/**
 * lib-sommelier.mjs — Claude como sommelier del catálogo: decide QUÉ VINO es
 * cada ficha, bodega por bodega, y el agrupador aplica esas decisiones.
 *
 * POR QUÉ EXISTE. Medido el 07/10/2026 sobre el snapshot publicado: de 16
 * vinos conocidos elegidos al azar, los 16 tenían una cola de fichas
 * duplicadas al lado de la principal ("LUIGI BOSCA SANGRE MALBEC DOC" con 12
 * tiendas al lado de "De Sangre Malbec" con 20; El Gran Enemigo Cepillo en 3
 * fichas; Colonia Las Liebres en 4; "LAS PERDICES A COLORADA ANCELL"). Cada
 * tienda inventa una forma nueva de escribir el nombre y las reglas de texto
 * persiguen esa cola sin alcanzarla nunca. Lo que falta es conocimiento:
 * saber que "A COLORADA ANCELL" es Ala Colorada Ancellotta y que Serie A no
 * es Concreto. Eso es trabajo de sommelier, y Claude lo sabe hacer.
 *
 * CÓMO (scripts/sommelier.mjs corre esto en batch, con presupuesto):
 *   · Unidad = una bodega (con sus variantes de escritura y etiquetas) y
 *     TODAS sus fichas a la vez, con cada nombre tal como lo escribe cada
 *     tienda, su precio y cuántas veces aparece. Claude devuelve la lista de
 *     vinos de la bodega y, por ficha, cuál es — más las ofertas que están
 *     en la ficha equivocada.
 *   · Cada unidad se juzga DOS veces, de forma independiente (orden y
 *     etiquetas distintas). Sólo se aplica lo que coincide en las dos: dos
 *     nombres van juntos si los dos juicios los ponen juntos.
 *   · Los veredictos se guardan por NOMBRE de oferta normalizado (nameKey),
 *     no por ficha: sobreviven a los cambios diarios del agrupador, y una
 *     oferta nueva con un nombre ya visto cae sola en su vino.
 *
 * DOCTRINA CERO-QUIMERAS (la misma que lib-jev.mjs). Claude no pasa por
 * encima de:
 *   · los gates de identidad duros: tipo, color, dulzor y varietal (lo que
 *     el nombre dice explícitamente). Sí levanta los de nivel/paraje y
 *     edición, que es donde las tiendas escriben distinto y donde hace falta
 *     saber de vinos;
 *   · la guarda de precio (medianas comparables a >1,6×);
 *   · el partidor por precio incoherente, que corre DESPUÉS.
 *
 * NUNCA ROMPE EL BUILD. Sin data/sommelier/verdicts.json, el agrupador sigue
 * exactamente como antes.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { stripAccents, decodeEntities } from "./lib-identity.mjs";
import { identityConflict } from "./stage4-token-merge.mjs";

export const SOMMELIER_MODEL = process.env.SOMMELIER_MODEL || "claude-opus-5-5";
// Cambiar los prompts o el schema NO invalida veredictos viejos (se pagaron
// y siguen siendo válidos), pero queda registrado en cada pasada.
export const PROMPT_VERSION = "2026-10-07";

// Precio por millón de tokens, tarifa estándar (la Batches API cobra la
// mitad). Fuente: tabla de modelos de la API al 06/10/2026.
const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Costo en USD de un `usage` de la API. `batch` aplica el 50 %. */
export function costOf(usage, model = SOMMELIER_MODEL, { batch = true } = {}) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const u = usage ?? {};
  const usd =
    ((u.input_tokens ?? 0) * p.in +
      (u.output_tokens ?? 0) * p.out +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1e6;
  return batch ? usd / 2 : usd;
}

/** Estimación antes de mandar: ~3,2 caracteres por token en español. */
export function estimateCost(inputChars, outputTokens, model = SOMMELIER_MODEL) {
  return costOf({ input_tokens: Math.ceil(inputChars / 3.2), output_tokens: outputTokens }, model);
}

