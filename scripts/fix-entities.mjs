#!/usr/bin/env node
/**
 * One-shot: decode HTML entities in the existing snapshot.json.
 *
 * Found 460+ groups where names like "Moet &amp; Chandon" and
 * "Láminas: &#8220;Vino tinto...&#8221;" were stored literally instead
 * of decoded. Fix forward: each scraper now decodes at source. This
 * script cleans the committed snapshot in-place.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}

const inPath = resolve(REPO_ROOT, "data/snapshot.json");
const snap = JSON.parse(readFileSync(inPath, "utf8"));
let decoded = 0;

for (const g of snap.productGroups ?? []) {
  if (g.canonicalName) {
    const before = g.canonicalName;
    g.canonicalName = decode(g.canonicalName);
    if (before !== g.canonicalName) decoded++;
  }
  if (g.brand) g.brand = decode(g.brand);
  for (const o of g.offers ?? []) {
    if (o.name) o.name = decode(o.name);
  }
}

// Also decode intermediate snapshot files if present (affects future merges)
for (const name of [
  "snapshot-tiendanube.json",
  "snapshot-woocommerce.json",
  "snapshot-vtex.json",
  "snapshot-shopify.json",
  "snapshot-mercadolibre.json",
]) {
  const p = resolve(REPO_ROOT, "data", name);
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    let changed = 0;
    for (const pr of data.products ?? []) {
      if (pr.name && pr.name !== decode(pr.name)) {
        pr.name = decode(pr.name);
        changed++;
      }
      if (pr.brand) pr.brand = decode(pr.brand);
      if (pr.description) pr.description = decode(pr.description);
    }
    if (changed > 0) {
      writeFileSync(p, JSON.stringify(data));
      console.log(`  ${name}: decoded ${changed} product names`);
    }
  } catch {
    // file missing, skip
  }
}

writeFileSync(inPath, JSON.stringify(snap));
console.log(`\nMain snapshot: decoded ${decoded} group names. Wrote ${inPath}`);
