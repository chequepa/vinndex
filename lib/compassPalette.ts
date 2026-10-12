/**
 * Tipos y paleta del compass de /explorar, sin dependencias: lo importa
 * components/WineCompass.tsx ("use client"). Ver la nota de lib/format.ts
 * sobre por qué nada de cliente puede importar de lib/snapshot.ts ni de
 * módulos que lo importen (lib/compass.ts sí lo hace).
 */

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
