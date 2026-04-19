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

const VARIETALS = [
  { name: "Malbec", re: /\bmalbec\b/i },
  { name: "Cabernet Sauvignon", re: /\bcabernet\s+sauvignon\b/i },
  { name: "Cabernet Franc", re: /\bcabernet\s+franc\b/i },
  { name: "Cabernet", re: /\bcabernet\b/i },
  { name: "Chardonnay", re: /\bchardonnay\b/i },
  { name: "Sauvignon Blanc", re: /\bsauvignon\s+blanc\b/i },
  { name: "Merlot", re: /\bmerlot\b/i },
  { name: "Bonarda", re: /\bbonarda\b/i },
  { name: "Pinot Noir", re: /\bpinot\s+noir\b/i },
  { name: "Pinot Grigio", re: /\bpinot\s+grigio\b/i },
  { name: "Torrontés", re: /\btorront[eé]s\b/i },
  { name: "Syrah", re: /\b(syrah|shiraz)\b/i },
  { name: "Tempranillo", re: /\btempranillo\b/i },
  { name: "Petit Verdot", re: /\bpetit\s+verdot\b/i },
  { name: "Riesling", re: /\briesling\b/i },
  { name: "Viognier", re: /\bviognier\b/i },
  { name: "Semillón", re: /\bsemill[oó]n\b/i },
  { name: "Tannat", re: /\btannat\b/i },
  { name: "Barbera", re: /\bbarbera\b/i },
  { name: "Sangiovese", re: /\bsangiovese\b/i },
  { name: "Nebbiolo", re: /\bnebbiolo\b/i },
  { name: "Criolla", re: /\bcriolla\b/i },
  { name: "Moscatel", re: /\bmoscatel\b/i },
  { name: "Gewürztraminer", re: /\bgew[uü]rztraminer\b/i },
];

const REGIONS = [
  { name: "Mendoza", re: /\bmendoza\b/i },
  { name: "Valle de Uco", re: /\b(valle\s+de\s+uco|uco\s+valley|tupungato|vista\s+flores|gualtallary|tunuyan|altamira)\b/i },
  { name: "Luján de Cuyo", re: /\b(luj[aá]n\s+de\s+cuyo|agrelo|vistalba|perdriel)\b/i },
  { name: "Maipú", re: /\bmaip[uú]\b/i },
  { name: "San Juan", re: /\bsan\s+juan\b/i },
  { name: "Salta", re: /\b(salta|cafayate|valles\s+calchaqu|molinos|colom[eé])\b/i },
  { name: "Patagonia", re: /\b(patagonia|r[ií]o\s+negro|neuqu[eé]n|chubut)\b/i },
  { name: "La Rioja", re: /\bla\s+rioja\b/i },
  { name: "Catamarca", re: /\bcatamarca\b/i },
];

const TYPES = [
  {
    name: "Espumante",
    re: /\b(espumante|extra\s*brut|nature|champagne|champa\xf1a|brut|champenois|prosecco|cava)\b/i,
  },
  { name: "Rosado", re: /\b(rosado|ros[eé]|ros[eé]\s+de|blush)\b/i },
  { name: "Blanco", re: /\b(blanco|white|chardonnay|sauvignon\s+blanc|torront[eé]s|viognier|riesling|semill[oó]n|pinot\s+grigio)\b/i },
  { name: "Dulce", re: /\b(dulce|cosecha\s+tard[ií]a|late\s+harvest|tard[ií]o|malamado|fortificado|oporto|jerez)\b/i },
  { name: "Tinto", re: /\b(tinto|red|malbec|cabernet|merlot|bonarda|syrah|shiraz|petit\s+verdot|tempranillo|pinot\s+noir)\b/i },
];

function extractVarietals(name) {
  const out = [];
  for (const v of VARIETALS) {
    if (v.re.test(name) && !out.includes(v.name)) {
      // Special-case: don't add "Cabernet" if we already matched Cabernet Sauvignon/Franc
      if (v.name === "Cabernet" && (out.includes("Cabernet Sauvignon") || out.includes("Cabernet Franc"))) {
        continue;
      }
      out.push(v.name);
    }
  }
  return out.slice(0, 3);
}

function extractRegion(name, brand) {
  const haystack = `${name} ${brand ?? ""}`;
  for (const r of REGIONS) {
    if (r.re.test(haystack)) return r.name;
  }
  return null;
}

function extractType(name) {
  // Priority: Espumante > Rosado > Dulce > Blanco > Tinto
  // Some bottles are both "malbec" (tinto) and "espumante" — espumante wins.
  for (const t of TYPES) {
    if (t.re.test(name)) return t.name;
  }
  return null;
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

    // Facets: most-common varietal across the group's items, single region
    const varietalCounts = new Map();
    for (const i of items) {
      for (const v of extractVarietals(i.name)) {
        varietalCounts.set(v, (varietalCounts.get(v) ?? 0) + 1);
      }
    }
    const varietals = [...varietalCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 3);

    let region = null;
    for (const i of items) {
      region = extractRegion(i.name, i.brand ?? brand);
      if (region) break;
    }

    const typeCounts = new Map();
    for (const i of items) {
      const t = extractType(i.name);
      if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const type =
      typeCounts.size > 0
        ? [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null;

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
      varietals,
      region,
      type,
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
