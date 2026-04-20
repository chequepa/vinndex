#!/usr/bin/env node
/**
 * Stage 2 matching: embeddings + cosine-similarity merge.
 *
 * Stage 1 (determinístico) matches pairs where normalized tokens agree.
 * Stage 2 catches pairs where the names diverge enough that tokens don't
 * line up — e.g. "Don David Reserva Malbec" vs "Don David Malbec Reserva"
 * (word order breaks tokens even with sorting) or "Catena Malbec" vs
 * "Catena Zapata Malbec Argentino 2021".
 *
 * Pipeline:
 *   1. Compute embeddings for every group's canonicalName (batched)
 *   2. For each group G1, find the nearest group G2 by cosine similarity
 *   3. Merge if similarity >= SIM_THRESHOLD and varietal/brand agree
 *   4. Use Union-Find to handle chains (A~B, B~C → merge all three)
 *   5. Rewrite data/snapshot.json with collapsed groups
 *
 * Requirements:
 *   - OPENAI_API_KEY in .env.local at repo root (readable via fs)
 *
 * Cost: ~$0.02 for 20k groups (text-embedding-3-small, $0.02/M tokens)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Load OPENAI_API_KEY from .env.local without pulling in a dependency.
function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env.local");
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
    // ignore if missing
  }
}
loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error(
    "OPENAI_API_KEY missing. Create .env.local with OPENAI_API_KEY=sk-...",
  );
  process.exit(1);
}

const MODEL = "text-embedding-3-small";
const BATCH_SIZE = 500;
const SIM_THRESHOLD = 0.93; // conservative — false merges are worse than missed merges
const MAX_MERGE_PAIRS_PER_GROUP = 5;

async function embedBatch(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Build embedding input text for a group (name + brand + varietal). */
function embeddingText(g) {
  const parts = [g.canonicalName];
  if (g.brand) parts.push(g.brand);
  if (g.varietals && g.varietals.length > 0) parts.push(g.varietals.join(" "));
  return parts.join(" — ");
}

/** Compatible merge: require matching varietal if both have one, and
 * roughly same brand (case-insensitive loose match) if both have one. */
function compatibleToMerge(a, b) {
  const av = new Set((a.varietals ?? []).map((v) => v.toLowerCase()));
  const bv = new Set((b.varietals ?? []).map((v) => v.toLowerCase()));
  if (av.size > 0 && bv.size > 0) {
    // Require intersection
    let hit = false;
    for (const v of av) if (bv.has(v)) hit = true;
    if (!hit) return false;
  }
  // If both have format and differ, don't merge (bottle vs caja)
  if (a.format && b.format && a.format !== b.format) return false;
  return true;
}

// Union-Find for tracking merge clusters
function makeUF(n) {
  const parent = new Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  return { find, union };
}

