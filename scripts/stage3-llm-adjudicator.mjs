#!/usr/bin/env node
/**
 * Stage 3: LLM adjudicator for ambiguous Stage 2 pairs.
 *
 * Stage 2 uses cosine similarity threshold >= 0.93 (conservative) for
 * embedding-based merges. That misses pairs like "Zuccardi Concreto
 * Malbec" vs "Vino Concreto Malbec 750ml" (sim ~0.90) that are clearly
 * the same wine but differ enough in tokens to fall below the threshold.
 *
 * Stage 3 picks pairs in the "gray zone" [0.88, 0.93) that pass the
 * compatibleToMerge() guardrails (varietal/color/format agreement) and
 * asks GPT-4o-mini a binary question: is this the same wine SKU?
 *
 * Cost: ~$0.50 first run for ~30-40k candidate pairs. Subsequent runs
 * ~$0.02 thanks to data/stage3-cache.json which remembers every pair
 * we've already adjudicated.
 *
 * Requirements:
 *   - OPENAI_API_KEY in .env.local or CI secrets
 *   - Runs AFTER stage2-embeddings.mjs (reads its output snapshot +
 *     embeddings cache)
 */

import { readFileSync, writeFileSync, existsSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

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
    /* ignore */
  }
}
loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY missing. Set in .env.local or CI secret.");
  process.exit(1);
}

const MODEL = "gpt-4o-mini";
const SIM_MIN = 0.88;
const SIM_MAX = 0.93;
const MAX_PAIRS_PER_GROUP = 3;
const BATCH_SIZE = 20;
const CONCURRENCY = 4;
const EMBED_CACHE_PATH = resolve(REPO_ROOT, "data/embeddings-cache.json");
const LLM_CACHE_PATH = resolve(REPO_ROOT, "data/stage3-cache.json");

// ===== matching helpers (mirrored from stage2-embeddings.mjs) =====

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

function embeddingText(g) {
  const parts = [g.canonicalName];
  if (g.brand) parts.push(g.brand);
  if (g.varietals && g.varietals.length > 0) parts.push(g.varietals.join(" "));
  return parts.join(" — ");
}

const COLOR_KEYWORDS = ["tinto", "blanco", "rosado", "rose", "rojo", "red", "white"];
const SWEETNESS_KEYWORDS = ["extra brut", "demi sec", "demi-sec", "dulce", "nature", "seco", "dry", "sweet", "brut nature"];
const NUMBERED_EDITION = /\b(\d{1,3})\s*(bot|un|unid|edicion|n\.?)?\b/i;

function hasWord(haystack, word) {
  return new RegExp(`\\b${word.replace(/[-\s]/g, "[-\\s]?")}\\b`, "i").test(haystack);
}

function compatibleToMerge(a, b) {
  const av = new Set((a.varietals ?? []).map((v) => v.toLowerCase()));
  const bv = new Set((b.varietals ?? []).map((v) => v.toLowerCase()));
  if (av.size > 0 && bv.size > 0) {
    let hit = false;
    for (const v of av) if (bv.has(v)) hit = true;
    if (!hit) return false;
  }
  if (a.type && b.type && a.type !== b.type) return false;
  if (a.format && b.format && a.format !== b.format) return false;

  const aname = a.canonicalName.toLowerCase();
  const bname = b.canonicalName.toLowerCase();
  for (const color of COLOR_KEYWORDS) {
    const aHas = hasWord(aname, color);
    const bHas = hasWord(bname, color);
    if (aHas !== bHas) {
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
      const others = SWEETNESS_KEYWORDS.filter((s) => s !== sw);
      const aOther = others.some((s) => hasWord(aname, s));
      const bOther = others.some((s) => hasWord(bname, s));
      if ((aHas && bOther) || (bHas && aOther)) return false;
    }
  }
  const aNum = aname.match(NUMBERED_EDITION);
  const bNum = bname.match(NUMBERED_EDITION);
  if (aNum && bNum && aNum[1] !== bNum[1]) {
    const skipNums = new Set(["750", "375", "187", "1500"]);
    if (!skipNums.has(aNum[1]) && !skipNums.has(bNum[1])) return false;
  }
  return true;
}

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

// ===== LLM call =====

function buildPrompt(pairs) {
  const lines = pairs
    .map((p, i) => {
      const aCtx = [p.a.canonicalName];
      if (p.a.brand) aCtx.push(`bodega: ${p.a.brand}`);
      if (p.a.vintage) aCtx.push(`cosecha: ${p.a.vintage}`);
      const bCtx = [p.b.canonicalName];
      if (p.b.brand) bCtx.push(`bodega: ${p.b.brand}`);
      if (p.b.vintage) bCtx.push(`cosecha: ${p.b.vintage}`);
      return `${i + 1}. A: "${aCtx.join(" · ")}" | B: "${bCtx.join(" · ")}"`;
    })
    .join("\n");
  return lines;
}

