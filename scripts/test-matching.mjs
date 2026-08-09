#!/usr/bin/env node
/**
 * Harness dorado de matching — blinda los gates de stage4-token-merge.mjs
 * contra regresiones. Corre en CI (daily-scrape) ANTES de aplicar la capa
 * de merge: si un cambio en los gates rompe un caso conocido, el build
 * falla y no se publica un snapshot con quimeras.
 *
 * Filosofía (del rediseño): un FALSO MERGE (quimera) es peor que un merge
 * faltante. Por eso los NEGATIVOS (no deben unirse) son sagrados.
 *
 * Uso: node scripts/test-matching.mjs   (exit 1 si algún caso falla)
 */
import { hardConflict, lineRelation } from "./stage4-token-merge.mjs";
import { secondaryKey } from "./remerge-groups.mjs";
import { NAME_PREFIX_TO_BRAND } from "./lib-identity.mjs";

const g = (canonicalName, extra = {}) => ({ canonicalName, type: null, varietals: [], brand: null, ...extra });

// NEGATIVOS: hardConflict DEBE devolver un gate (≠ null). Son los vinos
// distintos que NUNCA deben colapsar.
const MUST_CONFLICT = [
  ["tier: El Enemigo vs Gran Enemigo", g("El Enemigo Cabernet Franc"), g("Gran Enemigo Gualtallary Cabernet Franc")],
  ["parcela: Tilcara vs Purmamarca", g("El Bayeh Pequeños Parceleros Tinto de Tilcara"), g("El Bayeh Pequeños Parceleros Tinto de Purmamarca")],
  ["parcela: Tilcara vs Maimará", g("El Bayeh Tinto de Tilcara"), g("El Bayeh Tinto de Maimará")],
  ["varietal: Catena Malbec vs Cabernet", g("Angélica Zapata Malbec", { varietals: ["Malbec"] }), g("Angélica Zapata Cabernet Sauvignon", { varietals: ["Cabernet Sauvignon"] })],
  ["varietal: Felino Malbec vs Red Blend", g("Felino Malbec"), g("Felino Red Blend")],
  ["varietal: Escorihuela Malbec vs Sangiovese", g("Escorihuela Gascón Malbec"), g("Escorihuela Gascón Sangiovese")],
  ["color: tinto vs rosado", g("Cordero con Piel de Lobo Malbec"), g("Cordero con Piel de Lobo Malbec Rosé")],
  ["color: extra brut vs brut rosé", g("Baron B Extra Brut"), g("Baron B Brut Rosé")],
  ["pack: botella vs caja x6", g("Manos Negras Malbec"), g("Manos Negras Malbec Caja x 6 u")],
  ["volumen: 750 vs 1500", g("Luca Malbec"), g("Luca Malbec 1,5 Litros")],
  ["volumen: 750 vs 375", g("Portillo Malbec"), g("Portillo Malbec 375 cc")],
  ["edicion: Tonel Único 248 vs 119", g("Tonel Único 248 Malbec"), g("Tonel Único 119 Malbec")],
  ["edicion: Antología 57 vs 60", g("Rutini Antología 57"), g("Rutini Antología 60")],
  ["edad: Montchenot 10 vs 5 años", g("Montchenot Tinto 10 años"), g("Montchenot Tinto 5 años")],
  ["tier: base vs reserva", g("Alma Mora Malbec"), g("Alma Mora Reserva Malbec")],
  ["color: espumante E/B vs rosé", g("Chandon E/B x 750ml"), g("Chandon Rosé")],
  ["dulzor: extra brut vs demi sec", g("Chandon Extra Brut"), g("Chandon Demi Sec")],
  ["dulzor: extra brut vs brut nature", g("Baron B Extra Brut"), g("Baron B Brut Nature")],
];

// POSITIVOS: hardConflict DEBE devolver null (compatibles). Mismo vino con
// nombres/marca divergentes — el resto del pipeline decide si los une.
const MUST_PASS = [
  ["mismo nombre, marca distinta", g("El Enemigo Malbec", { varietals: ["Malbec"] }), g("Enemigo Malbec", { varietals: ["Malbec"] })],
  ["bodega vs línea (El Bayeh Tilcara)", g("El Bayeh Tinto de Tilcara", { type: "Tinto" }), g("Parceleros Criolla Tilcara", { varietals: ["Criolla"] })],
  ["ruido vs limpio", g("Vino Luigi Bosca Malbec D.O.C", { varietals: ["Malbec"] }), g("Luigi Bosca Malbec", { varietals: ["Malbec"] })],
  ["acentos/caps", g("ANGELICA ZAPATA CABERNET S.", { varietals: ["Cabernet Sauvignon"] }), g("Angélica Zapata Cabernet Sauvignon", { varietals: ["Cabernet Sauvignon"] })],
  ["espumante: E/B vs Extra Brut (mismo dulzor)", g("Chandon E/B x 750ml"), g("Chandon Extra Brut")],
];

