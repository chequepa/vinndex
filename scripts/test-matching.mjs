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
import { NAME_PREFIX_TO_BRAND, canonicalizeName } from "./lib-identity.mjs";
import { isValidEan } from "./lib-ean.mjs";

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
  // Taquigrafía (17/09, evaluación Jev): la normalización NO puede borrar
  // diferencias reales de edición, nivel ni alcohol.
  ["taquigrafía: Capítulo Uno vs Cap 2", g("Ruca Malen Capítulo Uno Chardonnay"), g("Ruca Malen Cap 2 Chardonnay")],
  ["taquigrafía: Rva vs Gran Reserva", g("Escorihuela Rva Malbec"), g("Escorihuela Gran Reserva Malbec")],
  ["taquigrafía: Gran R. vs Reserva", g("Fabre Montmayou Gran R. Malbec"), g("Fabre Montmayou Reserva Malbec")],
  ["taquigrafía: 12 YO vs 18 Years", g("Glenfiddich 12 YO"), g("Glenfiddich 18 Years")],
  ["taquigrafía: Grand Cabernet vs Cabernet (línea gran)", g("Terrazas Grand Cabernet"), g("Terrazas Cabernet")],
];

// POSITIVOS: hardConflict DEBE devolver null (compatibles). Mismo vino con
// nombres/marca divergentes — el resto del pipeline decide si los une.
const MUST_PASS = [
  ["mismo nombre, marca distinta", g("El Enemigo Malbec", { varietals: ["Malbec"] }), g("Enemigo Malbec", { varietals: ["Malbec"] })],
  ["bodega vs línea (El Bayeh Tilcara)", g("El Bayeh Tinto de Tilcara", { type: "Tinto" }), g("Parceleros Criolla Tilcara", { varietals: ["Criolla"] })],
  ["ruido vs limpio", g("Vino Luigi Bosca Malbec D.O.C", { varietals: ["Malbec"] }), g("Luigi Bosca Malbec", { varietals: ["Malbec"] })],
  ["acentos/caps", g("ANGELICA ZAPATA CABERNET S.", { varietals: ["Cabernet Sauvignon"] }), g("Angélica Zapata Cabernet Sauvignon", { varietals: ["Cabernet Sauvignon"] })],
  ["espumante: E/B vs Extra Brut (mismo dulzor)", g("Chandon E/B x 750ml"), g("Chandon Extra Brut")],
  // Taquigrafía de tienda (17/09, evaluación Jev: pares que un modelo daba
  // "mismo" con ≥0,9 y el gate vetaba por leer otra edición/nivel).
  ["taquigrafía: Capítulo Dos = Cap II", g("Ruca Malen Capítulo Dos Cabernet"), g("Vino tinto Cabernet Ruca Malen Cap II 750 ml")],
  ["taquigrafía: Capítulo Dos = cap 2", g("Ruca Malen Capítulo Dos Chardonnay"), g("Vino blanco Chardonnay Ruca Malen cap 2 750 ml")],
  ["taquigrafía: Cuartel Dos = Cuartel 2", g("Marchiori & Barraud Cuartel 2 Malbec"), g("Marchiori y Barraud Cuartel Dos Malbec")],
  ["taquigrafía: Gran Rva = Gran Reserva", g("Escorihuela Gascón Gran Reserva Rosé"), g("ESCORIHUELA GRAN RVA ROSE")],
  ["taquigrafía: Gran R. = Gran Reserva", g("Vino Fabre Gran Reserva Malbec"), g("FABRE MONTMAYOU GRAN R. MALBEC")],
  ["taquigrafía: Res Malbec = Reserva Malbec", g("Finca Flichman Finca Reserva Malbec"), g("FINCA FLICHMAN Vino Flichman Res Malbec Bot-750cc-")],
  ["taquigrafía: Grand Vin = Gran Vin", g("Vino tinto Gran Vin Fabre Montmayou 750 ml"), g("Fabre Montmayou Grand Vin")],
  ["taquigrafía: 0% = sin alcohol", g("Vino Blanco Chardonnay 0% 750 Ml Nieto Senetiner"), g("Vino blanco sin alcohol Nieto Senetiner Chardonnay 750 ml")],
  ["taquigrafía: 20Y Old = 20 Year Old", g("Oporto Taylors 20 Year Old Tawny Port"), g("Taylor´S Vino De Oporto 20Y Old Tawny Port")],
  ["taquigrafía: graduación no es edición", g("Alma Mora Malbec 13,5% vol"), g("Alma Mora Malbec")],
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
  // Auditoría 13/09: 7 fichas del mismo DV Catena separadas por puntuación.
  ["iniciales: D.v. Catena = DV Catena", "DV Catena Malbec-Malbec", "Vino Tinto D.v. Catena Malbec - Malbec 750 Cc", "equal"],
  ["iniciales: D. V. Catena = DV Catena", "DV CATENA MALBEC MALBEC", "D. V. Catena Malbec-Malbec", "equal"],
  ["iniciales: D,V, Catena = DV Catena", "DV Catena Malbec-Malbec", "D,V, CATENA MALBEC - MALBEC", "equal"],
  // 20/09: primer voto de usuario del sitio + EAN 7798269720342 en dos
  // tiendas. Una escribe la línea pegada y la otra con espacio; el token
  // pegado no coincidía con ninguna pieza y daba "disjoint" = otro vino.
  ["línea pegada: Kungfu = Kung Fu", "KUNG FU MALBEC", "Riccitelli Kungfu Malbec", "subset"],
  ["línea pegada, sin marca de por medio", "Vino Kung Fu Malbec 750 Ml", "Kungfu Malbec", "equal"],
  // Límite conocido de la regla: cuando la forma con espacio es un PARAJE,
  // el otro lado ya la strippeó como token de identidad y no queda vocabulario
  // para partir la pegada ("vistaflores"). Queda en subset — no lo arregla
  // esta capa sino un alias de paraje. Anotado para la próxima corrida.
  ["línea pegada sobre paraje: queda en subset", "Zuccardi Vista Flores Malbec", "Zuccardi Vistaflores Malbec", "subset"],
  // La regla sólo parte si las piezas están del OTRO lado: estas NO se tocan.
  ["no inventa piezas: Alaris ≠ Ala Ris", "Alaris Malbec", "Medalla Malbec", "disjoint"],
  ["no parte una línea en sílabas ajenas", "Zuccardi Serie A Malbec", "Zuccardi Concreto Malbec", "crossing"],
];

