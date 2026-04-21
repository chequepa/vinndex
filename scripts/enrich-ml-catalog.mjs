#!/usr/bin/env node
/**
 * Enriches data/snapshot-mercadolibre.json by calling ML's
 * /products/{catalog_id} endpoint for each product whose externalSku
 * looks like MLA\d+. Populates brand, description (varietal + year +
 * volume), and — when available — EAN (via CATALOG_PRODUCT_ID attr).
 *
 * Auth: refresh_token from .env.local (user token) — same flow as
 * scrape-mercadolibre.mjs. Run after scrape-mercadolibre.mjs and before
 * merge-snapshots.mjs.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

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

const CONCURRENCY = 6;
const REQUEST_DELAY_MS = 60;

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
    console.error(`refresh failed: HTTP ${res.status}`);
    return null;
  }
  const body = await res.json();
  return body.access_token;
}

function attrValue(attrs, id) {
  const a = attrs?.find((x) => x.id === id);
  if (!a) return null;
  const v = a.value_name ?? a.values?.[0]?.name;
  return typeof v === "string" ? v.trim() : null;
}

async function fetchCatalogProduct(token, catalogId) {
  const res = await fetch(
    `https://api.mercadolibre.com/products/${catalogId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return { data: await res.json() };
}

function enrich(product, catalog) {
  const attrs = catalog.attributes ?? [];
  const brand = attrValue(attrs, "BRAND") || attrValue(attrs, "CELLAR");
  const varietal = attrValue(attrs, "VARIETAL");
  const year = attrValue(attrs, "YEAR") || attrValue(attrs, "VINTAGE");
  const volume = attrValue(attrs, "UNIT_VOLUME") || attrValue(attrs, "VOLUME_CAPACITY");
  const wineType = attrValue(attrs, "WINE_TYPE");
  const line = attrValue(attrs, "LINE");
  const ean = attrValue(attrs, "GTIN") || attrValue(attrs, "EAN");

  const descParts = [];
  if (varietal) descParts.push(varietal);
  if (year) descParts.push(year);
  if (volume) descParts.push(volume);
  if (wineType && !varietal) descParts.push(wineType);

  return {
    ...product,
    name: catalog.name?.trim() || product.name,
    brand: brand || product.brand,
    externalSku: ean || product.externalSku,
    description:
      descParts.length > 0 ? descParts.join(" · ") : product.description,
    catalogLine: line || null,
  };
}

async function worker(queue, token, stats) {
  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    const { idx, product } = job;
    try {
      const r = await fetchCatalogProduct(token, product.externalSku);
      if (r.notFound) {
        stats.notFound++;
      } else if (r.error) {
        stats.errors++;
        stats.errorDetails.push(`${product.externalSku}: ${r.error}`);
      } else {
        const before = { brand: !!product.brand, sku: product.externalSku };
        const after = enrich(product, r.data);
        if (!before.brand && after.brand) stats.gainedBrand++;
        if (!/^\d{12,14}$/.test(before.sku ?? "") && /^\d{12,14}$/.test(after.externalSku ?? "")) {
          stats.gainedEan++;
        }
        stats.enriched++;
        job.result = after;
      }
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push(`${product.externalSku}: ${err.message}`);
    }
    if (stats.processed % 100 === 0) {
      process.stdout.write(
        `  ${stats.processed}/${stats.total} · enriched=${stats.enriched} · brand+${stats.gainedBrand} · ean+${stats.gainedEan} · 404=${stats.notFound} · err=${stats.errors}\n`,
      );
    }
    stats.processed++;
    if (REQUEST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }
}

async function main() {
  const t0 = Date.now();
  const snapPath = resolve(REPO_ROOT, "data/snapshot-mercadolibre.json");
  if (!existsSync(snapPath)) {
    console.error(`Missing ${snapPath}. Run scrape-mercadolibre.mjs first.`);
    process.exit(1);
  }

  const token = await refreshAccessToken();
  if (!token) {
    console.error(
      "No ML access token. Skipping enrichment (need ML_APP_ID + ML_CLIENT_SECRET + ML_REFRESH_TOKEN).",
    );
    process.exit(0);
  }
  console.log("Got ML access token.\n");

  const snap = JSON.parse(readFileSync(snapPath, "utf8"));
  const catalogIdx = [];
  for (let i = 0; i < snap.products.length; i++) {
    const p = snap.products[i];
    if (typeof p.externalSku === "string" && /^MLA\d+$/.test(p.externalSku)) {
      catalogIdx.push({ idx: i, product: p });
    }
  }
  console.log(
    `Found ${catalogIdx.length} catalog-product IDs out of ${snap.products.length} total\n`,
  );

  const stats = {
    total: catalogIdx.length,
    processed: 0,
    enriched: 0,
    gainedBrand: 0,
    gainedEan: 0,
    notFound: 0,
    errors: 0,
    errorDetails: [],
  };

  const queue = catalogIdx.slice();
  const workers = Array.from({ length: CONCURRENCY }, () =>
    worker(queue, token, stats),
  );
  await Promise.all(workers);

  for (const job of catalogIdx) {
    if (job.result) snap.products[job.idx] = job.result;
  }

  snap.enrichedAt = new Date().toISOString();
  snap.enrichment = {
    total: stats.total,
    enriched: stats.enriched,
    gainedBrand: stats.gainedBrand,
    gainedEan: stats.gainedEan,
    notFound: stats.notFound,
    errors: stats.errors,
  };

  writeFileSync(snapPath, JSON.stringify(snap));
  console.log(
    `\nDone in ${Date.now() - t0}ms: enriched=${stats.enriched}, brand+${stats.gainedBrand}, ean+${stats.gainedEan}, 404=${stats.notFound}, errors=${stats.errors}`,
  );
  if (stats.errorDetails.length && stats.errorDetails.length <= 10) {
    console.log("Errors:");
    for (const e of stats.errorDetails) console.log(`  ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
