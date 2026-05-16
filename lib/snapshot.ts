import snapshotJson from "@/data/snapshot.json";
import type { ScrapedProduct } from "./adapters/types";
import type { ProductGroup } from "./matching";
import { bestScoreFor } from "./scores";

export type SnapshotStore = {
  storeSlug: string;
  storeName: string;
  startedAt: string;
  durationMs: number;
  pagesFetched: number;
  productCount: number;
  errors: string[];
};

export type Snapshot = {
  generatedAt: string;
  generator: string;
  maxPagesPerStore?: number;
  sources?: { platform: string; path: string; generatedAt: string }[];
  storeCount: number;
  productCount: number;
  stores: SnapshotStore[];
  /** Legacy — dropped from shipped snapshot in favor of productGroups[].offers[]. */
  products?: ScrapedProduct[];
  productGroups?: ProductGroup[];
  groupCount?: number;
  multiStoreGroupCount?: number;
  groupsGeneratedAt?: string;
};

export const snapshot = snapshotJson as Snapshot;

export function snapshotStats() {
  let inStock = 0;
  let withPrice = 0;
  let withBrand = 0;
  for (const g of groups) {
    for (const o of g.offers) {
      if (o.inStock) inStock++;
      if (o.priceArs !== null && o.priceArs > 0) withPrice++;
    }
    if (g.brand) {
      for (const _ of g.offers) withBrand++;
    }
  }
  return {
    productCount: snapshot.productCount,
    storeCount: snapshot.storeCount,
    generatedAt: snapshot.generatedAt,
    inStock,
    withPrice,
    withBrand,
    groupCount: snapshot.groupCount ?? 0,
    multiStoreGroupCount: snapshot.multiStoreGroupCount ?? 0,
  };
}

/** All productGroups (sorted by relevance — multi-store first, then price).
 *
 * Dos normalizaciones runtime sobre el snapshot:
 *
 * 1. **`offerCount`** — el pipeline tiene 4 stages que setean el campo y
 *    dos de ellas (build-groups, stage1b, stage3) lo computan como
 *    `inStock.length` mientras que stage2 / remerge / split usan
 *    `offers.length`. Resultado: ~28% del catálogo termina desincronizado.
 *    Lo recomputamos como `offers.length` (total) que es lo que el campo
 *    dice ser. Para "ofertas con stock" usar `inStockOfferCount`.
 *
 * 2. **`inStock` vs `priceArs`** — varios adapters marcan ofertas como
 *    `inStock=true` aunque no pudieron extraer el precio (priceArs=null),
 *    lo que hace que la UI muestre "Consultar precio" para algo
 *    teóricamente disponible. Si no hay precio no es realmente comprable,
 *    así que forzamos inStock a false. El fix correcto sería en cada
 *    adapter pero son 8 platforms y este punto cubre todos.
 */
export const groups: ProductGroup[] = (snapshot.productGroups ?? []).map(
  (g: ProductGroup) => ({
    ...g,
    offers: (g.offers ?? []).map((o) =>
      o.inStock && o.priceArs == null ? { ...o, inStock: false } : o,
    ),
    offerCount: g.offers?.length ?? 0,
  }),
);

export function findGroup(slug: string): ProductGroup | undefined {
  return groups.find((g) => g.groupSlug === slug);
}

function groupPriceKey(g: ProductGroup): number {
  return g.minPrice != null && g.minPrice > 0
    ? g.minPrice
    : Number.POSITIVE_INFINITY;
}

export type SortKey =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "stores-desc"
  | "name-asc"
  | "score-desc";