// ── lineRelation: la política de auto-merge del pipeline ──
// "equal"  → único caso donde Stage 2 puede auto-mergear sin LLM.
// "subset" → sólo el LLM (Stage 3/6.5) puede cerrarlo.
// "crossing"/"disjoint" → jamás por texto/embedding/LLM; sólo ancla de
//                         paraje (Stage 6) o known-merges.json (humano).
// Estos casos vienen de quimeras REALES publicadas (run 2026-07-02).
const LINE_CASES = [
  // [descripción, nombre A, nombre B, relación esperada]
  ["QUIMERA LIVE: Serie A vs Concreto (misma bodega, mismo varietal)", "Zuccardi Serie A Malbec", "Zuccardi Concreto Malbec", "crossing"],
  ["QUIMERA LIVE: Medalla vs Alaris", "Medalla Malbec", "Alaris Malbec", "disjoint"],
  ["QUIMERA LIVE: DV Catena vs Adrianna", "DV CATENA MALBEC MALBEC", "DV Catena Adrianna Malbec", "subset"],
  ["QUIMERA LIVE: Rutini Chardonnay vs Encuentro", "Rutini Chardonnay", "Rutini Encuentro Chardonnay", "subset"],
  ["Catena clásico vs Malbec Argentino (ícono)", "Catena Malbec", "Catena Zapata Malbec Argentino", "subset"],
  ["Zuccardi Q no es el Zuccardi pelado", "Zuccardi Q Malbec", "Zuccardi Malbec", "subset"],
  ["reorden de palabras = mismo vino", "Don David Reserva Malbec", "Don David Malbec Reserva", "equal"],
  ["ruido no-identidad = mismo vino", "Vino Luigi Bosca Malbec D.O.C", "Luigi Bosca Malbec", "equal"],
  ["split que el LLM debe poder cerrar", "Concreto Malbec", "Zuccardi Concreto Malbec", "subset"],
  ["genéricos sin identidad no auto-mergean", "Vino Tinto Malbec", "Malbec tinto 750", "disjoint"],
];

// ── secondaryKey (remerge-groups): la línea NUNCA se strippea ──
// Regresión del bug "KNOWN_PRODUCERS strippea labels": Medalla/Alaris/
// Don David/Adrianna quedaban con secondary="" y colapsaban por bucket.
const SECONDARY_CASES = [
  ["Medalla conserva su línea", "Medalla Malbec", "medalla"],
  ["Alaris conserva su línea", "Alaris Malbec", "alaris"],
  ["Don David conserva su línea", "Don David Malbec", "don david"],
  ["bodega al frente se strippea, línea queda", "Trapiche Medalla Malbec", "medalla"],
  ["Adrianna conserva su línea", "DV Catena Adrianna Malbec", "adrianna"],
  ["Gran Apartado conserva su línea", "Rutini Gran Apartado Chardonnay", "apartado"],
  ["Encuentro conserva su línea", "Rutini Encuentro Chardonnay", "encuentro"],
  ["label-como-marca sí se strippea (identidad vive en brand)", "A Lisa Malbec", ""],
  ["Trapiche pelado queda vacío (identidad = brand+varietal)", "Trapiche Malbec", ""],
];

let failed = 0;
console.log("=== NEGATIVOS (deben tener conflicto) ===");
for (const [name, a, b] of MUST_CONFLICT) {
  const c = hardConflict(a, b);
  const ok = c !== null;
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${name}  →  ${c ?? "SIN CONFLICTO (¡quimera!)"}`);
}
console.log("\n=== POSITIVOS (deben pasar, conflicto = null) ===");
for (const [name, a, b] of MUST_PASS) {
  const c = hardConflict(a, b);
  const ok = c === null;
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${name}  →  ${c ?? "ok"}`);
}

console.log("\n=== LINEAS (relación de line-tokens → política de merge) ===");
for (const [desc, a, b, expected] of LINE_CASES) {
  const got = lineRelation(a, b);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${desc}  →  ${got}${ok ? "" : ` (esperaba ${expected})`}`);
}

console.log("\n=== SECONDARY KEY (remerge no borra la línea) ===");
for (const [desc, name, expected] of SECONDARY_CASES) {
  const got = secondaryKey(name);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${desc}  →  "${got}"${ok ? "" : ` (esperaba "${expected}")`}`);
}

// ── parseOffer (identidad v2): clave de vino + comparabilidad ──
import { parseOffer, fallbackWineKey, isComparable, resolveBodega } from "./lib-offer-identity.mjs";
import { applyManualOverlay } from "./lib-catalog-manual.mjs";
const PARSE_CASES = [
  // [descripción, nombreA, brandA, nombreB, brandB, mismaClave?, comparableA?]
  ["mismo vino con/sin bodega y ruido", "Concreto Malbec", null, "Vino Zuccardi Concreto Malbec 750cc", "Zuccardi", true, true],
  ["Serie A ≠ Concreto (claves distintas)", "Zuccardi Serie A Malbec", null, "Zuccardi Concreto Malbec", null, false, true],
  ["375cc NO comparable", "Zuccardi Serie A Malbec 375cc", null, "Zuccardi Serie A Malbec", null, true, false],
  ["magnum NO comparable", "Zuccardi Concreto Malbec 2016 Magnum 1.5L", null, "Zuccardi Concreto Malbec", null, true, false],
  ["caja x6 NO comparable", "ZUCCARDI SERIE A MALBEC CAJA X 6 UN", null, "Zuccardi Serie A Malbec", null, true, false],
  ["estuche NO comparable", "Estuche Zuccardi Serie A Malbec 750cc", null, "Zuccardi Serie A Malbec", null, true, false],
  ["Medalla ≠ Alaris", "Medalla Malbec", "Trapiche", "Alaris Malbec", "Trapiche", false, true],
];

