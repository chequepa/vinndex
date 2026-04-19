#!/usr/bin/env node
/**
 * Offline scraping: runs the Tiendanube adapter locally against all 14
 * configured stores and writes a snapshot to data/snapshot.json.
 *
 * Why offline: Cloudflare blocks Railway data-center IPs. Residential IPs
 * (like a dev machine) go through fine. Until we wire residential proxies
 * (IPRoyal) or a dedicated worker environment, the snapshot is regenerated
 * manually and committed to the repo. The web app reads from the snapshot.
 *
 * Usage:
 *   node scripts/scrape-tiendanube.mjs             # all stores, 3 pages each
 *   node scripts/scrape-tiendanube.mjs full        # all stores, up to 80 pages
 *   node scripts/scrape-tiendanube.mjs grand-cru   # single store, 3 pages
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
};

const STORES = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "data/stores-snapshot-config.json"), "utf8"),
);

const MAX_PAGES = 80;
const PAGE_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 20_000;
const STORE_DELAY_MS = 1500;

function isJsonLdProduct(obj) {
  if (!obj || typeof obj !== "object") return false;
  const t = obj["@type"];
  if (Array.isArray(t)) return t.includes("Product");
  return t === "Product";
}

function parseJsonLdFromHtml(html) {
  const out = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[1].trim();
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (isJsonLdProduct(item)) out.push(item);
      if (item?.mainEntity && isJsonLdProduct(item.mainEntity)) {
        out.push(item.mainEntity);
      }
    }
  }
  return out;
}

function normalize(ld, storeSlug) {
  const url = ld.mainEntityOfPage?.["@id"] ?? ld["@id"];
  const name = ld.name?.trim();
  if (!url || !name) return null;

  const brand = typeof ld.brand === "string" ? ld.brand : ld.brand?.name ?? null;
  const image = Array.isArray(ld.image) ? ld.image[0] : ld.image;

  const rawPrice = ld.offers?.price;
  let priceArs = null;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== "") {
    const asNum =
      typeof rawPrice === "number"
        ? rawPrice
        : Number(String(rawPrice).replace(/[^\d.]/g, ""));
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

async function scrapeStore(config, maxPages) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = new Map();

  const base = config.baseUrl.replace(/\/+$/, "");
  const catalog = config.catalogPath.replace(/^\/+|\/+$/g, "");

  let pagesFetched = 0;
  let lastAdded = 1;

  for (let page = 1; page <= maxPages && lastAdded > 0; page++) {
    const url = page === 1 ? `${base}/${catalog}/` : `${base}/${catalog}/page/${page}/`;
    pagesFetched++;
    lastAdded = 0;

    let res;
    try {
      res = await fetchWithTimeout(url);
    } catch (err) {
      errors.push(`page ${page}: fetch failed (${err.message})`);
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
        lastAdded++;
      }
    }

    if (page < maxPages && lastAdded > 0) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }

  return {
    storeSlug: config.slug,
    storeName: config.name,
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
  const full = args.includes("full");
  const targetSlug = args.find((a) => a !== "full");
  const maxPages = full ? MAX_PAGES : 3;

  const targets = targetSlug
    ? STORES.filter((s) => s.slug === targetSlug)
    : STORES;

  if (targets.length === 0) {
    console.error(`Unknown store slug "${targetSlug}"`);
    console.error(`Available: ${STORES.map((s) => s.slug).join(", ")}`);
    process.exit(1);
  }

  console.log(
    `Scraping ${targets.length} store(s), maxPages=${maxPages}, delay=${STORE_DELAY_MS}ms between stores\n`,
  );

  const results = [];
  let totalProducts = 0;
  let totalPages = 0;
  let totalErrors = 0;
  const t0 = Date.now();

  for (const store of targets) {
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
    `\nDone: ${totalProducts} products across ${targets.length} stores in ${Date.now() - t0}ms (${totalPages} pages, ${totalErrors} errors)`,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-tiendanube.mjs",
    maxPagesPerStore: maxPages,
    storeCount: targets.length,
    productCount: totalProducts,
    stores: results.map(({ products, ...meta }) => ({
      ...meta,
    })),
    products: results.flatMap((r) => r.products),
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