export type SearchOptions = {
  multiStoreOnly?: boolean;
  varietal?: string | null;
  type?: string | null;
  region?: string | null;
  sort?: SortKey;
  /**
   * Sólo grupos con al menos 1 oferta in-stock (típicamente lo que el
   * usuario quiere — vinos comprables hoy). Mantenemos opt-in para no
   * romper páginas que sí muestran out-of-stock (e.g. ficha).
   */
  inStockOnly?: boolean;
  /** Filtro de rango de precio sobre `g.minPrice`. */
  priceMin?: number | null;
  priceMax?: number | null;
  /**
   * Filtro multi-bodega: array de brand keys (lowercased). Si hay >=1,
   * el grupo tiene que matchear alguna.
   */
  brands?: string[] | null;
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Relevance score of a group against a user query. Higher = more
 * relevant. Rewards phrase matches, prefix matches, brand matches,
 * storeCount (more stores = more likely to be the one the user
 * actually meant), and penalises long noisy names that happened to
 * include the tokens (e.g., "Vino Blah Blah Malbec X Blah" shouldn't
 * beat "Malbec").
 */
function relevanceScore(
  g: ProductGroup,
  phrase: string,
  tokens: string[],
): number {
  const name = stripAccents(g.canonicalName.toLowerCase());
  const brand = stripAccents((g.brand ?? "").toLowerCase());
  // Compose a virtual "brand + name" haystack so phrases that span
  // brand→name (e.g. "zuccardi concreto" when the brand is Zuccardi and
  // the name is "Concreto Malbec") count as contiguous hits.
  const combined = brand ? `${brand} ${name}` : name;

  let score = 0;

  // Bodega browsing mode: single-token query that matches the brand
  // exactly. User is likely exploring that bodega's catalog — rank by
  // storeCount so flagship wines surface first.
  if (tokens.length === 1 && brand && brand === tokens[0]) {
    score += 100 + Math.min(g.storeCount, 30) * 10;
  }

  // Full phrase hit — strong signal for specific searches. Works on the
  // combined haystack so "zuccardi concreto" matches even when brand and
  // name are stored separately.
  if (name.startsWith(phrase)) score += 300;
  else if (combined.startsWith(phrase)) score += 240;
  else if (name.includes(phrase)) score += 180;
  else if (combined.includes(phrase)) score += 130;

  if (brand && phrase.length >= 3) {
    if (brand.startsWith(phrase)) score += 120;
    else if (brand.includes(phrase)) score += 60;
  }

  // Per-token matches. Word-boundary hit > substring.
  for (const t of tokens) {
    if (t.length === 0) continue;
    const wordRe = new RegExp(`\\b${t}\\b`);
    if (wordRe.test(combined)) score += 30;
    else if (combined.includes(t)) score += 8;
  }

  // Social proof: more stores = more likely to be the SKU users want.
  score += Math.min(g.storeCount, 25) * 5;

  // Penalise long names, but only above a threshold so normal wine
  // names ("Rutini Cabernet Malbec" = 22 chars) aren't hurt. Kicks in
  // for the "Box Varietal Gran Enemigo 3 botellas + accesorios" kind
  // of noisy names.
  if (name.length > 30) score -= (name.length - 30) * 0.6;

  // Boost wines with price data (in stock somewhere).
  if (g.minPrice != null && g.minPrice > 0) score += 10;

  return score;
}

function groupComparator(
  sort: SortKey,
  query: string,
): (a: ProductGroup, b: ProductGroup) => number {
  switch (sort) {
    case "price-desc":
      return (a, b) => {
        const ap = a.minPrice ?? -1;
        const bp = b.minPrice ?? -1;
        if (ap === -1 && bp !== -1) return 1;
        if (bp === -1 && ap !== -1) return -1;
        if (ap !== bp) return bp - ap;
        return b.storeCount - a.storeCount;
      };
    case "stores-desc":
      return (a, b) => {
        if (a.storeCount !== b.storeCount)
          return b.storeCount - a.storeCount;
        return groupPriceKey(a) - groupPriceKey(b);
      };
    case "name-asc":
      return (a, b) =>
        a.canonicalName.localeCompare(b.canonicalName, "es-AR");
    case "score-desc": {
      // Mejor puntaje de crítico primero — usamos la pivot 100 de
      // James Suckling / Robert Parker / etc. Si no hay scores en
      // ningún crítico, el grupo cae al final ordenado por price.
      return (a, b) => {
        const sa = bestScoreFor(a.groupSlug);
        const sb = bestScoreFor(b.groupSlug);
        if (sa !== sb) return sb - sa;
        return groupPriceKey(a) - groupPriceKey(b);
      };
    }
    case "relevance": {
      const phrase = stripAccents(query.toLowerCase().trim());
      const tokens = phrase ? phrase.split(/\s+/).filter(Boolean) : [];
      return (a, b) => {
        const sa = relevanceScore(a, phrase, tokens);
        const sb = relevanceScore(b, phrase, tokens);
        if (sa !== sb) return sb - sa;
        return groupPriceKey(a) - groupPriceKey(b);
      };
    }
    case "price-asc":
    default:
      return (a, b) => {
        if (groupPriceKey(a) !== groupPriceKey(b))
          return groupPriceKey(a) - groupPriceKey(b);
        return b.storeCount - a.storeCount;
      };
  }
}

export function searchGroups(
  query: string,
  limit = 48,
  options: SearchOptions = {},
): ProductGroup[] {
  const q = stripAccents(query.trim().toLowerCase());
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  // Non-wines (beer, spirits, food items) are excluded from /buscar even
  // when they're in the snapshot — Vinndex is a wine comparator, surfacing
  // "Leffe cerveza" or "Grana Padano queso" as top results destroys trust.
  let source = groups.filter(looksLikeWineGroup);

  if (options.multiStoreOnly) {
    source = source.filter((g) => g.storeCount >= 2);
  }
  if (options.inStockOnly) {
    // storeCount > 0 implica al menos una oferta in-stock (ver
    // build-groups.mjs: el statsBasis se calcula sólo con in-stock).
    source = source.filter((g) => (g.storeCount ?? 0) >= 1);
  }
  if (options.varietal) {
    const v = options.varietal.toLowerCase();
    source = source.filter((g) =>
      (g.varietals ?? []).some((x) => x.toLowerCase() === v),
    );
  }
  if (options.type) {
    const t = options.type.toLowerCase();
    source = source.filter((g) => g.type?.toLowerCase() === t);
  }
  if (options.region) {
    const r = options.region.toLowerCase();
    source = source.filter((g) => g.region?.toLowerCase() === r);
  }
  if (options.brands && options.brands.length > 0) {
    const set = new Set(options.brands.map((b) => b.toLowerCase()));
    source = source.filter((g) =>
      g.brand ? set.has(g.brand.toLowerCase()) : false,
    );
  }
  if (typeof options.priceMin === "number") {
    const min = options.priceMin;
    source = source.filter(
      (g) => typeof g.minPrice === "number" && g.minPrice >= min,
    );
  }
  if (typeof options.priceMax === "number") {
    const max = options.priceMax;
    source = source.filter(
      (g) => typeof g.minPrice === "number" && g.minPrice <= max,
    );
  }

  const filtered = q
    ? source.filter((g) => {
        const haystack = stripAccents(
          `${g.canonicalName} ${g.brand ?? ""}`.toLowerCase(),
        );
        return tokens.every((t) => haystack.includes(t));
      })
    : source;

  // When the user has a query and hasn't picked a sort, default to
  // relevance — a cheap Monnalisa should not outrank an exact-match A
  // Lisa when the user typed "a lisa".
  const effectiveSort: SortKey =
    options.sort ?? (q ? "relevance" : "price-asc");

  return [...filtered]
    .sort(groupComparator(effectiveSort, q))
    .slice(0, limit);
}

/**
 * Return wines similar to the one passed in — for the "otros que te
 * pueden gustar" section at the bottom of /vino/[slug]. Ranking:
 *
 *   varietal match (+3) · region match (+2) · price band match (+2) · storeCount>=3 (+1)
 *
 * Only in-stock offers count, and we require at least a varietal match
 * so we never recommend a Chardonnay next to a Malbec.
 */
export function relatedGroups(
  base: ProductGroup,
  limit = 6,
): ProductGroup[] {
  const baseVarietals = (base.varietals ?? []).map((v) => v.toLowerCase());
  const baseRegion = base.region?.toLowerCase();
  const basePrice = base.minPrice ?? null;
  const priceMin = basePrice ? basePrice * 0.65 : null;
  const priceMax = basePrice ? basePrice * 1.45 : null;

  const candidates: { g: ProductGroup; score: number }[] = [];
  for (const g of groups) {
    if (g.groupSlug === base.groupSlug) continue;
    if (g.minPrice == null || g.minPrice <= 0) continue;
    if (!g.offers?.some((o) => o.inStock)) continue;

    const gVarietals = (g.varietals ?? []).map((v) => v.toLowerCase());
    const varietalOverlap =
      baseVarietals.length === 0 ||
      baseVarietals.some((v) => gVarietals.includes(v));
    if (!varietalOverlap) continue;

    let score = 0;
    if (baseVarietals.length > 0 && baseVarietals.some((v) => gVarietals.includes(v))) {
      score += 3;
    }
    if (baseRegion && g.region?.toLowerCase() === baseRegion) score += 2;
    if (priceMin && priceMax && g.minPrice >= priceMin && g.minPrice <= priceMax) {
      score += 2;
    }
    if (g.storeCount >= 3) score += 1;
    candidates.push({ g, score });
  }

  return candidates
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return b.g.storeCount - a.g.storeCount;
    })
    .slice(0, limit)
    .map((x) => x.g);
}