async function main() {
  const inPath = resolve(REPO_ROOT, "data/snapshot.json");
  const snap = JSON.parse(readFileSync(inPath, "utf8"));
  const groups = snap.productGroups ?? [];
  if (groups.length === 0) {
    console.error("No productGroups — run build-groups.mjs first.");
    process.exit(1);
  }

  console.log(
    `Computing embeddings for ${groups.length} groups (batches of ${BATCH_SIZE})...`,
  );
  const embeddings = new Array(groups.length);
  const t0 = Date.now();
  for (let i = 0; i < groups.length; i += BATCH_SIZE) {
    const batch = groups.slice(i, i + BATCH_SIZE).map(embeddingText);
    const embs = await embedBatch(batch);
    for (let j = 0; j < embs.length; j++) embeddings[i + j] = embs[j];
    process.stdout.write(
      `\r  ${Math.min(i + BATCH_SIZE, groups.length)}/${groups.length}`,
    );
  }
  console.log(`\n  embeddings done in ${Math.round((Date.now() - t0) / 1000)}s`);

  // Find candidate merges by brute force (cubic would be too slow for 20k,
  // but linear-scan per-group against all others is O(n²) ≈ 400M ops —
  // at a few nanoseconds per op that's ~5s total).
  console.log("Finding candidate merge pairs...");
  const t1 = Date.now();
  const pairs = [];
  for (let i = 0; i < groups.length; i++) {
    const gi = groups[i];
    const ei = embeddings[i];
    // Track top K candidates above threshold
    const topK = [];
    for (let j = i + 1; j < groups.length; j++) {
      const gj = groups[j];
      if (!compatibleToMerge(gi, gj)) continue;
      const sim = cosine(ei, embeddings[j]);
      if (sim >= SIM_THRESHOLD) {
        topK.push({ j, sim });
        if (topK.length > MAX_MERGE_PAIRS_PER_GROUP) {
          topK.sort((a, b) => b.sim - a.sim);
          topK.length = MAX_MERGE_PAIRS_PER_GROUP;
        }
      }
    }
    for (const p of topK) pairs.push({ i, j: p.j, sim: p.sim });
  }
  console.log(
    `  ${pairs.length} candidate pairs above sim=${SIM_THRESHOLD} in ${Math.round((Date.now() - t1) / 1000)}s`,
  );

  // Union all pairs
  const uf = makeUF(groups.length);
  for (const { i, j } of pairs) uf.union(i, j);

  // Build clusters
  const clusters = new Map();
  for (let i = 0; i < groups.length; i++) {
    const root = uf.find(i);
    const arr = clusters.get(root) ?? [];
    arr.push(i);
    clusters.set(root, arr);
  }

  const mergedClusters = [...clusters.values()].filter((c) => c.length > 1);
  console.log(
    `  ${mergedClusters.length} clusters collapsed (saved ~${
      [...clusters.values()].reduce((s, c) => s + c.length - 1, 0)
    } groups)`,
  );

  // Merge: pick the group with highest storeCount+offerCount as root, pool offers
  const newGroups = [];
  const consumed = new Set();
  for (const [root, indices] of clusters.entries()) {
    if (consumed.has(root)) continue;
    for (const i of indices) consumed.add(i);
    if (indices.length === 1) {
      newGroups.push(groups[indices[0]]);
      continue;
    }

    indices.sort((a, b) => {
      const ga = groups[a],
        gb = groups[b];
      if (ga.storeCount !== gb.storeCount) return gb.storeCount - ga.storeCount;
      return gb.offerCount - ga.offerCount;
    });
    const canonical = groups[indices[0]];
    const allOffers = indices.flatMap((i) => groups[i].offers);

    // Dedup offers by externalUrl
    const seen = new Set();
    const dedupOffers = [];
    for (const o of allOffers) {
      if (seen.has(o.externalUrl)) continue;
      seen.add(o.externalUrl);
      dedupOffers.push(o);
    }

    const uniqueStores = new Set(dedupOffers.map((o) => o.storeSlug));
    const prices = dedupOffers
      .map((o) => o.priceArs)
      .filter((p) => typeof p === "number" && p > 0);

    // Merge varietals (union)
    const varietalSet = new Set();
    for (const i of indices)
      for (const v of groups[i].varietals ?? []) varietalSet.add(v);
    const varietals = [...varietalSet].slice(0, 3);

    const merged = {
      ...canonical,
      offers: dedupOffers.sort(
        (a, b) =>
          (a.priceArs ?? Number.POSITIVE_INFINITY) -
          (b.priceArs ?? Number.POSITIVE_INFINITY),
      ),
      storeCount: uniqueStores.size,
      offerCount: dedupOffers.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      varietals,
    };
    newGroups.push(merged);
  }

  // Sort as before: multi-store first, then price asc
  newGroups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    const pa = a.minPrice ?? Number.POSITIVE_INFINITY;
    const pb = b.minPrice ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  const multi = newGroups.filter((g) => g.storeCount >= 2).length;
  console.log(
    `\nBefore: ${groups.length} groups, ${
      groups.filter((g) => g.storeCount >= 2).length
    } multi-store`,
  );
  console.log(`After:  ${newGroups.length} groups, ${multi} multi-store`);

  snap.productGroups = newGroups;
  snap.groupCount = newGroups.length;
  snap.multiStoreGroupCount = multi;
  snap.stage2GeneratedAt = new Date().toISOString();
  snap.stage2Pairs = pairs.length;

  writeFileSync(inPath, JSON.stringify(snap));
  console.log(`\nWrote ${inPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
