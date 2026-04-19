import snapshotJson from "@/data/snapshot.json";
import type { ScrapedProduct } from "./adapters/types";

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

/** Brand slug for search filter */
export function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
