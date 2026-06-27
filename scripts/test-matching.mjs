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
import { hardConflict } from "./stage4-token-merge.mjs";

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
];

// POSITIVOS: hardConflict DEBE devolver null (compatibles). Mismo vino con
// nombres/marca divergentes — el resto del pipeline decide si los une.
const MUST_PASS = [
  ["mismo nombre, marca distinta", g("El Enemigo Malbec", { varietals: ["Malbec"] }), g("Enemigo Malbec", { varietals: ["Malbec"] })],
  ["bodega vs línea (El Bayeh Tilcara)", g("El Bayeh Tinto de Tilcara", { type: "Tinto" }), g("Parceleros Criolla Tilcara", { varietals: ["Criolla"] })],
  ["ruido vs limpio", g("Vino Luigi Bosca Malbec D.O.C", { varietals: ["Malbec"] }), g("Luigi Bosca Malbec", { varietals: ["Malbec"] })],
  ["acentos/caps", g("ANGELICA ZAPATA CABERNET S.", { varietals: ["Cabernet Sauvignon"] }), g("Angélica Zapata Cabernet Sauvignon", { varietals: ["Cabernet Sauvignon"] })],
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

console.log("");
if (failed > 0) {
  console.error(`❌ ${failed} caso(s) fallaron. NO publicar — revisar gates en stage4-token-merge.mjs.`);
  process.exit(1);
}
console.log(`✅ Todos los casos dorados pasan (${MUST_CONFLICT.length} negativos + ${MUST_PASS.length} positivos).`);