// ── Clave de nombre ─────────────────────────────────────────────────────────
// CONGELADA A PROPÓSITO. No usa canonicalizeName() ni ningún extractor del
// pipeline: esos cambian cada semana, y si la clave cambia, todos los
// veredictos ya pagados quedan huérfanos. Sólo: entidades HTML, acentos,
// minúsculas, sin añada (19xx/20xx) y sin puntuación. Si alguna vez hay que
// cambiarla, hay que migrar data/sommelier/verdicts.json.
export function nameKey(raw) {
  return stripAccents(decodeEntities(String(raw ?? "")))
    .toLowerCase()
    .replace(/(?<![a-z0-9])(?:19[5-9]\d|20[0-4]\d)(?![a-z0-9])/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function shortHash(s, n = 12) {
  return createHash("sha256").update(s).digest("hex").slice(0, n);
}

// PRNG determinístico para barajar la segunda pasada.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled(arr, seed) {
  const r = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const fmtPrice = (p) => (typeof p === "number" && p > 0 ? `$${Math.round(p).toLocaleString("es-AR")}` : "sin precio");

// ── Prompts ─────────────────────────────────────────────────────────────────

const CRITERIO = `Qué cuenta como el MISMO vino (sus precios se comparan en una sola ficha):
- Misma bodega, misma línea/etiqueta, mismo varietal o corte, mismo color y mismo dulzor.
- NO distinguen (es el mismo vino): la añada; el formato (750 ml, 375, magnum, caja x6, estuche, lata, bag in box, pouch — el sitio los muestra como formatos dentro de la ficha); el tapón; las palabras de relleno ("Vino tinto", "750 cc", "de Bodega X", "Botella de"); abreviaturas de tienda (Rva = Reserva, EB = Extra Brut, CS = Cabernet Sauvignon, CF = Cabernet Franc, "EST." = estuche, "ESP." = espumante); errores de tipeo; mayúsculas; orden de las palabras; el nombre de la bodega presente o ausente; el paraje o la región cuando la línea sólo existe de ese lugar (Concreto es siempre de Paraje Altamira).
- SÍ distinguen (son vinos distintos): la línea (Serie A ≠ Concreto; Medalla ≠ Gran Medalla; Petit Caro ≠ Caro; De Sangre ≠ Luigi Bosca Malbec); el nivel (Reserva, Gran Reserva, Single Vineyard, Ícono) cuando la bodega tiene la misma línea con y sin él; el varietal; el color (rosado ≠ tinto; Blanc de Malbec ≠ Malbec); el dulzor (Extra Brut ≠ Brut Nature ≠ Dulce; Cosecha Tardía ≠ seco); el paraje cuando la línea tiene varios (Exploración Gualtallary ≠ Exploración La Consulta); las ediciones numeradas (Antología 38 ≠ 40); versiones especiales (Low alcohol, sin alcohol, orgánico cuando es otra etiqueta, Tributo, edición aniversario).
- El precio es evidencia: dos nombres parecidos con precios a más del doble casi siempre son líneas distintas.`;

export const SYSTEM_BODEGA = `Sos el sommelier de Vinndex, un comparador de precios de vinos de vinotecas online de Argentina. Cada ficha del sitio debería ser UN vino, con todas las tiendas que lo venden. Hoy hay muchas fichas duplicadas (el mismo vino escrito distinto por cada tienda) y algunas mezcladas (dos vinos en una ficha).

Te paso todas las fichas actuales de una bodega. Cada ficha trae los nombres exactos con que la publican las tiendas, cuántas ofertas tiene cada nombre y su precio mediano. Tu trabajo:
1. Armar la lista de VINOS reales de la bodega que aparecen en las fichas (un id corto por vino: v1, v2...).
2. Para cada ficha, decir qué es:
   - "vino": la ficha es ese vino (campo "vino" con su id). Varias fichas pueden apuntar al mismo vino: así se fusionan los duplicados.
   - "otra_bodega": la ficha es de otra bodega (poné su nombre en "bodega_real"; la tienda cargó mal la marca).
   - "no_vino": no es vino (aceite, aceto, destilado, gin, sidra, cerveza, accesorio, copa sola, gift card).
   - "mix": un pack con vinos DISTINTOS adentro, o una caja surtida.
   - "dudoso": no alcanza la información para decidir.
3. En "excepciones", los nombres de una ficha "vino" que NO son ese vino: con el id del vino que sí son, o null si no son ninguno de la lista (otro vino, otra bodega, no-vino, mix). Si todos los nombres de la ficha son el mismo vino, dejá la lista vacía.

${CRITERIO}

Un error que junta dos vinos distintos en una ficha es mucho peor que dejar un duplicado: si dudás entre "mismo" y "distinto", marcá "dudoso" o dejá las fichas en vinos separados. Pero no seas tímido con lo obvio: un mismo vino escrito de cinco formas son cinco fichas al mismo id.

Respondé SOLO con el JSON del schema. Toda ficha que te paso tiene que aparecer exactamente una vez en "fichas".`;

export const SYSTEM_ATRIBUCION = `Sos el sommelier de Vinndex, un comparador de precios de vinos de vinotecas online de Argentina. Estas fichas no tienen bodega identificada. Para cada una, decí de qué bodega es el producto según su nombre y lo que sabés de vinos argentinos (y de importados si aparecen).

Reglas:
- Si la bodega está en la lista de bodegas conocidas del sitio, usá EXACTAMENTE ese nombre.
- Una etiqueta pertenece a su bodega: "Saint Felicien" → Catena Zapata, "Alamos" → Catena Zapata, "Trumpeter" → Rutini, "Cordero con Piel de Lobo" → Mosquita Muerta.
- Si el nombre no alcanza para saberlo con confianza, devolvé null. Mejor null que una bodega inventada.
- Si no es vino (aceite, destilado, accesorio, etc.), devolvé null.

Respondé SOLO con el JSON del schema, una entrada por ficha.`;

export const SYSTEM_FAMILIAS = `Sos el sommelier de Vinndex, un comparador de precios de vinos de vinotecas online de Argentina. Te paso todas las bodegas del sitio tal como las cargaron las tiendas, con cuántas fichas tiene cada una y ejemplos de sus vinos.

El mismo vino aparece en fichas distintas porque una tienda pone una bodega y otra tienda otra: variantes de escritura ("Escorihuela" / "Escorihuela Gascón", "Bodega Norton" / "Norton"), la etiqueta cargada como si fuera la bodega ("DV Catena", "Nicasia" o "Saint Felicien" en vez de Catena Zapata), o el nombre del enólogo en vez de la bodega.

Agrupá los nombres que hay que revisar JUNTOS porque sus vinos pueden ser los mismos. Una familia por grupo, con su nombre canónico (el de la bodega). Reglas:
- Sólo agrupá cuando las tiendas usan uno u otro nombre para los MISMOS vinos. NO agrupes bodegas distintas de un mismo holding o grupo empresario (Trapiche y El Esteco son bodegas distintas aunque sean del mismo grupo).
- Bodegas con apellido en común pero distintas (Catena Zapata / Ernesto Catena / Alma Negra) van separadas.
- Devolvé sólo familias de 2 o más nombres; el resto se revisa sola. Cada nombre aparece en una familia como máximo.
- Copiá los nombres EXACTAMENTE como están en la lista.

Respondé SOLO con el JSON del schema.`;

const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const str = { type: "string" };

export const SCHEMA_BODEGA = {
  type: "object",
  additionalProperties: false,
  required: ["vinos", "fichas"],
  properties: {
    vinos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "nombre", "bodega", "linea", "varietal", "color", "dulzor"],
        properties: {
          id: str,
          nombre: str,
          bodega: str,
          linea: nullable(str),
          varietal: nullable(str),
          color: nullable({ type: "string", enum: ["tinto", "blanco", "rosado", "naranjo", "espumante"] }),
          dulzor: nullable(str),
        },
      },
    },
    fichas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["f", "tipo", "vino", "bodega_real", "excepciones"],
        properties: {
          f: str,
          tipo: { type: "string", enum: ["vino", "otra_bodega", "no_vino", "mix", "dudoso"] },
          vino: nullable(str),
          bodega_real: nullable(str),
          excepciones: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["n", "vino"],
              properties: { n: str, vino: nullable(str) },
            },
          },
        },
      },
    },
  },
};