// ── secondaryKey (remerge-groups): la línea NUNCA se strippea ──
// Regresión del bug "KNOWN_PRODUCERS strippea labels": Medalla/Alaris/
// Don David/Adrianna quedaban con secondary="" y colapsaban por bucket.
const SECONDARY_CASES = [
  ["Medalla conserva su línea", "Medalla Malbec", "medalla"],
  ["Alaris conserva su línea", "Alaris Malbec", "alaris"],
  ["Don David conserva su línea", "Don David Malbec", "don david"],
  ["bodega al frente se strippea, línea queda", "Trapiche Medalla Malbec", "medalla"],
  // 13/09: "DV Catena" pasó a ser una LÍNEA de Catena Zapata (ya no una
  // bodega propia), así que tampoco se strippea — la línea entera queda.
  ["Adrianna conserva su línea (DV Catena es línea, no bodega)", "DV Catena Adrianna Malbec", "dv catena adrianna"],
  ["Gran Apartado conserva su línea", "Rutini Gran Apartado Chardonnay", "apartado"],
  ["Encuentro conserva su línea", "Rutini Encuentro Chardonnay", "encuentro"],
  ["label-como-marca sí se strippea (identidad vive en brand)", "A Lisa Malbec", ""],
  ["Trapiche pelado queda vacío (identidad = brand+varietal)", "Trapiche Malbec", ""],
];

