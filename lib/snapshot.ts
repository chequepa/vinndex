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
  maxPagesPerStore: number;
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

export function searchProducts(query: string, limit = 50): ScrapedProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return snapshot.products.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  return snapshot.products
    .filter((p) => {
      const haystack = `${p.name} ${p.brand ?? ""} ${p.description ?? ""}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    })
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
