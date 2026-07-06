#!/usr/bin/env node
/**
 * Adapter custom para espaciovino.com.ar — una de las vinotecas online
 * más grandes de Argentina (~1.200+ vinos).
 *
 * NO es Magento estándar (el detector la fingerprinteó así por markers
 * genéricos, falso positivo) ni expone API/JSON-LD: es un frontend
 * custom (`/js/compiled/main.js`) que renderiza el catálogo server-side
 * con clases propias. Lo parseamos del HTML.
 *
 * Estructura del card (grid `.row.product-list`):
 *   <div class="product">
 *     <div class="image"><a href="/vinos-ficha/{slug}">
 *       <img data-src="/media/..." alt="NOMBRE"></a></div>
 *     <div class="data"><div class="name"><h2>
 *       <a href="/vinos-ficha/{slug}">NOMBRE</a></h2></div>
 *       <span class="product-list-price">$26.200,00</span>  (tachado, ignorar)
 *       <span class="product-price">$ <span class="product-price-fraction">15.720</span>
 *         <span class="product-price-decimal">00</span></span>  (vigente)
 *
 * Paginación: /vinos?p=N. Filtra accesorios (copas, etc.).
 *
 * Salida compatible con merge-snapshots.mjs (mismo shape que los demás
 * adapters). NO está integrado al daily-scrape todavía — correr manual
 * y revisar antes de sumarlo al workflow + stores.json.
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

const STORE = {
  slug: "espaciovino",
  name: "Espaciovino",
  baseUrl: "https://www.espaciovino.com.ar",
  catalogPath: "/vinos",
};
const MAX_PAGES = 80;
const PAGE_DELAY_MS = 600;
const FETCH_TIMEOUT_MS = 25_000;

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

function looksLikeWine(name) {
  return !/\b(copa|decantador|descorchador|tirabuz|sacacorchos|aireador|enfriador|gift\s*card|caja\s+regalo|accesorio)\b/i.test(
    name,
  );
}

function parseProductsFromHtml(html) {
  const out = [];
  // Cada card es <div class="product"> dentro de .product-list.
  const chunks = html.split(/<div\s+class="product">/);
  for (const chunk of chunks.slice(1)) {
    // Link a ficha + nombre: <div class="name"><h2><a href="/vinos-ficha/X">NOMBRE</a>
    const nameMatch = chunk.match(
      /<div\s+class="name">\s*<h2>\s*<a\s+href="(\/vinos-ficha\/[^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/i,
    );
    if (!nameMatch) continue;
    const path = nameMatch[1].replace(/&amp;/g, "&").trim();
    const name = decodeEntities(nameMatch[2].trim());
    if (!name) continue;

    // Imagen real en data-src (src es placeholder botella.jpg, lazy-load).
    const imgMatch = chunk.match(/<img[^>]*data-src="([^"]+)"/i);
    const imageUrl = imgMatch
      ? new URL(imgMatch[1].replace(/&amp;/g, "&"), STORE.baseUrl).href
      : null;

    // Precio VIGENTE: dentro de <span class="product-price"> hay
    // product-price-fraction (entero con miles ".") + -decimal (centavos).
    // OJO: product-list-price es el tachado (sin descuento) — no tomarlo.
    let priceArs = null;
    const fracMatch = chunk.match(
      /<span\s+class="product-price-fraction">\s*([\d.]+)\s*<\/span>/i,
    );
    if (fracMatch) {
      const n = Number(fracMatch[1].replace(/\./g, ""));
      if (Number.isFinite(n) && n >= 500) priceArs = n;
    }

    const slug = path.split("/vinos-ficha/")[1] ?? null;

    out.push({
      storeSlug: STORE.slug,
      externalUrl: new URL(path, STORE.baseUrl).href,
      externalSku: slug ? `ESPV-${slug}` : null,
      name,
      brand: null, // el card no expone bodega de forma estructurada
      imageUrl,
      priceArs,
      currency: "ARS",
      inStock: priceArs != null, // sin precio extraíble = no comprable
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
  let filtered = 0;
  const base = STORE.baseUrl.replace(/\/+$/, "");

  console.log(`== ${STORE.name} ==`);
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      page === 1 ? `${base}${STORE.catalogPath}` : `${base}${STORE.catalogPath}?p=${page}`;
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

    const items = parseProductsFromHtml(await res.text());
    if (items.length === 0) {
      console.log("empty (end)");
      break;
    }
    let added = 0;
    for (const p of items) {
      if (!looksLikeWine(p.name)) {
        filtered++;
        continue;
      }
      if (!products.has(p.externalUrl)) {
        products.set(p.externalUrl, p);
        added++;
      }
    }
    console.log(`${items.length} items (${added} new, ${products.size} total)`);
    if (added === 0) break; // fin de resultados únicos
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  const result = {
    storeSlug: STORE.slug,
    storeName: STORE.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched,
    filtered,
    productCount: products.size,
    products: [...products.values()],
    errors,
  };

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-espaciovino.mjs",
    platform: "custom",
    storeCount: 1,
    productCount: result.productCount,
    stores: [(({ products, ...meta }) => meta)(result)],
    products: result.products,
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-espaciovino.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot));
  console.log(
    `\nDone: ${result.productCount} products, ${filtered} filtered, ${result.errors.length} errors in ${Date.now() - t0}ms`,
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
