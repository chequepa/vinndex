#!/usr/bin/env node
/**
 * Scrapea Vinoteca Ligier (ligier.com.ar).
 *
 * En octubre de 2026 Ligier dejó Magento por un sitio propio en Next.js
 * (Vercel). vinotecaligier.com redirige ahí y `/search/vino` cae en
 * `/productos?q=vino`, que el adapter de Magento leía como página vacía:
 * 0 productos y 0 errores todos los días.
 *
 * El listado por categoría (`/vinos`, `/espumantes`) se renderiza en el
 * servidor con 24 cards por página (`?page=N`) y cada card trae todo lo
 * que hace falta: bodega, nombre, "Varietal · País · 750 ml", precio y el
 * SKU interno (sufijo del slug, `…-be80478` → BE80478). La ficha tiene
 * JSON-LD con gtin13, pero pedir ~4.000 fichas por día para sumar el EAN
 * no vale la carga sobre la tienda; si hace falta, va como paso aparte.
 *
 * robots.txt (30/10/2026): `User-Agent: *` sólo excluye /carrito.
 *
 * Output: data/snapshot-ligier.json (mismo shape que el resto).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fetchPageWithRetry } from "./lib-fetch-retry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HEADERS = {
  "user-agent": USER_AGENT,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
};

const PAGE_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 25_000;
// /vinos tenía 162 páginas el 30/10. El tope real lo da la paginación de
// la propia página 1; esto es sólo la red de seguridad.
const DEFAULT_MAX_PAGES = 400;

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

const stripTags = (s) => decodeEntities(s.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** "$ 28.900" / "$ 1.234,50" → número. */
function parseArs(s) {
  const m = s.match(/\$\s*([\d.]+(?:,\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Última página que anuncia la paginación (`?page=162`), o null. */
export function parseLastPage(html, path) {
  let last = null;
  const re = new RegExp(`href="${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?page=(\\d+)"`, "g");
  for (const m of html.matchAll(re)) {
    const n = Number(m[1]);
    if (!last || n > last) last = n;
  }
  return last;
}

/**
 * Cards del listado. Cada una abre con el `<div class="group flex flex-col
 * …">` y tiene dos `<a href="/productos/…">`: la imagen y el título.
 */
export function parseCards(html, store) {
  const base = store.baseUrl.replace(/\/+$/, "");
  const out = [];
  const chunks = html.split(/<div class="group flex flex-col[^"]*">/);
  for (const chunk of chunks.slice(1)) {
    const title = chunk.match(/<a class="[^"]*line-clamp-2[^"]*" href="(\/productos\/[^"?#]+)">([\s\S]*?)<\/a>/);
    if (!title) continue;
    const path = title[1];
    const name = stripTags(title[2]);
    if (!name) continue;

    const brandM = chunk.match(/<p class="truncate[^"]*uppercase[^"]*">([\s\S]*?)<\/p>/);
    const metaM = chunk.match(/<p class="mt-1[^"]*truncate[^"]*">([\s\S]*?)<\/p>/);

    // Precio vigente: el `font-bold` que no está tachado. El "c/u llevando
    // 6" es un precio por cantidad y va en otro <p>, no se toma.
    let priceArs = null;
    for (const m of chunk.matchAll(/<(p|span|s|del) class="([^"]*)"[^>]*>([^<]*\$[^<]*)<\/\1>/g)) {
      if (m[1] === "s" || m[1] === "del" || /line-through/.test(m[2])) continue;
      if (!/font-bold/.test(m[2])) continue;
      priceArs = parseArs(m[3]);
      if (priceArs) break;
    }

    // Imagen original (sin el proxy de /_next/image).
    let imageUrl = null;
    const img = chunk.match(/src="\/_next\/image\?url=([^&"]+)/);
    if (img) {
      try {
        imageUrl = decodeURIComponent(img[1]);
      } catch {
        imageUrl = null;
      }
    }

    const skuM = path.match(/-([a-z]{2,3}\d{4,})$/i);
    const meta = metaM ? stripTags(metaM[1]) : null;

    out.push({
      storeSlug: store.slug,
      externalUrl: `${base}${path}`,
      externalSku: skuM ? skuM[1].toUpperCase() : null,
      name,
      brand: brandM ? stripTags(brandM[1]) || null : null,
      imageUrl,
      priceArs,
      currency: "ARS",
      inStock: priceArs != null && !/sin stock|agotad/i.test(stripTags(chunk)),
      description: meta || null,
    });
  }
  return out;
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

async function scrapeStore(store) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = new Map();
  const base = store.baseUrl.replace(/\/+$/, "");
  const maxPages = store.maxPages ?? DEFAULT_MAX_PAGES;
  const stats = { retries: 0, recovered: false };
  let pagesFetched = 0;
  let truncated = false;

  for (const path of store.categoryPaths) {
    let lastPage = null;
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? `${base}${path}` : `${base}${path}?page=${page}`;
      pagesFetched++;
      const result = await fetchPageWithRetry({
        page,
        stats,
        doFetch: () => fetchWithTimeout(url),
        readBody: (res) => res.text(),
        isDone: (status, p) => status === 404 && p > 1,
      });
      if (result.done) break;
      if (result.failure) {
        errors.push(`${path} page ${page}: ${result.failure}`);
        if (page === 1) break;
        continue;
      }

      const html = result.value;
      if (page === 1) lastPage = parseLastPage(html, path);
      const cards = parseCards(html, store);
      if (cards.length === 0) {
        // En la página 1 no es "categoría vacía": es markup que cambió.
        if (page === 1) errors.push(`${path} page 1: sin cards (${html.length}B) — ¿cambió el markup?`);
        break;
      }
      let added = 0;
      for (const c of cards) {
        if (!products.has(c.externalUrl)) {
          products.set(c.externalUrl, c);
          added++;
        }
      }
      if (added === 0) break;
      if (lastPage && page >= lastPage) break;
      if (page === maxPages) truncated = true;
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }

  return {
    storeSlug: store.slug,
    storeName: store.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    truncated,
    retries: stats.retries,
    recoveredAfterRetry: stats.recovered,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };
}

async function main() {
  const stores = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "data/stores.json"), "utf8"),
  ).filter((s) => s.platform === "custom" && s.customAdapter === "ligier-next");
  console.log(`Scraping ${stores.length} ligier store(s)\n`);

  const results = [];
  const t0 = Date.now();
  for (const store of stores) {
    process.stdout.write(`  ${store.slug.padEnd(22)} ... `);
    const r = await scrapeStore(store);
    results.push(r);
    console.log(
      `${String(r.productCount).padStart(4)} productos · ${r.pagesFetched} páginas · ${String(r.durationMs).padStart(6)}ms · ${r.errors.length} errors`,
    );
    if (r.errors.length) console.log(`    ${r.errors.join("; ")}`);
  }

  const productCount = results.reduce((n, r) => n + r.productCount, 0);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-ligier.mjs",
    platform: "custom",
    storeCount: results.length,
    productCount,
    stores: results.map(({ products, ...meta }) => meta),
    products: results.flatMap((r) => r.products),
  };
  const outPath = resolve(REPO_ROOT, "data/snapshot-ligier.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot));
  console.log(`\nDone: ${productCount} productos en ${Date.now() - t0}ms\nWrote ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
