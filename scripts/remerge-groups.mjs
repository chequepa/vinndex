#!/usr/bin/env node
/**
 * Post-process: find near-duplicate groups in the shipped snapshot and
 * merge them. Safe to run against the stripped snapshot that doesn't
 * carry the raw products[] array.
 *
 * Two groups are considered the same wine when:
 *   1. canonicalName (stripped of accents + casing) matches
 *   2. vintage + format match
 *   3. Their brands are either equal, or both resolve to the same value
 *      via NAME_PREFIX_TO_BRAND (the label-on-bottle rule)
 *
 * If all three hold, offers get concatenated (dedup by store+url), stats
 * are recomputed from in-stock offers, and the smaller groups are
 * dropped. The primary (highest storeCount) keeps its slug so SEO URLs
 * don't break.
 *
 * Kept out of build-groups.mjs because build-groups needs raw products
 * that CI strips from the shipped snapshot — this script works against
 * what we actually ship.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");

// Keep in sync with scripts/build-groups.mjs NAME_PREFIX_TO_BRAND.
// When you add an entry there, add it here too (or the post-process
// won't merge existing shipped groups that still have the old brands).
const NAME_PREFIX_TO_BRAND = {
  // Noemia's second labels — "A Lisa" / "J. Alberto" are the labels on
  // the bottle, but producer Noemia is sometimes listed as the brand.
  "a lisa": "A Lisa",
  "a. lisa": "A Lisa",
  "j alberto": "J. Alberto",
  "j. alberto": "J. Alberto",
  // DV Catena — sometimes "Catena", sometimes "DV Catena"
  "dv catena": "DV Catena",
  // Enemigo line — El Enemigo is Alejandro Vigil's project; scrapers
  // sometimes attribute to Aleanna (Vigil's company) or Catena Zapata
  // (where Vigil is head enologist).
  "el enemigo": "El Enemigo",
  "gran enemigo": "Gran Enemigo",
  // Alamos is a Catena Zapata line, often listed with brand=Catena
  "alamos": "Alamos",
  // Padrillos is Ernesto Catena's line (Catena Zapata's brother),
  // sometimes listed with brand=Ernesto Catena
  "padrillos": "Padrillos",
  // Saint Felicien — Catena Zapata's casual line
  "saint felicien": "Saint Felicien",
  // Luca is Laura Catena's project — distinct from Catena Zapata
  "luca": "Luca",
  // Cheval des Andes — Terrazas + Cheval Blanc JV
  "cheval des andes": "Cheval Des Andes",
  "cheval-des-andes": "Cheval Des Andes",
  // Nicolas Catena Zapata — top Catena cuvée, often conflated
  "nicolas catena": "Nicolas Catena Zapata",
  // Bodegas Bianchi's top line
  "particular": "Bianchi Particular",
};

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(s) {
  return stripAccents(String(s ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function resolveBrandFromName(rawName, originalBrand) {
  if (!rawName) return originalBrand ?? null;
  const lower = stripAccents(String(rawName))
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const prefix of Object.keys(NAME_PREFIX_TO_BRAND)) {
    if (lower === prefix || lower.startsWith(prefix + " ")) {
      return NAME_PREFIX_TO_BRAND[prefix];
    }
  }
  return originalBrand ?? null;
}

function brandsAreCompatible(brands) {
  // Null always OK. Otherwise, all non-null must be equal (case-insensitive)
  // OR one is a substring of the other (e.g., "Catena" ⊂ "Catena Zapata").
  const nonNull = brands.filter(Boolean);
  if (nonNull.length <= 1) return true;
  const normalized = nonNull.map((b) =>
    stripAccents(b).toLowerCase().trim(),
  );
  // Equal check
  if (new Set(normalized).size === 1) return true;
  // Substring check — one brand wraps all others
  for (let i = 0; i < normalized.length; i++) {
    let wrapsAll = true;
    for (let j = 0; j < normalized.length; j++) {
      if (i === j) continue;
      if (!normalized[i].includes(normalized[j])) {
        wrapsAll = false;
        break;
      }
    }
    if (wrapsAll) return true;
  }
  return false;
}

function recomputeStats(primary) {
  const offers = primary.offers ?? [];
  const inStock = offers.filter((o) => o.inStock);
  const prices = inStock
    .map((o) => o.priceArs)
    .filter((p) => typeof p === "number" && p > 0);
  primary.minPrice = prices.length ? Math.min(...prices) : null;
  primary.maxPrice = prices.length ? Math.max(...prices) : null;
  primary.storeCount = new Set(inStock.map((o) => o.storeSlug)).size;
  primary.offerCount = offers.length;
  primary.inStockOfferCount = inStock.length;
  primary.totalStoreCount = new Set(offers.map((o) => o.storeSlug)).size;
}

function mergeBucket(bucket) {
  // Sort by storeCount desc; primary keeps its slug.
  bucket.sort((a, b) => (b.storeCount ?? 0) - (a.storeCount ?? 0));
  const primary = bucket[0];
  const others = bucket.slice(1);

  // Offers: concat all, dedup by (storeSlug, externalUrl) keeping the
  // lowest price when there's a collision.
  const offerMap = new Map();
  for (const g of bucket) {
    for (const o of g.offers ?? []) {
      const k = `${o.storeSlug}|${o.externalUrl ?? ""}|${o.name ?? ""}`;
      const existing = offerMap.get(k);
      if (
        !existing ||
        (o.priceArs != null &&
          existing.priceArs != null &&
          o.priceArs < existing.priceArs)
      ) {
        offerMap.set(k, o);
      }
    }
  }
  primary.offers = [...offerMap.values()];

  // Inherit the best brand: prefer a NAME_PREFIX_TO_BRAND resolution
  // over whatever the scraper captured.
  const resolvedBrand = resolveBrandFromName(primary.canonicalName, null);
  if (resolvedBrand) {
    primary.brand = resolvedBrand;
  } else if (!primary.brand) {
    primary.brand = bucket.find((g) => g.brand)?.brand ?? null;
  }

  // Inherit image/varietals/region/type from whoever has them if we don't.
  for (const key of ["imageUrl", "varietals", "region", "type"]) {
    if (!primary[key] || (Array.isArray(primary[key]) && primary[key].length === 0)) {
      const donor = bucket.find((g) => g[key] && (!Array.isArray(g[key]) || g[key].length));
      if (donor) primary[key] = donor[key];
    }
  }

  recomputeStats(primary);
  return { primary, droppedSlugs: others.map((g) => g.groupSlug) };
}

function main() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const groups = snapshot.productGroups ?? [];
  console.log(`Loaded ${groups.length} groups from snapshot.`);

  // Bucket by (normalizedName, vintage, format)
  const buckets = new Map();
  for (const g of groups) {
    const key = `${normalizeName(g.canonicalName)}|${g.vintage ?? ""}|${g.format ?? ""}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }

  const dropSet = new Set();
  let mergedBuckets = 0;
  let rejectedBuckets = 0;
  const examples = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    // Brand compat: after NAME_PREFIX_TO_BRAND normalization, the brands
    // should either agree or be null. Reject anything with conflicting
    // non-null brands — could be genuinely different wines that share a
    // generic name like "Malbec Reserva".
    const resolvedBrands = bucket.map((g) =>
      resolveBrandFromName(g.canonicalName, g.brand),
    );
    const rawBrands = bucket.map((g) => g.brand);
    if (
      !brandsAreCompatible(resolvedBrands) &&
      !brandsAreCompatible(rawBrands)
    ) {
      rejectedBuckets++;
      if (examples.length < 3) {
        examples.push({
          reason: "brand-conflict",
          names: bucket.map((g) => `${g.brand ?? "∅"}: ${g.canonicalName}`),
        });
      }
      continue;
    }

    const { primary, droppedSlugs } = mergeBucket(bucket);
    for (const s of droppedSlugs) dropSet.add(s);
    mergedBuckets++;
    if (mergedBuckets <= 5) {
      examples.push({
        reason: "merged",
        kept: primary.groupSlug,
        dropped: droppedSlugs,
        brand: primary.brand,
        name: primary.canonicalName,
      });
    }
  }

  snapshot.productGroups = groups.filter((g) => !dropSet.has(g.groupSlug));
  snapshot.groupCount = snapshot.productGroups.length;
  snapshot.multiStoreGroupCount = snapshot.productGroups.filter(
    (g) => (g.storeCount ?? 0) >= 2,
  ).length;

  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot));

  console.log(`\n=== Remerge report ===`);
  console.log(
    `Merged ${mergedBuckets} buckets, dropped ${dropSet.size} duplicate groups.`,
  );
  console.log(`Rejected ${rejectedBuckets} buckets (brand conflict).`);
  console.log(
    `Groups: ${groups.length} → ${snapshot.groupCount} (−${groups.length - snapshot.groupCount})`,
  );
  console.log(`Multi-store: ${snapshot.multiStoreGroupCount}`);

  console.log(`\nExamples:`);
  for (const e of examples) {
    console.log(JSON.stringify(e, null, 2));
  }
}

main();
