#!/usr/bin/env node
/**
 * Reads data/snapshot.json and augments it with a productGroups array.
 * Uses deterministic matching (canonical name + vintage + format).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractVintage(name) {
  const m = name.match(/\b(19\d{2}|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
}

function extractFormat(name) {
  const lower = name.toLowerCase();
  const parts = [];
  const mPack = lower.match(/\b(caja|pack|box|estuche)\b/);
  const mXN = lower.match(/\bx\s*(\d+)\b/);
  const mMagnum = lower.match(/\bmagnum\b/);
  const mHalf = lower.match(/\b(media|half)\b/);
  const mVolL = lower.match(/\b(\d+(?:[.,]\d+)?)\s*l\b/);
  const mVolMl = lower.match(/\b(\d{3,4})\s*ml\b/);
  if (mPack) parts.push(mPack[1]);
  if (mXN) parts.push(`x${mXN[1]}`);
  if (mMagnum) parts.push("magnum");
  if (mHalf) parts.push("half");
  if (mVolL) parts.push(`${mVolL[1].replace(",", ".")}l`);
  if (mVolMl && mVolMl[1] !== "750") parts.push(`${mVolMl[1]}ml`);
  return parts.length > 0 ? parts.sort().join("-") : null;
}

function canonicalize(name, brand) {
  const vintage = extractVintage(name);
  const format = extractFormat(name);

  let s = stripAccents(name).toLowerCase().trim();
  s = s.replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ");
  s = s.replace(/\d+\s*ml\b/g, " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*l\b/g, " ");
  s = s.replace(/\bx\s*\d+\b/g, " ");
  s = s.replace(
    /\b(caja|pack|box|estuche|magnum|media|half|vino|cosecha|750)\b/g,
    " ",
  );
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  if (brand) {
    const nb = stripAccents(brand)
      .toLowerCase()
      .replace(/^bodega\s+/, "")
      .replace(/^bodegas\s+/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (nb && !s.startsWith(nb)) {
      s = `${nb} ${s}`;
      s = s.replace(/\s+/g, " ").trim();
    }
  }

  return { base: s, vintage, format };
}

function keyToString(k) {
  return `${k.base}|${k.vintage ?? ""}|${k.format ?? ""}`;
}

function groupSlug(k) {
  const base = k.base.replace(/\s+/g, "-").slice(0, 60);
  const vint = k.vintage ? `-${k.vintage}` : "";
  const fmt = k.format ? `-${k.format.replace(/[^a-z0-9]+/g, "-")}` : "";
  return (base + vint + fmt).replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function main() {
  const inPath = resolve(REPO_ROOT, "data/snapshot.json");
  const snap = JSON.parse(readFileSync(inPath, "utf8"));
  const products = snap.products ?? [];

  const byKey = new Map();
  for (const p of products) {
    const k = canonicalize(p.name, p.brand);
    if (!k.base) continue;
    const ks = keyToString(k);
    const existing = byKey.get(ks);
    if (existing) existing.items.push(p);
    else byKey.set(ks, { key: k, items: [p] });
  }

  const usedSlugs = new Map();
  const groups = [];

  for (const { key, items } of byKey.values()) {
    const uniqueStores = new Set(items.map((i) => i.storeSlug));

    let slug = groupSlug(key);
    if (!slug) slug = "wine";
    const baseSlug = slug;
    const count = usedSlugs.get(baseSlug) ?? 0;
    if (count > 0) slug = `${baseSlug}-${count + 1}`;
    usedSlugs.set(baseSlug, count + 1);

    const prices = items
      .map((i) => i.priceArs)
      .filter((p) => typeof p === "number" && p > 0);

    const canonicalName =
      items.slice().sort((a, b) => a.name.length - b.name.length)[0].name;
    const brand =
      items.find((i) => i.brand)?.brand?.replace(/^Bodega(s)?\s+/i, "") ?? null;
    const imageUrl = items.find((i) => i.imageUrl)?.imageUrl ?? null;

    const offers = items
      .map((i) => ({
        storeSlug: i.storeSlug,
        externalUrl: i.externalUrl,
        externalSku: i.externalSku,
        name: i.name,
        priceArs: i.priceArs,
        inStock: i.inStock,
        imageUrl: i.imageUrl,
      }))
      .sort((a, b) => {
        const pa = a.priceArs ?? Number.POSITIVE_INFINITY;
        const pb = b.priceArs ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      });

    groups.push({
      groupSlug: slug,
      canonicalName,
      brand,
      vintage: key.vintage,
      format: key.format,
      imageUrl,
      storeCount: uniqueStores.size,
      offerCount: items.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      offers,
    });
  }

  groups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    const pa = a.minPrice ?? Number.POSITIVE_INFINITY;
    const pb = b.minPrice ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  const multiStore = groups.filter((g) => g.storeCount >= 2).length;
  const totalOffersInMulti = groups
    .filter((g) => g.storeCount >= 2)
    .reduce((sum, g) => sum + g.offerCount, 0);

  console.log(`Groups built:`);
  console.log(`  Total groups: ${groups.length}`);
  console.log(`  Multi-store groups (>=2 tiendas): ${multiStore}`);
  console.log(`  Offers in multi-store groups: ${totalOffersInMulti}`);
  console.log(`  Avg offers per multi-store group: ${
    multiStore > 0 ? (totalOffersInMulti / multiStore).toFixed(2) : 0
  }`);

  const out = {
    ...snap,
    productGroups: groups,
    groupCount: groups.length,
    multiStoreGroupCount: multiStore,
    groupsGeneratedAt: new Date().toISOString(),
  };

  writeFileSync(inPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${inPath}`);
}

main();
