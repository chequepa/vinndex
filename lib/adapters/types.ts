/**
 * Normalized product snapshot scraped from a store.
 * This is the shape we'd eventually persist in Postgres as a price snapshot.
 */
export type ScrapedProduct = {
  storeSlug: string;
  externalUrl: string;
  externalSku: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  priceArs: number | null;
  currency: string;
  inStock: boolean;
  description: string | null;
};

export type ScrapeResult = {
  storeSlug: string;
  startedAt: string;
  durationMs: number;
  pagesFetched: number;
  productCount: number;
  products: ScrapedProduct[];
  errors: string[];
};

export type StoreConfig = {
  slug: string;
  name: string;
  platform: "tiendanube" | "woocommerce" | "vtex" | "shopify" | "bigcommerce";
  baseUrl: string;
  catalogPath: string;
};