export const SCHEMA_ATRIBUCION = {
  type: "object",
  additionalProperties: false,
  required: ["fichas"],
  properties: {
    fichas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["f", "bodega"],
        properties: { f: str, bodega: nullable(str) },
      },
    },
  },
};

export const SCHEMA_FAMILIAS = {
  type: "object",
  additionalProperties: false,
  required: ["familias"],
  properties: {
    familias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["canonica", "miembros"],
        properties: { canonica: str, miembros: { type: "array", items: str } },
      },
    },
  },
};

/**
 * Texto del pedido de una unidad de bodega. Las fichas se presentan en el
 * orden dado (la pasada B va barajada) y las etiquetas (F1, F1.2...) se
 * asignan en ese orden, así las dos pasadas no se ven iguales.
 *
 * @param {{family:string, fichas:Array<{names:Array<{key:string,raw:string,count:number,price:number|null}>, storeCount:number, price:number|null}>}} unit
 * @param {number[]} order  índices de unit.fichas en el orden a presentar
 * @returns {{text:string, labeled:string[][]}}
 *   labeled[i][j] = nameKey de la etiqueta F{i+1}.{j+1}. Es lo único que
 *   hace falta guardar para leer la respuesta horas después, cuando el
 *   snapshot ya cambió.
 */
