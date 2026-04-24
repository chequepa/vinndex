import priceHistoryJson from "@/data/price-history.json";

export type PriceEntry = {
  date: string; // YYYY-MM-DD
  min: number;
  stores: number;
};

export type PriceHistory = {
  lastUpdated: string | null;
  minStoreCount: number;
  maxDays: number;
  history: Record<string, PriceEntry[]>;
};

const PH = priceHistoryJson as unknown as PriceHistory;

/** Series of entries for a slug, oldest first. Empty array if no history. */
export function getPriceHistory(slug: string): PriceEntry[] {
  const series = PH.history?.[slug];
  return Array.isArray(series) ? series : [];
}

/** Pct change over the given lookback window. Positive = went up. */
export function priceDelta(
  series: PriceEntry[],
  days = 7,
): { pct: number; fromPrice: number; toPrice: number } | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  // Find the entry closest to `days` ago.
  const target = new Date(latest.date);
  target.setDate(target.getDate() - days);
  const targetIso = target.toISOString().slice(0, 10);
  let baseline: PriceEntry | undefined;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].date <= targetIso) {
      baseline = series[i];
      break;
    }
  }
  if (!baseline) baseline = series[0];
  if (!baseline || baseline.min === 0) return null;
  const pct = ((latest.min - baseline.min) / baseline.min) * 100;
  return {
    pct,
    fromPrice: baseline.min,
    toPrice: latest.min,
  };
}
