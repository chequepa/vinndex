/**
 * Índice Vinndex de vinotecas: "¿cuál es la vinoteca más barata?"
 *
 * La métrica tiene que ser defendible frente a la vinoteca que sale mal
 * parada, así que se apoya en tres decisiones:
 *
 *   1. Se comparan los MISMOS vinos. Una vinoteca no es "cara" por vender
 *      Catena Zapata en vez de Portillo: cada oferta se mide contra la
 *      mediana de su propia ficha.
 *   2. Solo entran las ofertas que forman la base de precio de una ficha
 *      (`isPriceBasisOffer`: en stock, precio ≥ $1.000, botella suelta de
 *      750 ml, sin colección, sin precio sospechoso) y solo en fichas
 *      donde compiten al menos 3 vinotecas. Con 2 no hay "mercado".
 *   3. Mediana, no mínimo ni promedio: un scraper que parsea mal un
 *      precio no mueve el índice de nadie.
 *
 * Por ficha y vinoteca se toma UNA oferta (la más barata de esa vinoteca
 * en esa ficha): si una tienda lista tres cosechas del mismo vino no
 * pesa tres veces, y la mediana del mercado también se calcula sobre un
 * precio por vinoteca.
 *
 * El índice de una vinoteca es la mediana de sus ratios precio/mediana.
 * 0,91 = "9% más barata que el mercado"; 1,12 = "+12% respecto al
 * mercado". Se publica solo con ≥ 30 vinos comparables; con menos, la
 * vinoteca tiene página pero queda fuera del ranking ("muestra chica").
 *
 * Todo sale del snapshot (inmutable durante la vida del proceso), así que
 * se calcula una vez y se cachea a nivel módulo, como `brandPages()`.
 */
import storesConfig from "@/data/stores.json";
import storeActivityJson from "@/data/store-activity.json";
import type { ProductGroup } from "./matching";
import { groups, isPriceBasisOffer, storeName, displayBrand } from "./snapshot";
import { wineFullName } from "./wineNames";

/** Mínimo de vinotecas en la base de una ficha para que cuente como mercado. */
export const MIN_STORES_PER_WINE = 3;
/** Mínimo de vinos comparables para publicar el índice de una vinoteca. */
export const MIN_SAMPLE = 30;
/** Máximo de "mejores precios" que guardamos por vinoteca. */
const MAX_BEST_DEALS = 24;
/** Con menos vinos relevados la página es thin: noindex y fuera del sitemap. */
export const MIN_INDEXABLE_WINES = 3;

export type PriceBandKey = "hasta-10k" | "10k-25k" | "mas-25k";

export type PriceBand = {
  key: PriceBandKey;
  /** Etiqueta corta para UI ("Hasta $10.000"). */
  label: string;
  /** Fichas de la banda en las que la vinoteca compite. */
  competed: number;
  /** De esas, en cuántas tiene el mejor precio (empates cuentan). */
  best: number;
  /** best / competed en %, o null si no compite en la banda. */
  sharePct: number | null;
};

export type StoreBestDeal = {
  slug: string;
  name: string;
  brand: string | null;
  /** Precio de la vinoteca en esa ficha. */
  priceArs: number;
  /** Mediana del mercado (un precio por vinoteca) en esa ficha. */
  medianArs: number;
  /** Ahorro vs. la mediana, en % entero (≥ 1). */
  savingPct: number;
};

export type StoreIndex = {
  slug: string;
  name: string;
  baseUrl: string;
  /** Mediana de precio/mediana-del-mercado. null = muestra chica. */
  index: number | null;
  /** Posición en el ranking (1 = más barata). null = muestra chica. */
  rank: number | null;
  /** Fichas con ≥ 3 vinotecas en las que la vinoteca compite. */
  comparableCount: number;
  /** Fichas en las que tiene el precio mínimo de la base (empates cuentan). */
  bestPriceCount: number;
  /** Fichas con al menos una oferta suya (con o sin stock). */
  totalWines: number;
  bestDeals: StoreBestDeal[];
  cheapestShareByBand: PriceBand[];
  /** La vinoteca no cambió ningún precio en 60+ días (data/store-activity.json):
   * sus precios no compiten y queda fuera del ranking. */
  stale: boolean;
  /** Última fecha (YYYY-MM-DD) en que mostró un precio distinto, si se sabe. */
  lastPriceChange: string | null;
};