/** Get top facets (varietals, types, regions) for sidebar filtering. */
export function facetCounts(): {
  varietals: { name: string; count: number }[];
  types: { name: string; count: number }[];
  regions: { name: string; count: number }[];
} {
  const vCount = new Map<string, number>();
  const tCount = new Map<string, number>();
  const rCount = new Map<string, number>();

  for (const g of groups) {
    if (!looksLikeWineGroup(g)) continue;
    for (const v of g.varietals ?? []) {
      vCount.set(v, (vCount.get(v) ?? 0) + 1);
    }
    if (g.type) tCount.set(g.type, (tCount.get(g.type) ?? 0) + 1);
    if (g.region) rCount.set(g.region, (rCount.get(g.region) ?? 0) + 1);
  }

  const toSorted = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return {
    varietals: toSorted(vCount),
    types: toSorted(tCount),
    regions: toSorted(rCount),
  };
}

// Note: findProductBySlug / searchProducts / productSlug were removed —
// all pages now operate on productGroups via findGroup / searchGroups.

export function formatArs(value: number | null): string {
  if (value === null || value <= 0) return "Consultar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

// Re-export displayWineName from its own module (kept separate so
// client components can import without pulling in snapshot.json).
export { displayWineName } from "./displayWineName";

/** Return a human-readable store name for a given storeSlug. */
export function storeName(slug: string): string {
  return (
    snapshot.stores.find((s) => s.storeSlug === slug)?.storeName ?? slug
  );
}

export type BrandStat = {
  name: string;
  count: number;
  storeCount: number;
};

/**
 * Known brand aliases so "Familia Zuccardi" / "Bodegas Norton" / "Catena
 * Zapata" collapse with their short forms for the Top Brands ranking and
 * to avoid splitting the same bodega into multiple cards.
 * Keys lowercase; values are the canonical display form.
 */
const BRAND_ALIASES_DISPLAY: Record<string, string> = {
  "bodega catena zapata": "Catena Zapata",
  "catena zapata": "Catena Zapata",
  catena: "Catena Zapata",
  "familia zuccardi": "Zuccardi",
  zucardi: "Zuccardi",
  "bodegas zuccardi": "Zuccardi",
  "bodega norton": "Norton",
  "bodegas norton": "Norton",
  "bodega trapiche": "Trapiche",
  "bodegas trapiche": "Trapiche",
  "bodega salentein": "Salentein",
  "bodegas salentein": "Salentein",
  "bodega luigi bosca": "Luigi Bosca",
  "luigi bosca": "Luigi Bosca",
  "cheval des andes": "Cheval des Andes",
  "el esteco": "El Esteco",
  "finca las moras": "Las Moras",
  "las moras": "Las Moras",
  "don david": "Don David",
};

/**
 * Normalize brand for grouping (topBrands key). Strip redundant prefixes
 * ("Bodega", "Bodegas", "Familia"), lowercase, collapse whitespace, then
 * apply alias map so variants merge into one key.
 */
function normalizeBrandKey(s: string): string {
  const stripped = s
    .toLowerCase()
    .replace(/^\s*(bodegas?|familia)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return BRAND_ALIASES_DISPLAY[stripped]?.toLowerCase() ?? stripped;
}

/**
 * Pretty brand name for display. Prefers the canonical alias when known
 * (e.g. "BODEGA CATENA ZAPATA" → "Catena Zapata"); otherwise applies
 * title-casing for all-uppercase VTEX brands and leaves the rest alone.
 */
function normalizeBrandCase(s: string): string {
  const trimmed = s.trim();
  const stripped = trimmed
    .toLowerCase()
    .replace(/^\s*(bodegas?|familia)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const alias = BRAND_ALIASES_DISPLAY[stripped];
  if (alias) return alias;
  // Preserve only properly mixed-case strings (has both upper and lower).
  // Strings that are all-lowercase ("zuccardi", "gran enemigo") need
  // title-casing, just like ALLCAPS — they typically come from scrapers
  // that lowercase brand keys.
  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  if (hasLower && hasUpper) return trimmed;
  // ALLCAPS or all-lowercase → Title Case
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      if (w.length === 0) return w;
      if (/^(de|del|la|el|las|los|y|&)$/.test(w)) return w;
      // Acronyms like DV, II, III stay uppercase
      if (/^(dv|doc|ii|iii|iv|vi|vii|viii|ix)$/i.test(w)) return w.toUpperCase();
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** Pretty brand name for display (fixes SHOUT CASE from VTEX etc). */
export function displayBrand(brand: string | null | undefined): string {
  if (!brand) return "";
  return normalizeBrandCase(brand.trim());
}

/**
 * Top wine brands across all stores.
 *
 * We prefer brands whose products are tagged with a varietal — otherwise
 * supermarket spirits/champagne brands (Glenmorangie, Smirnoff, Veuve
 * Clicquot) drown out actual Argentine wine bodegas, since they're stocked
 * by 3-6 supermarkets each.
 */
export function topBrands(limit = 12): BrandStat[] {
  const byBrand = new Map<
    string,
    { count: number; stores: Set<string>; wineish: number }
  >();

  // Walk groups → offers (avoids needing snapshot.products, which is
  // redundant with offers and was dropped from the shipped snapshot).
  for (const g of groups) {
    const raw = g.brand?.trim();
    if (!raw) continue;
    if (/smirnoff|absolut|glen|johnnie|chivas|jack\s+daniels|ballantine|jameson|bombay|gordon|tanqueray|beefeater|bacardi|captain\s+morgan|malibu|baileys|campari|aperol|fernet|martini|cinzano|red\s+bull/i.test(raw))
      continue;
    const key = normalizeBrandKey(raw);
    const isWine =
      (g.varietals && g.varietals.length > 0) ||
      g.type === "Tinto" ||
      g.type === "Blanco";
    for (const offer of g.offers) {
      const existing = byBrand.get(key);
      if (existing) {
        existing.count++;
        existing.stores.add(offer.storeSlug);
        if (isWine) existing.wineish++;
      } else {
        byBrand.set(key, {
          count: 1,
          stores: new Set([offer.storeSlug]),
          wineish: isWine ? 1 : 0,
        });
      }
    }
  }

  return [...byBrand.entries()]
    .filter(([, { count, wineish }]) => count === 0 || wineish / count >= 0.4)
    .map(([key, { count, stores }]) => ({
      // key is normalized lowercase; run it through displayBrand for
      // proper casing + alias canonicalization for the home card.
      name: displayBrand(key),
      count,
      storeCount: stores.size,
    }))
    .sort(
      (a, b) =>
        b.storeCount - a.storeCount ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/**
 * Top deals: multi-store groups with credible savings.
 *
 * Credibility filter: we require 3+ stores validating the price range (so a
 * single outlier store doesn't drive the "deal"), and cap savings at 70% —
 * anything higher usually signals bad data (stale price, wrong SKU match,
 * promo-locked listing) rather than a real bargain.
 */
// Keywords that signal the group is NOT wine: spirits, beer, soft drinks,
// food items (some "wine" stores carry charcuterie/cheese/oil too — those
// products end up in our snapshot when scrapers pull the full catalog).
const NOT_WINE_RE =
  /\b(sidra|gin|whisk[ey]+|vodka|ron(?!\s+(de\s+)?(la|los|las))|tequila|mezcal|vermut|vermouth|aperitivo|aperol|campari|fernet|gancia|cinzano|martini|cerveza|beer|ipa|lager|ale|stout|porter|pilsen|weiss|jugo|licor|bailey|baileys|absolut|smirnoff|johnnie|chivas|jack\s+daniels|ballantine|jameson|bombay|gordon|tanqueray|beefeater|bacardi|malibu|red\s+bull|coca|pepsi|agua\b|juice|chocolate|cacao|grana\s+padano|parmes[aá]no|queso|salame|jam[oó]n|fiamb|conserva|aceite|vinagre|caf[eé]\b|t[eé]\b|miel|aceitunas|kombucha|sangr[ií]a)\b/i;

// Bottle sizes that are NOT wine (wines are 375ml/750ml/1500ml/3L typically).
// 33cl/35cl = beer cans, 200ml/250ml/500ml = small spirits/snack sizes.
const NOT_WINE_SIZE_RE =
  /\b(33|35|473)\s*cl\b|\b(?:100|150|200|250|330|355|473)\s*ml\b|\b200\s*gr\b/i;

// Detects "case", "estuche", "pack", "caja x N" wines — different SKU
// from a single bottle. Pooling them in the same group inflates max
// price (e.g. "AHORRO MÁXIMO 95%" comparing 1 bottle vs a case of 6).
const CASE_OFFER_RE =
  /\b(estuche|caja\b|cajas\b|caj[ìí]n|pack|gift\s*box|6\s*pack|six\s*pack|x\s*[2-9]\d*\b|x[2-9]\d*\b)/i;

/** True if the offer name suggests a multi-bottle pack/case, not a single bottle. */
export function isCaseOffer(offerName: string | null | undefined): boolean {
  if (!offerName) return false;
  return CASE_OFFER_RE.test(offerName);
}

/**
 * Bottle-only price + store stats for a group. Excludes case/estuche/pack
 * offers from the calculation so "ahorro máximo" doesn't get inflated by
 * comparing 1 bottle vs 1 case of 6.
 *
 * Falls back to the snapshot's minPrice/maxPrice/storeCount if there are
 * no bottle offers (rare — case-only groups).
 */
export function bottleStats(g: ProductGroup): {
  minPrice: number | null;
  maxPrice: number | null;
  storeCount: number;
  hasCases: boolean;
} {
  const offers = g.offers ?? [];
  const bottles = offers.filter((o) => !isCaseOffer(o.name));
  const cases = offers.filter((o) => isCaseOffer(o.name));
  if (bottles.length === 0) {
    return {
      minPrice: g.minPrice,
      maxPrice: g.maxPrice,
      storeCount: g.storeCount,
      hasCases: cases.length > 0,
    };
  }
  const inStockPrices = bottles
    .filter((o) => o.inStock)
    .map((o) => o.priceArs)
    .filter((p): p is number => p != null && p > 0);
  if (inStockPrices.length === 0) {
    // Match the snapshot's behaviour: if no in-stock bottles, fall back
    // to all bottle prices (still excluding cases).
    const allBottlePrices = bottles
      .map((o) => o.priceArs)
      .filter((p): p is number => p != null && p > 0);
    if (allBottlePrices.length === 0) {
      return {
        minPrice: null,
        maxPrice: null,
        storeCount: 0,
        hasCases: cases.length > 0,
      };
    }
    return {
      minPrice: Math.min(...allBottlePrices),
      maxPrice: Math.max(...allBottlePrices),
      storeCount: new Set(bottles.map((o) => o.storeSlug)).size,
      hasCases: cases.length > 0,
    };
  }
  return {
    minPrice: Math.min(...inStockPrices),
    maxPrice: Math.max(...inStockPrices),
    storeCount: new Set(
      bottles.filter((o) => o.inStock).map((o) => o.storeSlug),
    ).size,
    hasCases: cases.length > 0,
  };
}

function looksLikeWineGroup(g: ProductGroup): boolean {
  // Sniff the canonical name for explicit non-wine keywords first — these
  // override the varietal/type heuristic because some scrapers tag their
  // beer/soda catalog with bogus type values.
  if (NOT_WINE_RE.test(g.canonicalName)) return false;
  if (NOT_WINE_SIZE_RE.test(g.canonicalName)) return false;
  // If the group has a varietal or a wine type, trust that.
  if (g.varietals && g.varietals.length > 0) return true;
  if (g.type && g.type !== null) return true;
  return true;
}

export function topDeals(limit = 6): ProductGroup[] {
  return groups
    .filter(
      (g) =>
        g.storeCount >= 3 &&
        g.minPrice != null &&
        g.maxPrice != null &&
        g.minPrice >= 2000 && // exclude absurdly low min prices
        g.maxPrice > g.minPrice &&
        g.imageUrl &&
        looksLikeWineGroup(g),
    )
    .map((g) => ({
      g,
      savings:
        ((g.maxPrice as number) - (g.minPrice as number)) /
        (g.maxPrice as number),
    }))
    .filter(({ savings }) => savings >= 0.25 && savings <= 0.7)
    .sort((a, b) => {
      // Prioritize bigger savings, then more stores
      if (Math.abs(b.savings - a.savings) > 0.01)
        return b.savings - a.savings;
      return b.g.storeCount - a.g.storeCount;
    })
    .slice(0, limit)
    .map(({ g }) => g);
}

/** Brand slug for search filter */
export function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type BrandPage = {
  slug: string;
  name: string;
  groupCount: number;
  wineCount: number;
  storeCount: number;
  regions: string[];
  varietals: string[];
  topGroups: ProductGroup[];
};

/** All brand pages for navigation / sitemap. Brand is normalized and
 * a page is generated only if the brand has at least 3 wines and is NOT
 * in the spirits blacklist. */
export function brandPages(): BrandPage[] {
  const SPIRITS = /smirnoff|absolut|glen|johnnie|chivas|jack\s+daniels|ballantine|jameson|bombay|gordon|tanqueray|beefeater|bacardi|captain\s+morgan|malibu|baileys|campari|aperol|fernet|martini|cinzano|red\s+bull/i;
  const byKey = new Map<string, { canonicalName: string; groups: ProductGroup[] }>();

  for (const g of groups) {
    if (!g.brand) continue;
    if (SPIRITS.test(g.brand)) continue;
    const normalized = g.brand
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^bodega(s)?\s+/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!normalized) continue;
    const entry = byKey.get(normalized);
    const pretty = displayBrand(g.brand);
    if (entry) {
      entry.groups.push(g);
      // Prefer longer canonical names
      if (pretty.length > entry.canonicalName.length)
        entry.canonicalName = pretty;
    } else {
      byKey.set(normalized, { canonicalName: pretty, groups: [g] });
    }
  }

  const pages: BrandPage[] = [];
  for (const [slug, { canonicalName, groups: gs }] of byKey.entries()) {
    if (gs.length < 3) continue;
    const stores = new Set<string>();
    const regions = new Set<string>();
    const varietals = new Set<string>();
    let wineCount = 0;
    for (const g of gs) {
      wineCount += g.offerCount;
      for (const o of g.offers) stores.add(o.storeSlug);
      if (g.region) regions.add(g.region);
      for (const v of g.varietals ?? []) varietals.add(v);
    }
    // Top groups by storeCount + min price
    const topGroups = [...gs]
      .sort((a, b) => {
        if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
        return (a.minPrice ?? 1e9) - (b.minPrice ?? 1e9);
      })
      .slice(0, 24);

    pages.push({
      slug,
      name: canonicalName,
      groupCount: gs.length,
      wineCount,
      storeCount: stores.size,
      regions: [...regions],
      varietals: [...varietals].slice(0, 5),
      topGroups,
    });
  }

  return pages.sort((a, b) => b.storeCount - a.storeCount || b.groupCount - a.groupCount);
}

export function findBrandPage(slug: string): BrandPage | undefined {
  return brandPages().find((p) => p.slug === slug);
}

export type FacetPage = {
  slug: string;
  name: string;
  kind: "varietal" | "region";
  groupCount: number;
  storeCount: number;
  topGroups: ProductGroup[];
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function varietalPages(): FacetPage[] {
  const byVar = new Map<string, ProductGroup[]>();
  for (const g of groups) {
    for (const v of g.varietals ?? []) {
      const arr = byVar.get(v) ?? [];
      arr.push(g);
      byVar.set(v, arr);
    }
  }
  const pages: FacetPage[] = [];
  for (const [name, gs] of byVar.entries()) {
    if (gs.length < 10) continue;
    const stores = new Set<string>();
    for (const g of gs) for (const o of g.offers) stores.add(o.storeSlug);
    const topGroups = [...gs]
      .sort(
        (a, b) =>
          b.storeCount - a.storeCount ||
          (a.minPrice ?? 1e9) - (b.minPrice ?? 1e9),
      )
      .slice(0, 48);
    pages.push({
      slug: slugify(name),
      name,
      kind: "varietal",
      groupCount: gs.length,
      storeCount: stores.size,
      topGroups,
    });
  }
  return pages.sort((a, b) => b.groupCount - a.groupCount);
}

export function regionPages(): FacetPage[] {
  const byReg = new Map<string, ProductGroup[]>();
  for (const g of groups) {
    if (!g.region) continue;
    const arr = byReg.get(g.region) ?? [];
    arr.push(g);
    byReg.set(g.region, arr);
  }
  const pages: FacetPage[] = [];
  for (const [name, gs] of byReg.entries()) {
    if (gs.length < 5) continue;
    const stores = new Set<string>();
    for (const g of gs) for (const o of g.offers) stores.add(o.storeSlug);
    const topGroups = [...gs]
      .sort(
        (a, b) =>
          b.storeCount - a.storeCount ||
          (a.minPrice ?? 1e9) - (b.minPrice ?? 1e9),
      )
      .slice(0, 48);
    pages.push({
      slug: slugify(name),
      name,
      kind: "region",
      groupCount: gs.length,
      storeCount: stores.size,
      topGroups,
    });
  }
  return pages.sort((a, b) => b.groupCount - a.groupCount);
}

export function findFacetPage(
  kind: "varietal" | "region",
  slug: string,
): FacetPage | undefined {
  const source = kind === "varietal" ? varietalPages() : regionPages();
  return source.find((p) => p.slug === slug);
}