export function buildBodegaPrompt(unit, order) {
  const labeled = [];
  const lines = [`Bodega: ${unit.family}`, `Fichas: ${order.length}`, ""];
  order.forEach((fi, pos) => {
    const f = unit.fichas[fi];
    const fl = `F${pos + 1}`;
    labeled.push(f.names.map((n) => n.key));
    lines.push(`${fl} · ${f.storeCount} tienda${f.storeCount === 1 ? "" : "s"} · ${fmtPrice(f.price)}`);
    f.names.forEach((n, j) => {
      lines.push(`  ${fl}.${j + 1} "${n.raw.slice(0, 140).replace(/"/g, "'")}" ×${n.count} ${fmtPrice(n.price)}`);
    });
  });
  return { text: lines.join("\n"), labeled };
}

/**
 * Convierte la respuesta de una pasada en lo que se guarda: para cada
 * nameKey, el id local del vino, "x" (no es un vino de la lista: otra
 * bodega, no-vino, mix, o excepción sin vino) o nada (sin decisión). Un id
 * de vino inexistente cuenta como sin decisión.
 *
 * @param {object} out       JSON de la respuesta (SCHEMA_BODEGA)
 * @param {string[][]} labeled  de buildBodegaPrompt()
 * @returns {{map: Record<string,string>, wines: Record<string,object>, otra: Record<string,string>, stats: object}}
 */
