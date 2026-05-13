#!/usr/bin/env node
/**
 * Diagnostic: hunt for suspected duplicate product groups that slipped
 * past Stage 0-4. NO writes — just a readable report grouped by the
 * heuristic that flagged each cluster.
 *
 * Heuristics:
 *   A. Distinctive-token clusters: groups sharing ≥2 distinctive tokens
 *      (rare tokens that aren't generic wine vocabulary) with different
 *      brands → almost always the same wine mis-attributed.
 *   B. Near-identical names via Jaccard ≥ 0.75 on tokens, same vintage
 *      + format, compatible brands.
 *   C. "Noisy name" variants: one name is a strict prefix/subset of
 *      another's tokens + same brand.
 *
 * Run: node scripts/find-duplicates.mjs
 * Or:  node scripts/find-duplicates.mjs | less
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");

// Tokens so common they're useless for matching — wine varieties,
// types, years, volume units, generic descriptors.
const STOPWORDS = new Set([
  "vino",
  "tinto",
  "blanco",
  "rosado",
  "espumante",
  "espumoso",
  "dulce",
  "seco",
  "malbec",
  "cabernet",
  "sauvignon",
  "chardonnay",
  "bonarda",
  "syrah",
  "pinot",
  "noir",
  "merlot",
  "torrontes",
  "torrontés",
  "tempranillo",
  "viognier",
  "riesling",
  "moscatel",
  "criolla",
  "gewurztraminer",
  "franc",
  "petit",
  "verdot",
  "cosecha",
  "reserva",
  "gran",
  "clasico",
  "clásico",
  "doc",
  "do",
  "igp",
  "750",
  "ml",
  "cc",
  "l",
  "750ml",
  "1500",
  "1500ml",
  "750cc",
  "caja",
  "box",
  "pack",
  "estuche",
  "magnum",
  "media",
  "half",
  "botella",
  "bot",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "con",
  "sin",
  "un",
  "una",
  "x",
  "2",
  "3",
  "4",
  "6",
  "bodega",
  "bodegas",
  "familia",
  "x2",
  "x3",
  "x4",
  "x6",
  "c",
  "u",
]);

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokenize(str) {
  return stripAccents(String(str ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function distinctiveTokens(tokens) {
  return tokens.filter(
    (t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t),
  );
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function brandsCompatible(b1, b2) {
  if (!b1 || !b2) return true;
  const n1 = stripAccents(b1).toLowerCase().trim();
  const n2 = stripAccents(b2).toLowerCase().trim();
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  return false;
}

// Si se pasa `--out=path.json`, el script escribe el report como JSON
// estructurado a esa ruta — usado por el daily-scrape para alimentar
// el dashboard /admin/duplicates. Si NO se pasa el flag, el comportamiento
// es el histórico (output legible a stdout para hacer `node ... | less`).
const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith("--out="));
const OUT_PATH = outArg ? outArg.slice("--out=".length) : null;
const JSON_ONLY = !!OUT_PATH;

function maybeLog(...m) {
  if (!JSON_ONLY) console.log(...m);
}

function main() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const groups = snapshot.productGroups ?? [];
  maybeLog(`Analyzing ${groups.length} groups...\n`);

  // Enrich each group with tokens + distinctive set
  const enriched = groups.map((g) => {
    const tokens = tokenize(g.canonicalName);
    const distinctive = distinctiveTokens(tokens);
    return { g, tokens, distinctive };
  });

  // Filter to groups with ≥2 distinctive tokens (otherwise too noisy)
  const good = enriched.filter((e) => e.distinctive.length >= 2);
  maybeLog(
    `${good.length} groups have ≥2 distinctive tokens (of ${groups.length}).\n`,
  );

  // ===== Heuristic A: Distinctive-token overlap =====
  // Index by distinctive-token pairs. Groups that share ≥2 distinctive
  // tokens are candidate duplicates.
  const byPair = new Map();
  for (const e of good) {
    const d = e.distinctive;
    for (let i = 0; i < d.length; i++) {
      for (let j = i + 1; j < d.length; j++) {
        const key = [d[i], d[j]].sort().join("|");
        if (!byPair.has(key)) byPair.set(key, []);
        byPair.get(key).push(e);
      }
    }
  }

  const clustersByPair = [];
  const seenPair = new Set();
  for (const [key, members] of byPair) {
    if (members.length < 2) continue;
    // Dedupe by group slug to avoid same cluster from different pairs
    const clusterKey = members
      .map((m) => m.g.groupSlug)
      .sort()
      .join(",");
    if (seenPair.has(clusterKey)) continue;
    seenPair.add(clusterKey);

    // Same vintage + format
    const vintages = new Set(members.map((m) => m.g.vintage ?? "∅"));
    const formats = new Set(members.map((m) => m.g.format ?? "∅"));
    if (vintages.size > 1 || formats.size > 1) continue;

    // At least one pair of incompatible brands — otherwise my
    // remerger would've already caught it.
    const brands = members.map((m) => m.g.brand);
    let hasIncompat = false;
    for (let i = 0; i < brands.length; i++) {
      for (let j = i + 1; j < brands.length; j++) {
        if (!brandsCompatible(brands[i], brands[j])) {
          hasIncompat = true;
          break;
        }
      }
      if (hasIncompat) break;
    }
    if (!hasIncompat) continue;

    // Drop clusters > 6 members (usually a very generic token pair
    // that's matching many legit-distinct wines)
    if (members.length > 6) continue;

    clustersByPair.push({ key, members });
  }

  maybeLog(`\n===== HEURISTIC A: Distinctive-token overlap =====`);
  maybeLog(
    `${clustersByPair.length} candidate clusters with ≥2 shared distinctive tokens and brand conflict.\n`,
  );

  // Sort clusters by total storeCount desc (most impactful first)
  clustersByPair.sort((a, b) => {
    const sA = a.members.reduce((sum, m) => sum + (m.g.storeCount ?? 0), 0);
    const sB = b.members.reduce((sum, m) => sum + (m.g.storeCount ?? 0), 0);
    return sB - sA;
  });

  for (const c of clustersByPair.slice(0, 60)) {
    const total = c.members.reduce(
      (sum, m) => sum + (m.g.storeCount ?? 0),
      0,
    );
    maybeLog(`  [${c.key}] — total stores if merged: ${total}`);
    for (const m of c.members) {
      const brand = m.g.brand ?? "∅";
      maybeLog(
        `    sc=${m.g.storeCount ?? 0}  ${brand.padEnd(22)}  ${m.g.canonicalName}`,
      );
    }
    maybeLog("");
  }

  // ===== Heuristic B: Jaccard ≥ 0.75 on distinctive tokens =====
  // More expensive — O(n²) within the same first-distinctive-token bucket
  const byFirst = new Map();
  for (const e of good) {
    const t = e.distinctive[0];
    if (!byFirst.has(t)) byFirst.set(t, []);
    byFirst.get(t).push(e);
  }

  const jaccardCandidates = [];
  for (const bucket of byFirst.values()) {
    if (bucket.length < 2 || bucket.length > 60) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if ((a.g.vintage ?? "") !== (b.g.vintage ?? "")) continue;
        if ((a.g.format ?? "") !== (b.g.format ?? "")) continue;
        const sim = jaccard(a.distinctive, b.distinctive);
        if (sim < 0.75) continue;
        if (a.distinctive.length < 2 || b.distinctive.length < 2) continue;
        jaccardCandidates.push({ a, b, sim });
      }
    }
  }

  maybeLog(`\n===== HEURISTIC B: Jaccard ≥ 0.75 on distinctive tokens =====`);
  maybeLog(`${jaccardCandidates.length} candidate pairs.\n`);

  jaccardCandidates.sort((x, y) => {
    const sa = (x.a.g.storeCount ?? 0) + (x.b.g.storeCount ?? 0);
    const sb = (y.a.g.storeCount ?? 0) + (y.b.g.storeCount ?? 0);
    return sb - sa;
  });

  for (const { a, b, sim } of jaccardCandidates.slice(0, 40)) {
    maybeLog(
      `  jaccard=${sim.toFixed(2)}  total_sc=${(a.g.storeCount ?? 0) + (b.g.storeCount ?? 0)}`,
    );
    maybeLog(
      `    sc=${a.g.storeCount ?? 0}  ${(a.g.brand ?? "∅").padEnd(22)}  ${a.g.canonicalName}`,
    );
    maybeLog(
      `    sc=${b.g.storeCount ?? 0}  ${(b.g.brand ?? "∅").padEnd(22)}  ${b.g.canonicalName}`,
    );
    maybeLog("");
  }

  // ===== JSON output mode ====
  // Cuando se pasa --out=path.json escribimos un payload estructurado
  // para que /admin/duplicates lo consuma sin re-correr el detector.
  if (OUT_PATH) {
    const payload = {
      generatedAt: new Date().toISOString(),
      snapshotGeneratedAt: snapshot.generatedAt ?? null,
      groupCount: groups.length,
      groupsWithDistinctiveTokens: good.length,
      heuristicA: {
        description:
          "Clusters de grupos que comparten ≥2 tokens distintivos con brand conflict.",
        total: clustersByPair.length,
        items: clustersByPair.slice(0, 80).map((c) => ({
          key: c.key,
          totalStoresIfMerged: c.members.reduce(
            (sum, m) => sum + (m.g.storeCount ?? 0),
            0,
          ),
          members: c.members.map((m) => ({
            slug: m.g.groupSlug,
            brand: m.g.brand ?? null,
            canonicalName: m.g.canonicalName,
            storeCount: m.g.storeCount ?? 0,
          })),
        })),
      },
      heuristicB: {
        description:
          "Pares de grupos con Jaccard ≥ 0.75 sobre tokens distintivos.",
        total: jaccardCandidates.length,
        items: jaccardCandidates.slice(0, 80).map(({ a, b, sim }) => ({
          jaccard: Number(sim.toFixed(3)),
          totalStoresIfMerged: (a.g.storeCount ?? 0) + (b.g.storeCount ?? 0),
          a: {
            slug: a.g.groupSlug,
            brand: a.g.brand ?? null,
            canonicalName: a.g.canonicalName,
            storeCount: a.g.storeCount ?? 0,
          },
          b: {
            slug: b.g.groupSlug,
            brand: b.g.brand ?? null,
            canonicalName: b.g.canonicalName,
            storeCount: b.g.storeCount ?? 0,
          },
        })),
      },
    };
    fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
    console.log(
      `wrote ${OUT_PATH} — heuristicA: ${payload.heuristicA.total} clusters, heuristicB: ${payload.heuristicB.total} pairs`,
    );
  }
}

main();
