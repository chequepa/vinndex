#!/usr/bin/env node
/**
 * build-wine-catalog.mjs — Identidad v2, paso 1: el CATÁLOGO de vinos.
 *
 * El activo que le falta al sistema actual: conocimiento explícito de
 * (bodega → líneas → qué distingue a cada línea). Sin esto es IMPOSIBLE
 * resolver los dos bugs live a la vez:
 *   · "Serie A" ≠ "Concreto" (misma bodega, mismo varietal, gates duros
 *     todos en verde) — sólo el conocimiento de que son LÍNEAS distintas
 *     los separa.
 *   · "Concreto Malbec" = "Concreto Malbec Paraje Altamira" — sólo el
 *     conocimiento de que Concreto embotella UN paraje (el paraje es
 *     parte del nombre completo, no un diferenciador) los une. El gate
 *     de parcela genérico hace lo contrario (correcto para Aluvional,
 *     que sí tiene parajes múltiples).
 *
 * Pipeline:
 *   1. parseOffer() sobre todas las ofertas → candidatos de línea
 *      agregados por (bodega | lineTokens | varietal | color | dulzor).
 *   2. Candidatos con ≥2 tiendas (donde agrupar importa) van al LLM
 *      (gpt-4o-mini, batch por bodega, cache eterno por clave de
 *      candidato en data/catalog-llm-cache.json).
 *   3. El LLM valida: ¿es una línea real? ¿nombre canónico? ¿bodega
 *      correcta (caza atribuciones erróneas)? ¿aliases dentro del lote?
 *      ¿qué parajes/tiers vistos NO distinguen (parte del nombre)?
 *   4. Materializa data/wine-catalog.json — persistente, curable a mano,
 *      crece incremental (sólo candidatos nuevos van al LLM).
 *
 * Uso:
 *   node scripts/build-wine-catalog.mjs [--offers path] [--min-stores 2]
 *                                       [--max-llm N] [--dry]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseOffer, stripAccents, normalizeBodegaKey } from "./lib-offer-identity.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── CLI args ──
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const OFFERS_PATH = argVal("--offers", resolve(ROOT, "data/offers.json"));
const MIN_STORES = Number(argVal("--min-stores", "2"));
const MAX_LLM = Number(argVal("--max-llm", "999999"));
const DRY = args.includes("--dry");

const CATALOG_PATH = resolve(ROOT, "data/wine-catalog.json");
const CACHE_PATH = resolve(ROOT, "data/catalog-llm-cache.json");

// ── OpenAI ──
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* sin .env.local seguimos (CI usa secrets) */ }
}
loadEnv();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o-mini";
const BATCH = 12;
const CONCURRENCY = 6;

