#!/usr/bin/env node
/**
 * Offline scraping for WooCommerce stores. Hits the public Store API
 * (/wp-json/wc/store/v1/products) and normalizes to ScrapedProduct shape.
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
  accept: "application/json,text/plain,*/*",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
};

const PER_PAGE = 100;
const MAX_PAGES = 80;
const PAGE_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 20_000;
const STORE_DELAY_MS = 1500;

const STORES = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "data/stores.json"), "utf8"),
).filter((s) => s.platform === "woocommerce");

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: ctrl.signal,
      redirect: "follow",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function extractBrand(p) {
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

function priceToNumber(p) {
  if (!p) return null;
  const raw = p.price ?? p.regular_price ?? p.sale_price;
  if (!raw) return null;
  const minor = p.currency_minor_unit ?? 2;
  const asNum = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(asNum) || asNum <= 0) return null;
  return asNum / Math.pow(10, minor);
}

function normalize(p, storeSlug) {
  const url = p.permalink;
  const name = p.name?.trim();
  if (!url || !name) return null;
  const brand = extractBrand(p);
  const desc = p.short_description
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    storeSlug,
    externalUrl: url,
    externalSku: p.sku ? p.sku.trim() || null : null,
    name: decodeEntities(name),
    brand: brand ? decodeEntities(brand) : null,
    imageUrl: p.images?.[0]?.src ?? null,
    priceArs: priceToNumber(p.prices),
    currency: p.prices?.currency_code ?? "ARS",
    inStock: p.is_in_stock ?? false,
    description: desc ? decodeEntities(desc) : null,
  };
}

function looksLikeWine(p) {
  const cats = (p.categories ?? [])
    .map((c) => (c.name ?? c.slug ?? "").toLowerCase())
    .join(" ");
  if (!cats) return true;
  const wineish =
    /(vino|tinto|blanco|rosado|espumante|champagne|malbec|bodega|licor|vermut|aperitivo|whisky|gin|vermouth|ron|tequila|mezcal)/i;
  const nonWine = /(ropa|indumentaria|accesorio|remera|buzo|hat|sneaker|zapatilla|moda|fashion)/i;
  if (nonWine.test(cats) && !wineish.test(cats)) return false;
  return true;
}

async function scrapeStore(store, maxPages) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = new Map();
  const base = store.baseUrl.replace(/\/+$/, "");
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = `${base}/wp-json/wc/store/v1/products?per_page=${PER_PAGE}&page=${page}`;
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
      if (page === 1) break;
      continue;
    }
    let items;
    try {
      const body = await res.json();
      items = Array.isArray(body) ? body : [];
    } catch {
      errors.push(`page ${page}: non-JSON`);
      break;
    }
    if (items.length === 0) break;

    let added = 0;
    for (const p of items) {
      if (!looksLikeWine(p)) continue;
      const n = normalize(p, store.slug);
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
    storeSlug: store.slug,
    storeName: store.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fastMode = args.includes("fast");
  const maxPages = fastMode ? 2 : MAX_PAGES;

  console.log(
    `Scraping ${STORES.length} WooCommerce stores, maxPages=${maxPages}\n`,
  );

  const results = [];
  let totalProducts = 0;
  let totalPages = 0;
  let totalErrors = 0;
  const t0 = Date.now();

  for (const store of STORES) {
    process.stdout.write(`  ${store.slug.padEnd(22)} ... `);
    const r = await scrapeStore(store, maxPages);
    results.push(r);
    totalProducts += r.productCount;
    totalPages += r.pagesFetched;
    totalErrors += r.errors.length;
    console.log(
      `${String(r.productCount).padStart(4)} products · ${String(r.durationMs).padStart(5)}ms · ${r.errors.length} errors`,
    );
    if (r.errors.length) console.log(`    ${r.errors.join("; ")}`);
    await new Promise((resolve) => setTimeout(resolve, STORE_DELAY_MS));
  }

  console.log(
    `\nDone: ${totalProducts} products across ${STORES.length} stores in ${Date.now() - t0}ms (${totalPages} pages, ${totalErrors} errors)`,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-woocommerce.mjs",
    platform: "woocommerce",
    maxPagesPerStore: maxPages,
    storeCount: STORES.length,
    productCount: totalProducts,
    stores: results.map(({ products, ...meta }) => meta),
    products: results.flatMap((r) => r.products),
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-woocommerce.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
