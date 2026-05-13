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

export type StorePlatform =
  | "tiendanube"
  | "woocommerce"
  | "vtex"
  | "shopify"
  | "bigcommerce"
  | "magento"
  | "prestashop"
  | "mercadolibre"
  // SPAs custom con backend propio (caso típico: catálogo entero en una
  // fila JSON de Supabase). Cada una necesita su scraper a medida.
  | "custom";

export type StoreConfig = {
  slug: string;
  name: string;
  platform: StorePlatform;
  baseUrl: string;
  /** Tiendanube (/ar/productos/), Shopify (/products.json), WC placeholder. */
  catalogPath?: string;
  /** PrestaShop (/1574-vinos). */
  categoryPath?: string;
  /** VTEX: array de category paths; null para fallback ft=vino. */
  categoryPaths?: string[] | null;
  /** Magento (/search/vino). */
  searchPath?: string;
  /** Custom adapters: identifier para que el scraper sepa qué plugin
   * usar. Ej. "ambar-supabase". */
  customAdapter?: string;
};