function norm(s) {
  return stripAccents(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}
function sha1(s) {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

// ── 1. Agregación de candidatos ──
function aggregate(offers) {
  const cands = new Map();
  let excluded = 0, sinBodega = 0;
  for (const o of offers) {
    if (!o.name) continue;
    const p = parseOffer(o.name, o.brand);
    if (p.excluded) { excluded++; continue; }
    if (!p.bodega) { sinBodega++; continue; }
    const key = [
      normalizeBodegaKey(p.bodega),
      p.lineTokens.join(" "),
      p.varietal ?? "",
      p.color ?? "",
      p.dulzor ?? "",
    ].join("|");
    let c = cands.get(key);
    if (!c) {
      c = {
        key,
        bodega: p.bodega,
        lineTokens: p.lineTokens,
        varietal: p.varietal,
        color: p.color,
        dulzor: p.dulzor,
        offerCount: 0,
        stores: new Set(),
        names: new Map(), // nombre → count
        discs: new Map(), // discriminador → count
        tiers: new Map(),
      };
      cands.set(key, c);
    }
    c.offerCount++;
    c.stores.add(o.storeSlug);
    c.names.set(o.name, (c.names.get(o.name) ?? 0) + 1);
    for (const d of p.discriminadores) c.discs.set(d, (c.discs.get(d) ?? 0) + 1);
  }
  return { cands, excluded, sinBodega };
}

// ── 2/3. LLM por lote de bodega ──
const SYSTEM_PROMPT = `Sos un experto en el mercado de vinos argentinos (bodegas, líneas comerciales, etiquetas). Te paso candidatos de LÍNEA detectados en catálogos de vinotecas online, agrupados por bodega presunta. Para CADA candidato respondé un objeto JSON:

{
 "i": <índice del candidato>,
 "legit": true|false,        // ¿es una línea/etiqueta real de vino de esa bodega? false para basura (accesorios, bundles mal parseados, texto promocional, pseudo-líneas como "seleccion" o "varietal")
 "linea": "<nombre canónico de la línea tal como aparece en la etiqueta, ej 'Serie A', 'Concreto', 'Q', 'Medalla'>",
 "bodega": "<bodega productora CORRECTA — corregila si la presunta está mal atribuida>",
 "aliasDe": <índice de OTRO candidato de este lote que es LA MISMA línea (typo/variante), o null>,
 "parajesNoDistinguen": ["<paraje>"],  // de los "parajes vistos": los que son parte del NOMBRE COMPLETO del único vino de la línea (ej "paraje altamira" en Zuccardi Concreto). NO incluyas parajes que separan embotellados DISTINTOS de la línea (ej La Consulta vs Gualtallary en Zuccardi Aluvional)
 "tiersNoDistinguen": ["<tier>"]       // ídem para "reserva"/"gran": si TODA la línea lleva ese tier en el nombre (Don David Reserva) no distingue; si la línea tiene versión base Y reserva, SÍ distingue
}

Sé conservador: si no conocés la línea con certeza, legit=true pero no inventes correcciones de bodega ni marques parajes/tiers como no-distinguen (dejá los arrays vacíos). Respondé EXCLUSIVAMENTE JSON compacto: {"candidatos":[...]} — sin explicaciones, sin campos extra, strings cortos.`;

function candidatePrompt(bodega, items) {
  const lines = items.map((c, idx) => {
    const samples = [...c.names.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([n]) => `"${n}"`)
      .join(", ");
    const discs = [...c.discs.entries()].map(([d, n]) => `${d}(${n})`).join(", ");
    return `${idx}. línea=[${c.lineTokens.join(" ") || "∅"}] varietal=${c.varietal ?? "∅"} color=${c.color ?? "∅"}${c.dulzor ? ` dulzor=${c.dulzor}` : ""} · ${c.stores.size} tiendas, ${c.offerCount} ofertas · parajes/tiers vistos: ${discs || "ninguno"} · ejemplos: ${samples}`;
  });
  return `Bodega presunta: ${bodega}\n\nCandidatos:\n${lines.join("\n")}`;
}

async function askBatch(bodega, items) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      // Sin cap el modelo divagaba hasta el límite (~16k tokens ≈ 49k
      // chars) → JSON truncado → retry infinito + TPM quemado. 3.500
      // alcanza de sobra para 12 candidatos compactos.
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: candidatePrompt(bodega, items) },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 180)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  const out = parsed.candidatos ?? parsed.candidates ?? [];
  if (!Array.isArray(out)) throw new Error("LLM shape: candidatos no es array");
  return out;
}

function slugify(s) {
  return norm(s).replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}

