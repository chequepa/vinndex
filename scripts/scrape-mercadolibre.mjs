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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Load .env.local for ML credentials (ML_APP_ID + ML_CLIENT_SECRET + ML_REFRESH_TOKEN)
function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}
loadEnv();

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

// ========= API mode (when ML_REFRESH_TOKEN is set) =========
// User tokens from 3-legged OAuth work against /sites/MLA/search, which
// client_credentials don't. Much richer data than HTML scrape.

async function refreshAccessToken() {
  const appId = process.env.ML_APP_ID;
  const secret = process.env.ML_CLIENT_SECRET;
  const refreshToken = process.env.ML_REFRESH_TOKEN;
  if (!appId || !secret || !refreshToken) return null;
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: appId,
      client_secret: secret,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    console.error(`  refresh failed: HTTP ${res.status}`);
    return null;
  }
  const body = await res.json();
  return body.access_token;
}

async function apiSearch(accessToken, offset, limit) {
  const res = await fetch(
    `https://api.mercadolibre.com/sites/MLA/search?category=MLA1577&limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`API HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function normalizeApiItem(it) {
  // EAN from attributes
  let ean = null;
  for (const a of it.attributes ?? []) {
    if (a.id === "EAN" || a.id === "GTIN" || a.name === "EAN" || a.name === "GTIN") {
      const v = a.value_name ?? a.values?.[0]?.name;
      if (v && /^\d{12,14}$/.test(v.trim())) ean = v.trim();
    }
  }
  // Brand
  let brand = null;
  for (const a of it.attributes ?? []) {
    if (a.id === "BRAND" || a.name === "Marca") {
      brand = a.value_name ?? a.values?.[0]?.name;
      if (brand) break;
    }
  }
  const priceNum = typeof it.price === "number" && it.price > 0 ? it.price : null;
  return {
    storeSlug: "mercado-libre",
    externalUrl: (it.permalink || "").split("?")[0] || it.permalink,
    externalSku: ean || it.id || null,
    name: decodeEntities((it.title || "").trim()),
    brand: brand ? decodeEntities(brand) : null,
    imageUrl: it.thumbnail || null,
    priceArs: priceNum,
    currency: it.currency_id || "ARS",
    inStock: (it.available_quantity ?? 0) > 0,
    description: null,
  };
}

async function scrapeApi() {
  // NOTE (2026-04-21): probado el flujo 3-legged OAuth + PKCE + user token
  // y /sites/MLA/search devuelve 403 de todas formas. ML cambi\u00f3 pol\u00edtica
  // en 2024 y el endpoint de b\u00fasqueda est\u00e1 cerrado para apps de terceros
  // independiente del scope. El HTML scraper sigue siendo el \u00fanico camino
  // viable para listados masivos.
  //
  // El refresh_token queda guardado por si en el futuro queremos enriquecer
  // items individuales (/items/{id}) con EAN / reviews / seller rating.
  return null;
}

// ========= HTML mode (default / fallback) =========

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

const STORE = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "data/stores.json"), "utf8"),
).find((s) => s.platform === "mercadolibre");

// ===== Bot Manager challenge bypass =====
//
// ML pone un interstitial anti-bot (cookies `_bm*`, server Tengine) delante
// de listado.mercadolibre.com.ar: responde 200 con una página chica que
// exige JS y resuelve un proof-of-work SHA-256. Sin resolverlo nunca llega
// el listado real y parseListingPage() devuelve [] (el "silently broken").
//
// El challenge (extraído del JS servido) es:
//   - cookie `_bmstate` = `${seed};${difficulty};...` (URL-encoded)
//   - buscar el menor entero `a` tal que sha256(seed + a) empiece con
//     `difficulty` ceros hex
//   - mandar cookie `_bmc = encodeURIComponent(`${seed};${a}`)` + el flag
//     `_bm_skipml=true`, reintentar la misma URL
//
// Mantenemos un cookie jar a nivel módulo: una vez resuelto, las páginas
// siguientes reusan las cookies. Si el challenge reaparece (la cookie de
// bypass dura ~5min) se resuelve de nuevo solo — el PoW es ~1ms.