/** Días sin movimiento de precios a partir de los cuales una vinoteca se considera abandonada. */
export const STALE_DAYS = 60;

type ActivityEntry = { firstSeen?: string; lastPriceChange?: string | null };
type Activity = { updatedAt?: string | null; stores?: Record<string, ActivityEntry> };
const ACTIVITY = storeActivityJson as unknown as Activity;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** slug → última fecha de cambio, para las vinotecas sin movimiento en STALE_DAYS. */
export function staleStoreMap(): Map<string, string | null> {
  const today = ACTIVITY.updatedAt ?? new Date().toISOString().slice(0, 10);
  const out = new Map<string, string | null>();
  for (const [slug, e] of Object.entries(ACTIVITY.stores ?? {})) {
    if (!e.firstSeen || daysBetween(e.firstSeen, today) < STALE_DAYS) continue;
    const last = e.lastPriceChange ?? e.firstSeen;
    if (daysBetween(last, today) >= STALE_DAYS) out.set(slug, e.lastPriceChange ?? null);
  }
  return out;
}

type StoreConfig = { slug: string; name: string; baseUrl: string };

const STORES = storesConfig as StoreConfig[];

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bandFor(medianArs: number): PriceBandKey {
  if (medianArs < 10_000) return "hasta-10k";
  if (medianArs < 25_000) return "10k-25k";
  return "mas-25k";
}

const BAND_LABELS: Record<PriceBandKey, string> = {
  "hasta-10k": "Hasta $10.000",
  "10k-25k": "$10.000 a $25.000",
  "mas-25k": "Más de $25.000",
};

function emptyBands(): Record<PriceBandKey, { competed: number; best: number }> {
  return {
    "hasta-10k": { competed: 0, best: 0 },
    "10k-25k": { competed: 0, best: 0 },
    "mas-25k": { competed: 0, best: 0 },
  };
}

type Accumulator = {
  ratios: number[];
  comparableCount: number;
  bestPriceCount: number;
  wines: Set<string>;
  deals: StoreBestDeal[];
  bands: Record<PriceBandKey, { competed: number; best: number }>;
};

function newAccumulator(): Accumulator {
  return {
    ratios: [],
    comparableCount: 0,
    bestPriceCount: 0,
    wines: new Set(),
    deals: [],
    bands: emptyBands(),
  };
}

/** Un precio por vinoteca: el más bajo de sus ofertas en la base de la ficha. */
function pricesByStore(g: ProductGroup): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of g.offers ?? []) {
    if (!o.inStock || o.priceArs == null || o.priceArs <= 0) continue;
    if (!isPriceBasisOffer(o)) continue;
    const prev = out.get(o.storeSlug);
    if (prev === undefined || o.priceArs < prev) out.set(o.storeSlug, o.priceArs);
  }
  return out;
}

let cache: StoreIndex[] | null = null;
let bySlug: Map<string, StoreIndex> | null = null;