export function parseBodegaOutput(out, labeled) {
  const wines = {};
  for (const v of out?.vinos ?? []) {
    if (!v?.id || wines[v.id]) continue;
    wines[v.id] = { nombre: v.nombre, bodega: v.bodega, linea: v.linea ?? null, varietal: v.varietal ?? null, color: v.color ?? null, dulzor: v.dulzor ?? null };
  }
  const fichaIdx = (label) => {
    const m = /^F(\d+)$/.exec(String(label ?? "").trim());
    const i = m ? Number(m[1]) - 1 : -1;
    return i >= 0 && i < labeled.length ? i : -1;
  };
  const nameOf = (label) => {
    const m = /^F(\d+)\.(\d+)$/.exec(String(label ?? "").trim());
    if (!m) return null;
    return labeled[Number(m[1]) - 1]?.[Number(m[2]) - 1] ?? null;
  };
  const map = {};
  const otra = {};
  const stats = { fichas: 0, sinRespuesta: 0, idsInvalidos: 0, tipos: {} };
  const seen = new Set();
  for (const r of out?.fichas ?? []) {
    const fi = fichaIdx(r?.f);
    if (fi < 0 || seen.has(fi)) continue;
    seen.add(fi);
    stats.fichas++;
    stats.tipos[r.tipo] = (stats.tipos[r.tipo] ?? 0) + 1;
    let base = null;
    if (r.tipo === "vino") {
      if (r.vino && wines[r.vino]) base = r.vino;
      else stats.idsInvalidos++;
    } else if (r.tipo === "otra_bodega" || r.tipo === "no_vino" || r.tipo === "mix") {
      base = "x";
    }
    for (const key of labeled[fi]) {
      if (base !== null && map[key] === undefined) map[key] = base;
      if (r.tipo === "otra_bodega" && r.bodega_real) otra[key] = r.bodega_real;
    }
    for (const e of r.excepciones ?? []) {
      const key = nameOf(e?.n);
      if (!key) continue;
      if (e.vino === null) map[key] = "x";
      else if (wines[e.vino]) map[key] = e.vino;
      else { stats.idsInvalidos++; delete map[key]; }
    }
  }
  stats.sinRespuesta = labeled.length - seen.size;
  return { map, wines, otra, stats };
}

// ── Consenso ────────────────────────────────────────────────────────────────

/**
 * Consenso de dos pasadas sobre una unidad. Dos nombres quedan en la misma
 * clase sólo si las DOS pasadas los pusieron en el mismo vino; un nombre es
 * "x" sólo si las dos dicen que no es un vino de la lista. Lo demás queda
 * sin decidir.
 *
 * @returns {{classes: Map<string,{cls:string, wine:object}>, out: Set<string>, agreement: number}}
 *   agreement: fracción de nombres decididos por las dos pasadas cuyo grupo
 *   de compañeros es idéntico en ambas (1 = coincidencia total).
 */
export function unitConsensus(unitKey, A, B) {
  const classes = new Map();
  const out = new Set();
  const both = [];
  for (const [k, a] of Object.entries(A.map)) {
    const b = B.map[k];
    if (b === undefined || b === null) continue;
    if (a === "x" && b === "x") { out.add(k); continue; }
    if (a === "x" || b === "x") continue;
    both.push(k);
    classes.set(k, { cls: `${unitKey}|${a}|${b}`, wine: A.wines[a] ?? B.wines[b] ?? null });
  }
  // Acuerdo: para cada nombre, ¿sus compañeros en A son los mismos que en B?
  const membersA = new Map(), membersB = new Map();
  for (const k of both) {
    const a = A.map[k], b = B.map[k];
    if (!membersA.has(a)) membersA.set(a, []);
    membersA.get(a).push(k);
    if (!membersB.has(b)) membersB.set(b, []);
    membersB.get(b).push(k);
  }
  let same = 0;
  for (const k of both) {
    const ma = membersA.get(A.map[k]), mb = membersB.get(B.map[k]);
    if (ma.length === mb.length && ma.every((x) => B.map[x] === B.map[k])) same++;
  }
  return { classes, out, agreement: both.length ? same / both.length : 1 };
}

// Una unidad cuyas dos pasadas coinciden en menos de esta fracción no se
// aplica: o el modelo está adivinando o la bodega es un lío que pide ojo
// humano (queda en el report).
export const MIN_AGREEMENT = 0.8;

/**
 * Índice nameKey → clase de vino, a partir de todas las unidades con dos
 * pasadas. Si un nombre aparece en varias unidades (la bodega se re-planeó),
 * gana el veredicto más reciente.
 */
