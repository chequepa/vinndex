import type { ScrapedProduct, ScrapeResult, StoreConfig } from "./types";

const USER_AGENT =
  "Vinndex/0.1 (+https://vinndex.com.ar) comparador de precios de vinos AR";

/**
 * Tiendanube stores don't expose /products.json publicly anymore, but each
 * product page embeds a full <script type="application/ld+json"> Product
 * schema per item. Category listing pages also embed JSON-LD for each
 * product card (~20 per page), which lets us harvest many products per
 * request.
 *
 * Strategy: walk paginated category pages (`/catalogPath/page/N/`) and
 * extract JSON-LD Product blocks until a page returns zero new products
 * or a hard limit is hit.
 */

const MAX_PAGES = 80;
const PAGE_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 15_000;

type JsonLdProduct = {
  "@type"?: string | string[];
  name?: string;
  image?: string | string[];
  description?: string;
  sku?: string;
  brand?: { name?: string } | string;
  mainEntityOfPage?: { "@id"?: string };
  "@id"?: string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
};

function isJsonLdProduct(obj: unknown): obj is JsonLdProduct {
  if (!obj || typeof obj !== "object") return false;
  const t = (obj as JsonLdProduct)["@type"];
  if (Array.isArray(t)) return t.includes("Product");
  return t === "Product";
}

function parseJsonLdFromHtml(html: string): JsonLdProduct[] {
  const out: JsonLdProduct[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (isJsonLdProduct(item)) out.push(item);
      if (
        item &&
        typeof item === "object" &&
        "mainEntity" in item &&
        isJsonLdProduct((item as { mainEntity: unknown }).mainEntity)
      ) {
        out.push((item as { mainEntity: JsonLdProduct }).mainEntity);
      }
    }
  }
  return out;
}

function normalize(
  ld: JsonLdProduct,
  storeSlug: string,
): ScrapedProduct | null {
  const url = ld.mainEntityOfPage?.["@id"] ?? ld["@id"];
  const name = ld.name?.trim();
  if (!url || !name) return null;

  const brand = typeof ld.brand === "string" ? ld.brand : ld.brand?.name ?? null;
  const image = Array.isArray(ld.image) ? ld.image[0] : ld.image;

  const rawPrice = ld.offers?.price;
  let priceArs: number | null = null;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== "") {
    const asNum =
      typeof rawPrice === "number" ? rawPrice : Number(String(rawPrice).replace(/[^\d.]/g, ""));
    if (Number.isFinite(asNum) && asNum > 0) priceArs = asNum;
  }

  const availability = ld.offers?.availability ?? "";
  const inStock = /InStock/i.test(availability);

  return {
    storeSlug,
    externalUrl: url,
    externalSku: ld.sku ?? null,
    name,
    brand: brand ?? null,
    imageUrl: image ?? null,
    priceArs,
    currency: ld.offers?.priceCurrency ?? "ARS",
    inStock,
    description: ld.description ?? null,
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeTiendanube(
  config: StoreConfig,
  options: { maxPages?: number } = {},
): Promise<ScrapeResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors: string[] = [];
  const products = new Map<string, ScrapedProduct>();
  const maxPages = Math.min(options.maxPages ?? MAX_PAGES, MAX_PAGES);

  const base = config.baseUrl.replace(/\/+$/, "");
  const catalog = config.catalogPath.replace(/^\/+|\/+$/g, "");

  let pagesFetched = 0;
  let lastPageAddedCount = 1;

  for (let page = 1; page <= maxPages && lastPageAddedCount > 0; page++) {
    const url =
      page === 1
        ? `${base}/${catalog}/`
        : `${base}/${catalog}/page/${page}/`;

    pagesFetched++;
    lastPageAddedCount = 0;

    let res: Response;
    try {
      res = await fetchWithTimeout(url);
    } catch (err) {
      errors.push(`page ${page}: fetch failed (${(err as Error).message})`);
      break;
    }
    if (!res.ok) {
      if (res.status === 404 && page > 1) break;
      errors.push(`page ${page}: HTTP ${res.status}`);
      if (page === 1) break;
      continue;
    }

    const html = await res.text();
    const lds = parseJsonLdFromHtml(html);

    for (const ld of lds) {
      const p = normalize(ld, config.slug);
      if (!p) continue;
      if (!products.has(p.externalUrl)) {
        products.set(p.externalUrl, p);
        lastPageAddedCount++;
      }
    }

    if (page < maxPages && lastPageAddedCount > 0) {
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
