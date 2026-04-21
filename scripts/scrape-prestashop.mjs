#!/usr/bin/env node
/**
 * PrestaShop adapter (currently Frappe).
 *
 * Parses product-miniature <article> blocks from paginated category pages:
 *   /1574-vinos?page=N
 *
 * Each card exposes: title + link + image + brand + reference + price.
 * Nicely structured — no fighting with messy markup.
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
  accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
};

const MAX_PAGES = 100;
const PAGE_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 20_000;

const STORES = [
  {
    slug: "frappe",
    name: "Frappe",
    platform: "prestashop",
    baseUrl: "https://www.frappe.com.ar",
    categoryPath: "/1574-vinos",
  },
];

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
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
    return await fetch(url, { headers: HEADERS, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

function parsePrestashopCategory(html, store) {
  const out = [];
  // Each product card is a <article> with product-miniature class
  const chunks = html.split(/<article[^>]+class="[^"]*product-miniature[^"]*"/);
  for (const chunk of chunks.slice(1)) {
    // Title + link in h3.product-title > a
    const linkMatch = chunk.match(
      /<h[23]\s+class="[^"]*product-title[^"]*"[^>]*>\s*<a\s+href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/,
    );
    if (!linkMatch) continue;
    const url = linkMatch[1].replace(/&amp;/g, "&").trim();
    const name = decodeEntities(linkMatch[2].trim());
    if (!name) continue;

    // Image: img data-src
    const imgMatch = chunk.match(
      /<img[^>]*(?:data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"[^>]*class="[^"]*product-thumbnail-first/,
    );
    const imageUrl = imgMatch ? imgMatch[1].replace(/&amp;/g, "&") : null;

    // Brand
    const brandMatch = chunk.match(
      /<div class="product-brand[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/,
    );
    const brand = brandMatch ? decodeEntities(brandMatch[1].trim()) : null;

    // Reference (internal SKU)
    const refMatch = chunk.match(
      /<div class="product-reference[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/,
    );
    const externalSku = refMatch ? refMatch[1].trim() : null;

    // Price — prefer the content attribute (exact number) over display string
    let priceArs = null;
    const priceContentMatch = chunk.match(
      /<span class="product-price"[^>]*content="([\d\.]+)"/,
    );
    if (priceContentMatch) {
      const n = Number(priceContentMatch[1]);
      if (Number.isFinite(n) && n >= 500) priceArs = Math.round(n);
    }

    // Product ID
    const idMatch = chunk.match(/data-id-product="(\d+)"/);

    out.push({
      storeSlug: store.slug,
      externalUrl: url,
      externalSku: externalSku || (idMatch ? `PS-${idMatch[1]}` : null),
      name,
      brand,
      imageUrl,
      priceArs,
      currency: "ARS",
      inStock: true,
      description: null,
    });
  }
  return out;
}

function looksLikeWine(p) {
  const n = p.name.toLowerCase();
  if (/\b(copa|decantador|descorchador|sacacorchos|tirabuz|aireador)\b/i.test(n)) return false;
  return true;
}

async function scrapeStore(store) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = new Map();
  const base = store.baseUrl.replace(/\/+$/, "");
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? `${base}${store.categoryPath}` : `${base}${store.categoryPath}?page=${page}`;
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
      break;
    }

    const html = await res.text();
    const items = parsePrestashopCategory(html, store);
    if (items.length === 0) {
      console.log("empty");
      break;
    }

    let added = 0;
    for (const p of items) {
      if (!looksLikeWine(p)) continue;
      if (!products.has(p.externalUrl)) {
        products.set(p.externalUrl, p);
        added++;
      }
    }
    console.log(`${items.length} items (${added} new, ${products.size} total)`);
    if (added === 0) break;

    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
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
  console.log(`Scraping ${STORES.length} PrestaShop store(s)\n`);
  const results = [];
  let total = 0;
  const t0 = Date.now();

  for (const store of STORES) {
    console.log(`\n== ${store.name} ==`);
    const r = await scrapeStore(store);
    results.push(r);
    total += r.productCount;
    console.log(`  total: ${r.productCount} products, ${r.errors.length} errors, ${r.durationMs}ms`);
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-prestashop.mjs",
    platform: "prestashop",
    storeCount: results.length,
    productCount: total,
    stores: results.map(({ products, ...meta }) => meta),
    products: results.flatMap((r) => r.products),
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-prestashop.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot));
  console.log(`\nDone in ${Date.now() - t0}ms`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