export function buildIndex(verdicts) {
  const index = new Map();
  const out = new Set();
  const units = [];
  const entries = Object.entries(verdicts?.units ?? {})
    .filter(([, u]) => u.kind === "bodega" && u.passes?.A && u.passes?.B && u.passes.A.inputHash === u.passes.B.inputHash)
    .sort((x, y) => String(x[1].at ?? "").localeCompare(String(y[1].at ?? "")));
  for (const [unitKey, u] of entries) {
    if ((verdicts.disabled ?? []).includes(unitKey)) continue;
    const c = unitConsensus(unitKey, expandPass(u, "A"), expandPass(u, "B"));
    units.push({ unitKey, agreement: c.agreement, classes: c.classes.size, out: c.out.size, applied: c.agreement >= MIN_AGREEMENT });
    if (c.agreement < MIN_AGREEMENT) continue;
    for (const [k, v] of c.classes) { index.set(k, v); out.delete(k); }
    for (const k of c.out) { out.add(k); index.delete(k); }
  }
  return { index, out, units };
}

/** Las pasadas se guardan alineadas a `u.names` para no repetir claves. */
export function compactPass(unitNames, parsed) {
  return { m: unitNames.map((k) => parsed.map[k] ?? null), wines: parsed.wines };
}
export function expandPass(u, which) {
  const p = u.passes[which];
  const map = {};
  u.names.forEach((k, i) => { if (p.m[i] !== null && p.m[i] !== undefined) map[k] = p.m[i]; });
  return { map, wines: p.wines ?? {} };
}

export function loadVerdicts(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // un archivo roto no tumba el agrupador: se sigue sin sommelier
  }
}

// ── Aplicación sobre los grupos del agrupador ───────────────────────────────

// Gates que Claude NUNCA levanta (lo que el nombre dice explícito). Nivel/
// paraje y edición sí: ahí es donde las tiendas escriben distinto.
const HARD = new Set(["type", "color", "dulzor", "varietal"]);
export function sommelierGate(aName, bName) {
  const r = identityConflict({ canonicalName: aName }, { canonicalName: bName });
  return r && HARD.has(r) ? r : null;
}

