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

import { readFileSync, writeFileSync, existsSync, createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
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
const CACHE_PATH = resolve(REPO_ROOT, "data/embeddings-cache.json");
const EMBED_CONCURRENCY = 4;

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

// Words that signal a distinct sub-SKU in Spanish wine catalogs. If two
// groups differ in any of these aspects we refuse to merge.
const COLOR_KEYWORDS = ["tinto", "blanco", "rosado", "rose", "rojo", "red", "white"];
const SWEETNESS_KEYWORDS = ["extra brut", "demi sec", "demi-sec", "dulce", "nature", "seco", "dry", "sweet", "brut nature"];
const NUMBERED_EDITION = /\b(\d{1,3})\s*(bot|un|unid|edicion|n\.?)?\b/i;

function hasWord(haystack, word) {
  return new RegExp(`\\b${word.replace(/[-\s]/g, "[-\\s]?")}\\b`, "i").test(haystack);
}

/** Compatible merge: require matching varietal + type + color + sweetness
 * when signals are present. Varietal agreement alone isn't enough because
 * supermarkets often share naming conventions (e.g. "Pico de Oro Tinto" vs
 * "Pico de Oro Rosado" differ only in color word). */
function compatibleToMerge(a, b) {
  const av = new Set((a.varietals ?? []).map((v) => v.toLowerCase()));
  const bv = new Set((b.varietals ?? []).map((v) => v.toLowerCase()));
  if (av.size > 0 && bv.size > 0) {
    let hit = false;
    for (const v of av) if (bv.has(v)) hit = true;
    if (!hit) return false;
  }

  // Type mismatch (Tinto vs Blanco vs Espumante vs Rosado vs Dulce) — block
  if (a.type && b.type && a.type !== b.type) return false;

  // Format mismatch (caja vs bottle vs magnum) — block
  if (a.format && b.format && a.format !== b.format) return false;

  // Explicit color / sweetness disagreement even when type is missing
  const aname = a.canonicalName.toLowerCase();
  const bname = b.canonicalName.toLowerCase();

  for (const color of COLOR_KEYWORDS) {
    const aHas = hasWord(aname, color);
    const bHas = hasWord(bname, color);
    if (aHas !== bHas) {
      // Check if either explicitly has a DIFFERENT color keyword
      const otherColors = COLOR_KEYWORDS.filter((c) => c !== color);
      const aOther = otherColors.some((c) => hasWord(aname, c));
      const bOther = otherColors.some((c) => hasWord(bname, c));
      if ((aHas && bOther) || (bHas && aOther)) return false;
    }
  }

  for (const sw of SWEETNESS_KEYWORDS) {
    const aHas = hasWord(aname, sw);
    const bHas = hasWord(bname, sw);
    if (aHas !== bHas) {
      // If one has explicit sweetness and the other has a DIFFERENT sweetness, block
      const others = SWEETNESS_KEYWORDS.filter((s) => s !== sw);
      const aOther = others.some((s) => hasWord(aname, s));
      const bOther = others.some((s) => hasWord(bname, s));
      if ((aHas && bOther) || (bHas && aOther)) return false;
    }
  }

  // Numbered editions: "Expo 13" vs "Expo 24" should not merge
  const aNum = aname.match(NUMBERED_EDITION);
  const bNum = bname.match(NUMBERED_EDITION);
  if (aNum && bNum && aNum[1] !== bNum[1]) {
    // Ignore if the number is a common year or 750
    const skipNums = new Set(["750", "375", "187", "1500"]);
    if (!skipNums.has(aNum[1]) && !skipNums.has(bNum[1])) return false;
  }

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

// NDJSON (newline-delimited JSON) — one entry per line. Avoids the
// 512MB string limit of JSON.stringify on ~300MB caches (25k embeddings
// × 1536 floats). Streaming read keeps memory bounded too.
async function loadCacheNdjson(path) {
  const cache = {};
  if (!existsSync(path)) return cache;
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    try {
      const { k, e } = JSON.parse(line);
      if (k && Array.isArray(e)) cache[k] = e;
    } catch {
      /* skip malformed lines */
    }
  }
  return cache;
}

async function saveCacheNdjson(path, cache) {
  const ws = createWriteStream(path);
  for (const [key, emb] of Object.entries(cache)) {
    const line = JSON.stringify({ k: key, e: emb }) + "\n";
    if (!ws.write(line)) {
      await new Promise((resolve) => ws.once("drain", resolve));
    }
  }
  await new Promise((resolve, reject) => {
    ws.end((err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  const inPath = resolve(REPO_ROOT, "data/snapshot.json");
  const snap = JSON.parse(readFileSync(inPath, "utf8"));
  const groups = snap.productGroups ?? [];
  if (groups.length === 0) {
    console.error("No productGroups — run build-groups.mjs first.");
    process.exit(1);
  }

  // Load cache (key = embeddingText). Most canonicalNames are stable
  // day-to-day — only new groups need a fresh embedding. Cache cuts the
  // OpenAI calls from ~20k/run to typically <200/run after the first.
  const cache = await loadCacheNdjson(CACHE_PATH);
  const cacheHits = { hit: 0, miss: 0 };

  const embeddings = new Array(groups.length);
  const missIdx = [];
  const missText = [];
  for (let i = 0; i < groups.length; i++) {
    const text = embeddingText(groups[i]);
    const cached = cache[text];
    if (cached) {
      embeddings[i] = cached;
      cacheHits.hit++;
    } else {
      missIdx.push(i);
      missText.push(text);
      cacheHits.miss++;
    }
  }
  console.log(
    `Cache: ${cacheHits.hit}/${groups.length} hits, ${cacheHits.miss} misses`,
  );

  if (missText.length > 0) {
    console.log(
      `Embedding ${missText.length} new groups (batches of ${BATCH_SIZE}, concurrency ${EMBED_CONCURRENCY})...`,
    );
    const t0 = Date.now();
    const batches = [];
    for (let i = 0; i < missText.length; i += BATCH_SIZE) {
      batches.push({ start: i, texts: missText.slice(i, i + BATCH_SIZE) });
    }
    let done = 0;
    async function worker() {
      while (batches.length > 0) {
        const job = batches.shift();
        if (!job) break;
        const embs = await embedBatch(job.texts);
        for (let j = 0; j < embs.length; j++) {
          const origIdx = missIdx[job.start + j];
          const text = missText[job.start + j];
          embeddings[origIdx] = embs[j];
          cache[text] = embs[j];
        }
        done += embs.length;
        process.stdout.write(`\r  ${done}/${missText.length}`);
      }
    }
    await Promise.all(
      Array.from({ length: EMBED_CONCURRENCY }, () => worker()),
    );
    console.log(
      `\n  OpenAI calls done in ${Math.round((Date.now() - t0) / 1000)}s`,
    );
    await saveCacheNdjson(CACHE_PATH, cache);
    console.log(`  cache saved (${Object.keys(cache).length} entries)`);
  } else {
    console.log("  100% cache hit — no OpenAI calls needed");
  }

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
