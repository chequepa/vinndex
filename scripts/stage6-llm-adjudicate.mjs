#!/usr/bin/env node
/**
 * Stage 6.5 — adjudicador LLM sobre la cola gris de Stage 6.
 *
 * Stage 6 (stage4-token-merge.mjs) une sólo lo que es provablemente el mismo
 * vino (EAN / token-set igual / ancla de paraje). Lo que comparte mucho pero
 * NO se puede cerrar por texto sin riesgo (nombres divergentes, marca mal
 * atribuida) queda en data/stage4-graymerge-candidates.json. Esos pares ya
 * pasaron los gates duros (mismo varietal/color/tipo/volumen/pack/parcela/
 * tier) — lo único en duda es si son el MISMO vino o dos vinos parecidos.
 *
 * Acá gpt-4o-mini decide par por par. Es el cierre del long-tail que el
 * determinístico no puede: el caso del usuario "Tinto de Tilcara" (marca mal
 * puesta "Andillian") y similares. Para los "yes" aplicamos el merge con la
 * MISMA validación de cluster que Stage 6 (hardConflict en todos los pares
 * internos) — un cluster que contenga una incompatibilidad se descarta
 * entero. Prioridad #1 sigue siendo cero quimeras.
 *
 * Reusa el patrón de stage3-llm-adjudicator (batches, cache, concurrency).
 *
 * Requiere OPENAI_API_KEY en .env.local o CI secret. Corre DESPUÉS de
 * stage4-token-merge.mjs. Cost: ~$0.30-0.50 primer run, ~$0.02 con cache.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { identityConflict, isIdentityToken, resolveBrand } from "./stage4-token-merge.mjs";
import { contentTokens, stripAccents } from "./lib-identity.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SNAPSHOT = resolve(ROOT, "data/snapshot.json");
const MERGES = resolve(ROOT, "data/group-merges.json");
const CANDIDATES = resolve(ROOT, "data/stage4-graymerge-candidates.json");
const CACHE = resolve(ROOT, "data/stage6-llm-cache.json");

const MODEL = "gpt-4o-mini";
const BATCH = 20;
const CONCURRENCY = 4;
const CHECKPOINT_EVERY = 50;
const MAX_PAIRS = 12000; // tope de seguridad de pares a juzgar por run

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch { /* ignore */ }
}
loadEnv();
const KEY = process.env.OPENAI_API_KEY;

const SYSTEM = `Sos un experto en vinos argentinos resolviendo si dos fichas de tienda son EL MISMO PRODUCTO (mismo SKU físico, para comparar precio entre vinotecas).

Decí "yes" SOLO si es el mismo vino: misma bodega/productor, misma etiqueta/línea, mismo varietal o corte, mismo paraje/viñedo si lo nombran, misma gama. Las diferencias de FORMATO DE TEXTO no importan: "Vino X" vs "X", mayúsculas, acentos, orden de palabras, que una ponga el año y otra no, o que la MARCA atribuida difiera (las tiendas a veces ponen mal la bodega o ponen el nombre de la línea — juzgá por el nombre del vino, no por el campo marca).

Decí "no" si: distinta gama (Gran/Reserva/Single Vineyard vs base), distinto paraje (Tilcara vs Purmamarca, Gualtallary vs Agrelo), distinto varietal, distinto color (tinto/blanco/rosado), o son vinos distintos de la misma bodega (líneas diferentes).

Ante la duda, "no" (un falso positivo arruina la comparación de precios).

Respondé EXCLUSIVAMENTE JSON: {"answers":["yes"|"no", ...]} en orden.`;

