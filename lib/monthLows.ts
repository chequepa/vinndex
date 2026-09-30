import { findGroup } from "@/lib/snapshot";
import priceHistoryJson from "@/data/price-history.json";
import type { PriceEntry, PriceHistory } from "@/lib/priceHistory";

const PH = priceHistoryJson as unknown as PriceHistory;

export type MonthLow = {
  slug: string;
  canonicalName: string;
  brand: string | null;
  imageUrl: string | null;
  storeCount: number;
  /** Mejor precio de hoy. */
  minPrice: number;
  /** Mínimo anterior de la ventana (sin contar hoy). */
  previousMin: number;
  /** Cuánto por debajo del mínimo anterior, en % (positivo). */
  belowPct: number;
};

let cache: { days: number; lows: MonthLow[] } | null = null;

/**
 * Vinos cuyo mejor precio de hoy es el más bajo de los últimos `days`
 * días. Se calcula sobre `data/price-history.json` (serie diaria del
 * precio mínimo publicado por ficha, sólo fichas con varias vinotecas) y
 * se cruza con el snapshot vigente para nombre/imagen. Cacheado a nivel
 * módulo: el snapshot es estático durante la vida del proceso.
 *
 * Exigimos ≥14 puntos en la serie y ≥3 vinotecas hoy para que "mínimo
 * del mes" signifique algo; un vino que apareció ayer no tiene mes.
 */
export function monthLows(days = 30): MonthLow[] {
  if (cache && cache.days === days) return cache.lows;
  const out: MonthLow[] = [];
  const history = PH.history ?? {};
  const last = PH.lastUpdated;
  for (const [slug, series] of Object.entries(history)) {
    if (!Array.isArray(series) || series.length < 14) continue;
    const latest: PriceEntry = series[series.length - 1];
    if (!last || latest.date !== last) continue; // sin dato de hoy
    if (latest.stores < 3 || !(latest.min > 0)) continue;
    const cutoff = new Date(`${latest.date}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    let previousMin = Number.POSITIVE_INFINITY;
    let points = 0;
    for (let i = 0; i < series.length - 1; i++) {
      const e = series[i];
      if (e.date < cutoffIso || !(e.min > 0)) continue;
      points++;
      if (e.min < previousMin) previousMin = e.min;
    }
    if (points < 10 || !Number.isFinite(previousMin)) continue;
    if (latest.min >= previousMin) continue;
    const g = findGroup(slug);
    if (!g || g.minPrice == null || g.minPrice <= 0) continue;
    out.push({
      slug,
      canonicalName: g.canonicalName,
      brand: g.brand,
      imageUrl: g.imageUrl ?? null,
      storeCount: g.storeCount,
      minPrice: g.minPrice,
      previousMin,
      belowPct: ((previousMin - latest.min) / previousMin) * 100,
    });
  }
  out.sort((a, b) => b.belowPct - a.belowPct || b.storeCount - a.storeCount);
  cache = { days, lows: out };
  return out;
}
