import type { ScrapedProduct, ScrapeResult, StoreConfig } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
  // schema.org/Product expone códigos GTIN globales además del SKU interno
  // de la tienda. Cuando la bodega los carga (cosa frecuente en Tiendanube
  // porque el formulario de "publicar producto" lo pide aparte del SKU),
  // son nuestra ancla de matching más fuerte.
  gtin?: string;
  gtin8?: string;
  gtin12?: string;
  gtin13?: string;
  gtin14?: string;
  mpn?: string;
  brand?: { name?: string } | string;
  mainEntityOfPage?: { "@id"?: string };
  "@id"?: string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
};

/**
 * Devuelve el GTIN/EAN explícito si el JSON-LD lo trae en cualquiera de
 * sus slots schema.org. Validamos 8-14 dígitos para evitar basura.
 * Si no hay GTIN explícito pero el `sku` parece un EAN (12-14 dígitos)
 * lo aceptamos también — muchas tiendas argentinas cargan el EAN en el
 * campo SKU porque su backend no tiene un slot separado.
 */
function extractGtin(ld: JsonLdProduct): string | null {
  const candidates = [
    ld.gtin13,
    ld.gtin14,
    ld.gtin12,
    ld.gtin8,
    ld.gtin,
    ld.sku,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const clean = String(raw).replace(/[\s-]/g, "");
    if (/^\d{8,14}$/.test(clean)) return clean;
  }
  return null;
}

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

  // Preferimos GTIN sobre SKU porque cross-tienda el GTIN es estable y el
  // SKU es interno de cada vinoteca. `lib/snapshot` y Stage 0 EAN matchean
  // todo lo que tenga 12-14 dígitos en externalSku, así que poblar acá
  // con el GTIN real hace que Stage 0 absorba más matches sin tocar nada
  // río abajo. Fallback al sku original si no detectamos GTIN.
  const gtin = extractGtin(ld);
  return {
    storeSlug,
    externalUrl: url,
    externalSku: gtin ?? ld.sku ?? null,
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
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "es-AR,es;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua":
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
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
  const catalog = (config.catalogPath ?? "/ar/productos/").replace(
    /^\/+|\/+$/g,
    "",
  );

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
