#!/usr/bin/env node
/**
 * build-match-questions.mjs — arma las preguntas "¿es el mismo vino?"
 * que se le muestran a la gente en las fichas.
 *
 * DE DÓNDE SALEN LOS PARES: de donde el sistema está genuinamente en
 * duda, no de cualquier lado. Hoy la fuente es el EAN: cuando dos fichas
 * distintas comparten un código de barras, el barcode dice "mismo
 * producto" pero los gates del pipeline dijeron que no. Alguien se
 * equivoca — o la tienda cargó mal el EAN, o el gate está partiendo de
 * más — y un humano lo resuelve mirando dos etiquetas.
 *
 * QUÉ NO PREGUNTAMOS (importante, es lo que hace que la pregunta valga):
 *   · Pares bloqueados por VOLUMEN o PACK: ahí el gate tiene razón
 *     obvia (la caja x6 reusa el EAN de la botella). Preguntarlo sería
 *     gastarle la paciencia a la gente con algo que ya sabemos.
 *   · Pares sin imagen en alguna de las dos fichas: sin foto de la
 *     etiqueta la pregunta no se puede contestar bien.
 *   · Fichas basura (no-vino, bundles, copa).
 *
 * LOS VOTOS NO SON AUTORIDAD. Son un input más, con peso, que se suma al
 * catálogo, al EAN y a Vivino. Ninguna de esas fuentes fusiona sola: todas
 * alimentan revisión. Por eso acá sólo se generan PREGUNTAS; qué hacer
 * con las respuestas se decide después, mirando también cuánto se
 * contradicen entre sí los que votaron.
 *
 * Uso:
 *   node scripts/build-match-questions.mjs           # dry-run
 *   node scripts/build-match-questions.mjs --write   # escribe el JSON
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { hardConflict } from "./stage4-token-merge.mjs";
import { toEan } from "./lib-ean.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WRITE = process.argv.includes("--write");
const OUT = resolve(ROOT, "data/match-questions.json");

// Gates donde el bloqueo es obviamente correcto → no se pregunta.
const OBVIOUS_GATES = new Set(["volumen", "pack"]);

const snap = JSON.parse(readFileSync(resolve(ROOT, "data/snapshot.json"), "utf8"));

const NON_WINE =
  /\b(whisky|vodka|gin|ron|tequila|cognac|brandy|fernet|vermouth|vermut|aperitivo|aperol|campari|licor|grappa|pisco|cerveza|gancia|aperitif|johnnie|walker|chivas|bourbon|gift\s*card|combo|estuche|copa|kit|surtido)\b/i;

const repName = (g) =>
  (g.offers ?? [])
    .map((o) => o.name)
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)[0] ?? g.canonicalName;

const usable = (g) =>
  g && g.imageUrl && g.canonicalName && !NON_WINE.test(g.canonicalName);

/**
 * Nombre que ve el usuario. El `canonicalName` solo no alcanza: muchas
 * fichas lo tienen pelado ("Malbec") porque la bodega vive en `brand`, y
 * preguntar "¿Malbec es el mismo vino que Reserve Malbec?" es
 * incontestable. Misma regla que el <title> de la ficha: se antepone la
 * marca salvo que ya esté en el nombre.
 */
function displayName(g) {
  const name = g.canonicalName ?? "";
  if (!g.brand) return name;
  return name.toLowerCase().includes(g.brand.toLowerCase())
    ? name
    : `${g.brand} ${name}`;
}

// EAN → fichas que lo publican
const byEan = new Map();
for (const g of snap.productGroups) {
  for (const o of g.offers ?? []) {
    const sku = toEan(o.externalSku);
    if (!sku) continue;
    if (!byEan.has(sku)) byEan.set(sku, new Map());
    byEan.get(sku).set(g.groupSlug, g);
  }
}

const questions = [];
const seen = new Set();
const stats = { eansCompartidos: 0, descartadosGateObvio: 0, descartadosSinImagen: 0, preguntas: 0 };

for (const [ean, gs] of byEan) {
  if (gs.size < 2) continue;
  stats.eansCompartidos++;
  const arr = [...gs.values()];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const A = arr[i], B = arr[j];
      const key = [A.groupSlug, B.groupSlug].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);

      if (!usable(A) || !usable(B)) { stats.descartadosSinImagen++; continue; }

      const gate = hardConflict(
        { canonicalName: repName(A) },
        { canonicalName: repName(B) },
      );
      if (gate && OBVIOUS_GATES.has(gate)) { stats.descartadosGateObvio++; continue; }

      questions.push({
        id: key,
        ean,
        // `gate` es contexto para quien revise después, no se le muestra
        // al usuario: la pregunta tiene que ser limpia, sin sugerir.
        gate: gate ?? null,
        a: { slug: A.groupSlug, name: displayName(A), image: A.imageUrl, stores: A.storeCount },
        b: { slug: B.groupSlug, name: displayName(B), image: B.imageUrl, stores: B.storeCount },
      });
      stats.preguntas++;
    }
  }
}

// Primero las de fichas con más tiendas: son las que más gente ve y las
// que más duelen si están mal.
questions.sort((x, y) => (y.a.stores + y.b.stores) - (x.a.stores + x.b.stores));

console.log("=== preguntas '¿es el mismo vino?' ===");
for (const [k, v] of Object.entries(stats)) console.log(String(v).padStart(6), k);
console.log("\n--- primeras 10 ---");
for (const q of questions.slice(0, 10)) {
  console.log(`  [${q.gate ?? "sin veto"}] ${q.a.name.slice(0, 40)}  ⟷  ${q.b.name.slice(0, 40)}`);
}

if (WRITE) {
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), questions }, null, 0),
  );
  console.log(`\n✅ data/match-questions.json (${questions.length} preguntas)`);
} else {
  console.log("\n(dry-run — pasá --write para escribir el JSON)");
}
