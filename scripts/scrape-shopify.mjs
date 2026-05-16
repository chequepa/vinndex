#!/usr/bin/env node
/**
 * Offline scraping for Shopify stores. Uses the public /products.json
 * endpoint that Shopify exposes by default.
 *
 *   GET /products.json?limit=250&page=N   (max 250/page)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HEADERS = {
  "user-agent": USER_AGENT,
  accept: "application/json",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
};

const PER_PAGE = 250;
const MAX_PAGES = 50;
const PAGE_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 20_000;

const STORES = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "data/stores.json"), "utf8"),
).filter((s) => s.platform === "shopify");

async function fetchJson(url) {
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

const WINE_TYPE = /vino|wine|champagne|champa/i;
const EXCLUDE_TYPE = /spirits|whisky|gin|vodka|ron|tequila|mezcal|licor|vermut|fern|aperit|cerveza|beer/i;

function looksLikeWine(p) {
  const type = (p.product_type ?? "").toLowerCase();
  const tags = Array.isArray(p.tags) ? p.tags.join(" ").toLowerCase() : String(p.tags || "").toLowerCase();
  const name = (p.title ?? "").toLowerCase();

  if (EXCLUDE_TYPE.test(type)) return false;
  if (EXCLUDE_TYPE.test(name) && !WINE_TYPE.test(name)) return false;

  if (WINE_TYPE.test(type)) return true;
  if (WINE_TYPE.test(tags)) return true;
  if (WINE_TYPE.test(name)) return true;
  return false;
}

function normalize(p, store) {
  const variant = p.variants?.[0];
  const url = `${store.baseUrl}/products/${p.handle}`;
  const name = p.title?.trim();
  if (!name) return null;

  const priceRaw = variant?.price;
  const priceNum =
    priceRaw != null ? Number(String(priceRaw).replace(",", ".")) : null;
  const price =
    typeof priceNum === "number" && isFinite(priceNum) && priceNum >= 500
      ? priceNum
      : null;

  const imageUrl = p.images?.[0]?.src ?? p.image?.src ?? null;

  // Brand: Shopify "vendor" is often the store itself. Use tags as fallback.
  let brand = null;
  if (p.vendor && p.vendor.toLowerCase() !== store.name.toLowerCase()) {
    brand = p.vendor;
  } else if (Array.isArray(p.tags)) {
    const brandTag = p.tags.find(
      (t) =>
        typeof t === "string" &&
        (t.toLowerCase().startsWith("marca:") ||
          t.toLowerCase().startsWith("bodega:")),
    );
    if (brandTag) brand = brandTag.split(":")[1].trim();
  }

  // Shopify expone `barcode` aparte del `sku` interno — cuando la tienda
  // lo carga es un EAN-13 estable cross-tienda y debería tener prioridad.
  // El sku puede ser cualquier cosa (incluso el slug de URL en algunas
  // bodegas). Validamos 12-14 dígitos antes de aceptar.
  const barcode = variant?.barcode
    ? String(variant.barcode).replace(/[\s-]/g, "")
    : null;
  const gtin = barcode && /^\d{12,14}$/.test(barcode) ? barcode : null;
  // Si el sku mismo viene como EAN-13 (caso frecuente en bodegas que
  // copian el código del fabricante al SKU) lo aceptamos como tal.
  const skuClean = variant?.sku ? String(variant.sku).trim() : null;
  const skuAsEan =
    skuClean && /^\d{12,14}$/.test(skuClean.replace(/[\s-]/g, ""))
      ? skuClean.replace(/[\s-]/g, "")
      : null;

  return {
    storeSlug: store.slug,
    externalUrl: url,
    externalSku: gtin || skuAsEan || skuClean || null,
    name,
    brand,
    imageUrl,
    priceArs: price,
    currency: "ARS",
    // Si no pudimos extraer precio (price === null porque < 500 o NaN)
    // forzamos inStock a false — un producto sin precio no es realmente
    // comprable y la UI termina mostrando "Consultar" en lugar de un valor.
    inStock: price != null && (variant?.available ?? false),
    description:
      p.body_html
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() ?? null,
  };
}

async function scrapeStore(store) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = new Map();
  const base = store.baseUrl.replace(/\/+$/, "");
  let pagesFetched = 0;
  let raw = 0;
  let filtered = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${base}/products.json?limit=${PER_PAGE}&page=${page}`;
    pagesFetched++;
    let res;
    try {
      res = await fetchJson(url);
    } catch (err) {
      errors.push(`page ${page}: fetch failed (${err.message})`);
      break;
    }
    if (!res.ok) {
      if (res.status === 404) break;
      errors.push(`page ${page}: HTTP ${res.status}`);
      break;
    }
    let body;
    try {
      body = await res.json();
    } catch {
      errors.push(`page ${page}: non-JSON`);
      break;
    }
    const items = Array.isArray(body?.products) ? body.products : [];
    if (items.length === 0) break;
    raw += items.length;

    let added = 0;
    for (const p of items) {
      if (!looksLikeWine(p)) {
        filtered++;
        continue;
      }
      const n = normalize(p, store);
      if (!n) continue;
      if (!products.has(n.externalUrl)) {
        products.set(n.externalUrl, n);
        added++;
      }
    }

    if (items.length < PER_PAGE) break;

    if (page < MAX_PAGES) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }

  return {
    storeSlug: store.slug,
    storeName: store.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    rawSeen: raw,
    filtered,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };
}

async function main() {
  console.log(`Scraping ${STORES.length} Shopify store(s)\n`);
  const results = [];
  let totalProducts = 0;
  let totalErrors = 0;
  const t0 = Date.now();

  for (const store of STORES) {
    process.stdout.write(`  ${store.slug.padEnd(22)} ... `);
    const r = await scrapeStore(store);
    results.push(r);
    totalProducts += r.productCount;
    totalErrors += r.errors.length;
    console.log(
      `${String(r.productCount).padStart(4)} products (${r.rawSeen} raw, ${r.filtered} filtered) · ${String(r.durationMs).padStart(5)}ms · ${r.errors.length} errors`,
    );
    if (r.errors.length) console.log(`    ${r.errors.join("; ")}`);
  }

  console.log(
    `\nDone: ${totalProducts} products across ${STORES.length} stores in ${Date.now() - t0}ms (${totalErrors} errors)`,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-shopify.mjs",
    platform: "shopify",
    storeCount: STORES.length,
    productCount: totalProducts,
    stores: results.map(({ products, ...meta }) => meta),
    products: results.flatMap((r) => r.products),
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-shopify.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
