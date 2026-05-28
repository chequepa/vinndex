/**
 * Helpers para la página /explorar (Wine Compass).
 *
 * El compass mapea cada vino a un punto 2D:
 *   X = vintage (joven → guarda, derecha → izquierda en realidad porque
 *       en español leemos "guarda" como "más antiguo")
 *   Y = precio mínimo en escala log (asequible → premium)
 *
 * Los slim records que viajan al cliente solo llevan lo que el compass usa
 * (perf: ~500 vinos × ~10 campos vs ~30 campos de ProductGroup completo).
 */

import { groups, displayBrand } from "@/lib/snapshot";
import { displayWineName } from "@/lib/displayWineName";

export type CompassWine = {
  slug: string;
  name: string;
  displayName: string;
  brand: string | null;
  brandDisplay: string;
  vintage: number;
  minPrice: number;
  storeCount: number;
  varietals: string[];
  region: string | null;
  type: string | null;
  imageUrl: string | null;
};

export type CompassDataset = {
  wines: CompassWine[];
  topVarietals: { name: string; count: number }[];
  topRegions: { name: string; count: number }[];
  priceRange: { min: number; max: number };
  vintageRange: { min: number; max: number };
};

/**
 * Build the compass dataset. We cap at `limit` wines, ordered by storeCount
 * (proxy of "popularidad" / "cobertura"). This keeps the DOM under control:
 * 600 dots renders smoothly; 5k would lag interaction.
 */
export function buildCompassDataset(limit = 600): CompassDataset {
  const eligible = groups.filter(
    (g) =>
      g.storeCount >= 2 &&
      g.minPrice != null &&
      g.minPrice > 0 &&
      g.vintage != null &&
      g.vintage >= 2008 &&
      g.vintage <= 2025,
  );

  const sorted = [...eligible].sort(
    (a, b) => b.storeCount - a.storeCount || (a.minPrice ?? 0) - (b.minPrice ?? 0),
  );

  const wines: CompassWine[] = sorted.slice(0, limit).map((g) => ({
    slug: g.groupSlug,
    name: g.canonicalName,
    displayName: displayWineName(g.canonicalName),
    brand: g.brand,
    brandDisplay: displayBrand(g.brand),
    vintage: g.vintage!,
    minPrice: g.minPrice!,
    storeCount: g.storeCount,
    varietals: g.varietals ?? [],
    region: g.region ?? null,
    type: g.type ?? null,
    imageUrl: g.imageUrl ?? null,
  }));

  // Top varietals / regions ranked by count in the dataset (not the full
  // catalog) — they're filter facets, so they should match what's visible.
  const varietalCount = new Map<string, number>();
  const regionCount = new Map<string, number>();
  for (const w of wines) {
    for (const v of w.varietals) {
      varietalCount.set(v, (varietalCount.get(v) ?? 0) + 1);
    }
    if (w.region) {
      regionCount.set(w.region, (regionCount.get(w.region) ?? 0) + 1);
    }
  }
  const topVarietals = [...varietalCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topRegions = [...regionCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const prices = wines.map((w) => w.minPrice);
  const vintages = wines.map((w) => w.vintage);

  return {
    wines,
    topVarietals,
    topRegions,
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    vintageRange: { min: Math.min(...vintages), max: Math.max(...vintages) },
  };
}

/**
 * Color per wine — uses varietal first, falls back to type. The palette is
 * intentionally vinosa (no "bright purple Pinot"); each tone is a real
 * shade of the wine itself, not a chartjs default.
 */
export const VARIETAL_PALETTE: Record<string, string> = {
  Malbec: "#6B1E2E",
  "Cabernet Sauvignon": "#9C2D52",
  "Cabernet Franc": "#A03A60",
  Bonarda: "#7C2440",
  Merlot: "#892138",
  Syrah: "#651A2A",
  "Pinot Noir": "#B85072",
  Tannat: "#5A1530",
  Chardonnay: "#E8D47C",
  "Sauvignon Blanc": "#D4E8B5",
  Torrontés: "#E8C77C",
  Semillón: "#E0CB80",
  Viognier: "#DDB66E",
};

export function colorForWine(w: CompassWine): string {
  for (const v of w.varietals) {
    if (VARIETAL_PALETTE[v]) return VARIETAL_PALETTE[v];
  }
  const t = (w.type ?? "").toLowerCase();
  if (t.includes("blanc")) return "#E8D47C";
  if (t.includes("ros")) return "#E8859E";
  if (t.includes("espum")) return "#F5EDE0";
  return "#6B1E2E"; // default malbec
}
