#!/usr/bin/env node
/**
 * Stage 3: LLM adjudicator for ambiguous Stage 2 pairs.
 *
 * Stage 2 uses cosine similarity threshold >= 0.93 (conservative) for
 * embedding-based merges. That misses pairs like "Zuccardi Concreto
 * Malbec" vs "Vino Concreto Malbec 750ml" (sim ~0.90) that are clearly
 * the same wine but differ enough in tokens to fall below the threshold.
 *
 * Stage 3 reads the gray-zone candidate pairs that Stage 2 already
 * collected during its O(n²) scan (dumped to data/stage3-candidates.json)
 * and asks GPT-4o-mini a binary question: is this the same wine SKU?
 *
 * No re-scanning, no embeddings loading — just LLM calls over the pairs
 * that Stage 2 handed us. Keeps Stage 3 under a few minutes even on the
 * first run.
 *
 * Cost: ~$0.30-0.50 first run for ~30-40k pairs. Subsequent runs ~$0.02
 * thanks to data/stage3-cache.json.
 *
 * Requirements:
 *   - OPENAI_API_KEY in .env.local or CI secrets
 *   - Runs AFTER stage2-embeddings.mjs (reads the candidates file it
 *     wrote)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
const BATCH_SIZE = 20;
const CONCURRENCY = 4;
const CHECKPOINT_EVERY = 50; // batches → checkpoint cache every ~1k answers
const CANDIDATES_PATH = resolve(REPO_ROOT, "data/stage3-candidates.json");
const LLM_CACHE_PATH = resolve(REPO_ROOT, "data/stage3-cache.json");

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

function buildPrompt(pairs) {
  return pairs
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

async function main() {
  if (!existsSync(CANDIDATES_PATH)) {
    console.error(
      "Missing data/stage3-candidates.json — Stage 2 did not emit gray-zone pairs (older stage2 format?).",
    );
    process.exit(1);
  }
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, "utf8"));
  console.log(`Stage 3 on ${candidates.length} gray-zone pairs from Stage 2`);

  const snapPath = resolve(REPO_ROOT, "data/snapshot.json");
  const snap = JSON.parse(readFileSync(snapPath, "utf8"));
  const groups = snap.productGroups ?? [];
  if (groups.length === 0) {
    console.error("No productGroups — run build-groups.mjs + stage2 first.");
    process.exit(1);
  }
  // Slug → index, for applying merges
  const slugIndex = new Map();
  for (let i = 0; i < groups.length; i++) slugIndex.set(groups[i].groupSlug, i);

  // Load LLM cache
  const llmCache = existsSync(LLM_CACHE_PATH)
    ? JSON.parse(readFileSync(LLM_CACHE_PATH, "utf8"))
    : {};

  // Separate cached vs fresh
  const cachedYes = [];
  const cachedNo = [];
  const toAsk = [];
  for (const pair of candidates) {
    pair._cacheKey = cacheKey(pair.a, pair.b);
    const cached = llmCache[pair._cacheKey];
    if (cached === "yes") cachedYes.push(pair);
    else if (cached === "no") cachedNo.push(pair);
    else toAsk.push(pair);
  }
  console.log(
    `Cache: ${cachedYes.length + cachedNo.length}/${candidates.length} known (${cachedYes.length} yes, ${cachedNo.length} no) · ${toAsk.length} to ask`,
  );

  const mergedPairs = [...cachedYes];

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
          const answers = await askLLMBatch(batch);
          for (let k = 0; k < batch.length; k++) {
            const pair = batch[k];
            const ans = answers[k];
            llmCache[pair._cacheKey] = ans;
            if (ans === "yes") mergedPairs.push(pair);
          }
          done += batch.length;
          process.stdout.write(`\r  ${done}/${toAsk.length}`);
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
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
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

  // Apply Union-Find merges using slugs as identity
  const uf = makeUF(groups.length);
  let unresolvable = 0;
  for (const pair of mergedPairs) {
    const i = slugIndex.get(pair.a.groupSlug);
    const j = slugIndex.get(pair.b.groupSlug);
    if (i === undefined || j === undefined) {
      unresolvable++;
      continue;
    }
    uf.union(i, j);
  }
  if (unresolvable > 0) {
    console.log(
      `  ${unresolvable} merge pairs skipped (group slug missing, probably already merged in Stage 2)`,
    );
  }

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

  // Merge into new groups (same shape as Stage 2 cluster merging)
  const newGroups = [];
  for (const indices of clusters.values()) {
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