const slugify = (s) =>
  stripAccents(String(s ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

/**
 * Aplica el consenso sobre los grupos del agrupador, in place.
 *
 *   1. Cada grupo tiene un vino "de casa" si al menos la mitad de sus
 *      ofertas tiene un veredicto y la clase más votada es ésa.
 *   2. Grupos con el mismo vino de casa se fusionan en el del catálogo, o
 *      si no hay, en el más grande — salvo gate duro o precio incompatible.
 *   3. Las ofertas cuyo veredicto es OTRO vino se mudan a la ficha de ese
 *      vino (o a una nueva); las que son "x" salen a una ficha propia.
 *
 * @param {Map<string,{wine:object|null, offers:object[]}>} groups
 * @param {{index:Map, out:Set}} idx  de buildIndex()
 * @param {object} h  helpers del agrupador
 * @param {(o:object)=>string} h.rawName      nombre original de la tienda
 * @param {(g:object)=>string} h.canonOf      nombre representativo del grupo
 * @param {(a:object,b:object)=>boolean} h.pricesCompatible
 * @param {(a:string,b:string)=>string|null} [h.gate]
 * @param {boolean} [h.dryRun]  sólo cuenta, no toca los grupos
 */
export function applySommelier(groups, idx, h) {
  const gate = h.gate ?? sommelierGate;
  const stats = { gruposConCasa: 0, fusiones: 0, mudadas: 0, fuera: 0, bloqueadasGate: 0, bloqueadasPrecio: 0, ejemplos: [] };
  const clsOf = (o) => idx.index.get(nameKey(h.rawName(o)))?.cls ?? null;
  const isOut = (o) => idx.out.has(nameKey(h.rawName(o)));
  const wineByCls = new Map();
  for (const v of idx.index.values()) if (!wineByCls.has(v.cls)) wineByCls.set(v.cls, v.wine);
  const note = (s) => { if (stats.ejemplos.length < 400) stats.ejemplos.push(s); };

  // 1. Vino de casa por grupo.
  const homeOf = new Map(); // groupKey → cls
  for (const [key, g] of groups) {
    const tally = new Map();
    for (const o of g.offers) {
      const c = clsOf(o);
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    if (!tally.size) continue;
    const [best, n] = [...tally].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (n * 2 < g.offers.length) continue;
    homeOf.set(key, best);
  }
  stats.gruposConCasa = homeOf.size;

  // 2. Fusiones por vino de casa.
  const byCls = new Map();
  for (const [key, cls] of homeOf) {
    if (!byCls.has(cls)) byCls.set(cls, []);
    byCls.get(cls).push(key);
  }
  const homeGroup = new Map(); // cls → groupKey superviviente
  for (const [cls, keys] of byCls) {
    keys.sort((a, b) => {
      const ga = groups.get(a), gb = groups.get(b);
      return (gb.wine ? 1 : 0) - (ga.wine ? 1 : 0) || gb.offers.length - ga.offers.length || (a < b ? -1 : 1);
    });
    const dstKey = keys[0];
    homeGroup.set(cls, dstKey);
    for (const srcKey of keys.slice(1)) {
      const dst = groups.get(dstKey), src = groups.get(srcKey);
      const an = h.canonOf(dst), bn = h.canonOf(src);
      const g = gate(an, bn);
      if (g) { stats.bloqueadasGate++; note(`gate ${g}: "${bn}" ✗ "${an}"`); continue; }
      if (!h.pricesCompatible(dst, src)) { stats.bloqueadasPrecio++; note(`precio: "${bn}" ✗ "${an}"`); continue; }
      stats.fusiones++;
      note(`fusión: "${bn}" (${src.offers.length}) → "${an}" (${dst.offers.length})`);
      if (!h.dryRun) {
        dst.offers.push(...src.offers);
        groups.delete(srcKey);
      }
    }
  }

  // 3. Mudanzas: ofertas cuyo veredicto no es el vino de casa de su grupo.
  //    Un vino sin ficha propia recibe UNA ficha nueva (clave determinística
  //    por clase), aunque sus ofertas vengan de varios grupos.
  for (const [key, g] of [...groups]) {
    const home = homeOf.get(key);
    if (!home || !groups.has(key)) continue;
    const moving = new Map(); // destino → ofertas
    let blocked = 0;
    for (const o of g.offers) {
      const c = clsOf(o);
      let dest = null;
      if (c && c !== home) {
        const target = homeGroup.get(c);
        if (target && target !== key && groups.has(target)) {
          if (gate(h.canonOf(groups.get(target)), h.rawName(o))) { blocked++; continue; }
          dest = target;
        } else if (!target) {
          dest = `som|${slugify(wineByCls.get(c)?.nombre ?? "vino")}|${shortHash(c, 8)}`;
        }
      } else if (!c && isOut(o)) {
        dest = `${key}::som-x-${slugify(nameKey(h.rawName(o)))}`;
      }
      if (!dest) continue;
      if (!moving.has(dest)) moving.set(dest, []);
      moving.get(dest).push(o);
    }
    stats.bloqueadasGate += blocked;
    if (!moving.size) continue;
    const leaving = new Set([...moving.values()].flat());
    // Nunca vaciar un grupo: si todo se va, el grupo no era de ese vino.
    if (leaving.size === g.offers.length) continue;
    for (const [dest, offs] of moving) {
      if (dest.includes("::som-x-")) stats.fuera += offs.length;
      else stats.mudadas += offs.length;
      note(`mudanza: ${offs.length} × "${h.rawName(offs[0])}" fuera de "${h.canonOf(g)}"`);
    }
    if (h.dryRun) continue;
    g.offers = g.offers.filter((o) => !leaving.has(o));
    for (const [dest, offs] of moving) {
      if (groups.has(dest)) groups.get(dest).offers.push(...offs);
      else groups.set(dest, { wine: null, expr: null, offers: offs });
      if (dest.startsWith("som|")) {
        const c = clsOf(offs[0]);
        if (c && !homeGroup.has(c)) homeGroup.set(c, dest);
      }
    }
  }
  return stats;
}
