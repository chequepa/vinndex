#!/usr/bin/env node
/**
 * Mercado Libre public listing scraper.
 *
 * ML's OAuth API requires a user token (3-legged flow) since 2024. Client
 * Credentials tokens return 403 on /sites/MLA/search, and the 3-legged
 * flow needs Juan to approve in a browser each time. For a daily scrape
 * that pattern is fragile.
 *
 * The listing pages at https://listado.mercadolibre.com.ar/vinos_Desde_N
 * are public HTML (no auth). We parse ~100 cards per page and walk
 * pagination until we hit an empty page or MAX_PAGES.
 *
 * Each card has title + price + image (+ permalink, sometimes opaque).
 * Products get storeSlug="mercado-libre" and our matching pipeline
 * collapses duplicates across ML and other stores.
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

const MAX_PAGES = 40; // 40 × ~50 = ~2000 products cap
const PAGE_DELAY_MS = 800;
const FETCH_TIMEOUT_MS = 25_000;

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

const STORE = {
  slug: "mercado-libre",
  name: "Mercado Libre",
  platform: "mercadolibre",
  baseUrl: "https://listado.mercadolibre.com.ar",
};

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

/**
 * Parse ML listing HTML into products.
 * The poly-card pattern looks like:
 *   <h3 class="poly-component__title-wrapper">
 *     <a href="...">TITLE</a>
 *   </h3>
 *   ...
 *   <img class="poly-component__picture" src="IMG" alt="TITLE"...>
 *   ...
 *   <span aria-label="NNN pesos">...</span>
 */
function parseListingPage(html) {
  const out = [];

  // Split on the card anchor pattern — each card has a poly-card wrapper
  const cardChunks = html.split(/<div[^>]+class="[^"]*poly-card\b/);
  // first chunk is before any card, skip it
  for (const chunk of cardChunks.slice(1)) {
    // Title + href
    const titleMatch = chunk.match(
      /<h3[^>]*class="[^"]*poly-component__title-wrapper[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/,
    );
    if (!titleMatch) continue;
    const href = titleMatch[1].replace(/&amp;/g, "&").trim();
    const title = titleMatch[2].trim();
    if (!title) continue;

    // Image
    const imgMatch = chunk.match(
      /<img[^>]*class="[^"]*poly-component__picture[^"]*"[^>]*src="([^"]+)"/,
    );
    const imageUrl = imgMatch ? imgMatch[1].replace(/&amp;/g, "&") : null;

    // Price — look for first aria-label="NNNNN pesos" in this chunk
    const priceMatch = chunk.match(/aria-label="(\d[\d\.]*)\s*pesos?"/);
    let priceArs = null;
    if (priceMatch) {
      const raw = priceMatch[1].replace(/\./g, "");
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) priceArs = n;
    }

    // Resolve canonical URL:
    //   - https://www.mercadolibre.com.ar/slug/p/MLA123 = catalog product (good)
    //   - https://articulo.mercadolibre.com.ar/MLA-123-slug = individual listing (good)
    //   - https://click1.mercadolibre.com.ar/... = opaque tracking redirect (drop param noise)
    let externalUrl = href;
    // Strip tracking query params
    try {
      const u = new URL(externalUrl);
      // Keep only clean path, drop all query for identity
      externalUrl = `${u.origin}${u.pathname}`;
    } catch {
      /* leave as-is */
    }

    // Extract MLA ID for sku / externalSku
    let externalSku = null;
    const mlaInPath = externalUrl.match(/MLA[-]?(\d+)/);
    if (mlaInPath) externalSku = `MLA${mlaInPath[1]}`;

    out.push({
      storeSlug: STORE.slug,
      externalUrl,
      externalSku,
      name: decodeEntities(title),
      brand: null, // ML doesn't expose brand in listing card
      imageUrl,
      priceArs,
      currency: "ARS",
      inStock: true, // listing pages show in-stock only
      description: null,
    });
  }
  return out;
}

async function main() {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const products = new Map();
  const errors = [];
  let pagesFetched = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page === 0 ? 1 : 48 * page + 1;
    const url =
      page === 0
        ? `${STORE.baseUrl}/vinos`
        : `${STORE.baseUrl}/vinos_Desde_${from}_NoIndex_True`;
    pagesFetched++;
    process.stdout.write(`  page ${page + 1} (from=${from}) ... `);

    let res;
    try {
      res = await fetchWithTimeout(url);
    } catch (err) {
      errors.push(`page ${page + 1}: fetch failed (${err.message})`);
      console.log("FAIL");
      break;
    }
    if (!res.ok) {
      errors.push(`page ${page + 1}: HTTP ${res.status}`);
      console.log(`HTTP ${res.status}`);
      if (res.status === 429) {
        console.log("    (rate limited, stopping)");
        break;
      }
      continue;
    }

    const html = await res.text();
    const items = parseListingPage(html);
    if (items.length === 0) {
      console.log("empty (end)");
      break;
    }

    let added = 0;
    for (const p of items) {
      if (!products.has(p.externalUrl)) {
        products.set(p.externalUrl, p);
        added++;
      }
    }
    console.log(
      `${items.length} items (${added} new, ${products.size} total)`,
    );
    if (added === 0 && page > 0) {
      // All items were duplicates — we've hit the end of unique results
      break;
    }

    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  const result = {
    storeSlug: STORE.slug,
    storeName: STORE.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-mercadolibre.mjs",
    platform: "mercadolibre",
    storeCount: 1,
    productCount: result.productCount,
    stores: [
      {
        storeSlug: result.storeSlug,
        storeName: result.storeName,
        startedAt: result.startedAt,
        durationMs: result.durationMs,
        pagesFetched: result.pagesFetched,
        productCount: result.productCount,
        errors: result.errors,
      },
    ],
    products: result.products,
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-mercadolibre.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot));
  console.log(
    `\nDone: ${result.productCount} products in ${Date.now() - t0}ms, ${errors.length} errors`,
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
