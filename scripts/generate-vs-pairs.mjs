#!/usr/bin/env node
/**
 * Genera la lista de pares "vs" que se pre-renderan como páginas SEO
 * de cola larga (/vs/catena-dv-malbec-vs-alamos-malbec).
 *
 * Lógica de selección: para cada par de grupos con
 *   · MISMO varietal primario
 *   · storeCount >= 3 ambos (es importante que ambos sean comparables —
 *     una comparación tipo "X vs Y" con Y en 1 sola tienda no aporta)
 *   · price ratio máx 3x (vinos en órdenes de magnitud distintos no
 *     se comparan, sería forzado)
 *   · NO mismo brand (comparar dos productos de la misma bodega es
 *     menos útil que cross-bodega)
 *
 * Sort: total storeCount desc (los más populares primero, mayor SEO).
 *
 * Output: data/vs-pairs.json con shape:
 *   {
 *     generatedAt: ISO,
 *     pairCount: N,
 *     pairs: [
 *       { slugA, slugB, varietal, totalStoreCount }
 *     ]
 *   }
 *
 * Run: node scripts/generate-vs-pairs.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");
const OUT = path.join(ROOT, "data/vs-pairs.json");

const MAX_PAIRS = 400; // suficiente para SEO long tail sin inflar sitemap
const MIN_STORE_COUNT = 3;
const MAX_PRICE_RATIO = 3; // descarta comparar $5k vs $50k

// Mismos filtros que looksLikeWineGroup en lib/snapshot.ts
const NON_WINE_RE =
  /\b(whisk[eí]y?|gin|vodka|ron|tequila|mezcal|licor|vermut|fern|granadina|aperol|campari|cinzano|martini|cynar|amaretto|bitter|chartreuse|absent|jagermeister|jack[\s-]?daniels|smirnoff|absolut|cerveza|beer|glenlivet|hendricks|bombay|tanqueray|bushmills|chivas|johnny[\s-]?walker|jameson|macallan|aberlour)\b/i;

function main() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));

  // Filtrar a grupos que cumplen los criterios base.
  const eligible = (snapshot.productGroups ?? []).filter((g) => {
    if (!g.brand || g.brand.length < 2) return false;
    if ((g.storeCount ?? 0) < MIN_STORE_COUNT) return false;
    if (!g.canonicalName || NON_WINE_RE.test(g.canonicalName)) return false;
    if (typeof g.minPrice !== "number" || g.minPrice <= 0) return false;
    if (!g.varietals || g.varietals.length === 0) return false;
    return true;
  });

  // Bucket por varietal primario.
  const byVarietal = new Map();
  for (const g of eligible) {
    const v = g.varietals[0].toLowerCase();
    if (!byVarietal.has(v)) byVarietal.set(v, []);
    byVarietal.get(v).push(g);
  }

  // Generamos pares dentro de cada bucket.
  const pairs = [];
  for (const [varietal, bucket] of byVarietal.entries()) {
    // Ordenar por storeCount desc para que los pares "top vs top" salgan
    // primero — los que más SEO valen.
    bucket.sort((a, b) => (b.storeCount ?? 0) - (a.storeCount ?? 0));
    // Top 25 por varietal para no explotar combinatoriamente. Eso da
    // 25*24/2 = 300 pares por varietal máx; con ~15 varietales activos
    // total ~4500 pares pre-filtro, post-filtro ~1000.
    const top = bucket.slice(0, 25);

    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i];
        const b = top[j];
        if (a.brand?.toLowerCase() === b.brand?.toLowerCase()) continue;
        const ratio =
          Math.max(a.minPrice, b.minPrice) /
          Math.min(a.minPrice, b.minPrice);
        if (ratio > MAX_PRICE_RATIO) continue;
        // Slug canónico: orden alfabético entre los dos para que
        // /vs/a-vs-b y /vs/b-vs-a no sean URLs distintas.
        const [first, second] = [a.groupSlug, b.groupSlug].sort();
        pairs.push({
          slug: `${first}-vs-${second}`,
          slugA: first,
          slugB: second,
          varietal,
          totalStoreCount: (a.storeCount ?? 0) + (b.storeCount ?? 0),
        });
      }
    }
  }

  // Dedupe por slug (puede haber duplicados si dos varietales matchean
  // el mismo par — raro pero posible cuando un grupo tiene varios
  // varietales y comparten con otro grupo en dos buckets distintos).
  const seen = new Set();
  const uniquePairs = pairs.filter((p) => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });

  uniquePairs.sort((a, b) => b.totalStoreCount - a.totalStoreCount);

  const top = uniquePairs.slice(0, MAX_PAIRS);

  const payload = {
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt: snapshot.generatedAt ?? null,
    pairCount: top.length,
    totalCandidates: uniquePairs.length,
    pairs: top,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(
    `wrote ${OUT} — ${top.length} pairs (de ${uniquePairs.length} candidatos totales)`,
  );
  // Sample top 5 para que el log del workflow muestre algo útil.
  for (const p of top.slice(0, 5)) {
    console.log(
      `  · ${p.slug} (${p.varietal}, ${p.totalStoreCount} stores totales)`,
    );
  }
}

main();