// Taquigrafía: [desc, nombre crudo, nombre canonicalizado esperado]
// Los números en palabra sueltos son MARCA y no se tocan.
const SHORTHAND_CASES = [
  ["Dos Almas es marca", "Dos Almas Malbec", "Dos Almas Malbec"],
  ["Tres Esquinas es marca", "Tres Esquinas Bonarda", "Tres Esquinas Bonarda"],
  ["Latitud 33° es marca", "LATITUD 33° MALBEC", "LATITUD 33° MALBEC"],
  ["Resero no es Reserva", "Resero Tinto", "Resero Tinto"],
  ["Cap de Creus no es Capítulo", "Cap de Creus", "Cap de Creus"],
  ["Capítulo Tres → 3", "Ruca Malen Capitulo Tres Malbec", "Ruca Malen Capitulo 3 Malbec"],
  ["0,0% → sin alcohol, sin duplicar", "Vino sin alcohol 0,0%", "Vino sin alcohol"],
];

// EAN: [desc, valor crudo, ¿sirve como evidencia de identidad?]
const EAN_CASES = [
  ["EAN-13 real (El Enemigo Malbec)", "7794450000972", true],
  ["EAN-13 real (Colón Selecto)", "7790168904663", true],
  ["dígito verificador que no cierra", "7794450000973", false],
  ["ceros de relleno (molinillo El Castillo)", "7795260000000", false],
  ["ID interno de la tienda", "GRANDCRU", false],
  ["número de fila de la tienda", "234", false],
  ["notación científica de Excel", "7,80E+12", false],
  ["vacío", "", false],
  ["null", null, false],
  ["con espacios alrededor", "  7794450000972  ", true],
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
import {
  parseOffer,
  fallbackWineKey,
  isComparable,
  resolveBodega,
  cleanScraperBrand,
  isJunkBodegaKey,
  isStoreBrand,
  buildBodegaCollapser,
} from "./lib-offer-identity.mjs";
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
  // ── Auditoría 13/09: canonicalización de títulos ──
  ["iniciales con puntos: D.V. = DV", "D.V. Catena Malbec Malbec", null, "DV Catena Malbec-Malbec", null, true, true],
  ["iniciales con comas: D,V, = DV", "D,V, CATENA MALBEC - MALBEC", "Catena Zapata", "DV Catena Malbec-Malbec", null, true, true],
  ["iniciales con espacio: D. V. = DV", "D. V. Catena Malbec-Malbec", "Catena", "DV Catena Malbec-Malbec", null, true, true],
  ["ruido de retail: 'Vino Tinto … 750 Cc'", "Vino Tinto D.v. Catena Malbec - Malbec 750 Cc", null, "DV Catena Malbec-Malbec", null, true, true],
  ["'1.500 lts' es magnum, no línea", "Vino tinto Malbec Dv Catena 1.500 lts", null, "DV Catena Malbec-Malbec", null, true, false],
  ["'caja x 6 unidades' es pack, no línea", "DV Catena Cabernet-Malbec caja x 6 unidades", null, "DV Catena Cabernet Malbec", null, true, false],
  ["botellón = 1,5 L", "Botellon Dv Catena Malbec-malbec De Catena Zapata 1500 Ml año 2023", null, "DV Catena Malbec-Malbec", null, true, false],
  ["'estuche x 2 botellas' no es línea", "DV CATENA CABERNET MALBEC ESTUCHE x 2 BOTELLAS", null, "DV Catena Cabernet Malbec", null, true, false],
  ["D.O.C (3 letras) no se toca", "Vino Luigi Bosca Malbec D.O.C", "Luigi Bosca", "Luigi Bosca Malbec", "Luigi Bosca", true, true],
  ["S.V. sigue siendo una línea", "Rutini S.V. Malbec", null, "Rutini Malbec", null, false, true],
  // ── etiqueta → bodega madre ──
  ["Trumpeter es Rutini (sufijo '- Rutini Wines' no es línea)", "Trumpeter Cabernet Sauvignon - Rutini Wines", null, "Rutini Trumpeter Cabernet Sauvignon", null, true, true],
  ["Apartado es Rutini", "Apartado Gran Malbec", null, "Rutini Apartado Gran Malbec", null, true, true],
  ["Gran Enemigo ≠ El Enemigo (misma bodega, tier distinto)", "Gran Enemigo Gualtallary Cabernet Franc", null, "El Enemigo Cabernet Franc", null, false, true],
  ["paraje parcial: 'Cepillo' = 'El Cepillo'", "GRAN ENEMIGO CEPILLO", null, "Gran Enemigo El Cepillo", null, true, true],
  ["'Corte' es blend, no línea", "Gran Enemigo Corte", null, "Gran Enemigo Blend", null, true, true],
  // ── elisión, romanos, vineyard ──
  ["elisión: L`Esploratore = L´ESPLORATORE", "DV Catena L`Esploratore Malbec Salta", null, "DV CATENA L´ESPLORATORE MALBEC  SALTA", null, true, true],
  ["Esploratore Salta ≠ Esploratore La Rioja", "DV Catena L'Esploratore Malbec Salta", null, "DV Catena L'Esploratore Malbec La Rioja", null, false, true],
  ["romanos: XXXVIII = 38", "Rutini Antología XXXVIII Blend", null, "Rutini Antología 38 Blend", null, true, true],
  ["romanos: Antología 57 ≠ 60 sigue distinguiendo", "Rutini Antología LVII", null, "Rutini Antología LX", null, false, true],
  ["'Vineyard' suelto no distingue", "Nicasia Vineyard Malbec", null, "Nicasia Malbec", null, true, true],
  ["'Single Vineyard' sí distingue", "Rutini Single Vineyard Malbec", null, "Rutini Malbec", null, false, true],
  ["'Extra' de Extra Brut no es línea", "Trumpeter Extra Brut", null, "Rutini Trumpeter Extra Brut", null, true, true],
  ["marca de scraper con cola de producto", "Nampe Malbec 750cc", "Nampe Malbec 750 cc", "Nampe Malbec", "Nampe", true, true],
  ["Reserve = Reserva (Trumpeter)", "Trumpeter Reserve Malbec", null, "Rutini Trumpeter Reserva Malbec", null, true, true],
  ["Reserva sigue distinguiendo de la base", "Trumpeter Reserve Malbec", null, "Trumpeter Malbec", null, false, true],
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
{
  // Etiquetas que son LÍNEAS de una bodega madre, no bodegas (13/09).
  const expect = { "dv catena": "Catena Zapata", "saint felicien": "Catena Zapata", trumpeter: "Rutini", apartado: "Rutini", "gran enemigo": "El Enemigo", felino: "Viña Cobos" };
  for (const [k, v] of Object.entries(expect)) {
    const ok = NAME_PREFIX_TO_BRAND[k] === v;
    if (!ok) failed++;
    console.log(`  ${ok ? "✅" : "❌ FALLA"}  "${k}" es una línea de ${v}  →  ${NAME_PREFIX_TO_BRAND[k]}`);
  }
  // "Ernesto Catena" es OTRA bodega: el prefijo "catena" no se la come.
  const ec = resolveBodega("Ernesto Catena Ánimal Malbec", null);
  const ok = ec === "Ernesto Catena";
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  Ernesto Catena no es Catena Zapata  →  ${ec}`);
}
{
  // Marcas de scraper que no son bodegas (13/09: "casa", "san", "the",
  // "blanc" terminaban como bodegas de cientos de fichas).
  const cases = [
    ["Sauvignon Blanc", null],
    ["Casa", null],
    ["SIN MARCA.", null],
    ["S/M", null],
    ["Gin", null],
    ["Casa Bianchi", "Casa Bianchi"],
    ["Nampe Malbec 750 cc", "Nampe"],
    ["Bodega La Rural", "La Rural"],
  ];
  for (const [raw, want] of cases) {
    const got = cleanScraperBrand(raw);
    const ok2 = got === want;
    if (!ok2) failed++;
    console.log(`  ${ok2 ? "✅" : "❌ FALLA"}  marca de scraper "${raw}" → ${JSON.stringify(got)}${ok2 ? "" : ` (esperaba ${JSON.stringify(want)})`}`);
  }
  const junk = [["san", true], ["the", true], ["san telmo", false], ["catena zapata", false], ["casa de vinos", true], ["luca", false]];
  for (const [k, want] of junk) {
    const ok2 = isJunkBodegaKey(k) === want;
    if (!ok2) failed++;
    console.log(`  ${ok2 ? "✅" : "❌ FALLA"}  clave de bodega "${k}" ${want ? "es" : "no es"} basura`);
  }
  // El colapso por corpus nunca lleva a una clave basura, sí a una bodega.
  const col = buildBodegaCollapser([
    ...["a", "b", "c", "d"].map((st) => ({ bodegaKey: "casa", storeSlug: st })),
    { bodegaKey: "casa agostino", storeSlug: "e" },
    ...["a", "b", "c"].map((st) => ({ bodegaKey: "manos negras", storeSlug: st })),
    { bodegaKey: "manos negras artesano", storeSlug: "d" },
  ]);
  const ok3 = !col.has("casa agostino") && col.get("manos negras artesano") === "manos negras";
  if (!ok3) failed++;
  console.log(`  ${ok3 ? "✅" : "❌ FALLA"}  colapso: "Casa Agostino" no cae en "casa"; "Manos Negras Artesano" sí en Manos Negras`);
  // La tienda no es la bodega.
  const ok4 = isStoreBrand("Aldo's Vinoteca", "aldos-vinoteca") && isStoreBrand("Aldos Vinoteca", "aldos-vinoteca") && !isStoreBrand("Catena Zapata", "aldos-vinoteca");
  if (!ok4) failed++;
  console.log(`  ${ok4 ? "✅" : "❌ FALLA"}  "Aldo's Vinoteca" como marca en aldos-vinoteca es la tienda, no una bodega`);
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
  // Auditoría 13/09, caso 2: la línea fantasma "Apartado Gran Malbec" (alias
  // vacío) se comía al "Rutini Malbec" pelado, que es el Colección Malbec.
  {
    const w2 = [
      { id: "rutini-apartado-gran-malbec-malbec-tinto", bodega: "Rutini", linea: "Apartado Gran Malbec", varietal: "malbec", color: "tinto", lineAliases: [] },
      { id: "rutini-coleccion-malbec-tinto", bodega: "Rutini", linea: "Colección", varietal: "malbec", color: "tinto", lineAliases: ["cab"] },
    ];
    applyManualOverlay(w2);
    const vetoed = !w2.some((w) => w.id === "rutini-apartado-gran-malbec-malbec-tinto");
    const col = w2.find((w) => w.id === "rutini-coleccion-malbec-tinto");
    const bare = !!col && col.lineAliases.includes("");
    const ok = vetoed && bare;
    if (!ok) failed++;
    console.log(`  ${ok ? "✅" : "❌ FALLA"}  "Rutini Malbec" pelado es Colección Malbec, no Apartado Gran`);
  }
}

console.log("\n=== TAQUIGRAFÍA (canonicalizeName) ===");
for (const [desc, raw, expected] of SHORTHAND_CASES) {
  const got = canonicalizeName(raw);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${desc}  →  "${got}"${ok ? "" : ` (esperaba "${expected}")`}`);
}

console.log("\n=== EAN (evidencia de identidad) ===");
for (const [desc, raw, expected] of EAN_CASES) {
  const got = isValidEan(raw);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${desc}  →  ${got ? "válido" : "rechazado"}`);
}

console.log("");
if (failed > 0) {
  console.error(`❌ ${failed} caso(s) fallaron. NO publicar — revisar gates en stage4-token-merge.mjs / remerge-groups.mjs.`);
  process.exit(1);
}
console.log(`✅ Todos los casos dorados pasan (${MUST_CONFLICT.length} negativos + ${MUST_PASS.length} positivos + ${LINE_CASES.length} líneas + ${SECONDARY_CASES.length} secondary + ${PARSE_CASES.length} parser v2 + ${SHORTHAND_CASES.length} taquigrafía + ${EAN_CASES.length} EAN).`);
