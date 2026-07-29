#!/usr/bin/env node
/**
 * rebuild-legacy-redirects.mjs — recupera redirects perdidos en un cutover.
 *
 * Cuando el esquema de slugs cambia de golpe (como el cutover a identidad
 * v2 del 03/07/2026), las URLs viejas que Google ya tenía indexadas quedan
 * huérfanas: el pipeline sólo escribe redirects para los merges que él
 * mismo hace, no para un re-slugging masivo. Resultado del cutover v2:
 * ~9.5K URLs en "Not found (404)" en Search Console.
 *
 * SEÑAL: `externalUrl` de cada oferta es la huella única de un producto en
 * una tienda. Si las ofertas del grupo viejo hoy viven en un grupo nuevo,
 * ese grupo es el destino natural del slug viejo.
 *
 * DOCTRINA (la misma del harness de matching): un redirect FALSO es peor
 * que uno faltante — el 404 al menos no miente. Por eso tres gates:
 *   1. Dominancia ≥85% de las ofertas sobrevivientes en un solo destino.
 *      Un rename limpio manda ~100%; una quimera vieja que el sistema
 *      nuevo partió bien se reparte y queda en 404 a propósito.
 *      RESCATE: si el nombre del destino es idéntico al del origen, no hay
 *      ambigüedad que proteger y alcanza con ser el más votado — es el
 *      mismo vino separado porque UNA tienda lo nombra distinto.
 *   2. El nombre destino comparte ≥40% de vocabulario con el origen.
 *   3. El color no se contradice (un tinto no redirige a un blanco),
 *      salvo nombre idéntico — ahí el que estaba mal era el dato viejo.
 *
 * Uso:
 *   git show <commit-pre-cutover>:data/snapshot.json > /tmp/snapshot-v1.json
 *   node scripts/rebuild-legacy-redirects.mjs --old /tmp/snapshot-v1.json
 *   node scripts/rebuild-legacy-redirects.mjs --old /tmp/snapshot-v1.json --write
 *
 * Sin --write hace dry-run e imprime el reporte. Con --write fusiona en
 * data/group-merges.json (que es acumulativo: el pipeline preserva lo
 * previo y descarta solo. lo que apunta a un destino que dejó de existir).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const WRITE = args.includes("--write");
const OLD_PATH = argVal("--old", null);
const MERGES_PATH = resolve(ROOT, "data/group-merges.json");

if (!OLD_PATH) {
  console.error("Falta --old <snapshot viejo>. Ver el encabezado del archivo.");
  process.exit(1);
}

const DOMINANCE = 0.85;
const NAME_OVERLAP = 0.4;

const oldSnap = JSON.parse(readFileSync(OLD_PATH, "utf8"));
const newSnap = JSON.parse(readFileSync(resolve(ROOT, "data/snapshot.json"), "utf8"));
const existing = JSON.parse(readFileSync(MERGES_PATH, "utf8"));

const liveSlugs = new Set(newSnap.productGroups.map((g) => g.groupSlug));
const bySlug = new Map(newSnap.productGroups.map((g) => [g.groupSlug, g]));

/** Tokens significativos de un nombre, para comparar origen vs destino. */
function nameTokens(s) {
  return new Set(
    String(s ?? "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/).filter((t) => t.length > 2),
  );
}

// externalUrl → slug vivo
const urlToNew = new Map();
for (const g of newSnap.productGroups) {
  for (const o of g.offers ?? []) {
    if (o.externalUrl) urlToNew.set(o.externalUrl, g.groupSlug);
  }
}

const out = {};
const stats = {
  total: 0, sigueViva: 0, yaMapeada: 0, sinOfertas: 0,
  sinUrlSobreviviente: 0, ambigua: 0, rechazadaPorNombre: 0,
  rechazadaPorColor: 0, rescatadaPorNombre: 0, mapeada: 0,
};

for (const g of oldSnap.productGroups ?? []) {
  const slug = g.groupSlug;
  if (!slug) continue;
  stats.total++;

  if (liveSlugs.has(slug)) { stats.sigueViva++; continue; }
  if (existing[slug]) { stats.yaMapeada++; continue; }

  const urls = (g.offers ?? []).map((o) => o.externalUrl).filter(Boolean);
  if (urls.length === 0) { stats.sinOfertas++; continue; }

  const votes = new Map();
  for (const u of urls) {
    const dest = urlToNew.get(u);
    if (dest) votes.set(dest, (votes.get(dest) ?? 0) + 1);
  }
  if (votes.size === 0) { stats.sinUrlSobreviviente++; continue; }

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const [bestSlug, bestVotes] = ranked[0];
  const totalVotes = [...votes.values()].reduce((a, b) => a + b, 0);

  if (!liveSlugs.has(bestSlug)) { stats.sinUrlSobreviviente++; continue; }

  const dest = bySlug.get(bestSlug);

  // Gate 2 — vocabulario compartido.
  const t1 = nameTokens(g.canonicalName);
  const t2 = nameTokens(dest?.canonicalName);
  let sameName = false;
  if (t1.size && t2.size) {
    const shared = [...t1].filter((t) => t2.has(t)).length;
    sameName = shared === t1.size && shared === t2.size;
    if (shared / Math.min(t1.size, t2.size) < NAME_OVERLAP) {
      stats.rechazadaPorNombre++;
      continue;
    }
  }

  // Gate 1 — dominancia, con RESCATE por nombre idéntico.
  //
  // La dominancia sola castiga un caso que no es quimera: el mismo vino
  // que el sistema nuevo separó porque UNA tienda lo nombra distinto. Es
  // lo que le pasó a la página #1 de tráfico del sitio (39 clics/780
  // impresiones en 90 días): de sus 4 ofertas, 3 (Jumbo/Disco/Vea)
  // fueron a un grupo y 1 (Carrefour, que lo llama "Vino Rosado Dulce
  // Colón Select…") a otro → 75%, rechazada, 404.
  //
  // Si el nombre del destino es IDÉNTICO al del origen, no hay ambigüedad
  // que proteger: alcanza con que sea el destino más votado. Una quimera
  // real no comparte nombre exacto con la parte que la absorbe
  // (`alamos-malbec-reserva` = "Alamos Malbec" vs "Alamos Selección"),
  // así que la protección contra falsos redirects queda intacta.
  if (bestVotes / totalVotes < DOMINANCE && !sameName) {
    stats.ambigua++;
    continue;
  }
  if (bestVotes / totalVotes < DOMINANCE) stats.rescatadaPorNombre++;

  // Gate 3 — el color no se contradice.
  if (!sameName && g.type && dest?.type && g.type !== dest.type) {
    stats.rechazadaPorColor++;
    continue;
  }

  out[slug] = bestSlug;
  stats.mapeada++;
}

console.log("=== reconstrucción de redirects huérfanos ===");
for (const [k, v] of Object.entries(stats)) console.log(String(v).padStart(7), k);

if (!WRITE) {
  console.log("\n(dry-run — pasá --write para fusionar en data/group-merges.json)");
  process.exit(0);
}

// Los existentes MANDAN: no pisamos un redirect que ya escribió el pipeline.
const merged = { ...out, ...existing };
const sorted = {};
for (const k of Object.keys(merged).sort()) sorted[k] = merged[k];
writeFileSync(MERGES_PATH, JSON.stringify(sorted, null, 2) + "\n");
console.log(
  `\n✅ data/group-merges.json: ${Object.keys(existing).length} → ${Object.keys(sorted).length} redirects`,
);