const cookieJar = new Map();

function sha256hex(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function ingestSetCookies(res) {
  const list = res.headers.getSetCookie?.() ?? [];
  for (const line of list) {
    const first = line.split(";")[0];
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) cookieJar.set(name, value);
  }
}

function jarToHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function isChallenge(html) {
  return html.includes("verifyChallenge") || html.includes("_bm_skipml");
}

// Replica verifyChallenge()+navigateToContinue() del JS de ML.
function solveChallenge() {
  const raw = cookieJar.get("_bmstate");
  if (!raw) return false;
  const parts = decodeURIComponent(raw).split(";");
  const seed = parts[0];
  const difficulty = parts[1];
  if (!seed) return false;
  let answer = 0;
  if (difficulty && difficulty !== "0" && Number(difficulty) > 0) {
    const target = "0".repeat(Number(difficulty));
    let found = false;
    for (let i = 0; i < Number.MAX_SAFE_INTEGER; i++) {
      if (sha256hex(seed + i).startsWith(target)) {
        answer = i;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  cookieJar.set("_bmc", encodeURIComponent(`${seed};${answer}`));
  cookieJar.set("_bm_skipml", "true");
  return true;
}

async function rawFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { ...HEADERS };
    const cookie = jarToHeader();
    if (cookie) headers.cookie = cookie;
    return await fetch(url, {
      headers,
      signal: ctrl.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

// Devuelve un objeto Response-like: { ok, status, text() } — el body ya
// viene leído (resuelto el challenge si hacía falta). El resto del scraper
// usa res.ok / res.status / await res.text() sin cambios.
async function fetchWithTimeout(url) {
  let res = await rawFetch(url);
  ingestSetCookies(res);
  let body = await res.text();

  // Hasta 2 intentos de resolver el challenge (evita loop si ML cambia
  // el esquema). El PoW es ~1ms, así que reintentar es barato.
  for (let attempt = 0; attempt < 2 && isChallenge(body); attempt++) {
    if (!solveChallenge()) break;
    res = await rawFetch(url);
    ingestSetCookies(res);
    body = await res.text();
  }

  return {
    ok: res.ok,
    status: res.status,
    text: async () => body,
  };
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

    // Price — ML markup actual:
    //   - sin descuento: <span aria-label="26499 pesos argentinos">
    //   - con descuento: <s aria-label="Antes: 326900 pesos…"> (tachado)
    //       luego <div class="poly-price__current">
    //           <span aria-label="Ahora: 271503 pesos…"> (vigente)
    // El precio vigente SIEMPRE vive dentro de `poly-price__current`, así
    // que anclamos ahí: deja afuera el <s> tachado (va antes) y las cuotas
    // (van después). Toleramos el prefijo "Ahora: " y el sufijo
    // "argentinos". Sin poly-price__current, caemos al chunk completo.
    const pcIdx = chunk.indexOf("poly-price__current");
    const priceZone = pcIdx >= 0 ? chunk.slice(pcIdx) : chunk;
    const priceMatch = priceZone.match(
      /aria-label="(?:Ahora:\s*)?(\d[\d.]*)\s*pesos/,
    );
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

  // If API credentials exist, use the API path (richer data: EAN, brand)
  const apiResult = await scrapeApi();
  if (apiResult) {
    for (const p of apiResult.products) {
      if (!products.has(p.externalUrl)) products.set(p.externalUrl, p);
    }
    errors.push(...apiResult.errors);
    pagesFetched = apiResult.pagesFetched;
    console.log(`  API mode total: ${products.size} products\n`);
    // Still run HTML mode after API to cover listings API caps at offset 1000
  }

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
