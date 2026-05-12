#!/usr/bin/env node
/**
 * Detector de grupos duplicados por pHash DCT — diagnóstico, no modifica
 * el snapshot.
 *
 * IMPORTANTE — qué funciona y qué no:
 *
 *   ✅ pHash distance = 0 (modo default, --threshold 0):
 *      Captura grupos cuyas imágenes son perceptualmente idénticas
 *      aunque la URL difiera. Casos:
 *        - Mismo packshot servido por dos CDNs distintos (acdn-us vs
 *          dcdn-us de Tiendanube)
 *        - Mismo archivo a distinta resolución (240px vs 480px)
 *        - Producto distinto pero el CDN está mal configurado y
 *          sirve byte-a-byte la MISMA imagen para varios SKUs (caso
 *          real visto: jumboargentina.vteximg sirve el mismo JPG para
 *          "Amalaya Malbec" y "Etchart Torrontes"). Útil como señal de
 *          data quality.
 *
 *   ❌ pHash distance > 0 (modo --threshold N>0):
 *      No funciona como matcher autónomo en Vinndex. Los packshots de
 *      vino tienen demasiada similitud visual estructural — botella
 *      centrada vertical sobre fondo blanco + etiqueta beige central +
 *      base oscura — incluso con crop de la etiqueta y DCT 256-bit.
 *      Tests con threshold 4 dieron pares ridículos como "Aperitivo
 *      Cynar" ↔ "Las Perdices Malbec". Para distinguir vinos por
 *      imagen necesitamos OCR de la etiqueta o CLIP embeddings —
 *      pHash perceptual hashing NO es el camino.
 *
 *   Conclusión accionable para el equipo:
 *     - Usar threshold=0 como diagnóstico de data quality y como prior
 *       fuerte en Stage 2 (cuando dos grupos con embeddings parecidos
 *       tienen pHash idéntico, casi seguro son el mismo packshot).
 *     - Para matching visual entre vinos distintos, evaluar CLIP en
 *       otra iteración.
 *
 * Cache: data/phash-cache.ndjson — pHash por imageUrl (no por
 * groupSlug, así sobrevive a re-builds del snapshot). Restaurable en
 * CI vía actions/cache@v3 con la misma estrategia que stage2 / stage3.
 *
 * Uso:
 *   node scripts/find-phash-duplicates.mjs                # exactos sólo (~8min en 20k grupos)
 *   node scripts/find-phash-duplicates.mjs --limit 500    # subset para iterar
 *   node scripts/find-phash-duplicates.mjs --threshold 4  # incluye near-dupes (sabiendo que son ruidosos)
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  createWriteStream,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { computePHash, hammingDistance } from "./lib-phash.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SNAPSHOT = resolve(ROOT, "data/snapshot.json");
const CACHE = resolve(ROOT, "data/phash-cache.ndjson");

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(args[limitArg + 1]) : 0;
const thrArg = args.indexOf("--threshold");
// Default 0 — sólo matches exactos, alta confianza. Pasar --threshold N
// para explorar el espacio de near-dupes con la advertencia conocida de
// que >0 produce falsos positivos para botellas de vino.
const THRESHOLD = thrArg !== -1 ? Number(args[thrArg + 1]) : 0;

const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 12_000;

// Placeholders / imágenes genéricas reutilizadas que no aportan dedup.
// Se mantiene en sync con find-image-duplicates.mjs.
const PLACEHOLDER_PATTERNS = [
  /\/no-?photo\b/i,
  /\/no-?image\b/i,
  /\/placeholder/i,
  /\/default[-_]?(big|image|photo|thumb)?\.(jpg|jpeg|png|webp|gif)$/i,
  /\/blank\.(jpg|jpeg|png|webp|gif)$/i,
  /\/woocommerce-placeholder/i,
  /\/captura-de-pantalla/i,
  /\/screenshot[-_]/i,
  /\/(gift[-_]?card|gcv-|tarjeta[-_]?regalo)/i,
];
function isPlaceholderUrl(u) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(u));
}

async function fetchImage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "image/webp,image/avif,image/png,image/jpeg,image/*,*/*;q=0.8",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("empty body");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

function loadCache() {
  const map = new Map();
  if (!existsSync(CACHE)) return map;
  const raw = readFileSync(CACHE, "utf8");
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const { u, h } = JSON.parse(line);
      if (u) map.set(u, h); // h puede ser null = "intentamos y falló"
    } catch {
      // línea corrupta, skip
    }
  }
  return map;
}

async function computeWithCache(url, cache, cacheStream) {
  if (cache.has(url)) return cache.get(url);
  try {
    const buf = await fetchImage(url);
    const hash = await computePHash(buf);
    cache.set(url, hash);
    cacheStream.write(JSON.stringify({ u: url, h: hash }) + "\n");
    return hash;
  } catch {
    // Cacheamos null para no reintentar URLs muertas en sucesivos
    // runs. Si la URL eventualmente vuelve a la vida, basta con
    // borrar la línea del .ndjson manualmente.
    cache.set(url, null);
    cacheStream.write(JSON.stringify({ u: url, h: null }) + "\n");
    return null;
  }
}

