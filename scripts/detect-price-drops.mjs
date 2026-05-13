#!/usr/bin/env node
/**
 * Detector de price drops sobre el snapshot diario.
 *
 * Lee `data/price-history.json` (rolling 30 días, mantenido por
 * scripts/track-prices.mjs) y compara el último valor de cada slug
 * contra la mediana de los 7 días previos. Si baja ≥15% lo flagea
 * como "drop".
 *
 * Output: `data/price-drops.json` con shape:
 *   {
 *     generatedAt: ISO,
 *     snapshotGeneratedAt: ISO,
 *     threshold: 0.15,
 *     drops: [
 *       { slug, brand, canonicalName, currentPrice, medianPrice7d,
 *         dropPct, storeCount, imageUrl, storeSlug }
 *     ]
 *   }
 *
 * Sort: dropPct desc (mayor baja primero). Top 50.
 *
 * Filtros anti-noise:
 *   - sólo slugs con ≥7 días de histórico (sino la mediana no es
 *     confiable — un drop "del último día" podría ser fluctuación
 *     normal).
 *   - sólo slugs multi-tienda en el snapshot actual (sino el precio
 *     es de una sola fuente y el "drop" puede ser un typo).
 *   - sólo drops ≥15% (configurable). Drops <15% son ruido.
 *
 * Run: node scripts/detect-price-drops.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");
const HISTORY = path.join(ROOT, "data/price-history.json");
const OUT = path.join(ROOT, "data/price-drops.json");

const DROP_THRESHOLD = 0.15; // 15% mínimo para considerarlo drop
const MAX_DROP = 0.7; // 70% es ridículo — probable typo del scraper o data sucia
const MIN_HISTORY_DAYS = 7; // necesitamos ≥7 días para mediana confiable
const MIN_CURRENT_PRICE = 1500; // ningún vino real argentino bajo ese piso hoy
const MAX_DROPS = 50;

// Mismo filtro que looksLikeWineGroup en lib/snapshot.ts — descartamos
// destilados/aperitivos/licores que entran al snapshot por scrapers
// que no filtran bien (Carrefour, supers). Bug histórico: el regex
// usaba "gin " con espacio que no matcheaba final-de-string. Ahora
// usamos \b consistentemente y agregamos los productores de
// destilados (Glenlivet, Hendricks, Bombay) que cuelan productos no
// vino con su brand explícito.
const NON_WINE_RE =
  /\b(whisk[eí]y?|gin|vodka|ron|tequila|mezcal|licor|vermut|fern|granadina|aperol|campari|cinzano|martini|cynar|amaretto|bitter|chartreuse|absent|jagermeister|jack[\s-]?daniels|smirnoff|absolut|cerveza|beer|glenlivet|hendricks|bombay|tanqueray|bushmills|chivas|johnny[\s-]?walker|jameson|macallan|aberlour)\b/i;

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function main() {
  if (!fs.existsSync(HISTORY)) {
    console.error("No existe data/price-history.json — nada que detectar.");
    fs.writeFileSync(
      OUT,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          snapshotGeneratedAt: null,
          threshold: DROP_THRESHOLD,
          drops: [],
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const history = JSON.parse(fs.readFileSync(HISTORY, "utf8"));
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));

  // Index del snapshot por groupSlug para enriquecer metadata.
  const groupBySlug = new Map();
  for (const g of snapshot.productGroups ?? []) {
    groupBySlug.set(g.groupSlug, g);
  }

  const drops = [];
  const histMap = history.history ?? {};

  for (const [slug, entries] of Object.entries(histMap)) {
    if (!Array.isArray(entries) || entries.length < MIN_HISTORY_DAYS) {
      continue;
    }
    // Last entry = price actual. Previous N-1 = baseline.
    const sorted = [...entries].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const last = sorted[sorted.length - 1];
    const previous = sorted.slice(0, -1).slice(-7); // últimos 7 días previos
    if (previous.length < 3) continue; // confianza mínima
    if (typeof last.min !== "number" || last.min <= 0) continue;

    const baseline = median(
      previous
        .map((p) => p.min)
        .filter((v) => typeof v === "number" && v > 0),
    );
    if (!baseline || baseline <= 0) continue;

    const dropPct = (baseline - last.min) / baseline;
    if (dropPct < DROP_THRESHOLD) continue;
    // Drop >70% es ridículo en el mercado real — casi seguro es un
    // typo del scraper ($5500 → $20) o un cambio de SKU adentro del
    // grupo. Descartamos.
    if (dropPct > MAX_DROP) continue;
    // Precio actual muy bajo = data sucia. Ningún vino argentino real
    // está bajo $1500 hoy.
    if (last.min < MIN_CURRENT_PRICE) continue;

    const g = groupBySlug.get(slug);
    if (!g) continue;
    // Multi-tienda only — un drop en un solo store puede ser typo.
    if ((g.storeCount ?? 0) < 2) continue;
    // Filtrar no-vinos que se cuelan del scraper de supers.
    if (NON_WINE_RE.test(g.canonicalName ?? "")) continue;
    // Excluímos collector offers — el cálculo del min ya las excluye,
    // pero por las dudas chequeamos que el bestOffer no lo sea.
    const bestOffer = (g.offers ?? []).find(
      (o) => o.inStock && !o.isCollector,
    );
    if (!bestOffer) continue;

    drops.push({
      slug,
      brand: g.brand ?? null,
      canonicalName: g.canonicalName,
      currentPrice: last.min,
      medianPrice7d: baseline,
      dropPct: Number(dropPct.toFixed(3)),
      storeCount: g.storeCount,
      imageUrl: g.imageUrl ?? null,
      storeSlug: bestOffer.storeSlug,
      lastDate: last.date,
    });
  }

  drops.sort((a, b) => b.dropPct - a.dropPct);

  const payload = {
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt: snapshot.generatedAt ?? null,
    threshold: DROP_THRESHOLD,
    drops: drops.slice(0, MAX_DROPS),
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(
    `wrote ${OUT} — ${payload.drops.length} drops detectados (≥${
      DROP_THRESHOLD * 100
    }% baja vs mediana 7d)`,
  );
}

main();