async function main() {
  const raw = JSON.parse(readFileSync(OFFERS_PATH, "utf8"));
  const offers = raw.offers ?? raw.products ?? raw;
  console.log(`Catálogo v2 — ${offers.length} ofertas desde ${OFFERS_PATH}`);

  const { cands, excluded, sinBodega } = aggregate(offers);
  console.log(`  candidatos brutos: ${cands.size} (excluidas ${excluded} espirituosas/bundles, ${sinBodega} sin bodega)`);

  const eligible = [...cands.values()].filter((c) => c.stores.size >= MIN_STORES);
  console.log(`  candidatos con ≥${MIN_STORES} tiendas (van a validación): ${eligible.length}`);

  // Cache
  let cache = {};
  if (existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(readFileSync(CACHE_PATH, "utf8")); } catch { /* re-hacemos */ }
  }
  const need = [];
  for (const c of eligible) {
    c.cacheKey = sha1(c.key);
    if (!cache[c.cacheKey]) need.push(c);
  }
  console.log(`  cache: ${eligible.length - need.length} hits, ${need.length} a preguntar`);

  if (DRY) {
    // top bodegas por candidatos
    const byBodega = new Map();
    for (const c of eligible) {
      const k = normalizeBodegaKey(c.bodega);
      byBodega.set(k, (byBodega.get(k) ?? 0) + 1);
    }
    const top = [...byBodega.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log("  top bodegas:", top.map(([b, n]) => `${b}(${n})`).join(" "));
    return;
  }

  if (need.length > 0 && !OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY faltante y hay candidatos sin cache — corto.");
    process.exit(1);
  }

  // Batches por bodega
  const byBodega = new Map();
  for (const c of need.slice(0, MAX_LLM)) {
    const k = normalizeBodegaKey(c.bodega);
    if (!byBodega.has(k)) byBodega.set(k, []);
    byBodega.get(k).push(c);
  }
  const batches = [];
  for (const [, items] of byBodega) {
    items.sort((a, b) => b.stores.size - a.stores.size);
    for (let i = 0; i < items.length; i += BATCH) {
      batches.push(items.slice(i, i + BATCH));
    }
  }
  console.log(`  ${batches.length} batches LLM (modelo ${MODEL}, concurrencia ${CONCURRENCY})`);

  let done = 0, errors = 0;
  const t0 = Date.now();
  async function worker() {
    while (batches.length > 0) {
      const batch = batches.shift();
      if (!batch) break;
      try {
        const answers = await askBatch(batch[0].bodega, batch);
        for (const a of answers) {
          const c = batch[a.i];
          if (!c) continue;
          cache[c.cacheKey] = {
            legit: a.legit !== false,
            linea: a.linea ?? c.lineTokens.join(" "),
            bodega: a.bodega ?? c.bodega,
            aliasDeKey: Number.isInteger(a.aliasDe) && batch[a.aliasDe] ? batch[a.aliasDe].cacheKey : null,
            parajesNoDistinguen: Array.isArray(a.parajesNoDistinguen) ? a.parajesNoDistinguen.map(norm) : [],
            tiersNoDistinguen: Array.isArray(a.tiersNoDistinguen) ? a.tiersNoDistinguen.map(norm) : [],
          };
        }
        // candidatos del batch sin respuesta → default conservador
        for (const c of batch) {
          if (!cache[c.cacheKey]) {
            cache[c.cacheKey] = {
              legit: true,
              linea: c.lineTokens.join(" "),
              bodega: c.bodega,
              aliasDeKey: null,
              parajesNoDistinguen: [],
              tiersNoDistinguen: [],
            };
          }
        }
        done += batch.length;
        process.stdout.write(`\r  LLM ${done}/${need.length}`);
        if (done % (BATCH * 20) < BATCH) {
          writeFileSync(CACHE_PATH, JSON.stringify(cache));
        }
      } catch (err) {
        errors++;
        console.error(`\n  batch error (${batch.length} cands): ${err.message.slice(0, 120)}`);
        // Bisect: un batch envenenado (respuesta truncada/inválida) se
        // parte en mitades — el candidato problemático termina solo y
        // su respuesta individual entra en el cap. Un candidato solo que
        // sigue fallando recibe default conservador y NO se reintenta
        // (antes el reintento del batch entero ciclaba para siempre).
        if (batch.length > 1) {
          const mid = Math.ceil(batch.length / 2);
          batches.push(batch.slice(0, mid), batch.slice(mid));
        } else {
          const c = batch[0];
          cache[c.cacheKey] = {
            legit: true,
            linea: c.lineTokens.join(" "),
            bodega: c.bodega,
            aliasDeKey: null,
            parajesNoDistinguen: [],
            tiersNoDistinguen: [],
          };
          done++;
        }
        if (errors > 120) {
          console.error("  demasiados errores — corto y guardo lo que hay");
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
  console.log(`\n  LLM listo en ${Math.round((Date.now() - t0) / 1000)}s (${errors} errores) · cache ${Object.keys(cache).length} entradas`);

  // ── 4. Materializar catálogo ──
  // Resolución de aliases: seguir cadenas aliasDe hasta el canónico.
  const decisionOf = (c) => cache[c.cacheKey];
  const byCacheKey = new Map(eligible.map((c) => [c.cacheKey, c]));
  function canonicalKeyOf(c, depth = 0) {
    const d = decisionOf(c);
    if (!d || !d.aliasDeKey || depth > 5) return c.cacheKey;
    const parent = byCacheKey.get(d.aliasDeKey);
    if (!parent) return c.cacheKey;
    return canonicalKeyOf(parent, depth + 1);
  }

  // ── Guardas determinísticas sobre el conocimiento del LLM ──
  // El LLM se equivoca en preguntas de conocimiento fino (dijo que en
  // Rutini Single Vineyard "gualtallary" y "altamira" no distinguen —
  // sí distinguen: son embotellados distintos). Reglas duras:
  //   1. Sólo se puede dropear un paraje/tier VISTO en las ofertas del
  //      candidato (lo demás es ruido del modelo).
  //   2. Si el candidato muestra ≥2 parajes distintos entre sus ofertas,
  //      la línea es multi-paraje ⇒ los parajes SÍ distinguen; el LLM
  //      queda vetado (parajesNoDistinguen = []).
  //   3. Un tier sólo se dropea si aparece en ≥70% de las ofertas del
  //      candidato (= es parte del nombre completo, no una versión).
  const TIER_SET = new Set(["gran", "reserva", "gran reserva", "single", "vineyard", "single vineyard", "parcela", "parcel", "icono", "coleccion", "alta gama", "primera zona", "edicion limitada", "limited edition"]);

  // Parajes distintos vistos POR LÍNEA (bodega+lineTokens), agregando
  // TODOS los candidatos de la línea (todos los varietales). La guarda
  // multi-paraje tiene que operar a nivel línea: el candidato
  // "Aluvional (sin varietal)" sólo vio "altamira" en sus ofertas, pero
  // la línea Aluvional embotella Gualtallary/La Consulta/El Peral — si
  // CUALQUIER candidato de la línea ve otro paraje, nadie dropea.
  function distinctParajes(phrases) {
    const distinct = [];
    for (const p of [...phrases].sort((a, b) => b.length - a.length)) {
      if (!distinct.some((q) => q.includes(p) || p.includes(q) ||
        p.split(" ").every((t) => q.split(" ").includes(t)))) distinct.push(p);
    }
    return distinct;
  }
  // Clave por línea CANÓNICA (la que decidió el LLM) para que los alias
  // ("aluvional", "aluvional pje") compartan la misma guarda.
  function lineKeyOf(c) {
    const d = decisionOf(c);
    const bodega = norm(d?.bodega || c.bodega);
    const linea = d?.linea ? norm(d.linea) : c.lineTokens.join(" ");
    return `${bodega}|${linea}`;
  }
  const lineParajes = new Map(); // bodega|línea → Set(parajes vistos)
  for (const c of eligible) {
    const lk = lineKeyOf(c);
    if (!lineParajes.has(lk)) lineParajes.set(lk, new Set());
    for (const k of c.discs.keys()) {
      const n = norm(k);
      if (!TIER_SET.has(n)) lineParajes.get(lk).add(n);
    }
  }

  function guardedDecision(c, d) {
    const seen = new Map([...c.discs.entries()].map(([k, n]) => [norm(k), n]));
    const seenParajes = [...seen.keys()].filter((k) => !TIER_SET.has(k));
    const lineSeen = lineParajes.get(lineKeyOf(c)) ?? new Set();
    let parajes = (d.parajesNoDistinguen ?? []).map(norm).filter((p) => seen.has(p) || seenParajes.some((s) => s.includes(p) || p.includes(s)));
    // multi-paraje A NIVEL LÍNEA: veto al LLM
    if (distinctParajes(lineSeen).length >= 2) parajes = [];
    const tiers = (d.tiersNoDistinguen ?? []).map(norm).filter((t) => {
      const n = seen.get(t) ?? 0;
      return TIER_SET.has(t) && n >= Math.ceil(c.offerCount * 0.7);
    });
    return { ...d, parajesNoDistinguen: parajes, tiersNoDistinguen: tiers };
  }

  const wines = new Map(); // wineId → entry
  let junk = 0;
  let vetoedMultiParaje = 0;
  for (const c of eligible) {
    let d = decisionOf(c);
    if (!d) continue;
    if (!d.legit) { junk++; continue; }
    const before = (d.parajesNoDistinguen ?? []).length;
    d = guardedDecision(c, d);
    if (before > 0 && d.parajesNoDistinguen.length === 0) vetoedMultiParaje++;
    const canonKey = canonicalKeyOf(c);
    const canonC = byCacheKey.get(canonKey) ?? c;
    const canonD = decisionOf(canonC) ?? d;
    const bodega = canonD.bodega || canonC.bodega;
    const linea = canonD.linea || canonC.lineTokens.join(" ");
    const id = slugify(`${bodega} ${linea} ${canonC.varietal ?? ""} ${canonC.color ?? ""} ${canonC.dulzor ?? ""}`);
    if (!id) continue;
    let w = wines.get(id);
    if (!w) {
      w = {
        id,
        bodega,
        linea,
        varietal: canonC.varietal,
        color: canonC.color,
        dulzor: canonC.dulzor,
        lineAliases: [],
        parajesNoDistinguen: new Set(),
        tiersNoDistinguen: new Set(),
        offerCount: 0,
        storeCount: 0,
      };
      wines.set(id, w);
    }
    const aliasStr = c.lineTokens.join(" ");
    if (aliasStr && !w.lineAliases.includes(aliasStr)) w.lineAliases.push(aliasStr);
    for (const p of d.parajesNoDistinguen ?? []) w.parajesNoDistinguen.add(p);
    for (const t of d.tiersNoDistinguen ?? []) w.tiersNoDistinguen.add(t);
    w.offerCount += c.offerCount;
    w.storeCount = Math.max(w.storeCount, c.stores.size);
  }

  // ── Fold: vino varietal-null → hermano único con varietal ──
  // "Zuccardi Concreto" (sin varietal en el nombre) y "Zuccardi Concreto
  // Malbec" son EL MISMO vino cuando la línea tiene un solo varietal.
  // Fusionamos la entrada null en el hermano — así el asignador (que
  // matchea exacto primero) manda esas ofertas al vino con varietal vía
  // la herencia de línea. Si la línea tiene 2+ varietales (Serie A),
  // la entrada null queda como página ambigua propia (conservador).
  {
    const byLine = new Map();
    for (const w of wines.values()) {
      const lk = `${norm(w.bodega)}|${norm(w.linea)}`;
      if (!byLine.has(lk)) byLine.set(lk, []);
      byLine.get(lk).push(w);
    }
    let folded = 0;
    for (const [, ws] of byLine) {
      const nulls = ws.filter((w) => !w.varietal);
      const withVar = ws.filter((w) => w.varietal);
      if (nulls.length > 0 && withVar.length === 1) {
        const target = withVar[0];
        for (const nu of nulls) {
          for (const a of nu.lineAliases) {
            if (!target.lineAliases.includes(a)) target.lineAliases.push(a);
          }
          for (const p of nu.parajesNoDistinguen) target.parajesNoDistinguen.add(p);
          target.offerCount += nu.offerCount;
          target.storeCount = Math.max(target.storeCount, nu.storeCount);
          wines.delete(nu.id);
          folded++;
        }
      }
    }
    if (folded > 0) console.log(`  fold varietal-null → hermano único: ${folded}`);
  }

  const out = {
    _doc: "Catálogo de vinos v2 — (bodega, línea, varietal) con conocimiento por línea: aliases y qué parajes/tiers NO distinguen. Generado por build-wine-catalog.mjs (minado + validación gpt-4o-mini, cache en catalog-llm-cache.json). CURABLE A MANO: las correcciones humanas sobreviven — el builder sólo agrega entradas nuevas, no pisa existentes.",
    generatedAt: new Date().toISOString(),
    wines: [...wines.values()]
      .map((w) => ({
        ...w,
        parajesNoDistinguen: [...w.parajesNoDistinguen],
        tiersNoDistinguen: [...w.tiersNoDistinguen],
      }))
      .sort((a, b) => b.storeCount - a.storeCount || b.offerCount - a.offerCount),
  };

  // Merge incremental con catálogo existente: lo curado a mano gana.
  if (existsSync(CATALOG_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
      const prevById = new Map((prev.wines ?? []).map((w) => [w.id, w]));
      out.wines = out.wines.map((w) => prevById.get(w.id) ?? w);
      for (const w of prev.wines ?? []) {
        if (!out.wines.some((x) => x.id === w.id)) out.wines.push(w);
      }
    } catch { /* catálogo previo ilegible — escribimos fresco */ }
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(out, null, 1));
  console.log(`  catálogo: ${out.wines.length} vinos (${junk} candidatos junk descartados, ${vetoedMultiParaje} drops de paraje vetados por multi-paraje)`);
  console.log(`  → ${CATALOG_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