function build(): StoreIndex[] {
  const acc = new Map<string, Accumulator>();
  const known = new Set(STORES.map((s) => s.slug));
  const get = (slug: string) => {
    let a = acc.get(slug);
    if (!a) {
      a = newAccumulator();
      acc.set(slug, a);
    }
    return a;
  };

  for (const g of groups) {
    // Cobertura: cualquier oferta viva cuenta como "vino relevado".
    for (const o of g.offers ?? []) {
      if (known.has(o.storeSlug)) get(o.storeSlug).wines.add(g.groupSlug);
    }

    const prices = pricesByStore(g);
    if (prices.size < MIN_STORES_PER_WINE) continue;

    const sorted = [...prices.values()].sort((a, b) => a - b);
    const med = median(sorted);
    if (!(med > 0)) continue;
    const min = sorted[0];
    const band = bandFor(med);

    let name: string | null = null;
    let brand: string | null = null;
    for (const [slug, price] of prices) {
      if (!known.has(slug)) continue;
      const a = get(slug);
      a.ratios.push(price / med);
      a.comparableCount++;
      a.bands[band].competed++;
      if (price === min) {
        a.bestPriceCount++;
        a.bands[band].best++;
        const savingPct = Math.round(((med - price) / med) * 100);
        if (savingPct >= 1) {
          if (name === null) {
            name = wineFullName(g);
            brand = g.brand ? displayBrand(g.brand) : null;
          }
          a.deals.push({
            slug: g.groupSlug,
            name,
            brand,
            priceArs: price,
            medianArs: Math.round(med),
            savingPct,
          });
        }
      }
    }
  }

  const rows: StoreIndex[] = [];
  for (const s of STORES) {
    const a = acc.get(s.slug);
    // Sin ninguna oferta viva no hay página: la tienda está en el config
    // pero el snapshot todavía no la trae (o dejó de traerla).
    if (!a || a.wines.size === 0) continue;
    const ratios = a.ratios.slice().sort((x, y) => x - y);
    const index = ratios.length >= MIN_SAMPLE ? median(ratios) : null;
    const bestDeals = a.deals
      .sort((x, y) => y.savingPct - x.savingPct || x.priceArs - y.priceArs)
      .slice(0, MAX_BEST_DEALS);
    const cheapestShareByBand = (
      ["hasta-10k", "10k-25k", "mas-25k"] as PriceBandKey[]
    ).map((key) => {
      const b = a.bands[key];
      return {
        key,
        label: BAND_LABELS[key],
        competed: b.competed,
        best: b.best,
        sharePct: b.competed > 0 ? Math.round((b.best / b.competed) * 100) : null,
      };
    });
    const staleMap = staleStoreMap();
    const stale = staleMap.has(s.slug);
    rows.push({
      slug: s.slug,
      name: s.name || storeName(s.slug),
      baseUrl: s.baseUrl,
      // Sin movimiento de precios no hay índice publicable: sus precios
      // son de otro momento del mercado.
      index: stale ? null : index,
      rank: null,
      stale,
      lastPriceChange: stale ? (staleMap.get(s.slug) ?? null) : null,
      comparableCount: a.comparableCount,
      bestPriceCount: a.bestPriceCount,
      totalWines: a.wines.size,
      bestDeals,
      cheapestShareByBand,
    });
  }

  // Ranking: índice ascendente (más barata primero); a igual índice, la
  // que compite en más vinos. Las de muestra chica van al final, por
  // cobertura.
  rows.sort((x, y) => {
    if (x.index !== null && y.index !== null) {
      return x.index - y.index || y.comparableCount - x.comparableCount;
    }
    if (x.index !== null) return -1;
    if (y.index !== null) return 1;
    // muestra chica antes que las abandonadas
    if (x.stale !== y.stale) return x.stale ? 1 : -1;
    return (
      y.comparableCount - x.comparableCount ||
      y.totalWines - x.totalWines ||
      x.name.localeCompare(y.name, "es-AR")
    );
  });
  let rank = 0;
  for (const r of rows) {
    if (r.index !== null) r.rank = ++rank;
  }
  return rows;
}

/** Todas las vinotecas con ofertas vivas, ordenadas por índice (muestra chica al final). */
export function storeIndexAll(): StoreIndex[] {
  if (!cache) cache = build();
  return cache;
}

export function storeIndex(slug: string): StoreIndex | undefined {
  if (!bySlug) bySlug = new Map(storeIndexAll().map((s) => [s.slug, s]));
  return bySlug.get(slug);
}

/** Cantidad de vinotecas con índice publicado (denominador del "#3 de 61"). */
export function rankedStoreCount(): number {
  return storeIndexAll().filter((s) => s.index !== null).length;
}

/**
 * Índice → "-9%" / "+12%" / "0%". Redondeo entero: el índice es una
 * mediana de ratios y el decimal no aporta nada defendible.
 */
export function formatIndexPct(index: number): string {
  const pct = Math.round((index - 1) * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** Frase larga para hero/title: "9% más barata que el mercado". */
export function describeIndex(index: number): string {
  const pct = Math.round((index - 1) * 100);
  if (pct < 0) return `${-pct}% más barata que el mercado`;
  if (pct === 0) return "en línea con el mercado";
  return `+${pct}% respecto al mercado`;
}

export type IndexTone = "below" | "neutral" | "above";

/** Color del índice: verde por debajo de 0,97, terracota por encima de 1,03. */
export function indexTone(index: number): IndexTone {
  if (index < 0.97) return "below";
  if (index > 1.03) return "above";
  return "neutral";
}
