import type { ScrapedProduct, ScrapeResult, StoreConfig } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HEADERS = {
  "user-agent": USER_AGENT,
  accept: "application/json,text/plain,*/*",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
};

const PER_PAGE = 100;
const MAX_PAGES = 80;
const PAGE_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 20_000;

/**
 * WooCommerce's public Store API exposes a JSON endpoint for guests:
 *   GET /wp-json/wc/store/v1/products?page=N&per_page=100
 * Returns an array of products with prices, description, images, stock,
 * brands (via pa_bodega attribute taxonomy), permalink, etc.
 *
 * Some stores disable this API or are WooCommerce Blocks-only. We detect
 * via response content-type + status.
 */

type WcPrices = {
  price?: string | null;
  regular_price?: string | null;
  sale_price?: string | null;
  price_range?: unknown;
  currency_code?: string | null;
  currency_symbol?: string | null;
  currency_minor_unit?: number | null;
};

type WcImage = { src?: string; alt?: string };

type WcAttribute = {
  name?: string;
  taxonomy?: string;
  terms?: { name?: string; slug?: string }[];
};

type WcProduct = {
  id?: number;
  name?: string;
  slug?: string;
  permalink?: string;
  sku?: string | null;
  description?: string;
  short_description?: string;
  type?: string;
  prices?: WcPrices;
  images?: WcImage[];
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  attributes?: WcAttribute[];
  brands?: { name?: string }[];
  categories?: { name?: string; slug?: string }[];
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: HEADERS,
      signal: ctrl.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Pull a brand out of the WC product: prefer explicit brands[], then
 * attributes with taxonomy pa_bodega, then categories that look like bodega names. */
function extractBrand(p: WcProduct): string | null {
  if (p.brands && p.brands.length > 0 && p.brands[0].name) {
    return p.brands[0].name.trim();
  }
  if (p.attributes) {
    for (const a of p.attributes) {
      const tax = (a.taxonomy ?? "").toLowerCase();
      if (
        (tax.includes("bodega") || tax.includes("brand") || tax === "pa_marca") &&
        a.terms &&
        a.terms.length > 0
      ) {
        const n = a.terms[0].name?.trim();
        if (n) return n;
      }
    }
  }
  return null;
}

function priceToNumber(p: WcPrices | undefined): number | null {
  if (!p) return null;
  const raw = p.price ?? p.regular_price ?? p.sale_price;
  if (!raw) return null;
  const minor = p.currency_minor_unit ?? 2;
  const asNum = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(asNum) || asNum <= 0) return null;
  return asNum / Math.pow(10, minor);
}

/**
 * Algunas tiendas WC argentinas exponen el EAN como atributo custom
 * (taxonomies tipo `pa_ean`, `pa_codigo_barras`, `pa_gtin`) además del
 * SKU interno. Si está, lo preferimos sobre el SKU porque es estable
 * cross-tienda. Caso fallback: el sku mismo es un EAN-13.
 */
function extractGtin(p: WcProduct): string | null {
  const gtinTaxRe = /(ean|gtin|barcode|codigo[_-]?barra|codigo[_-]?de[_-]?barra)/i;
  for (const a of p.attributes ?? []) {
    const tax = (a.taxonomy ?? a.name ?? "").toLowerCase();
    if (!gtinTaxRe.test(tax)) continue;
    for (const term of a.terms ?? []) {
      const v = (term.name ?? "").replace(/[\s-]/g, "");
      if (/^\d{8,14}$/.test(v)) return v;
    }
  }
  const sku = p.sku?.trim();
  if (sku && /^\d{12,14}$/.test(sku)) return sku;
  return null;
}

function normalize(p: WcProduct, storeSlug: string): ScrapedProduct | null {
  const url = p.permalink;
  const name = p.name?.trim();
  if (!url || !name) return null;

  const gtin = extractGtin(p);
  return {
    storeSlug,
    externalUrl: url,
    externalSku: gtin ?? (p.sku ? p.sku.trim() || null : null),
    name,
    brand: extractBrand(p),
    imageUrl: p.images?.[0]?.src ?? null,
    priceArs: priceToNumber(p.prices),
    currency: p.prices?.currency_code ?? "ARS",
    inStock: p.is_in_stock ?? false,
    description:
      p.short_description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ??
      null,
  };
}

/** Keep only products that look like wine. Filters out obvious non-wine
 * merch (like "Hat" / "Sneakers" on some stores). Uses category hints and
 * falls back to keeping everything if no categories are present (safer). */
function looksLikeWine(p: WcProduct): boolean {
  const cats = (p.categories ?? [])
    .map((c) => (c.name ?? c.slug ?? "").toLowerCase())
    .join(" ");
  if (!cats) return true;
  const wineish = /(vino|tinto|blanco|rosado|espumante|champagne|malbec|bodega|licor|vermut|aperitivo)/i;
  const nonWine = /(ropa|indumentaria|accesorio|remera|buzo|hat|sneaker|zapatilla|moda|fashion)/i;
  if (nonWine.test(cats) && !wineish.test(cats)) return false;
  return true;
}

export async function scrapeWoocommerce(
  config: StoreConfig,
  options: { maxPages?: number } = {},
): Promise<ScrapeResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors: string[] = [];
  const products = new Map<string, ScrapedProduct>();
  const maxPages = Math.min(options.maxPages ?? MAX_PAGES, MAX_PAGES);
  const base = config.baseUrl.replace(/\/+$/, "");

  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = `${base}/wp-json/wc/store/v1/products?per_page=${PER_PAGE}&page=${page}`;
    pagesFetched++;

    let res: Response;
    try {
      res = await fetchWithTimeout(url);
    } catch (err) {
      errors.push(`page ${page}: fetch failed (${(err as Error).message})`);
      break;
    }
    if (!res.ok) {
      if (res.status === 404) {
        errors.push(`page ${page}: HTTP 404 (endpoint missing or page beyond)`);
        break;
      }
      errors.push(`page ${page}: HTTP ${res.status}`);
      if (page === 1) break;
      continue;
    }

    let items: WcProduct[];
    try {
      const body = (await res.json()) as WcProduct[];
      items = Array.isArray(body) ? body : [];
    } catch {
      errors.push(`page ${page}: non-JSON response`);
      break;
    }

    if (items.length === 0) break;

    let added = 0;
    for (const p of items) {
      if (!looksLikeWine(p)) continue;
      const n = normalize(p, config.slug);
      if (!n) continue;
      if (!products.has(n.externalUrl)) {
        products.set(n.externalUrl, n);
        added++;
      }
    }

    if (added === 0 && page > 1) break;
    if (items.length < PER_PAGE) break;

    if (page < maxPages) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }

  return {
    storeSlug: config.slug,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };
}
