#!/usr/bin/env node
/**
 * Merge data/snapshot-tiendanube.json + data/snapshot-woocommerce.json
 * into the canonical data/snapshot.json that the web app reads.
 *
 * Input files can be missing — we just skip them with a warning. This
 * makes it safe to regenerate only one platform at a time.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const INPUTS = [
  { path: "data/snapshot-tiendanube.json", platform: "tiendanube" },
  { path: "data/snapshot-woocommerce.json", platform: "woocommerce" },
  { path: "data/snapshot-vtex.json", platform: "vtex" },
  { path: "data/snapshot-shopify.json", platform: "shopify" },
  { path: "data/snapshot-mercadolibre.json", platform: "mercadolibre" },
];

function loadIfExists(path) {
  const abs = resolve(REPO_ROOT, path);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    console.warn(`  skip ${path}: ${err.message}`);
    return null;
  }
}

function main() {
  const parts = [];
  for (const { path, platform } of INPUTS) {
    const data = loadIfExists(path);
    if (!data) {
      console.log(`  missing: ${path}`);
      continue;
    }
    parts.push({ path, platform, data });
    console.log(
      `  loaded ${path}: ${data.storeCount} stores, ${data.productCount} products`,
    );
  }

  if (parts.length === 0) {
    console.error("No input snapshots found. Run scrape-*.mjs first.");
    process.exit(1);
  }

  const stores = parts.flatMap((p) => p.data.stores ?? []);
  const products = parts.flatMap((p) => p.data.products ?? []);

  // Dedup products by externalUrl (should already be unique per store)
  const byUrl = new Map();
  for (const p of products) {
    if (!byUrl.has(p.externalUrl)) byUrl.set(p.externalUrl, p);
  }
  const merged = [...byUrl.values()];

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "merge-snapshots.mjs",
    sources: parts.map((p) => ({
      platform: p.platform,
      path: p.path,
      generatedAt: p.data.generatedAt,
    })),
    storeCount: stores.length,
    productCount: merged.length,
    stores,
    products: merged,
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot.json");
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(
    `\nWrote ${outPath} — ${snapshot.storeCount} stores, ${snapshot.productCount} products`,
  );
}

main();
