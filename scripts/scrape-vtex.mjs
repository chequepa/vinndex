#!/usr/bin/env node
/**
 * Offline scraping for VTEX stores (Cencosud supermarkets + Carrefour + Gobar).
 *
 * VTEX exposes a public search endpoint that returns fully structured JSON
 * per product including price, stock, images, and category path — no HTML
 * parsing needed.
 *   GET /api/catalog_system/pub/products/search?ft=vino&_from=N&_to=M
 *
 * Pagination: _from/_to are inclusive 0-based indices. Max per request: 50.
 * Hard offset cap: ~2500 (VTEX returns 500 error beyond that).
 *
 * We filter client-side to products whose category path contains a wine
 * keyword — otherwise the ft=vino search also returns wine accessories
 * (copas, decanters, sacacorchos) which we don't want.
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
  accept: "application/json",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
};

const BATCH = 50;
const MAX_OFFSET = 2450;
const BATCH_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 20_000;
const STORE_DELAY_MS = 1500;

const STORES = [
  { slug: "jumbo", name: "Jumbo", platform: "vtex", baseUrl: "https://www.jumbo.com.ar" },
  { slug: "disco", name: "Disco", platform: "vtex", baseUrl: "https://www.disco.com.ar" },
  { slug: "vea", name: "Vea", platform: "vtex", baseUrl: "https://www.vea.com.ar" },
  { slug: "carrefour", name: "Carrefour", platform: "vtex", baseUrl: "https://www.carrefour.com.ar" },
  { slug: "dia", name: "Día", platform: "vtex", baseUrl: "https://diaonline.supermercadosdia.com.ar" },
  { slug: "gobar", name: "Gobar", platform: "vtex", baseUrl: "https://www.gobar.com.ar" },
];

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

const WINE_CATEGORY = /vino|tinto|blanco|rosado|espumante|champa|malbec|cabernet|chardonnay|sauvignon|bodega/i;
const ACCESSORY_HINT = /copa|decantador|descorchador|tirabuz|sacacorchos|aireador|enfriador|manteles|canastas|articulos para vino/i;

function looksLikeWine(p) {
  const cats = (p.categories ?? []).join(" ").toLowerCase();
  const name = (p.productName ?? "").toLowerCase();
  if (ACCESSORY_HINT.test(name)) return false;
  if (cats && WINE_CATEGORY.test(cats)) return true;
  // Fall back to name check
  return WINE_CATEGORY.test(name);
}

function priceFromOffer(co) {
  if (!co) return null;
  const v = co.Price ?? co.ListPrice ?? co.PriceWithoutDiscount;
  return typeof v === "number" && v > 0 ? v : null;
}

function normalize(p, storeSlug, baseUrl) {
  const item = p.items?.[0];
  const seller = item?.sellers?.[0];
  const co = seller?.commertialOffer;

  const rawLink = p.link ?? `${baseUrl}/${p.linkText ?? ""}/p`;
  const url = rawLink.startsWith("http") ? rawLink : `${baseUrl}${rawLink}`;

  const name = (p.productName ?? p.productTitle ?? "").trim();
  if (!url || !name) return null;

  const imageUrl = item?.images?.[0]?.imageUrl ?? null;
  const brand = p.brand ? p.brand.trim() : null;
  const inStock = co?.IsAvailable === true || (co?.AvailableQuantity ?? 0) > 0;

  return {
    storeSlug,
    externalUrl: url,
    externalSku: item?.ean || item?.itemId || p.productReference || null,
    name,
    brand,
    imageUrl,
    priceArs: priceFromOffer(co),
    currency: "ARS",
    inStock,
    description: p.metaTagDescription?.trim() || null,
  };
}

async function scrapeStore(store) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = new Map();
  const base = store.baseUrl.replace(/\/+$/, "");

  let pagesFetched = 0;
  let rawSeen = 0;
  let filtered = 0;

  for (let from = 0; from <= MAX_OFFSET; from += BATCH) {
    const to = Math.min(from + BATCH - 1, MAX_OFFSET);
    const url = `${base}/api/catalog_system/pub/products/search?ft=vino&_from=${from}&_to=${to}`;
    pagesFetched++;

    let res;
    try {
      res = await fetchJson(url);
    } catch (err) {
      errors.push(`from ${from}: fetch failed (${err.message})`);
      break;
    }
    if (!res.ok) {
      if (res.status === 416 || res.status === 206) {
        // Range exceeded or partial — some VTEX stores return 206
        if (res.status === 416) break;
      } else if (res.status >= 500) {
        errors.push(`from ${from}: HTTP ${res.status} (likely offset cap)`);
        break;
      } else {
        errors.push(`from ${from}: HTTP ${res.status}`);
        if (from === 0) break;
        continue;
      }
    }

    let items;
    try {
      const body = await res.json();
      items = Array.isArray(body) ? body : [];
    } catch {
      errors.push(`from ${from}: non-JSON`);
      break;
    }

    if (items.length === 0) break;
    rawSeen += items.length;

    let added = 0;
    for (const p of items) {
      if (!looksLikeWine(p)) {
        filtered++;
        continue;
      }
      const n = normalize(p, store.slug, base);
      if (!n) continue;
      if (!products.has(n.externalUrl)) {
        products.set(n.externalUrl, n);
        added++;
      }
    }

    if (items.length < BATCH) break;
    if (added === 0 && from > 0) {
      // safety — if we got items but none were wines, keep going a couple batches
    }

    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  return {
    storeSlug: store.slug,
    storeName: store.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    rawSeen,
    filtered,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const targetSlug = args[0];
  const targets = targetSlug
    ? STORES.filter((s) => s.slug === targetSlug)
    : STORES;

  if (targets.length === 0) {
    console.error(`Unknown store slug "${targetSlug}"`);
    console.error(`Available: ${STORES.map((s) => s.slug).join(", ")}`);
    process.exit(1);
  }

  console.log(`Scraping ${targets.length} VTEX store(s)\n`);

  const results = [];
  let totalProducts = 0;
  let totalErrors = 0;
  const t0 = Date.now();

  for (const store of targets) {
    process.stdout.write(`  ${store.slug.padEnd(12)} ... `);
    const r = await scrapeStore(store);
    results.push(r);
    totalProducts += r.productCount;
    totalErrors += r.errors.length;
    console.log(
      `${String(r.productCount).padStart(4)} products (${r.rawSeen} raw, ${r.filtered} filtered) · ${String(r.durationMs).padStart(5)}ms · ${r.errors.length} errors`,
    );
    if (r.errors.length) console.log(`    ${r.errors.join("; ")}`);
    await new Promise((resolve) => setTimeout(resolve, STORE_DELAY_MS));
  }

  console.log(
    `\nDone: ${totalProducts} products across ${targets.length} stores in ${Date.now() - t0}ms (${totalErrors} errors)`,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-vtex.mjs",
    platform: "vtex",
    storeCount: targets.length,
    productCount: totalProducts,
    stores: results.map(({ products, ...meta }) => meta),
    products: results.flatMap((r) => r.products),
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-vtex.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