const SYSTEM_PROMPT =
  "Sos un matcher de productos de vino argentinos. Para cada par A/B, decidís si refieren AL MISMO VINO DE LA MISMA BODEGA (misma etiqueta, mismo varietal, misma cosecha si está presente, mismo formato si está presente). Ignorá diferencias en formato de texto ('Vino X' vs 'X', 'Malbec 750ml' vs 'Malbec'). Si uno dice 'Reserva' y el otro no, NO son el mismo. Si los varietals difieren, NO son el mismo. Si las bodegas son distintas, NO son el mismo. Respondé EXCLUSIVAMENTE con JSON: {\"answers\": [\"yes\" | \"no\", ...]} con una respuesta por par en orden.";

async function askLLMBatch(pairs) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(pairs) },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`LLM returned non-JSON: ${content.slice(0, 200)}`);
  }
  const answers = parsed.answers;
  if (!Array.isArray(answers) || answers.length !== pairs.length) {
    throw new Error(
      `LLM answers shape mismatch: expected ${pairs.length}, got ${JSON.stringify(answers)}`,
    );
  }
  return answers.map((a) => (String(a).toLowerCase().startsWith("y") ? "yes" : "no"));
}

function cacheKey(a, b) {
  const aKey = (a.canonicalName + "|" + (a.brand ?? "") + "|" + (a.vintage ?? ""))
    .toLowerCase()
    .trim();
  const bKey = (b.canonicalName + "|" + (b.brand ?? "") + "|" + (b.vintage ?? ""))
    .toLowerCase()
    .trim();
  return aKey < bKey ? `${aKey}||${bKey}` : `${bKey}||${aKey}`;
}

// ===== main =====

