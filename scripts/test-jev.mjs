/**
 * Casos dorados de Jev como juez de pares (scripts/lib-jev.mjs). Sin red:
 * la política es pura y la API se stubbea.
 *
 * Lo sagrado: Jev NUNCA levanta un gate de varietal, dulzor, pack o
 * volumen; contra el catálogo o contra un gate de nivel/edición/color sólo
 * con código de barras en 2+ tiendas y vara alta; y sin clave o con la API
 * caída el pipeline sigue como si no existiera.
 *
 * Correr: node scripts/test-jev.mjs
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jevPolicy, adjudicatePairs, pairKey, JEV_MERGE_MIN } from "./lib-jev.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅  ${name}  →  ${detail}`); }
  else { fail++; console.log(`  ❌ FALLA  ${name}  →  ${detail}`); }
}

console.log("\n=== POLÍTICA ===");
check("seguro y sin gate → fusiona", jevPolicy({ pMismo: 0.97, gate: null }) === "merge", "merge");
check("umbral exacto fusiona", jevPolicy({ pMismo: JEV_MERGE_MIN, gate: null }) === "merge", `p=${JEV_MERGE_MIN}`);
check("0,89 NO fusiona (la elección cruda de Jev mezcla vinos)", jevPolicy({ pMismo: 0.89, gate: null }) === "no", "no");
check("seguro contra gate de color SIN código compartido → NO fusiona, queda sospechoso", jevPolicy({ pMismo: 0.99, gate: "color" }) === "gate-sospechoso", "gate-sospechoso");
check("seguro contra tier con código de UNA tienda → NO fusiona", jevPolicy({ pMismo: 1, gate: "tier/parcela", eanStores: 1 }) !== "merge", "no merge");
check("tier con código en 2 tiendas y ≥0,97 → fusiona (Perdenal/Pedernal)", jevPolicy({ pMismo: 0.97, gate: "tier/parcela", eanStores: 2 }) === "merge", "merge");
check("tier con código en 2 tiendas pero 0,96 → sospechoso", jevPolicy({ pMismo: 0.96, gate: "tier/parcela", eanStores: 2 }) === "gate-sospechoso", "gate-sospechoso");
for (const g of ["varietal", "dulzor", "pack", "volumen"]) {
  check(`gate de ${g} NUNCA se levanta`, jevPolicy({ pMismo: 1, gate: g, eanStores: 9 }) !== "merge", "no merge");
}
check("catálogo distinto sin código compartido → no", jevPolicy({ pMismo: 1, gate: null, catalogConflict: true }) === "no", "no");
check("catálogo distinto, código en 2 tiendas, ≥0,95 y sin gate → fusiona", jevPolicy({ pMismo: 0.95, gate: null, catalogConflict: true, eanStores: 2 }) === "merge", "merge");
check("catálogo distinto con 0,94 → no", jevPolicy({ pMismo: 0.94, gate: null, catalogConflict: true, eanStores: 2 }) === "no", "no");
check("catálogo distinto con gate → no (aunque sea tier)", jevPolicy({ pMismo: 1, gate: "tier/parcela", catalogConflict: true, eanStores: 5 }) === "no", "no");
check("sin veredicto → no", jevPolicy({ pMismo: undefined, gate: null }) === "no", "no");

console.log("\n=== CLAVE DEL PAR ===");
check("independiente del orden", pairKey("Rutini Malbec", "RUTINI  malbec 750") === pairKey("RUTINI  malbec 750", "Rutini Malbec"), "simétrica");
check("canonicaliza taquigrafía", pairKey("Ruca Malen Cap II", "x") === pairKey("Ruca Malen Capítulo Dos", "x"), "Cap II = Capítulo Dos");

const okFetch = (p) => async () => ({ ok: true, status: 200, json: async () => ({ model: "jev-1.13.0", answers: { match: { choice: p >= 0.5 ? "mismo" : "distinto", probabilities: { mismo: p } } } }) });
const PAIRS = [["Luigi Bosca Malbec", "Vino Luigi Bosca Malbec D.O.C"], ["Rutini Colección Malbec", "Rutini Colección Cabernet Malbec"]];

console.log("\n=== RED (stub) ===");
{
  let calls = 0;
  const { verdicts, stats } = await adjudicatePairs(PAIRS, { apiKey: undefined, fetchImpl: async () => { calls++; } });
  check("sin clave: no llama, no tira, cero veredictos", calls === 0 && verdicts.size === 0 && stats.sinClave, `llamadas=${calls}`);
}
{
  const { verdicts, stats } = await adjudicatePairs(PAIRS, { apiKey: "k", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  check("API caída: no tira, cero veredictos", verdicts.size === 0 && stats.errores === 2, `errores=${stats.errores}`);
}
{
  let calls = 0;
  const f = async (...a) => { calls++; return { ok: false, status: 401, json: async () => ({}) }; };
  const { verdicts } = await adjudicatePairs(PAIRS, { apiKey: "mala", fetchImpl: f, concurrency: 1 });
  check("clave inválida: corta en la primera", calls === 1 && verdicts.size === 0, `llamadas=${calls}`);
}
{
  const dir = mkdtempSync(join(tmpdir(), "jev-"));
  const cachePath = join(dir, "cache.json");
  let calls = 0;
  const f = async (...a) => { calls++; return okFetch(0.95)(...a); };
  await adjudicatePairs(PAIRS, { apiKey: "k", fetchImpl: f, cachePath });
  const first = calls;
  const { verdicts, stats } = await adjudicatePairs([...PAIRS, [PAIRS[0][1], PAIRS[0][0]]], { apiKey: "k", fetchImpl: f, cachePath });
  const cache = JSON.parse(readFileSync(cachePath, "utf8"));
  check("caché: la segunda corrida no vuelve a llamar", first === 2 && calls === 2 && stats.enCache === 2, `llamadas=${calls}, enCache=${stats.enCache}`);
  check("caché: el par invertido es el mismo par", verdicts.size === 2, `veredictos=${verdicts.size}`);
  check("caché: versionada por prompt", typeof cache.promptVersion === "string", cache.promptVersion);
}

console.log();
if (fail === 0) console.log(`✅ Todos los casos dorados de Jev pasan (${pass}).`);
else { console.log(`❌ ${fail} caso(s) fallan de ${pass + fail}.`); process.exit(1); }
