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

/** Decode HTML entities (&amp; &#8220; &#8211; etc) so names display cleanly. */
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
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

/** Common typo and alias map — collapse variants to a canonical form. */
const BRAND_ALIASES = [
  ["zucardi", "zuccardi"],
  ["familia zuccardi", "zuccardi"],
  ["familia zucardi", "zuccardi"],
  ["cheval des andes", "cheval"],
  ["bodega catena zapata", "catena"],
  ["catena zapata", "catena"],
  ["bodega norton", "norton"],
  ["bodegas norton", "norton"],
  ["bodega trapiche", "trapiche"],
  ["bodega salentein", "salentein"],
  ["bodegas salentein", "salentein"],
  ["luigi bosca", "luigibosca"],
  ["el esteco", "elesteco"],
  ["finca las moras", "lasmoras"],
  ["las moras", "lasmoras"],
  ["don david", "dondavid"],
  ["kaiken", "kaiken"],
  ["chandon", "chandon"],
  ["baron b", "baronb"],
];

// Words that don't carry wine identity — strip from the token set.
// KEEP varietals (Malbec/Bonarda/etc), proper nouns, and quality tiers —
// they're part of wine identity and distinguish e.g. Emma Bonarda from
// Emma Malbec.
const NOISE_TOKENS = new Set([
  "vino",
  "cosecha",
  "anada",
  "ano",
  "lata",
  "botella",
  "unidad",
  "unidades",
  "unid",
  "caja",
  "estuche",
  "pack",
  "box",
  "magnum",
  "media",
  "half",
  "750",
  "750cc",
  "cc",
  "ml",
  "tinto",
  "rojo",
  "red",
  "white",
  "x1",
  "x2",
  "x3",
  "x4",
  "x6",
  "x12",
  "de",
  "la",
  "el",
  "los",
  "las",
  "del",
  "y",
  "e",
  "o",
  "u",
  "x",
  "a",
]);

function tokenize(name) {
  const s = stripAccents(name)
    .toLowerCase()
    .replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ")
    .replace(/\d+\s*ml\b/g, " ")
    .replace(/\d+\s*cc\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*l\b/g, " ")
    .replace(/\bx\s*\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s
    .split(" ")
    .filter((t) => t && t.length > 1 && !NOISE_TOKENS.has(t));
}

function normalizeBrandAlias(brand) {
  if (!brand) return null;
  let s = stripAccents(brand)
    .toLowerCase()
    .replace(/^bodega(s)?\s+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [from, to] of BRAND_ALIASES) {
    if (s === from) {
      s = to;
      break;
    }
  }
  return s;
}

function canonicalize(name, brand) {
  const vintage = extractVintage(name);
  const format = extractFormat(name);

  // Token-set from name: order-independent, vintage-independent
  const nameTokens = tokenize(name);

  // Also include alias-normalized brand tokens so "Zucardi Emma" and
  // "Zuccardi Emma" match. Apply alias replacement BEFORE tokenization so
  // multi-word aliases (Familia Zucardi) resolve first.
  const brandSanitized = normalizeBrandAlias(brand);
  if (brandSanitized) {
    for (const t of brandSanitized.split(" ")) {
      if (t && !NOISE_TOKENS.has(t) && !nameTokens.includes(t)) {
        nameTokens.push(t);
      }
    }
  }

  // Apply brand aliases inside the name tokens too
  const joined = nameTokens.join(" ");
  let aliased = joined;
  for (const [from, to] of BRAND_ALIASES) {
    aliased = aliased.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  const finalTokens = aliased.split(" ").filter(Boolean);

  // Sort tokens alphabetically so order of words doesn't matter
  finalTokens.sort();

  return {
    base: finalTokens.join(" "),
    vintage,
    format,
  };
}

function keyToString(k) {
  // Only base is used as the matching key. Vintage and format are kept as
  // metadata per offer — we show vintage on the ficha to let the buyer
  // decide. Pooling across vintages drastically improves group coverage
  // (Emma Bonarda 2010, 2012, 2014 all collapse into one group).
  return k.base;
}

function groupSlug(k) {
  // Slug matches the key — vintage/format are per-offer metadata, not identity.
  return k.base
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function main() {
  const inPath = resolve(REPO_ROOT, "data/snapshot.json");
  const snap = JSON.parse(readFileSync(inPath, "utf8"));
  // Decode HTML entities everywhere before building groups so names are clean
  for (const p of snap.products ?? []) {
    if (p.name) p.name = decodeEntities(p.name);
    if (p.brand) p.brand = decodeEntities(p.brand);
    if (p.description) p.description = decodeEntities(p.description);
  }
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

  // Stage 1b: subset merge. Single-token or short groups whose tokens are a
  // strict subset of a larger multi-item group likely belong to that group
  // (e.g. "Emma Bonarda" without brand token, merged into "Emma Bonarda
  // Zuccardi"). Require the subset to have >=2 distinctive tokens and the
  // target to be unambiguous (only one multi-item group contains those
  // tokens as a subset).
  const keyEntries = [...byKey.entries()];
  const targets = keyEntries.filter(([, v]) => v.items.length >= 2);
  const targetTokens = targets.map(([k]) => ({
    key: k,
    tokens: new Set(k.split(" ").filter(Boolean)),
  }));

  const merged = new Set();
  for (const [k, v] of keyEntries) {
    if (v.items.length >= 2) continue; // only try to merge singletons
    const tokens = k.split(" ").filter(Boolean);
    if (tokens.length < 2) continue;
    // Find all targets where these tokens are a strict subset of target tokens
    const matches = targetTokens.filter(
      (t) =>
        t.key !== k &&
        tokens.every((tok) => t.tokens.has(tok)) &&
        tokens.length < t.tokens.size,
    );
    if (matches.length === 1) {
      // Unambiguous match — merge
      const target = byKey.get(matches[0].key);
      if (target) {
        target.items.push(...v.items);
        merged.add(k);
      }
    }
  }
  for (const k of merged) byKey.delete(k);

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

  // Drop snapshot.products from the published snapshot — it's fully
  // redundant with productGroups[].offers[]. Saves ~18MB.
  const { products: _products, ...rest } = snap;
  const out = {
    ...rest,
    productGroups: groups,
    groupCount: groups.length,
    multiStoreGroupCount: multiStore,
    groupsGeneratedAt: new Date().toISOString(),
  };

  writeFileSync(inPath, JSON.stringify(out));
  console.log(`\nWrote ${inPath}`);
}

main();