function buildPrompt(pairs) {
  return pairs.map((p, i) => {
    const a = [p.a.name]; if (p.a.brand) a.push(`marca: ${p.a.brand}`);
    const b = [p.b.name]; if (p.b.brand) b.push(`marca: ${p.b.brand}`);
    return `${i + 1}. A: "${a.join(" · ")}" | B: "${b.join(" · ")}"`;
  }).join("\n");
}
async function askLLM(pairs) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: buildPrompt(pairs) }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  const ans = parsed.answers;
  if (!Array.isArray(ans) || ans.length !== pairs.length) throw new Error(`shape mismatch: ${JSON.stringify(ans)}`);
  return ans.map((a) => (String(a).toLowerCase().startsWith("y") ? "yes" : "no"));
}
const cacheKey = (a, b) => {
  const ka = `${a.name}|${a.brand ?? ""}`.toLowerCase().trim();
  const kb = `${b.name}|${b.brand ?? ""}`.toLowerCase().trim();
  return ka < kb ? `${ka}||${kb}` : `${kb}||${ka}`;
};

function recomputeStats(g) {
  const offers = g.offers ?? [];
  const inStock = offers.filter((o) => o.inStock);
  const basis = inStock.length ? inStock : offers;
  const prices = basis.map((o) => o.priceArs).filter((p) => typeof p === "number" && p > 0);
  g.minPrice = prices.length ? Math.min(...prices) : null;
  g.maxPrice = prices.length ? Math.max(...prices) : null;
  g.storeCount = new Set(inStock.map((o) => o.storeSlug)).size;
  g.offerCount = inStock.length;
  g.inStockOfferCount = inStock.length;
  g.totalStoreCount = new Set(offers.map((o) => o.storeSlug)).size;
  g.totalOfferCount = offers.length;
}