async function main() {
  const snapPath = resolve(REPO_ROOT, "data/snapshot.json");
  const snap = JSON.parse(readFileSync(snapPath, "utf8"));
  const groups = snap.productGroups ?? [];
  if (groups.length === 0) {
    console.error("No productGroups — run build-groups.mjs + stage2 first.");
    process.exit(1);
  }

  if (!existsSync(EMBED_CACHE_PATH)) {
    console.error(
      "Missing data/embeddings-cache.json — Stage 3 requires Stage 2 embeddings.",
    );
    process.exit(1);
  }
  // NDJSON format (one entry per line) — avoids JSON.stringify 512MB
  // string limit on large caches. Same format Stage 2 writes.
  const embCache = {};
  const rl = createInterface({
    input: createReadStream(EMBED_CACHE_PATH),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    try {
      const { k, e } = JSON.parse(line);
      if (k && Array.isArray(e)) embCache[k] = e;
    } catch {
      /* skip */
    }
  }

  console.log(`Stage 3 on ${groups.length} groups, threshold [${SIM_MIN}, ${SIM_MAX})`);

  // Build embeddings array (cache hit only — no new OpenAI calls here)
  const embeddings = new Array(groups.length);
  let missing = 0;
  for (let i = 0; i < groups.length; i++) {
    const e = embCache[embeddingText(groups[i])];
    if (e) embeddings[i] = e;
    else missing++;
  }
  if (missing > 0) {
    console.warn(
      `${missing}/${groups.length} groups missing embeddings — skipped`,
    );
  }

  // Gather gray-zone candidate pairs
  console.log("Finding gray-zone candidate pairs...");
  const t1 = Date.now();
  const candidates = [];
  for (let i = 0; i < groups.length; i++) {
    const ei = embeddings[i];
    if (!ei) continue;
    const topK = [];
    for (let j = i + 1; j < groups.length; j++) {
      const ej = embeddings[j];
      if (!ej) continue;
      if (!compatibleToMerge(groups[i], groups[j])) continue;
      const sim = cosine(ei, ej);
      if (sim >= SIM_MIN && sim < SIM_MAX) {
        topK.push({ j, sim });
        if (topK.length > MAX_PAIRS_PER_GROUP) {
          topK.sort((a, b) => b.sim - a.sim);
          topK.length = MAX_PAIRS_PER_GROUP;
        }
      }
    }
    for (const p of topK) candidates.push({ i, j: p.j, sim: p.sim });
  }
  console.log(
    `  ${candidates.length} candidates in ${Math.round((Date.now() - t1) / 1000)}s`,
  );

  // Load LLM cache
  const llmCache = existsSync(LLM_CACHE_PATH)
    ? JSON.parse(readFileSync(LLM_CACHE_PATH, "utf8"))
    : {};
  const cachedYes = [];
  const cachedNo = [];
  const toAsk = [];
  for (const pair of candidates) {
    const key = cacheKey(groups[pair.i], groups[pair.j]);
    pair._cacheKey = key;
    const cached = llmCache[key];
    if (cached === "yes") cachedYes.push(pair);
    else if (cached === "no") cachedNo.push(pair);
    else toAsk.push(pair);
  }
  console.log(
    `Cache: ${cachedYes.length + cachedNo.length}/${candidates.length} known (${cachedYes.length} yes, ${cachedNo.length} no) · ${toAsk.length} to ask`,
  );

  // Ask LLM in batches with concurrency. Checkpoint the cache every N
  // batches so an interrupted run doesn't waste its progress — the next
  // run resumes from where we left off.
  const mergedPairs = [...cachedYes];
  const CHECKPOINT_EVERY = 50;
  if (toAsk.length > 0) {
    const t2 = Date.now();
    const batches = [];
    for (let b = 0; b < toAsk.length; b += BATCH_SIZE) {
      batches.push(toAsk.slice(b, b + BATCH_SIZE));
    }
    let done = 0;
    let errors = 0;
    let lastCheckpoint = 0;
    async function worker() {
      while (batches.length > 0) {
        const batch = batches.shift();
        if (!batch) break;
        try {
          const answers = await askLLMBatch(
            batch.map((p) => ({ a: groups[p.i], b: groups[p.j] })),
          );
          for (let k = 0; k < batch.length; k++) {
            const pair = batch[k];
            const ans = answers[k];
            llmCache[pair._cacheKey] = ans;
            if (ans === "yes") mergedPairs.push(pair);
          }
          done += batch.length;
          process.stdout.write(`\r  ${done}/${toAsk.length}`);
          // Checkpoint cache periodically
          if (done - lastCheckpoint >= CHECKPOINT_EVERY * BATCH_SIZE) {
            lastCheckpoint = done;
            try {
              writeFileSync(LLM_CACHE_PATH, JSON.stringify(llmCache));
            } catch (err) {
              console.error(`\n  checkpoint write failed: ${err.message}`);
            }
          }
        } catch (err) {
          errors++;
          console.error(`\n  batch error: ${err.message}`);
        }
      }
    }
    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => worker()),
    );
    console.log(
      `\n  LLM calls done in ${Math.round((Date.now() - t2) / 1000)}s (${errors} errors)`,
    );
    writeFileSync(LLM_CACHE_PATH, JSON.stringify(llmCache));
    console.log(`  cache saved (${Object.keys(llmCache).length} entries)`);
  }

  if (mergedPairs.length === 0) {
    console.log("No merges proposed by LLM — snapshot unchanged.");
    return;
  }

  // Apply Union-Find merges (same shape as Stage 2)
  const uf = makeUF(groups.length);
  for (const { i, j } of mergedPairs) uf.union(i, j);
  const clusters = new Map();
  for (let i = 0; i < groups.length; i++) {
    const root = uf.find(i);
    const arr = clusters.get(root) ?? [];
    arr.push(i);
    clusters.set(root, arr);
  }
  const mergedClusters = [...clusters.values()].filter((c) => c.length > 1);
  console.log(
    `Applying ${mergedClusters.length} new clusters (collapsing ${
      [...clusters.values()].reduce((s, c) => s + c.length - 1, 0)
    } groups)`,
  );

  const newGroups = [];
  for (const [root, indices] of clusters.entries()) {
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
    const allOffers = indices.flatMap((i) => groups[i].offers ?? []);
    const seen = new Set();
    const dedupOffers = [];
    for (const o of allOffers) {
      if (seen.has(o.externalUrl)) continue;
      seen.add(o.externalUrl);
      dedupOffers.push(o);
    }
    const inStockOffers = dedupOffers.filter((o) => o.inStock);
    const summaryOffers = inStockOffers.length > 0 ? inStockOffers : dedupOffers;
    const uniqueStores = new Set(summaryOffers.map((o) => o.storeSlug));
    const prices = summaryOffers
      .map((o) => o.priceArs)
      .filter((p) => typeof p === "number" && p > 0);
    const varietalSet = new Set();
    for (const i of indices)
      for (const v of groups[i].varietals ?? []) varietalSet.add(v);
    const varietals = [...varietalSet].slice(0, 3);

    newGroups.push({
      ...canonical,
      offers: dedupOffers.sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
        return (
          (a.priceArs ?? Number.POSITIVE_INFINITY) -
          (b.priceArs ?? Number.POSITIVE_INFINITY)
        );
      }),
      storeCount: uniqueStores.size,
      offerCount: inStockOffers.length,
      totalStoreCount: new Set(dedupOffers.map((o) => o.storeSlug)).size,
      totalOfferCount: dedupOffers.length,
      inStockOfferCount: inStockOffers.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      varietals,
    });
  }

  newGroups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    const pa = a.minPrice ?? Number.POSITIVE_INFINITY;
    const pb = b.minPrice ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  const multi = newGroups.filter((g) => g.storeCount >= 2).length;
  console.log(
    `Before: ${groups.length} groups, ${
      groups.filter((g) => g.storeCount >= 2).length
    } multi-store`,
  );
  console.log(`After:  ${newGroups.length} groups, ${multi} multi-store`);

  snap.productGroups = newGroups;
  snap.groupCount = newGroups.length;
  snap.multiStoreGroupCount = multi;
  snap.stage3GeneratedAt = new Date().toISOString();
  snap.stage3Merges = mergedPairs.length;
  writeFileSync(snapPath, JSON.stringify(snap));
  console.log(`Wrote ${snapPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
