import snapshotJson from "@/data/snapshot.json";
import type { ScrapedProduct } from "./adapters/types";
import type { ProductGroup } from "./matching";

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
  products: ScrapedProduct[];
  productGroups?: ProductGroup[];
  groupCount?: number;
  multiStoreGroupCount?: number;
  groupsGeneratedAt?: string;
};

export const snapshot = snapshotJson as Snapshot;

export function snapshotStats() {
  return {
    productCount: snapshot.productCount,
    storeCount: snapshot.storeCount,
    generatedAt: snapshot.generatedAt,
    inStock: snapshot.products.filter((p) => p.inStock).length,
    withPrice: snapshot.products.filter(
      (p) => p.priceArs !== null && p.priceArs > 0,
    ).length,
    withBrand: snapshot.products.filter((p) => p.brand).length,
    groupCount: snapshot.groupCount ?? 0,
    multiStoreGroupCount: snapshot.multiStoreGroupCount ?? 0,
  };
}

/** All productGroups (sorted by relevance — multi-store first, then price). */
export const groups: ProductGroup[] = snapshot.productGroups ?? [];

export function findGroup(slug: string): ProductGroup | undefined {
  return groups.find((g) => g.groupSlug === slug);
}

function groupPriceKey(g: ProductGroup): number {
  return g.minPrice != null && g.minPrice > 0
    ? g.minPrice
    : Number.POSITIVE_INFINITY;
}

export type SearchOptions = {
  multiStoreOnly?: boolean;
  varietal?: string | null;
  type?: string | null;
  region?: string | null;
};

export function searchGroups(
  query: string,
  limit = 48,
  options: SearchOptions = {},
): ProductGroup[] {
  const q = query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  let source = groups;

  if (options.multiStoreOnly) {
    source = source.filter((g) => g.storeCount >= 2);
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

  const filtered = q
    ? source.filter((g) => {
        const haystack =
          `${g.canonicalName} ${g.brand ?? ""}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      })
    : source;

  return [...filtered]
    .sort((a, b) => {
      // Default sort: cheapest first. Comparables bubble up via tiebreak
      // (more stores validating the price win when prices tie).
      if (groupPriceKey(a) !== groupPriceKey(b))
        return groupPriceKey(a) - groupPriceKey(b);
      return b.storeCount - a.storeCount;
    })
    .slice(0, limit);
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

/** Derive a URL-safe slug from a product's externalUrl. */
export function productSlug(product: ScrapedProduct): string {
  try {
    const u = new URL(product.externalUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? parts[parts.length - 2] ?? "";
    if (last) return `${product.storeSlug}__${last}`;
  } catch {
    /* fall through */
  }
  return `${product.storeSlug}__${product.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

export function findProductBySlug(slug: string): ScrapedProduct | undefined {
  return snapshot.products.find((p) => productSlug(p) === slug);
}

/**
 * Sort key that pushes null/missing prices to the end but keeps real prices
 * in ascending order.
 */
function priceKey(p: ScrapedProduct): number {
  return p.priceArs != null && p.priceArs > 0
    ? p.priceArs
    : Number.POSITIVE_INFINITY;
}

export function searchProducts(query: string, limit = 50): ScrapedProduct[] {
  const q = query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const filtered = q
    ? snapshot.products.filter((p) => {
        const haystack =
          `${p.name} ${p.brand ?? ""} ${p.description ?? ""}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      })
    : snapshot.products;
  return [...filtered]
    .sort((a, b) => priceKey(a) - priceKey(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function formatArs(value: number | null): string {
  if (value === null || value <= 0) return "Consultar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

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
 * Normalize brand casing for display: ALLCAPS brands from VTEX become
 * Title Case, others are left alone.
 */
function normalizeBrandCase(s: string): string {
  if (!/[a-z]/.test(s)) {
    // All-uppercase — title case it
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => {
        if (w.length === 0) return w;
        // Preserve roman numerals and short connectors
        if (/^(de|del|la|el|las|los|y|&)$/.test(w)) return w;
        return w[0].toUpperCase() + w.slice(1);
      })
      .join(" ");
  }
  return s;
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

  // Build a lookup of (name -> first matching varietal) using the groups.
  const productToVarietal = new Map<string, boolean>();
  for (const g of groups) {
    const isWine =
      (g.varietals && g.varietals.length > 0) || g.type === "Tinto" || g.type === "Blanco";
    for (const o of g.offers) {
      productToVarietal.set(o.externalUrl, isWine);
    }
  }

  for (const p of snapshot.products) {
    if (!p.brand) continue;
    const raw = p.brand.trim();
    if (!raw) continue;
    if (/smirnoff|absolut|glen|johnnie|chivas|jack\s+daniels|ballantine|jameson|bombay|gordon|tanqueray|beefeater|bacardi|captain\s+morgan|malibu|baileys|campari|aperol|fernet|martini|cinzano|red\s+bull/i.test(raw))
      continue; // blacklist common spirits brands
    const key = normalizeBrandCase(raw); // collapses NORTON ↔ Norton
    const existing = byBrand.get(key);
    const isWine = productToVarietal.get(p.externalUrl) ?? false;
    if (existing) {
      existing.count++;
      existing.stores.add(p.storeSlug);
      if (isWine) existing.wineish++;
    } else {
      byBrand.set(key, {
        count: 1,
        stores: new Set([p.storeSlug]),
        wineish: isWine ? 1 : 0,
      });
    }
  }

  return [...byBrand.entries()]
    .filter(([, { count, wineish }]) => count === 0 || wineish / count >= 0.4)
    .map(([name, { count, stores }]) => ({
      name,
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
export function topDeals(limit = 6): ProductGroup[] {
  return groups
    .filter(
      (g) =>
        g.storeCount >= 3 &&
        g.minPrice != null &&
        g.maxPrice != null &&
        g.minPrice >= 2000 && // exclude absurdly low min prices
        g.maxPrice > g.minPrice &&
        g.imageUrl,
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