async function runWithConcurrency(items, fn, n) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = new Array(n).fill(0).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  let groups = snap.productGroups ?? [];
  groups = groups.filter(
    (g) =>
      g.imageUrl &&
      typeof g.imageUrl === "string" &&
      !isPlaceholderUrl(g.imageUrl) &&
      g.offers?.length,
  );
  if (LIMIT > 0) groups = groups.slice(0, LIMIT);

  console.log(
    `pHash DCT 256-bit · ${groups.length} grupos · threshold=${THRESHOLD}/256`,
  );

  const cache = loadCache();
  console.log(`Cache: ${cache.size} entradas previas`);
  const cacheStream = createWriteStream(CACHE, { flags: "a" });

  const t0 = Date.now();
  let processed = 0;
  const hashes = await runWithConcurrency(
    groups,
    async (g) => {
      const h = await computeWithCache(g.imageUrl, cache, cacheStream);
      processed++;
      if (processed % 200 === 0)
        process.stdout.write(`  ${processed}/${groups.length}\r`);
      return h;
    },
    CONCURRENCY,
  );
  cacheStream.end();
  await new Promise((r) => cacheStream.on("close", r));
  const validCount = hashes.filter((h) => h).length;
  const failedCount = hashes.filter((h) => h === null).length;
  console.log(
    `\nHashes: ${validCount} válidos / ${failedCount} fallidos en ${Math.round((Date.now() - t0) / 1000)}s`,
  );

  // Bucket por hash exacto — captura "mismo packshot, distinto CDN".
  const byHash = new Map();
  for (let i = 0; i < groups.length; i++) {
    const h = hashes[i];
    if (!h) continue;
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(i);
  }

  const exactClusters = [...byHash.values()].filter((arr) => arr.length >= 2);
  exactClusters.sort((a, b) => b.length - a.length);
  console.log(
    `\n=== EXACT (pHash idéntico — mismo packshot, posible CDN o resolución distinta) ===`,
  );
  console.log(`Total: ${exactClusters.length} clusters`);
  // Heurística: si un cluster tiene ≥5 grupos con brands DISTINTAS
  // probablemente es un placeholder genérico del CDN, no un dupe real.
  // Reportamos esos primero como "data quality" alerts — el equipo
  // puede agregar la URL al PLACEHOLDER_PATTERNS de find-image-duplicates.
  const placeholderSuspects = [];
  const realCandidates = [];
  for (const cluster of exactClusters) {
    const brands = new Set(
      cluster.map((i) => (groups[i].brand ?? "").toLowerCase()).filter(Boolean),
    );
    if (cluster.length >= 5 && brands.size >= 3) {
      placeholderSuspects.push(cluster);
    } else {
      realCandidates.push(cluster);
    }
  }
  if (placeholderSuspects.length > 0) {
    console.log(
      `\n  ⚠ ${placeholderSuspects.length} cluster(s) parecen PLACEHOLDER del CDN (≥5 grupos con marcas distintas):`,
    );
    for (const cluster of placeholderSuspects) {
      const url = groups[cluster[0]].imageUrl;
      console.log(
        `    placeholder candidate (${cluster.length} grupos): ${url}`,
      );
      console.log(`      → considerá agregar al PLACEHOLDER_PATTERNS`);
    }
  }
  for (const cluster of realCandidates.slice(0, 20)) {
    console.log(`\n  ${cluster.length} grupos comparten pHash:`);
    for (const i of cluster) {
      const g = groups[i];
      console.log(
        `    sc=${String(g.storeCount).padStart(2)}  ${(g.brand ?? "∅").padEnd(22)}  ${g.canonicalName.slice(0, 60)}`,
      );
    }
  }

  // Near-duplicates: para los hashes únicos, comparar pares con
  // distancia ≤ THRESHOLD. O(n²) sobre |uniqueHashes|; en 20k grupos
  // con ~15k hashes únicos eso son ~225M comparaciones — manejable.
  const uniqueHashes = [...byHash.keys()];
  console.log(
    `\n=== NEAR (dist ≤ ${THRESHOLD}/256, excluyendo exactos) sobre ${uniqueHashes.length} hashes únicos ===`,
  );
  const t1 = Date.now();
  const nearPairs = [];
  for (let i = 0; i < uniqueHashes.length; i++) {
    for (let j = i + 1; j < uniqueHashes.length; j++) {
      const d = hammingDistance(uniqueHashes[i], uniqueHashes[j]);
      if (d > 0 && d <= THRESHOLD) {
        const aMembers = byHash.get(uniqueHashes[i]);
        const bMembers = byHash.get(uniqueHashes[j]);
        for (const ai of aMembers) {
          for (const bi of bMembers) {
            if (groups[ai].groupSlug !== groups[bi].groupSlug) {
              nearPairs.push({ a: ai, b: bi, d });
            }
          }
        }
      }
    }
  }
  nearPairs.sort((a, b) => a.d - b.d);
  console.log(`Total: ${nearPairs.length} pares en ${Math.round((Date.now() - t1) / 1000)}s`);
  for (const p of nearPairs.slice(0, 20)) {
    const a = groups[p.a];
    const b = groups[p.b];
    console.log(
      `\n  d=${p.d}  sc ${a.storeCount}+${b.storeCount}=${a.storeCount + b.storeCount}`,
    );
    console.log(
      `    A: ${(a.brand ?? "∅").padEnd(22)}  ${a.canonicalName.slice(0, 60)}`,
    );
    console.log(
      `    B: ${(b.brand ?? "∅").padEnd(22)}  ${b.canonicalName.slice(0, 60)}`,
    );
  }

  // Persistir
  const out = {
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt: snap.generatedAt,
    algorithm: "phash-dct-256-with-label-crop",
    threshold: THRESHOLD,
    groupCount: groups.length,
    validHashes: validCount,
    failedHashes: failedCount,
    exactClusters: exactClusters.map((arr) =>
      arr.map((i) => groups[i].groupSlug),
    ),
    nearPairs: nearPairs.map((p) => ({
      a: groups[p.a].groupSlug,
      b: groups[p.b].groupSlug,
      d: p.d,
    })),
  };
  const outPath = resolve(ROOT, "data/phash-candidates.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(
    `\nWrote ${outPath} — ${exactClusters.length} exact + ${nearPairs.length} near pairs`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
