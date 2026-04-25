#!/usr/bin/env node
/**
 * Stage 5: split "chimera" product groups — groups where Stage 2/3
 * over-merged unrelated wines that happen to share a brand + varietal.
 *
 * Example caught in QA: "malbec-zuccardi" had 57 offers across what are
 * actually 3 different Zuccardi wines (Q, Concreto, Amphora Project).
 * Stage 3 LLM accepted the merges because the names are similar
 * ("Zuccardi X Malbec"), but Q and Concreto are distinct product lines
 * at distinct price points.
 *
 * Detection: for each group with ≥ 8 offers, find tokens that appear in
 * ≥ 25% AND ≤ 75% of offers (candidate "line" identifiers). If two or
 * more such tokens are mutually exclusive across offers, the group is a
 * chimera — split each token cluster into its own group.
 *
 * Conservative on purpose — only splits very-clear cases. Risks: false
 * splits of legitimate wines that happen to have varying name suffixes
 * (estuche / promo / etc.). Mitigated by stopword filtering.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");

// Tokens that should NOT be considered as line identifiers (too generic
// or descriptive — appearing in some offers and not others doesn't mean
// it's a different wine).
const SPLIT_STOPWORDS = new Set([
  "vino",
  "vinos",
  "tinto",
  "blanco",
  "rosado",
  "rose",
  "espumante",
  "champagne",
  "brut",
  "dulce",
  "seco",
  "reserva",
  "gran",
  "clasico",
  "clásico",
  "premium",
  "estuche",
  "promo",
  "regalo",
  "caja",
  "magnum",
  "doble",
  "edicion",
  "edición",
  "limitada",
  "750",
  "750ml",
  "ml",
  "cc",
  "750cc",
  "1500",
  "1500ml",
  "x",
  "x1",
  "x2",
  "x3",
  "x4",
  "x6",
  "x750",
  "x6u",
  "x12",
  "u",
  "un",
  "uds",
  "unidad",
  "unidades",
  "l",
  "lt",
  "75ml",
  "375",
  "1l",
  "5l",
  "1500cc",
  // Country/origin words sometimes appearing
  "argentino",
  "argentina",
  "italiano",
  "italia",
  // Color words for blends — both red/white versions exist as separate
  // groups intentionally; let's not split if only color differs
  "red",
  "white",
  "ano",
  "año",
  "cosecha",
  "vintage",
  "botella",
  "bot",
  "bote",
  "750c",
  // Varietals + types — discriminator should be at brand/line level
  "malbec",
  "cabernet",
  "sauvignon",
  "chardonnay",
  "bonarda",
  "syrah",
  "shiraz",
  "pinot",
  "noir",
  "grigio",
  "merlot",
  "torrontes",
  "torrontés",
  "tempranillo",
  "franc",
  "petit",
  "verdot",
  "viognier",
  "semillon",
  "semillón",
  "tannat",
  "riesling",
  "moscatel",
  "criolla",
  "blanc",
  "blancs",
  // Year tokens already filtered by /^\d+$/ but keep some words
  "fino",
  "fina",
  "tintas",
  "blancas",
  "rojo",
  "rojas",
  "rojos",
  // Spanish stopwords
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "con",
  "sin",
  "en",
  "por",
]);

function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(name) {
  return stripAccents(String(name ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        // Keep single-char tokens that aren't stopwords (e.g. "Q" line of
        // Zuccardi). Drop pure digits + stopwords.
        t.length >= 1 &&
        !/^\d+$/.test(t) &&
        !SPLIT_STOPWORDS.has(t),
    );
}

function recomputeStats(g) {
  const offers = g.offers ?? [];
  const inStock = offers.filter((o) => o.inStock);
  const prices = inStock
    .map((o) => o.priceArs)
    .filter((p) => typeof p === "number" && p > 0);
  g.minPrice = prices.length ? Math.min(...prices) : null;
  g.maxPrice = prices.length ? Math.max(...prices) : null;
  g.storeCount = new Set(inStock.map((o) => o.storeSlug)).size;
  g.offerCount = offers.length;
  g.inStockOfferCount = inStock.length;
  g.totalStoreCount = new Set(offers.map((o) => o.storeSlug)).size;
}

/** Returns true if the group is a chimera and was split. */
function trySplit(group, sink) {
  const offers = group.offers ?? [];
  if (offers.length < 8) return false;

  // Tokenize each offer's name
  const offerSets = offers.map((o) => ({
    offer: o,
    tokens: new Set(tokenize(o.name)),
  }));

  // Count tokens across offers
  const counts = new Map();
  for (const { tokens } of offerSets) {
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  // Splitter candidates: present in 10% — 75% of offers (lower bound
  // catches smaller distinct lines like "Amphora Project" with only 4
  // of 57 offers; upper bound avoids treating dominant tokens as
  // splitters).
  const N = offerSets.length;
  const min = Math.max(3, Math.ceil(N * 0.1));
  const max = Math.floor(N * 0.75);
  const splitters = [...counts.entries()]
    .filter(([, c]) => c >= min && c <= max)
    .map(([t]) => t)
    .sort();

  if (splitters.length < 2) return false;

  // Check mutual exclusivity: each offer should belong to AT MOST ONE
  // splitter (if it has multiple, it's ambiguous and we keep it intact).
  const ambiguous = offerSets.some(
    ({ tokens }) => splitters.filter((s) => tokens.has(s)).length > 1,
  );
  if (ambiguous) return false;

  // Cluster offers by splitter token (or "__none" if no splitter present).
  const clusters = new Map();
  for (const { offer, tokens } of offerSets) {
    const key = splitters.find((s) => tokens.has(s)) ?? "__none";
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(offer);
  }

  // Need at least 2 clusters with ≥3 offers each to call it a chimera.
  const meaningful = [...clusters.values()].filter((c) => c.length >= 3);
  if (meaningful.length < 2) return false;

  console.log(
    `\nSplitting chimera ${group.groupSlug} (${N} offers) by tokens [${splitters.join(", ")}]:`,
  );
  for (const [key, sub] of clusters) {
    console.log(
      `  → ${key === "__none" ? "(no splitter)" : `[${key}]`}: ${sub.length} offers`,
    );
  }

  // Build sub-groups. The biggest cluster keeps the original slug for
  // SEO continuity; others get a suffix.
  const sortedClusters = [...clusters.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  for (let i = 0; i < sortedClusters.length; i++) {
    const [key, subOffers] = sortedClusters[i];
    if (subOffers.length === 0) continue;
    const sub = { ...group };
    sub.offers = subOffers;
    if (i === 0) {
      sub.groupSlug = group.groupSlug;
    } else {
      const suffix =
        key === "__none"
          ? "var"
          : key.replace(/[^a-z0-9]/g, "").slice(0, 10);
      sub.groupSlug = `${group.groupSlug}__${suffix}`;
    }
    // Pick the most common offer name in this cluster as canonicalName.
    // The original group's name was likely from the dominant cluster
    // before split — so the smaller clusters need a more representative
    // name picked from their own offers.
    const nameCounts = new Map();
    for (const o of subOffers) {
      const n = (o.name ?? "").trim();
      if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
    }
    const topName = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topName) sub.canonicalName = topName[0];
    recomputeStats(sub);
    sink.push(sub);
  }
  return true;
}

function main() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const groups = snapshot.productGroups ?? [];
  console.log(`Loaded ${groups.length} groups from snapshot.`);

  const newGroups = [];
  let splitCount = 0;
  let added = 0;
  for (const g of groups) {
    const before = newGroups.length;
    const split = trySplit(g, newGroups);
    if (split) {
      splitCount++;
      added += newGroups.length - before - 1;
    } else {
      newGroups.push(g);
    }
  }

  snapshot.productGroups = newGroups;
  snapshot.groupCount = newGroups.length;
  snapshot.multiStoreGroupCount = newGroups.filter(
    (g) => (g.storeCount ?? 0) >= 2,
  ).length;

  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot));

  console.log(
    `\n=== Splitter report ===\nSplit ${splitCount} chimera groups, added ${added} new groups.`,
  );
  console.log(
    `Total: ${groups.length} → ${newGroups.length} (+${newGroups.length - groups.length})`,
  );
  console.log(`Multi-store: ${snapshot.multiStoreGroupCount}`);
}

main();
