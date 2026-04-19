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
      if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
      return groupPriceKey(a) - groupPriceKey(b);
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

/** Top brands by product count across all stores. */
export function topBrands(limit = 12): BrandStat[] {
  const byBrand = new Map<string, { count: number; stores: Set<string> }>();
  for (const p of snapshot.products) {
    if (!p.brand) continue;
    const key = p.brand.trim();
    if (!key) continue;
    const existing = byBrand.get(key);
    if (existing) {
      existing.count++;
      existing.stores.add(p.storeSlug);
    } else {
      byBrand.set(key, { count: 1, stores: new Set([p.storeSlug]) });
    }
  }
  return [...byBrand.entries()]
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

/** Top deals: multi-store groups with biggest savings %. */
export function topDeals(limit = 6): ProductGroup[] {
  return groups
    .filter(
      (g) =>
        g.storeCount >= 2 &&
        g.minPrice != null &&
        g.maxPrice != null &&
        g.minPrice > 0 &&
        g.maxPrice > g.minPrice &&
        g.imageUrl, // require image so card doesn't look empty
    )
    .map((g) => ({
      g,
      savings:
        ((g.maxPrice as number) - (g.minPrice as number)) /
        (g.maxPrice as number),
    }))
    .sort((a, b) => {
      // Prioritize bigger savings, then more stores (more validation)
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
