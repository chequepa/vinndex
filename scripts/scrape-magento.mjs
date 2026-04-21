#!/usr/bin/env node
/**
 * Magento 2 adapter (currently Vinoteca Ligier).
 *
 * Magento stores don't publish a clean JSON API for guests. We scrape the
 * catalogsearch results HTML which renders all products with consistent
 * classes (.product-item-info, .product-item-link, .price, img.product-image-photo).
 *
 * Paginación: ?p=N (24 productos/page). Rewrite URL: /catalogsearch/result/?q=vino → /search/vino
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HEADERS = {
  "user-agent": USER_AGENT,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "upgrade-insecure-requests": "1",
};

const MAX_PAGES = 150;
const PAGE_DELAY_MS = 600;
const FETCH_TIMEOUT_MS = 25_000;

const STORES = [
  {
    slug: "ligier",
    name: "Vinoteca Ligier",
    platform: "magento",
    baseUrl: "https://vinotecaligier.com",
    searchPath: "/search/vino",
  },
];

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};
function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

async function fetchWithTimeout(url) {
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

function parseProductsFromHtml(html, store) {
  const out = [];
  // Split by product-item-info blocks
  const chunks = html.split(/<div[^>]+class="[^"]*product-item-info[^"]*"/);
  for (const chunk of chunks.slice(1)) {
    // Title + link
    const linkMatch = chunk.match(
      /<a\s+class="product-item-link"\s+href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/,
    );
    if (!linkMatch) continue;
    const url = linkMatch[1].replace(/&amp;/g, "&").trim();
    const name = decodeEntities(linkMatch[2].trim());
    if (!name) continue;

    // Image (data-src for lazy-loaded)
    const imgMatch = chunk.match(
      /<img[^>]*class="[^"]*product-image-photo[^"]*"[^>]*(?:data-src|src)="([^"]+)"/,
    );
    const imageUrl = imgMatch ? imgMatch[1].replace(/&amp;/g, "&") : null;

    // Price — prefer data-price-amount from first .price-wrapper
    let priceArs = null;
    const priceDataMatch = chunk.match(/data-price-amount="([\d\.]+)"/);
    if (priceDataMatch) {
      const n = Number(priceDataMatch[1]);
      if (Number.isFinite(n) && n >= 500) priceArs = n;
    }

    // SKU rarely exposed in card; the product ID is in data-product-id
    const idMatch = chunk.match(/data-product-id="(\d+)"/);
    const externalSku = idMatch ? `LIG-${idMatch[1]}` : null;

    out.push({
      storeSlug: store.slug,
      externalUrl: url,
      externalSku,
      name,
      brand: null, // Magento search card doesn't expose brand
      imageUrl,
      priceArs,
      currency: "ARS",
      inStock: true, // Catalog search shows in-stock only by default
      description: null,
    });
  }
  return out;
}

function looksLikeWine(p) {
  const n = p.name.toLowerCase();
  // Block obvious accessories
  if (/\b(copa|decantador|descorchador|tirabuz|sacacorchos|aireador|enfriador|gift\s*card)\b/i.test(n))
    return false;
  return true;
}

async function scrapeStore(store) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = new Map();
  const base = store.baseUrl.replace(/\/+$/, "");
  let pagesFetched = 0;
  let filtered = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? `${base}${store.searchPath}` : `${base}${store.searchPath}?p=${page}`;
    pagesFetched++;
    process.stdout.write(`  page ${page} ... `);

    let res;
    try {
      res = await fetchWithTimeout(url);
    } catch (err) {
      errors.push(`page ${page}: fetch failed (${err.message})`);
      console.log("FAIL");
      break;
    }
    if (!res.ok) {
      errors.push(`page ${page}: HTTP ${res.status}`);
      console.log(`HTTP ${res.status}`);
      if (res.status === 429) break;
      continue;
    }

    const html = await res.text();
    const items = parseProductsFromHtml(html, store);
    if (items.length === 0) {
      console.log("empty");
      break;
    }

    let added = 0;
    for (const p of items) {
      if (!looksLikeWine(p)) { filtered++; continue; }
      if (!products.has(p.externalUrl)) {
        products.set(p.externalUrl, p);
        added++;
      }
    }
    console.log(`${items.length} items (${added} new, ${products.size} total)`);
    if (added === 0) break; // hit end of unique results

    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  return {
    storeSlug: store.slug,
    storeName: store.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    filtered,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };
}

async function main() {
  console.log(`Scraping ${STORES.length} Magento store(s)\n`);
  const results = [];
  let totalProducts = 0;
  let totalErrors = 0;
  const t0 = Date.now();

  for (const store of STORES) {
    console.log(`\n== ${store.name} ==`);
    const r = await scrapeStore(store);
    results.push(r);
    totalProducts += r.productCount;
    totalErrors += r.errors.length;
    console.log(
      `  total: ${r.productCount} products, ${r.errors.length} errors, ${r.durationMs}ms`,
    );
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-magento.mjs",
    platform: "magento",
    storeCount: results.length,
    productCount: totalProducts,
    stores: results.map(({ products, ...meta }) => meta),
    products: results.flatMap((r) => r.products),
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-magento.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot));
  console.log(
    `\nDone: ${totalProducts} products across ${results.length} stores in ${Date.now() - t0}ms`,
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
