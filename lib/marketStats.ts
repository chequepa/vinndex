import { groups, snapshot } from "./snapshot";
import { brandPages } from "./snapshot";
import type { ProductGroup } from "./matching";

/**
 * Agregados públicos del mercado argentino del vino, derivados del
 * snapshot diario. Alimenta `/data` (la página pública) y cualquier
 * consumidor de stats agregadas.
 */

type Slice = {
  name: string;
  count: number;
  pct: number;
  medianPrice: number | null;
};

export type MarketStats = {
  snapshotGeneratedAt: string;
  totals: {
    storeCount: number;
    groupCount: number;
    multiStoreGroupCount: number;
    productCount: number;
    brandCount: number;
  };
  /** Distribución por varietal — top 12, count + median min price. */
  varietals: Slice[];
  /** Distribución por región — solo las que tienen ≥3 grupos. */
  regions: Slice[];
  /** Distribución por tipo (Tinto, Blanco, Espumante, …). */
  types: Slice[];
  /** Distribución por banda de precio (rangos pre-definidos). */
  priceBands: {
    label: string;
    min: number;
    max: number | null;
    count: number;
    pct: number;
  }[];
  /** Top 10 bodegas por cobertura (storeCount). */
  topBrands: {
    slug: string;
    name: string;
    groupCount: number;
    storeCount: number;
  }[];
};

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
}

function distinctOrFirstVarietal(g: ProductGroup): string | null {
  return g.varietals?.[0] ?? null;
}

const VARIETAL_BLACKLIST = new Set([
  // "Cabernet" sin sufijo es ambigua y entra a fuerza por captura del
  // regex de matching. La excluimos del público; cada vino real cae en
  // "Cabernet Sauvignon" o "Cabernet Franc".
  "Cabernet",
]);

const PRICE_BANDS = [
  { label: "Hasta $5.000", min: 0, max: 5_000 },
  { label: "$5.000 — $10.000", min: 5_000, max: 10_000 },
  { label: "$10.000 — $20.000", min: 10_000, max: 20_000 },
  { label: "$20.000 — $40.000", min: 20_000, max: 40_000 },
  { label: "$40.000 — $80.000", min: 40_000, max: 80_000 },
  { label: "Más de $80.000", min: 80_000, max: null as number | null },
];

export function getMarketStats(): MarketStats {
  // Sólo grupos con price y multi-tienda — son los "comprables" reales.
  const real = groups.filter(
    (g) => typeof g.minPrice === "number" && g.minPrice > 0 && g.storeCount >= 2,
  );
  const totalReal = real.length;

  // Varietals
  const byVar = new Map<string, ProductGroup[]>();
  for (const g of real) {
    const v = distinctOrFirstVarietal(g);
    if (!v || VARIETAL_BLACKLIST.has(v)) continue;
    if (!byVar.has(v)) byVar.set(v, []);
    byVar.get(v)!.push(g);
  }
  const varietals: Slice[] = [...byVar.entries()]
    .map(([name, gs]) => ({
      name,
      count: gs.length,
      pct: gs.length / totalReal,
      medianPrice: median(
        gs.map((g) => g.minPrice).filter((p): p is number => !!p && p > 0),
      ),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Regiones
  const byReg = new Map<string, ProductGroup[]>();
  for (const g of real) {
    if (!g.region) continue;
    if (!byReg.has(g.region)) byReg.set(g.region, []);
    byReg.get(g.region)!.push(g);
  }
  const regions: Slice[] = [...byReg.entries()]
    .map(([name, gs]) => ({
      name,
      count: gs.length,
      pct: gs.length / totalReal,
      medianPrice: median(
        gs.map((g) => g.minPrice).filter((p): p is number => !!p && p > 0),
      ),
    }))
    .filter((r) => r.count >= 3)
    .sort((a, b) => b.count - a.count);

  // Types
  const byType = new Map<string, number>();
  for (const g of real) {
    if (!g.type) continue;
    byType.set(g.type, (byType.get(g.type) ?? 0) + 1);
  }
  const types: Slice[] = [...byType.entries()]
    .map(([name, count]) => ({
      name,
      count,
      pct: count / totalReal,
      medianPrice: null,
    }))
    .sort((a, b) => b.count - a.count);

  // Price bands
  const priceBands = PRICE_BANDS.map((band) => {
    const count = real.filter(
      (g) =>
        g.minPrice! >= band.min &&
        (band.max === null || g.minPrice! < band.max),
    ).length;
    return {
      ...band,
      count,
      pct: count / totalReal,
    };
  });

  // Top brands
  const bp = brandPages();
  const topBrands = bp.slice(0, 10).map((b) => ({
    slug: b.slug,
    name: b.name,
    groupCount: b.groupCount,
    storeCount: b.storeCount,
  }));

  return {
    snapshotGeneratedAt: snapshot.generatedAt,
    totals: {
      storeCount: snapshot.storeCount ?? 0,
      groupCount: snapshot.groupCount ?? 0,
      multiStoreGroupCount: snapshot.multiStoreGroupCount ?? 0,
      productCount: snapshot.productCount ?? 0,
      brandCount: bp.length,
    },
    varietals,
    regions,
    types,
    priceBands,
    topBrands,
  };
}