async function main() {
  if (!KEY) { console.error("OPENAI_API_KEY ausente — skip Stage 6.5."); process.exit(0); }
  if (!existsSync(CANDIDATES)) { console.error("Sin stage4-graymerge-candidates.json — corré stage4 primero."); process.exit(0); }
  const limit = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : MAX_PAIRS;

  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const groups = snap.productGroups ?? [];
  const merges = existsSync(MERGES) ? JSON.parse(readFileSync(MERGES, "utf8")) : {};
  const slugIdx = new Map(groups.map((g, i) => [g.groupSlug, i]));
  // resolver un slug (posiblemente absorbido por stage4) a su grupo vivo
  const liveSlug = (slug, depth = 0) => {
    if (slugIdx.has(slug)) return slug;
    if (depth > 10) return null;
    return merges[slug] ? liveSlug(merges[slug], depth + 1) : null;
  };

  const cand = JSON.parse(readFileSync(CANDIDATES, "utf8")).items ?? [];
  // dedup por par de slugs vivos, descartar ya-mergeados y no-vivos
  const seen = new Set();
  const pairs = [];
  for (const c of cand) {
    const la = liveSlug(c.a.slug), lb = liveSlug(c.b.slug);
    if (!la || !lb || la === lb) continue;
    const k = la < lb ? `${la}|${lb}` : `${lb}|${la}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pairs.push({ ...c, la, lb });
    if (pairs.length >= limit) break;
  }
  console.log(`Stage 6.5: ${pairs.length} pares gris vivos a juzgar (de ${cand.length} candidatos)`);

  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const yes = [];
  const toAsk = [];
  for (const p of pairs) {
    p._k = cacheKey(p.a, p.b);
    const c = cache[p._k];
    if (c === "yes") yes.push(p);
    else if (c !== "no") toAsk.push(p);
  }
  console.log(`  cache: ${pairs.length - toAsk.length} conocidos · ${toAsk.length} a preguntar`);

  if (toAsk.length) {
    const batches = [];
    for (let i = 0; i < toAsk.length; i += BATCH) batches.push(toAsk.slice(i, i + BATCH));
    let done = 0, errors = 0, sinceCk = 0;
    async function worker() {
      while (batches.length) {
        const batch = batches.shift();
        if (!batch) break;
        try {
          const ans = await askLLM(batch);
          batch.forEach((p, k) => { cache[p._k] = ans[k]; if (ans[k] === "yes") yes.push(p); });
          done += batch.length; sinceCk += batch.length;
          process.stdout.write(`\r  ${done}/${toAsk.length}`);
          if (sinceCk >= CHECKPOINT_EVERY * BATCH) { sinceCk = 0; try { writeFileSync(CACHE, JSON.stringify(cache)); } catch { /* */ } }
        } catch (e) { errors++; console.error(`\n  batch error: ${e.message}`); }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`\n  LLM listo (${errors} errores) · cache ${Object.keys(cache).length} entradas`);
  }
  console.log(`  ${yes.length} pares "mismo vino" según el LLM`);
  if (!yes.length) { console.log("Nada que mergear."); return; }

  // Stage 4 ya colapsó grupos: el canonicalName del grupo vivo no refleja
  // las ofertas absorbidas (un grupo "base" puede tener un ROSÉ adentro).
  // Para validar bien, chequeamos el gate entre TODOS los nombres de oferta
  // de ambos grupos (no sólo los canonicalName) — sino un rosado oculto en
  // un grupo podría mergear con un blanco de otro.
  function offerViews(idx) {
    const g = groups[idx];
    const names = [...new Set([g.canonicalName, ...(g.offers ?? []).map((o) => o.name)].filter(Boolean))].slice(0, 14);
    return names.map((n) => ({ canonicalName: n, type: g.type, varietals: g.varietals, format: g.format }));
  }
  function groupsConflict(m, n) {
    // identityConflict (no packaging): un grupo ya puede mezclar botella+caja
    // del pipeline original, eso no debe bloquear; pero un color/varietal/
    // parcela distinto oculto en una oferta SÍ (ej. ROSÉ vs BLANCO).
    for (const va of offerViews(m)) for (const vb of offerViews(n)) if (identityConflict(va, vb)) return true;
    return false;
  }

  // ── Gate de divergencia de LÍNEA (anti-error del LLM) ──
  // El LLM erra en nombres de línea: dice que "Séptima Emblema" = "Séptima
  // Obra" (líneas distintas). El gate de identidad no los ve (no son
  // varietal/color/parcela). Acá: si los dos grupos tienen un token EXCLUSIVO
  // distintivo (idf alto, no varietal/paraje/tier, no parte de la marca de
  // ninguno) → son líneas distintas → bloqueamos aunque el LLM diga sí.
  // Necesita idf local sobre los nombres vivos.
  const dfL = new Map();
  for (const g of groups) for (const t of new Set(contentTokens(g.canonicalName))) dfL.set(t, (dfL.get(t) ?? 0) + 1);
  const idfL = (t) => Math.log((groups.length + 1) / ((dfL.get(t) ?? 0) + 1));
  const LINE_IDF = 6.5; // token con df<=~40 = nombre de línea probable (emblema/obra)
  const brandToks = (g) => new Set(stripAccents(resolveBrand(g) ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  function lineToken(t, ba, bb) {
    return idfL(t) >= LINE_IDF && !isIdentityToken(t) && !ba.has(t) && !bb.has(t);
  }
  function lineDivergence(m, n) {
    const a = groups[m], b = groups[n];
    const ta = new Set(contentTokens(a.canonicalName)), tb = new Set(contentTokens(b.canonicalName));
    const ba = brandToks(a), bb = brandToks(b);
    let exA = false, exB = false;
    for (const t of ta) if (!tb.has(t) && lineToken(t, ba, bb)) exA = true;
    for (const t of tb) if (!ta.has(t) && lineToken(t, ba, bb)) exB = true;
    return exA && exB; // ambos lados con token de línea distinto → SKUs distintos
  }
  // union-find por índice de grupo vivo, ordenado por score desc
  yes.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const parent = groups.map((_, i) => i);
  const memb = groups.map((_, i) => [i]);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  let applied = 0, blocked = 0;
  for (const p of yes) {
    const i = slugIdx.get(p.la), j = slugIdx.get(p.lb);
    if (i === undefined || j === undefined) continue;
    const ri = find(i), rj = find(j);
    if (ri === rj) continue;
    // validación de cluster: ningún par cruzado puede violar el gate de
    // identidad (por nombre de oferta) ni ser una divergencia de línea.
    let conflict = false;
    for (const m of memb[ri]) { for (const n of memb[rj]) { if (groupsConflict(m, n) || lineDivergence(m, n)) { conflict = true; break; } } if (conflict) break; }
    if (conflict) { blocked++; continue; }
    parent[rj] = ri; memb[ri] = memb[ri].concat(memb[rj]); memb[rj] = [];
    applied++;
  }

  // materializar clusters
  const clusters = new Map();
  for (let i = 0; i < groups.length; i++) { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(i); }
  const newMerges = {};
  const drop = new Set();
  let mergedClusters = 0;
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((a, b) => (groups[b].storeCount ?? 0) - (groups[a].storeCount ?? 0) || (groups[b].totalOfferCount ?? 0) - (groups[a].totalOfferCount ?? 0));
    const primary = groups[idxs[0]];
    const offerMap = new Map();
    for (const k of idxs) for (const o of groups[k].offers ?? []) {
      const ok = `${o.storeSlug}|${o.externalUrl ?? ""}|${o.name ?? ""}`;
      const ex = offerMap.get(ok);
      if (!ex || (o.priceArs != null && ex.priceArs != null && o.priceArs < ex.priceArs)) offerMap.set(ok, o);
    }
    primary.offers = [...offerMap.values()].sort((a, b) => (a.inStock !== b.inStock ? (a.inStock ? -1 : 1) : (a.priceArs ?? Infinity) - (b.priceArs ?? Infinity)));
    const varSet = new Set();
    for (const k of idxs) for (const v of groups[k].varietals ?? []) varSet.add(v);
    if (varSet.size) primary.varietals = [...varSet].slice(0, 3);
    for (const key of ["imageUrl", "region", "type"]) if (!primary[key]) { const d = idxs.map((k) => groups[k]).find((g) => g[key]); if (d) primary[key] = d[key]; }
    recomputeStats(primary);
    for (let m = 1; m < idxs.length; m++) { newMerges[groups[idxs[m]].groupSlug] = primary.groupSlug; drop.add(idxs[m]); }
    mergedClusters++;
  }

  const out = groups.filter((_, i) => !drop.has(i));
  out.sort((a, b) => (b.storeCount ?? 0) - (a.storeCount ?? 0) || (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
  const multi = out.filter((g) => (g.storeCount ?? 0) >= 2).length;

  // acumular group-merges (resolver cadenas, descartar destinos muertos)
  const live = new Set(out.map((g) => g.groupSlug));
  const all = { ...merges, ...newMerges };
  const finalDest = (s, d = 0) => (d > 10 || !all[s] ? s : finalDest(all[s], d + 1));
  const resolved = {};
  for (const from of Object.keys(all)) { const to = finalDest(from); if (to !== from && live.has(to)) resolved[from] = to; }

  snap.productGroups = out;
  snap.groupCount = out.length;
  snap.multiStoreGroupCount = multi;
  snap.stage6LlmGeneratedAt = new Date().toISOString();
  snap.stage6LlmMerges = mergedClusters;
  writeFileSync(SNAPSHOT, JSON.stringify(snap));
  writeFileSync(MERGES, JSON.stringify(resolved, null, 2));

  console.log(`\n=== Stage 6.5 report ===`);
  console.log(`Pares aplicados: ${applied} · bloqueados por gate de cluster: ${blocked}`);
  console.log(`Clusters nuevos: ${mergedClusters} · grupos: ${groups.length} → ${out.length} (−${groups.length - out.length})`);
  console.log(`Multi-tienda: ${multi} · redirects totales: ${Object.keys(resolved).length}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
