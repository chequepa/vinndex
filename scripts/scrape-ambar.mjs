#!/usr/bin/env node
/**
 * Scrapea Ambar Selecto (ambarselecto.com.ar).
 *
 * Sitio SPA custom con el catálogo entero en una sola fila JSON de
 * Supabase (`ambar_config`, id=1, columna `data.wines`). Un único
 * round-trip a la API REST y listo.
 *
 * Filtro: sólo `topCat` ∈ {vinos, espumantes}. Whisky/cerveza fuera.
 *
 * Output: data/snapshot-ambar.json (mismo shape que el resto de los
 * scrapers para que merge-snapshots.mjs lo consuma sin tocar nada).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const FETCH_TIMEOUT_MS = 20_000;

// Credenciales públicas extraídas del index.html de ambarselecto.com.ar
// (SUPABASE_URL + SUPABASE_KEY = publishable anon key, expuesta al
// navegador por diseño).
const AMBAR_SUPABASE_URL = "https://wucexmkqbgkdjrbjkzss.supabase.co";
const AMBAR_SUPABASE_KEY =
  "sb_publishable_ekR24wfFHNG6jtRaR9S6_A_tyQ0rpxv";

const STORES = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "data/stores.json"), "utf8"),
).filter(
  (s) => s.platform === "custom" && s.customAdapter === "ambar-supabase",
);

async function fetchJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalize(w, store) {
  if (!w?.nombre || typeof w?.id !== "number") return null;
  if (w.topCat !== "vinos" && w.topCat !== "espumantes") return null;

  // Permalink convencional — el sitio no tiene routing pero `?id=N` es
  // estable y el día que agreguen deep-linking las URLs ya existen.
  const externalUrl = `${store.baseUrl.replace(/\/+$/, "")}/?id=${w.id}`;

  let priceArs = null;
  if (typeof w.precio === "number" && w.precio > 0) {
    const pct = typeof w.descPct === "number" ? w.descPct : 0;
    priceArs =
      w.oferta && pct > 0 ? Math.round(w.precio * (1 - pct / 100)) : w.precio;
  }

  return {
    storeSlug: store.slug,
    externalUrl,
    // Ambar no carga GTIN/EAN; usamos su id interno como sku estable.
    // No matchea el regex EAN de Stage 0 (no son 12-14 dígitos), así
    // que para esta tienda el matching se va a apoyar en Stage 1+
    // (nombre + brand + varietal) — esperable porque es una vinoteca
    // boutique chica.
    externalSku: `ambar-${w.id}`,
    name: w.nombre.trim(),
    brand: typeof w.bodega === "string" ? w.bodega.trim() || null : null,
    imageUrl: typeof w.imagen === "string" ? w.imagen.trim() || null : null,
    priceArs,
    currency: "ARS",
    // El sitio no expone stock — todo lo listado es comprable.
    inStock: priceArs != null,
    description:
      typeof w.descripcion === "string" ? w.descripcion.trim() || null : null,
  };
}

async function scrapeStore(store) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors = [];
  const products = [];

  try {
    const url = `${AMBAR_SUPABASE_URL}/rest/v1/ambar_config?id=eq.1&select=data,updated_at`;
    const rows = await fetchJson(url, {
      apikey: AMBAR_SUPABASE_KEY,
      Authorization: `Bearer ${AMBAR_SUPABASE_KEY}`,
      Accept: "application/json",
    });
    const wines = rows?.[0]?.data?.wines ?? [];
    for (const w of wines) {
      const p = normalize(w, store);
      if (p) products.push(p);
    }
  } catch (err) {
    errors.push(`fetch failed: ${err?.message ?? err}`);
  }

  return {
    storeSlug: store.slug,
    storeName: store.name,
    startedAt,
    durationMs: Date.now() - t0,
    pagesFetched: 1,
    productCount: products.length,
    products,
    errors,
  };
}

async function main() {
  if (STORES.length === 0) {
    console.error(
      "No hay stores con platform=custom + customAdapter=ambar-supabase en data/stores.json",
    );
    process.exit(1);
  }
  console.log(`Scraping ${STORES.length} ambar store(s)\n`);
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
      `${String(r.productCount).padStart(4)} productos · ${String(r.durationMs).padStart(5)}ms · ${r.errors.length} errors`,
    );
    if (r.errors.length) console.log(`    ${r.errors.join("; ")}`);
  }

  console.log(
    `\nDone: ${totalProducts} productos en ${STORES.length} tienda(s) en ${Date.now() - t0}ms (${totalErrors} errors)`,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "scrape-ambar.mjs",
    platform: "custom",
    storeCount: STORES.length,
    productCount: totalProducts,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stores: results.map(({ products: _products, ...meta }) => meta),
    products: results.flatMap((r) => r.products),
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot-ambar.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