console.log("\n=== PARSER v2 (identidad estructurada por oferta) ===");
for (const [desc, na, ba, nb, bb, sameKey, cmpA] of PARSE_CASES) {
  const pa = parseOffer(na, ba);
  const pb = parseOffer(nb, bb);
  const gotSame = fallbackWineKey(pa) === fallbackWineKey(pb);
  const gotCmp = isComparable(pa);
  const ok = gotSame === sameKey && gotCmp === cmpA;
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${desc}  →  clave ${gotSame ? "igual" : "distinta"}, ${gotCmp ? "comparable" : "no-comparable"}`);
}

console.log("\n=== DATOS (atribuciones de bodega) ===");
{
  const ok = NAME_PREFIX_TO_BRAND["don david"] === "El Esteco";
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  Don David es de El Esteco (no Trapiche)  →  ${NAME_PREFIX_TO_BRAND["don david"]}`);
}
{
  // Los súper cargan Colón con la bodega adentro del nombre y `brand`
  // vacío. Sin esta entrada CADA vino de la línea cae en fallback y la
  // ficha #1 de tráfico del sitio queda partida en dos.
  const ok = NAME_PREFIX_TO_BRAND["colon"] === "Colón";
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  Colón resuelve como bodega  →  ${NAME_PREFIX_TO_BRAND["colon"] ?? "SIN RESOLVER"}`);
  // Y no debe comerse "Colonia Las Liebres" (el match es por límite de
  // palabra; si alguien lo afloja, esto lo caza).
  const colonia = resolveBodega("Colonia Las Liebres Bonarda 750ml", null);
  const ok2 = colonia !== "Colón";
  if (!ok2) failed++;
  console.log(`  ${ok2 ? "✅" : "❌ FALLA"}  "Colonia Las Liebres" NO es Colón  →  ${colonia ?? "sin bodega"}`);
}

console.log("\n=== OVERLAY MANUAL DEL CATÁLOGO ===");
{
  // El Colón Frutos Rojos: 4 ofertas, mismo EAN (7790168904663), tres
  // tiendas lo nombran con el dulzor y una con el color, y el nombre de
  // producto de Jumbo termina en "7". Tienen que caer todas en la misma
  // ficha. Es el caso testigo del overlay: si alguien saca la entrada de
  // data/catalog-manual.json o rompe edicionesNoDistinguen, falla acá.
  const wines = [];
  applyManualOverlay(wines);
  const colon = wines.find((w) => w.id === "colon-select-frutos-rojos-rosado");
  const ok = Boolean(colon);
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  el overlay agrega el Colón Frutos Rojos  →  ${colon ? colon.linea : "AUSENTE"}`);

  if (colon) {
    const names = [
      "Vino Colon Selecto Dulce Fresco Frutos Rojos 7",
      "Vino rosado dulce Colón Select frutos rojos en botella 750 m",
    ];
    const aliases = new Set(
      (colon.lineAliases ?? []).map((a) => a.split(" ").filter(Boolean).sort().join(" ")),
    );
    let allMatch = true;
    for (const n of names) {
      const p = parseOffer(n, null);
      const bodegaOk = p.bodega === "Colón";
      const aliasOk = aliases.has(p.lineTokens.join(" "));
      if (!bodegaOk || !aliasOk) allMatch = false;
    }
    if (!allMatch) failed++;
    console.log(`  ${allMatch ? "✅" : "❌ FALLA"}  las 2 formas de nombrarlo caen en la misma línea del catálogo`);

    const dropsSeven = (colon.edicionesNoDistinguen ?? []).includes("7");
    if (!dropsSeven) failed++;
    console.log(`  ${dropsSeven ? "✅" : "❌ FALLA"}  el "7" del nombre de Jumbo no abre una ficha aparte`);
  }
}

console.log("");
if (failed > 0) {
  console.error(`❌ ${failed} caso(s) fallaron. NO publicar — revisar gates en stage4-token-merge.mjs / remerge-groups.mjs.`);
  process.exit(1);
}
console.log(`✅ Todos los casos dorados pasan (${MUST_CONFLICT.length} negativos + ${MUST_PASS.length} positivos + ${LINE_CASES.length} líneas + ${SECONDARY_CASES.length} secondary + ${PARSE_CASES.length} parser v2).`);
