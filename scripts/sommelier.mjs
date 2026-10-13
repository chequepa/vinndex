#!/usr/bin/env node
/**
 * sommelier.mjs — recorre el catálogo entero con Claude, bodega por bodega,
 * para decidir qué vino es cada ficha (ver scripts/lib-sommelier.mjs).
 *
 * Usa la Message Batches API (mitad de precio, sin apuro) y los créditos
 * mensuales de API del plan de Claude. No importa cuánto tarde: cada corrida
 * junta lo que terminó, manda lo siguiente y se frena en el tope de gasto
 * del ciclo. Todo el estado vive en data/sommelier/ (committeado), así que
 * cada corrida retoma donde quedó la anterior.
 *
 * Orden de trabajo:
 *   1. familias    — qué nombres de bodega son la misma bodega o etiquetas
 *                    de ella (una sola consulta).
 *   2. atribución  — bodega de las fichas que no tienen (lotes de 300).
 *   3. bodegas     — cada bodega con TODAS sus fichas, dos pasadas
 *                    independientes. Es el trabajo de fondo.
 * Después de la primera vuelta completa queda en modo incremental: una
 * bodega vuelve a la cola cuando junta nombres nuevos que nadie revisó.
 *
 * Uso:
 *   node scripts/sommelier.mjs status
 *   node scripts/sommelier.mjs run [--dry-run] [--max-requests 200]
 *   node scripts/sommelier.mjs probe "Las Perdices"   # una bodega en vivo, sin guardar
 *
 * Variables:
 *   ANTHROPIC_API_KEY        clave de la organización de Console vinculada al plan
 *   SOMMELIER_BUDGET_USD     tope por ciclo de facturación (default 90)
 *   SOMMELIER_CYCLE_DAY      día del mes en que se renuevan los créditos (default 1)
 *   SOMMELIER_MODEL          default claude-opus-5-5
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeBodegaKey } from "./lib-offer-identity.mjs";
import {
  SOMMELIER_MODEL,
  PROMPT_VERSION,
  SYSTEM_BODEGA,
  SYSTEM_ATRIBUCION,
  SYSTEM_FAMILIAS,
  SCHEMA_BODEGA,
  SCHEMA_ATRIBUCION,
  SCHEMA_FAMILIAS,
  nameKey,
  shortHash,
  shuffled,
  buildBodegaPrompt,
  parseBodegaOutput,
  compactPass,
  buildIndex,
  costOf,
  estimateCost,
  SYSTEM_DUPLICADOS,
  SCHEMA_DUPLICADOS,
  SYSTEM_AUDITORIA,
  SCHEMA_AUDITORIA,
  buildDupPrompt,
  parseDupOutput,
  buildAuditPrompt,
  parseAuditOutput,
  checksConsensus,
  SYSTEM_CATALOGO,
  SCHEMA_CATALOGO,
  buildCatalogPrompt,
  parseCatalogOutput,
  catalogConsensus,
  CATALOG_PROMPT_VERSION,
} from "./lib-sommelier.mjs";
import { applyManualOverlay } from "./lib-catalog-manual.mjs";
import { lineTokens } from "./stage4-token-merge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIR = resolve(ROOT, "data/sommelier");
const VERDICTS_PATH = resolve(DIR, "verdicts.json");
const STATE_PATH = resolve(DIR, "state.json");
const INFLIGHT_PATH = resolve(DIR, "inflight.json");
const SNAPSHOT_PATH = resolve(ROOT, "data/snapshot.json");

const args = process.argv.slice(2);
const cmd = args[0] ?? "status";
const flag = (f) => args.includes(f);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BUDGET_USD = Number(process.env.SOMMELIER_BUDGET_USD || 90);
const CYCLE_DAY = Math.min(28, Math.max(1, Number(process.env.SOMMELIER_CYCLE_DAY || 1)));
const MAX_REQUESTS = Number(argVal("--max-requests", process.env.SOMMELIER_MAX_REQUESTS || 200));
// Una bodega con más fichas que esto se parte en tandas (por título). Partir
// es malo (un duplicado puede quedar en tandas distintas), pero la salida
// (una línea por ficha + el razonamiento) tiene que caber holgada en el
// máximo de 128k tokens. Catena Zapata, la más grande, tiene ~550.
const MAX_FICHAS_PER_UNIT = 1000;
// Nombres por ficha que se muestran (los más frecuentes). Una ficha con más
// variantes que esto deja las raras sin revisar en esta vuelta.
const MAX_NAMES_PER_FICHA = 30;
const ATRIB_CHUNK = 300;
// Una bodega vuelve a la cola cuando la cantidad de nombres sin revisar
// supera esto (o el 10 % de sus nombres).
const RECHECK_MIN_NEW = 5;
const MAX_FAILURES = 3;
// SOMMELIER_RETRY_LOW=1: las bodegas que no se aplican por bajo acuerdo
// entre pasadas vuelven a la cola UNA vez, con esfuerzo xhigh. Si siguen
// sin coincidir, quedan como están (no se aplican).
const RETRY_LOW = process.env.SOMMELIER_RETRY_LOW === "1" || process.env.SOMMELIER_RETRY_LOW === "true";
// SOMMELIER_DOBLE=1: arma (una vez) el plan del doble chequeo —duplicados
// entre bodegas y auditoría de fichas— sobre el snapshot publicado. El plan
// queda guardado en verdicts.checks y las corridas siguientes lo continúan
// aunque no lleven la variable.
const DOBLE = process.env.SOMMELIER_DOBLE === "1" || process.env.SOMMELIER_DOBLE === "true";
const DUP_CASES_PER_REQUEST = 25;
const DUP_MAX_CANDS = 6;
const AUDIT_FICHAS_PER_REQUEST = 40;
// SOMMELIER_CATALOGO=1: arma (una vez) la auditoría del catálogo —alias y
// nombres de línea— sobre data/sommelier/catalog-evidence.json, que escribe
// build-groups-v2.mjs. El consenso va a data/sommelier/catalog-fixes.json,
// que el agrupador aplica sólo con `apply: true` (en sombra hasta revisar).
const CATALOGO = process.env.SOMMELIER_CATALOGO === "1" || process.env.SOMMELIER_CATALOGO === "true";
const CATALOG_ENTRIES_PER_REQUEST = 25;
const CATALOG_MAX_HERMANOS = 150;
const EVIDENCE_PATH = resolve(DIR, "catalog-evidence.json");
const FIXES_PATH = resolve(DIR, "catalog-fixes.json");
const CATALOG_PATH = resolve(ROOT, "data/wine-catalog.json");

// ── Estado ──────────────────────────────────────────────────────────────────

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
function loadVerdicts() {
  return readJson(VERDICTS_PATH, {
    _doc: "Veredictos del sommelier (Claude) por nombre de oferta. Lo escribe scripts/sommelier.mjs; lo lee build-groups-v2.mjs. Ver scripts/lib-sommelier.mjs. `disabled` = unidades que no se aplican (edición manual).",
    families: null,
    attribution: {},
    units: {},
    disabled: [],
  });
}
function loadState() {
  return readJson(STATE_PATH, { inflight: null, spend: {}, failures: {}, log: [] });
}
function save(verdicts, state) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(VERDICTS_PATH, JSON.stringify(verdicts) + "\n");
  if (verdicts.catalogo) writeCatalogFixes(verdicts);
  state.log = state.log.slice(-60);
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 1) + "\n");
}
function log(state, msg) {
  const line = `${new Date().toISOString().slice(0, 16)} ${msg}`;
  console.log(line);
  state.log.push(line);
}

/** Clave del ciclo de facturación actual (los créditos vencen al cerrar el ciclo). */
function cycleKey(d = new Date()) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const start = d.getUTCDate() >= CYCLE_DAY ? new Date(Date.UTC(y, m, CYCLE_DAY)) : new Date(Date.UTC(y, m - 1, CYCLE_DAY));
  return start.toISOString().slice(0, 10);
}

// ── Fichas del snapshot ─────────────────────────────────────────────────────

const median = (xs) => {
  const p = xs.filter((x) => typeof x === "number" && x >= 1000).sort((a, b) => a - b);
  if (!p.length) return null;
  return p.length % 2 ? p[(p.length - 1) / 2] : (p[p.length / 2 - 1] + p[p.length / 2]) / 2;
};

function loadFichas(verdicts) {
  const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const fichas = [];
  for (const g of snap.productGroups ?? []) {
    const byKey = new Map();
    for (const o of g.offers ?? []) {
      const key = nameKey(o.name);
      if (!key) continue;
      let n = byKey.get(key);
      if (!n) { n = { key, raw: o.name, count: 0, prices: [], stock: [] }; byKey.set(key, n); }
      n.count++;
      n.prices.push(o.priceArs);
      if (o.inStock) n.stock.push(o.priceArs);
    }
    if (!byKey.size) continue;
    const names = [...byKey.values()]
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, MAX_NAMES_PER_FICHA)
      .map((n) => ({ key: n.key, raw: n.raw, count: n.count, price: median(n.stock.length ? n.stock : n.prices) }));
    const comp = (g.offers ?? []).filter((o) => o.inStock && o.comparable).map((o) => o.priceArs);
    // Bodega: la que Claude atribuyó (por mayoría de los nombres) gana sobre
    // la del pipeline — así una ficha que la tienda cargó con su propia marca
    // viaja a la unidad de su bodega real.
    const votes = new Map();
    for (const n of names) {
      const b = verdicts.attribution[n.key];
      if (b) votes.set(b, (votes.get(b) ?? 0) + n.count);
    }
    const attributed = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    fichas.push({
      slug: g.groupSlug,
      title: g.canonicalName ?? names[0].raw,
      brand: g.brand || null,
      bodega: attributed ?? (g.brand || null),
      storeCount: g.storeCount ?? 0,
      offerCount: g.offers.length,
      price: median(comp.length ? comp : g.offers.map((o) => o.priceArs)),
      names,
    });
  }
  return fichas;
}

// ── Planificación ───────────────────────────────────────────────────────────

function familyOf(verdicts, bodega) {
  const k = normalizeBodegaKey(bodega);
  return verdicts.families?.map?.[k] ?? bodega;
}

function planBodegaUnits(fichas, verdicts) {
  const byFam = new Map();
  for (const f of fichas) {
    if (!f.bodega) continue;
    const fam = familyOf(verdicts, f.bodega);
    const k = normalizeBodegaKey(fam);
    if (!k) continue;
    if (!byFam.has(k)) byFam.set(k, { family: fam, fichas: [] });
    byFam.get(k).fichas.push(f);
  }
  const units = [];
  for (const [k, u] of byFam) {
    if (u.fichas.length < 2) continue;
    u.fichas.sort((a, b) => a.title.localeCompare(b.title));
    const chunks = Math.ceil(u.fichas.length / MAX_FICHAS_PER_UNIT);
    for (let c = 0; c < chunks; c++) {
      const part = u.fichas.slice(c * MAX_FICHAS_PER_UNIT, (c + 1) * MAX_FICHAS_PER_UNIT);
      const unitKey = `b:${k}${chunks > 1 ? `#${c + 1}` : ""}`;
      const names = [...new Set(part.flatMap((f) => f.names.map((n) => n.key)))].sort();
      units.push({
        unitKey,
        family: u.family,
        fichas: part,
        names,
        inputHash: shortHash(names.join("\n")),
        offers: part.reduce((s, f) => s + f.offerCount, 0),
      });
    }
  }
  return units;
}

function bodegaNeedsWork(unit, verdicts, state, lowAgreement) {
  if ((state.failures[unit.unitKey] ?? 0) >= MAX_FAILURES) return false;
  const v = verdicts.units[unit.unitKey];
  if (!v?.passes?.A || !v?.passes?.B) return true;
  if (lowAgreement?.has(unit.unitKey) && !v.retried) return true;
  const covered = new Set(v.names);
  const fresh = unit.names.filter((k) => !covered.has(k)).length;
  return fresh >= Math.max(RECHECK_MIN_NEW, 0.1 * unit.names.length);
}

function bodegaRequests(unit, verdicts, { retry = false } = {}) {
  const reqs = [];
  const idx = unit.fichas.map((_, i) => i);
  // Si una pasada ya llegó para estos mismos nombres y la otra falló, sólo
  // se manda la que falta (la que llegó ya se pagó).
  const pending = verdicts?.units?.[unit.unitKey]?.pending;
  const have = pending?.inputHash === unit.inputHash ? pending.passes : {};
  for (const pass of ["A", "B"]) {
    if (have[pass]) continue;
    // A: alfabético; B: barajado con semilla fija por unidad (independiente
    // y reproducible).
    const order = pass === "A" ? idx : shuffled(idx, parseInt(shortHash(unit.unitKey + pass, 8), 16));
    const { text, labeled } = buildBodegaPrompt(unit, order);
    // max_tokens holgado (sólo se paga lo que se usa; quedarse corto tira
    // la respuesta entera); la estimación para el presupuesto es aparte.
    const small = unit.fichas.length <= 15;
    reqs.push({
      custom_id: `b-${shortHash(unit.unitKey, 16)}-${pass}`,
      meta: { kind: "bodega", unitKey: unit.unitKey, family: unit.family, pass, inputHash: unit.inputHash, names: unit.names, labeled, retry: retry || undefined },
      estUsd: estimateCost(SYSTEM_BODEGA.length + text.length, (small ? 1_500 : 3_000) + unit.fichas.length * 130),
      params: {
        model: SOMMELIER_MODEL,
        max_tokens: Math.min(128_000, 16_000 + unit.fichas.length * 200),
        system: [{ type: "text", text: SYSTEM_BODEGA, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: text }],
        // Bodegas chicas (≤15 fichas): medium alcanza; las grandes, donde
        // están las líneas parecidas, piensan más.
        output_config: { effort: retry ? "xhigh" : small ? "medium" : "high", format: { type: "json_schema", schema: SCHEMA_BODEGA } },
      },
    });
  }
  return reqs;
}

function knownBodegas(fichas) {
  const cnt = new Map();
  for (const f of fichas) {
    if (!f.brand) continue;
    const e = cnt.get(f.brand) ?? { n: 0, ex: [] };
    e.n++;
    if (e.ex.length < 3) e.ex.push(f.title);
    cnt.set(f.brand, e);
  }
  return [...cnt].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
}

function familiesNeeded(fichas, verdicts) {
  const n = knownBodegas(fichas).length;
  if (!verdicts.families) return true;
  return n > (verdicts.families.bodegaCount ?? 0) * 1.1;
}

function familiesRequest(fichas) {
  const list = knownBodegas(fichas);
  const text = list.map(([b, e]) => `${b} (${e.n} fichas): ${e.ex.join("; ")}`).join("\n");
  return {
    custom_id: `f-${shortHash(text, 16)}`,
    meta: { kind: "familias", bodegaCount: list.length },
    estUsd: estimateCost(SYSTEM_FAMILIAS.length + text.length, 30_000),
    params: {
      model: SOMMELIER_MODEL,
      max_tokens: 64_000,
      system: [{ type: "text", text: SYSTEM_FAMILIAS }],
      messages: [{ role: "user", content: `Bodegas del sitio (${list.length}):\n${text}` }],
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA_FAMILIAS } },
    },
  };
}

function attributionRequests(fichas, verdicts) {
  const todo = fichas
    .filter((f) => !f.bodega && f.names.some((n) => !(n.key in verdicts.attribution)))
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!todo.length) return [];
  const bodegaList = knownBodegas(fichas).map(([b]) => b).join("\n");
  const reqs = [];
  for (let i = 0; i < todo.length; i += ATRIB_CHUNK) {
    const part = todo.slice(i, i + ATRIB_CHUNK);
    const labeled = part.map((f) => f.names.map((n) => n.key));
    const text = part
      .map((f, j) => `A${j + 1}: ${f.names.slice(0, 4).map((n) => `"${n.raw.slice(0, 120).replace(/"/g, "'")}"`).join(" / ")}`)
      .join("\n");
    reqs.push({
      custom_id: `a-${shortHash(part.map((f) => f.slug).join("|"), 16)}`,
      meta: { kind: "atribucion", labeled },
      estUsd: estimateCost(SYSTEM_ATRIBUCION.length + bodegaList.length + text.length, 4_000 + part.length * 40),
      params: {
        model: SOMMELIER_MODEL,
        max_tokens: 32_000,
        system: [
          { type: "text", text: SYSTEM_ATRIBUCION },
          { type: "text", text: `Bodegas conocidas del sitio:\n${bodegaList}`, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: `Fichas sin bodega (${part.length}). Usá el id A1, A2... en "f".\n${text}` }],
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA_ATRIBUCION } },
      },
    });
  }
  return reqs;
}

/**
 * Qué mandar ahora. Familias y atribución primero (cambian cómo se arman
 * las unidades); las bodegas, recién cuando eso está hecho.
 */
function plan(fichas, verdicts, state) {
  const prep = [];
  if (familiesNeeded(fichas, verdicts)) prep.push(familiesRequest(fichas));
  prep.push(...attributionRequests(fichas, verdicts));
  const units = planBodegaUnits(fichas, verdicts);
  const lowAgreement = RETRY_LOW ? new Set(buildIndex(verdicts).units.filter((u) => !u.applied).map((u) => u.unitKey)) : null;
  for (const u of units) u.retry = !!(lowAgreement?.has(u.unitKey) && verdicts.units[u.unitKey]?.passes?.B && !verdicts.units[u.unitKey].retried);
  const pending = units
    .filter((u) => bodegaNeedsWork(u, verdicts, state, lowAgreement))
    // Primero lo que no tiene veredicto completo (nunca revisado o con una
    // pasada colgada); dentro de eso, lo que más ofertas mueve.
    .sort((a, b) => (verdicts.units[a.unitKey]?.passes?.B ? 1 : 0) - (verdicts.units[b.unitKey]?.passes?.B ? 1 : 0) || b.offers - a.offers);
  return { prep, units, pending };
}

// ── Doble chequeo: plan ────────────────────────────────────────────────────

const compactFicha = (f) => ({
  slug: f.slug,
  bodega: f.brand,
  storeCount: f.storeCount,
  price: f.price,
  names: f.names.map((n) => ({ key: n.key, raw: n.raw, count: n.count, price: n.price })),
});

/**
 * Candidatos a duplicado que la primera vuelta no vio juntos: fichas de
 * bodegas (unidades) distintas o sin revisar, con ≥50 % de tokens de línea
 * en común (sin la bodega) y precios a menos de 2×. Cada ficha es principal
 * de un caso con sus vecinas todavía no preguntadas (máx. 6).
 */
function planDupCases(fichas, verdicts) {
  const idx = buildIndex(verdicts);
  const unitOf = (f) => {
    const c = new Map();
    for (const n of f.names) {
      const e = idx.index.get(n.key);
      if (e) { const u = e.cls.split("|")[0]; c.set(u, (c.get(u) ?? 0) + n.count); }
    }
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const F = fichas.map((f, i) => {
    const toks = new Set();
    for (const n of [f.title, ...f.names.slice(0, 3).map((x) => x.raw)]) for (const t of lineTokens(n)) toks.add(t);
    for (const t of normalizeBodegaKey(f.brand ?? "").split(" ")) toks.delete(t);
    return { i, f, toks, unit: unitOf(f) };
  });
  const df = new Map();
  for (const x of F) for (const t of x.toks) df.set(t, (df.get(t) ?? 0) + 1);
  const inv = new Map();
  for (const x of F) for (const t of x.toks) if (df.get(t) <= 60) { if (!inv.has(t)) inv.set(t, []); inv.get(t).push(x.i); }
  const seenPair = new Set();
  const nb = new Map();
  for (const ids of inv.values()) {
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const k = `${ids[a]},${ids[b]}`;
      if (seenPair.has(k)) continue;
      seenPair.add(k);
      const A = F[ids[a]], B = F[ids[b]];
      if (A.unit && B.unit && A.unit === B.unit) continue; // ya los vio juntos
      let inter = 0;
      for (const t of A.toks) if (B.toks.has(t)) inter++;
      const jac = inter / (A.toks.size + B.toks.size - inter);
      if (jac < 0.5) continue;
      const pa = A.f.price, pb = B.f.price;
      if (pa && pb && Math.max(pa / pb, pb / pa) > 2) continue;
      for (const [p, q] of [[A.i, B.i], [B.i, A.i]]) { if (!nb.has(p)) nb.set(p, []); nb.get(p).push([q, jac]); }
    }
  }
  // Principales: primero las fichas con más tiendas (la ficha "buena" de cada vino).
  const asked = new Set();
  const cases = [];
  const anchors = [...nb.keys()].sort((a, b) => fichas[b].storeCount - fichas[a].storeCount || a - b);
  for (const a of anchors) {
    const cands = nb.get(a)
      .filter(([q]) => !asked.has(a < q ? `${a},${q}` : `${q},${a}`))
      .sort((x, y) => y[1] - x[1])
      .slice(0, DUP_MAX_CANDS)
      .map(([q]) => q);
    if (!cands.length) continue;
    for (const q of cands) asked.add(a < q ? `${a},${q}` : `${q},${a}`);
    cases.push([a, ...cands]);
  }
  return cases;
}

function planChecks(fichas, verdicts) {
  const cases = planDupCases(fichas, verdicts);
  // Lo que más se ve primero: fichas con más tiendas.
  const auditIdx = fichas
    .map((f, i) => [f, i])
    .filter(([f]) => f.names.length >= 2)
    .sort((a, b) => b[0].storeCount - a[0].storeCount || a[1] - b[1])
    .map(([, i]) => i);
  // Sólo se guardan las fichas que usa el plan, reindexadas.
  const used = new Map();
  const use = (i) => { if (!used.has(i)) used.set(i, used.size); return used.get(i); };
  const dupCases = cases.map((c) => c.map(use));
  const audit = auditIdx.map(use);
  const stored = [];
  for (const [i, j] of used) stored[j] = compactFicha(fichas[i]);
  const units = {};
  for (let k = 0; k < dupCases.length; k += DUP_CASES_PER_REQUEST) {
    const part = dupCases.slice(k, k + DUP_CASES_PER_REQUEST);
    units[`d:${shortHash(JSON.stringify(part), 12)}`] = { kind: "duplicados", cases: part, passes: {} };
  }
  for (let k = 0; k < audit.length; k += AUDIT_FICHAS_PER_REQUEST) {
    const part = audit.slice(k, k + AUDIT_FICHAS_PER_REQUEST);
    units[`a:${shortHash(JSON.stringify(part), 12)}`] = { kind: "auditoria", fichaIdx: part, passes: {} };
  }
  return { apply: false, plannedAt: new Date().toISOString(), fichas: stored, units, plan: { casos: dupCases.length, auditadas: audit.length } };
}

function checkRequests(key, u, checks) {
  const reqs = [];
  for (const pass of ["A", "B"]) {
    if (u.passes?.[pass]) continue;
    const seed = parseInt(shortHash(key + pass, 8), 16);
    let system, schema, text, meta;
    if (u.kind === "duplicados") {
      const order = pass === "A" ? u.cases.map((_, i) => i) : shuffled(u.cases.map((_, i) => i), seed);
      const built = buildDupPrompt(u.cases.map((c) => c), checks.fichas, order);
      // labels.ci es el índice del caso: se traduce a ficha principal al leer.
      system = SYSTEM_DUPLICADOS; schema = SCHEMA_DUPLICADOS; text = built.text;
      meta = { kind: "duplicados", key, pass, labels: built.labels.map((l) => ({ cl: l.cl, anchor: u.cases[l.ci][0], cand: l.cand })) };
    } else {
      const order = pass === "A" ? u.fichaIdx : shuffled(u.fichaIdx, seed);
      const built = buildAuditPrompt(order, checks.fichas);
      system = SYSTEM_AUDITORIA; schema = SCHEMA_AUDITORIA; text = built.text;
      meta = { kind: "auditoria", key, pass, fichaIdx: order };
    }
    reqs.push({
      custom_id: `${u.kind[0]}-${shortHash(key, 16)}-${pass}`,
      meta,
      estUsd: estimateCost(system.length + text.length, 3_000),
      params: {
        model: SOMMELIER_MODEL,
        max_tokens: 32_000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: text }],
        output_config: { effort: "high", format: { type: "json_schema", schema } },
      },
    });
  }
  return reqs;
}

// ── Auditoría del catálogo ──────────────────────────────────────────────────

function planCatalog() {
  const ev = readJson(EVIDENCE_PATH, null);
  if (!ev?.entries?.length) return null;
  const wines = readJson(CATALOG_PATH, { wines: [] }).wines ?? [];
  applyManualOverlay(wines);
  const sib = new Map();
  for (const w of wines) {
    const b = normalizeBodegaKey(w.bodega);
    if (!sib.has(b)) sib.set(b, []);
    sib.get(b).push({ linea: w.linea, varietal: w.varietal ?? null, color: w.color ?? null, dulzor: w.dulzor ?? null, storeCount: w.storeCount ?? 0 });
  }
  // Lo curado a mano no se audita: ya lo miró una persona.
  const byB = new Map();
  for (const e of ev.entries) {
    if (e.manual) continue;
    const b = normalizeBodegaKey(e.bodega);
    if (!byB.has(b)) byB.set(b, []);
    byB.get(b).push(e);
  }
  const units = {};
  let vinos = 0, alias = 0;
  for (const [b, es] of byB) {
    const hermanos = (sib.get(b) ?? []).sort((x, y) => y.storeCount - x.storeCount).slice(0, CATALOG_MAX_HERMANOS);
    for (let k = 0; k < es.length; k += CATALOG_ENTRIES_PER_REQUEST) {
      const entries = es.slice(k, k + CATALOG_ENTRIES_PER_REQUEST);
      units[`k:${shortHash(b + "|" + entries.map((e) => e.id).join(","), 12)}`] = { bodega: es[0].bodega, hermanos, entries, passes: {} };
      vinos += entries.length;
      alias += entries.reduce((s2, e) => s2 + e.alias.length, 0);
    }
  }
  return { plannedAt: new Date().toISOString(), evidenceAt: ev.generatedAt ?? null, units, plan: { vinos, alias } };
}

function catalogRequests(key, u) {
  const reqs = [];
  for (const pass of ["A", "B"]) {
    if (u.passes?.[pass]?.v === CATALOG_PROMPT_VERSION) continue;
    const idx = u.entries.map((_, i) => i);
    const order = pass === "A" ? idx : shuffled(idx, parseInt(shortHash(key + pass, 8), 16));
    const built = buildCatalogPrompt(u, order);
    reqs.push({
      custom_id: `k-${shortHash(key, 16)}-${pass}`,
      meta: { kind: "catalogo", key, pass, labeled: built.labeled },
      estUsd: estimateCost(SYSTEM_CATALOGO.length + built.text.length, 3_000),
      params: {
        model: SOMMELIER_MODEL,
        max_tokens: 32_000,
        system: [{ type: "text", text: SYSTEM_CATALOGO, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: built.text }],
        output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA_CATALOGO } },
      },
    });
  }
  return reqs;
}

function writeCatalogFixes(verdicts) {
  const prev = readJson(FIXES_PATH, {});
  const wines = catalogConsensus(verdicts.catalogo);
  writeFileSync(
    FIXES_PATH,
    JSON.stringify(
      {
        _doc: "Correcciones del catálogo por consenso de las dos pasadas del sommelier (alias que capturan otro vino, nombres de línea mal escritos). Lo escribe scripts/sommelier.mjs; lo aplica build-groups-v2.mjs ANTES de catalog-manual.json, y sólo con apply=true o SOMMELIER_CATALOG_APPLY=1.",
        apply: prev.apply === true,
        wines,
      },
      null,
      1,
    ) + "\n",
  );
}

// ── Resultados ──────────────────────────────────────────────────────────────

function textOf(message) {
  const b = (message?.content ?? []).find((c) => c.type === "text");
  return b?.text ?? null;
}

function handleResult(meta, out, usd, verdicts, state) {
  const at = new Date().toISOString();
  if (meta.kind === "familias") {
    const map = {};
    for (const fam of out.familias ?? []) {
      if (!fam?.canonica || (fam.miembros ?? []).length < 2) continue;
      for (const m of fam.miembros) {
        const k = normalizeBodegaKey(m);
        if (k && !map[k]) map[k] = fam.canonica;
      }
      const ck = normalizeBodegaKey(fam.canonica);
      if (ck && !map[ck]) map[ck] = fam.canonica;
    }
    verdicts.families = { at, model: SOMMELIER_MODEL, bodegaCount: meta.bodegaCount, map };
    return `familias: ${(out.familias ?? []).length} grupos, ${Object.keys(map).length} nombres`;
  }
  if (meta.kind === "atribucion") {
    let set = 0, nul = 0;
    for (const r of out.fichas ?? []) {
      const m = /^A(\d+)$/.exec(String(r?.f ?? "").trim());
      const keys = m ? meta.labeled[Number(m[1]) - 1] : null;
      if (!keys) continue;
      for (const k of keys) verdicts.attribution[k] = r.bodega || null;
      if (r.bodega) set++;
      else nul++;
    }
    return `atribución: ${set} con bodega, ${nul} sin`;
  }
  if (meta.kind === "duplicados" || meta.kind === "auditoria") {
    const u = verdicts.checks?.units?.[meta.key];
    if (!u) return null;
    if (meta.kind === "duplicados") {
      // parseDupOutput devuelve [índice de caso, ficha]; acá ci ya es la principal.
      const labels = meta.labels.map((l) => ({ cl: l.cl, ci: l.anchor, cand: l.cand }));
      const pairs = parseDupOutput(out, labels);
      u.passes[meta.pass] = { pairs, at, usd: Math.round(usd * 10000) / 10000 };
      return `duplicados ${meta.key} [${meta.pass}]: ${pairs.length} pares "mismo"`;
    }
    const intrusos = parseAuditOutput(out, meta.fichaIdx, verdicts.checks.fichas);
    u.passes[meta.pass] = { intrusos, at, usd: Math.round(usd * 10000) / 10000 };
    return `auditoría ${meta.key} [${meta.pass}]: ${intrusos.length} intrusos`;
  }
  if (meta.kind === "catalogo") {
    const u = verdicts.catalogo?.units?.[meta.key];
    if (!u) return null;
    const res = parseCatalogOutput(out, meta.labeled);
    u.passes[meta.pass] = { res, at, usd: Math.round(usd * 10000) / 10000, v: CATALOG_PROMPT_VERSION };
    const aj = Object.values(res).reduce((s2, r) => s2 + r.ajenos.length, 0);
    const ln = Object.values(res).filter((r) => r.linea).length;
    return `catálogo ${u.bodega} [${meta.pass}]: ${aj} alias ajenos, ${ln} líneas a renombrar`;
  }
  if (meta.kind === "bodega") {
    const parsed = parseBodegaOutput(out, meta.labeled);
    const u = (verdicts.units[meta.unitKey] ??= { kind: "bodega", family: meta.family, names: [], passes: {} });
    // Las pasadas nuevas esperan en `pending` hasta que llegan las dos: si una
    // falla, la unidad sigue aplicando el veredicto anterior completo.
    if (!u.pending || u.pending.inputHash !== meta.inputHash) u.pending = { inputHash: meta.inputHash, names: meta.names, passes: {} };
    u.pending.passes[meta.pass] = {
      ...compactPass(meta.names, parsed),
      otra: parsed.otra,
      inputHash: meta.inputHash,
      at,
      model: SOMMELIER_MODEL,
      promptVersion: PROMPT_VERSION,
      stats: parsed.stats,
      usd: Math.round(usd * 10000) / 10000,
    };
    if (u.pending.passes.A && u.pending.passes.B) {
      u.names = u.pending.names;
      u.passes = u.pending.passes;
      u.at = at;
      delete u.pending;
      delete state.failures[meta.unitKey];
      if (meta.retry) u.retried = true;
      // Bodega real de las fichas mal atribuidas: sólo si las dos pasadas
      // dicen la misma (si no, la ficha se queda donde está).
      const A = u.passes.A.otra ?? {}, B = u.passes.B.otra ?? {};
      for (const [k, b] of Object.entries(A)) {
        if (B[k] && normalizeBodegaKey(B[k]) === normalizeBodegaKey(b)) verdicts.attribution[k] = b;
      }
    }
    const t = parsed.stats.tipos;
    return `${meta.unitKey} [${meta.pass}]: ${Object.keys(parsed.wines).length} vinos · ${parsed.stats.fichas} fichas (${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(", ")})` +
      (parsed.stats.sinRespuesta ? ` · ${parsed.stats.sinRespuesta} sin respuesta` : "") +
      (parsed.stats.idsInvalidos ? ` · ${parsed.stats.idsInvalidos} ids inválidos` : "");
  }
  return null;
}

async function collect(client, verdicts, state) {
  const inf = state.inflight;
  if (!inf) return true;
  const batch = await client.messages.batches.retrieve(inf.batchId);
  if (batch.processing_status !== "ended") {
    const c = batch.request_counts;
    // Sólo consola: cada línea nueva en state.json es un commit a main, y
    // cada commit a main es un deploy en Railway (09/10).
    console.log(`batch ${inf.batchId} en proceso: ${c.processing} procesando · ${c.succeeded} listos · ${c.errored} con error`);
    return false;
  }
  const metas = readJson(INFLIGHT_PATH, { requests: {} }).requests;
  const ck = cycleKey();
  let usdTotal = 0, ok = 0, bad = 0;
  for await (const r of await client.messages.batches.results(inf.batchId)) {
    const meta = metas[r.custom_id];
    if (!meta) continue;
    const failKey = meta.unitKey ?? meta.key ?? meta.kind;
    if (r.result.type !== "succeeded") {
      bad++;
      state.failures[failKey] = (state.failures[failKey] ?? 0) + 1;
      log(state, `✗ ${r.custom_id} (${failKey}): ${r.result.type}${r.result.type === "errored" ? ` ${r.result.error?.error?.type ?? r.result.error?.type ?? ""}` : ""}`);
      continue;
    }
    const msg = r.result.message;
    const usd = costOf(msg.usage, msg.model ?? SOMMELIER_MODEL, { batch: true });
    usdTotal += usd;
    const txt = textOf(msg);
    if (msg.stop_reason !== "end_turn" || !txt) {
      bad++;
      state.failures[failKey] = (state.failures[failKey] ?? 0) + 1;
      log(state, `✗ ${r.custom_id} (${failKey}): stop_reason=${msg.stop_reason}`);
      continue;
    }
    let out;
    try { out = JSON.parse(txt); } catch {
      bad++;
      state.failures[failKey] = (state.failures[failKey] ?? 0) + 1;
      log(state, `✗ ${r.custom_id} (${failKey}): JSON ilegible`);
      continue;
    }
    ok++;
    const line = handleResult(meta, out, usd, verdicts, state);
    if (line) log(state, `✓ ${line} · $${usd.toFixed(3)}`);
  }
  state.spend[ck] = Math.round(((state.spend[ck] ?? 0) + usdTotal) * 10000) / 10000;
  log(state, `batch ${inf.batchId} cerrado: ${ok} ok · ${bad} con problemas · $${usdTotal.toFixed(2)} (ciclo ${ck}: $${state.spend[ck].toFixed(2)} de $${BUDGET_USD})`);
  state.inflight = null;
  rmSync(INFLIGHT_PATH, { force: true });
  return true;
}

// ── Comandos ────────────────────────────────────────────────────────────────

async function run() {
  const dry = flag("--dry-run");
  const verdicts = loadVerdicts();
  const state = loadState();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key && !dry) {
    console.log("Sin ANTHROPIC_API_KEY: no hay nada que hacer (usá --dry-run para ver el plan).");
    return;
  }
  const client = key ? new Anthropic() : null;
  // ANTES de tocar la API: un batch creado cuyo id no se puede guardar se
  // vuelve a mandar en la próxima corrida y se paga dos veces.
  if (!dry) mkdirSync(DIR, { recursive: true });

  // El plan se guarda aunque haya un batch en vuelo: las corridas del cron
  // no llevan SOMMELIER_CATALOGO y lo continúan desde verdicts.catalogo.
  if (CATALOGO && !verdicts.catalogo) {
    verdicts.catalogo = planCatalog();
    if (verdicts.catalogo) {
      const n = Object.keys(verdicts.catalogo.units).length;
      log(state, `auditoría del catálogo planeada: ${verdicts.catalogo.plan.vinos} vinos, ${verdicts.catalogo.plan.alias} alias (${n} unidades × 2 pasadas)`);
    } else {
      console.log("auditoría del catálogo: falta data/sommelier/catalog-evidence.json (lo escribe build-groups-v2.mjs --publish)");
    }
  }
  if (!dry && verdicts.catalogo && state.inflight) save(verdicts, state);

  if (state.inflight) {
    if (dry) {
      console.log(`(dry-run) hay un batch en vuelo: ${state.inflight.batchId}`);
    } else {
      const done = await collect(client, verdicts, state);
      save(verdicts, state);
      if (!done) return;
    }
  }

  const fichas = loadFichas(verdicts);
  const { prep, units, pending } = plan(fichas, verdicts, state);
  const ck = cycleKey();
  const remaining = BUDGET_USD - (state.spend[ck] ?? 0);
  console.log(
    `fichas ${fichas.length} · unidades de bodega ${units.length} (${units.reduce((s, u) => s + u.fichas.length, 0)} fichas) · pendientes ${pending.length} · ` +
      `preparación ${prep.length} · ciclo ${ck}: $${(state.spend[ck] ?? 0).toFixed(2)} gastados, $${remaining.toFixed(2)} disponibles`,
  );

  // Preparación primero; si hay, las bodegas esperan a la próxima corrida.
  let requests = [];
  let est = 0;
  if (prep.length) {
    for (const r of prep) {
      if (requests.length >= MAX_REQUESTS || est + r.estUsd > remaining) break;
      requests.push(r);
      est += r.estUsd;
    }
  } else {
    for (const u of pending) {
      const rs = bodegaRequests(u, verdicts, { retry: u.retry });
      const c = rs.reduce((s, r) => s + r.estUsd, 0);
      if (requests.length + rs.length > MAX_REQUESTS) break;
      if (est + c > remaining) continue; // una unidad grande no frena a las chicas
      requests.push(...rs);
      est += c;
    }
  }
  // Doble chequeo: no depende de la atribución, va también con preparación.
  if (DOBLE && !verdicts.checks) {
    verdicts.checks = planChecks(fichas, verdicts);
    const n = Object.keys(verdicts.checks.units).length;
    log(state, `doble chequeo planeado: ${verdicts.checks.plan.casos} casos de duplicados + ${verdicts.checks.plan.auditadas} fichas a auditar (${n} unidades × 2 pasadas)`);
  }
  for (const [key, u] of Object.entries(verdicts.checks?.units ?? {})) {
    if ((state.failures[key] ?? 0) >= MAX_FAILURES) continue;
    const rs = checkRequests(key, u, verdicts.checks);
    if (!rs.length) continue;
    const c = rs.reduce((s2, r) => s2 + r.estUsd, 0);
    if (requests.length + rs.length > MAX_REQUESTS) break;
    if (est + c > remaining) break;
    requests.push(...rs);
    est += c;
  }
  for (const [key, u] of Object.entries(verdicts.catalogo?.units ?? {})) {
    if ((state.failures[key] ?? 0) >= MAX_FAILURES) continue;
    const rs = catalogRequests(key, u);
    if (!rs.length) continue;
    const c = rs.reduce((s2, r) => s2 + r.estUsd, 0);
    if (requests.length + rs.length > MAX_REQUESTS) break;
    if (est + c > remaining) break;
    requests.push(...rs);
    est += c;
  }
  if (!requests.length) {
    console.log(pending.length || prep.length ? `nada entra en el presupuesto que queda ($${remaining.toFixed(2)})` : "todo revisado: no hay nada pendiente");
    if (!dry) save(verdicts, state);
    return;
  }
  const kinds = requests.reduce((m, r) => m.set(r.meta.kind, (m.get(r.meta.kind) ?? 0) + 1), new Map());
  console.log(`a mandar: ${requests.length} pedidos (${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}) · estimado $${est.toFixed(2)}`);

  if (dry) {
    const out = resolve(argVal("--out", resolve(tmpdir(), "sommelier-dry-run.json")));
    const sample = [...new Map(requests.map((r) => [r.meta.kind, r])).values()];
    writeFileSync(out, JSON.stringify(sample.map((r) => ({ custom_id: r.custom_id, estUsd: r.estUsd, system: r.params.system.map((s) => s.text.slice(0, 400)), user: r.params.messages[0].content.slice(0, 6000) })), null, 1));
    console.log(`(dry-run) ejemplo de pedidos en ${out}`);
    for (const u of pending.slice(0, 15)) console.log(`  · ${u.unitKey} — ${u.fichas.length} fichas, ${u.names.length} nombres, ${u.offers} ofertas`);
    const all = pending.flatMap((u) => bodegaRequests(u, verdicts, { retry: u.retry }));
    const allUsd = all.reduce((s, r) => s + r.estUsd, 0);
    console.log(`(dry-run) vuelta completa de bodegas pendientes: ${all.length} pedidos (2 pasadas × ${pending.length} bodegas) · estimado $${allUsd.toFixed(2)} con Batches API`);
    return;
  }

  let batch;
  try {
    batch = await client.messages.batches.create({ requests: requests.map((r) => ({ custom_id: r.custom_id, params: r.params })) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw e;
    // Sin crédito, límite de tasa o la API caída: se reintenta en la próxima corrida.
    log(state, `no se pudo crear el batch: ${e?.status ?? ""} ${e?.message ?? e}`);
    save(verdicts, state);
    return;
  }
  writeFileSync(INFLIGHT_PATH, JSON.stringify({ batchId: batch.id, requests: Object.fromEntries(requests.map((r) => [r.custom_id, r.meta])) }) + "\n");
  state.inflight = { batchId: batch.id, submittedAt: new Date().toISOString(), requests: requests.length, estUsd: Math.round(est * 100) / 100 };
  log(state, `batch ${batch.id} enviado: ${requests.length} pedidos, estimado $${est.toFixed(2)}`);
  save(verdicts, state);
}

function status() {
  const verdicts = loadVerdicts();
  const state = loadState();
  const fichas = loadFichas(verdicts);
  const { prep, units, pending } = plan(fichas, verdicts, state);
  const done = units.filter((u) => verdicts.units[u.unitKey]?.passes?.B);
  const fichasDone = done.reduce((s, u) => s + u.fichas.length, 0);
  const fichasAll = units.reduce((s, u) => s + u.fichas.length, 0);
  const idx = buildIndex(verdicts);
  const lowAgreement = idx.units.filter((u) => !u.applied);
  const ck = cycleKey();
  console.log(`Sommelier — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`  familias de bodegas: ${verdicts.families ? `${Object.keys(verdicts.families.map).length} nombres agrupados` : "pendiente"}`);
  console.log(`  fichas sin bodega atribuidas: ${Object.values(verdicts.attribution).filter(Boolean).length} nombres`);
  console.log(`  bodegas revisadas: ${done.length}/${units.length} · fichas ${fichasDone}/${fichasAll} (${fichasAll ? ((100 * fichasDone) / fichasAll).toFixed(1) : 0}%)`);
  console.log(`  pendientes: ${pending.length} bodegas · ${prep.length} pedidos de preparación`);
  console.log(`  nombres con vino decidido (consenso): ${idx.index.size} · fuera de su ficha: ${idx.out.size}`);
  if (lowAgreement.length) console.log(`  bodegas NO aplicadas por bajo acuerdo entre pasadas: ${lowAgreement.map((u) => `${u.unitKey} (${(u.agreement * 100).toFixed(0)}%)`).join(", ")}`);
  if (verdicts.checks) {
    const us = Object.values(verdicts.checks.units);
    const done = us.filter((u) => u.passes?.A && u.passes?.B).length;
    const cons = checksConsensus(verdicts.checks);
    console.log(`  doble chequeo: ${done}/${us.length} unidades con dos pasadas · consenso: ${cons.merges.length} fusiones, ${cons.ejects.size} intrusos · ${verdicts.checks.apply ? "APLICADO" : "en sombra (checks.apply=false)"}`);
  }
  if (verdicts.catalogo) {
    const us = Object.values(verdicts.catalogo.units);
    const done = us.filter((u) => u.passes?.A && u.passes?.B).length;
    const fx = catalogConsensus(verdicts.catalogo);
    const fixes = readJson(FIXES_PATH, {});
    console.log(`  auditoría del catálogo: ${done}/${us.length} unidades con dos pasadas · consenso: ${fx.filter((f) => f.quitarAliases).length} vinos con alias a sacar, ${fx.filter((f) => f.linea).length} líneas a renombrar · ${fixes.apply ? "APLICADO" : "en sombra (catalog-fixes.json apply=false)"}`);
  }
  console.log(`  gasto del ciclo ${ck}: $${(state.spend[ck] ?? 0).toFixed(2)} de $${BUDGET_USD}`);
  console.log(`  batch en vuelo: ${state.inflight ? `${state.inflight.batchId} (${state.inflight.requests} pedidos, desde ${state.inflight.submittedAt})` : "ninguno"}`);
  for (const l of state.log.slice(-8)) console.log(`  │ ${l}`);
}

async function probe() {
  const target = args[1];
  if (!target) throw new Error('uso: node scripts/sommelier.mjs probe "<bodega>"');
  const verdicts = loadVerdicts();
  const fichas = loadFichas(verdicts);
  const units = planBodegaUnits(fichas, verdicts);
  const unit = units.find((u) => normalizeBodegaKey(u.family) === normalizeBodegaKey(target)) ?? units.find((u) => u.unitKey.includes(normalizeBodegaKey(target)));
  if (!unit) throw new Error(`no encontré la bodega "${target}"`);
  const [req] = bodegaRequests(unit);
  console.log(`${unit.unitKey}: ${unit.fichas.length} fichas, ${unit.names.length} nombres · estimado (sin batch) $${(req.estUsd * 2).toFixed(2)}`);
  if (flag("--dry-run") || !process.env.ANTHROPIC_API_KEY) {
    console.log(req.params.messages[0].content.slice(0, 4000));
    return;
  }
  const client = new Anthropic();
  // Fuera de batch y con salida larga: streaming para no chocar timeouts.
  const msg = await client.messages.stream(req.params).finalMessage();
  const out = JSON.parse(textOf(msg) ?? "{}");
  const parsed = parseBodegaOutput(out, req.meta.labeled);
  console.log(`costo: $${costOf(msg.usage, msg.model, { batch: false }).toFixed(3)} · stop_reason ${msg.stop_reason}`);
  const byWine = new Map();
  for (const f of unit.fichas) {
    for (const n of f.names) {
      const w = parsed.map[n.key];
      if (!w) continue;
      if (!byWine.has(w)) byWine.set(w, new Map());
      const m = byWine.get(w);
      m.set(f.title, (m.get(f.title) ?? 0) + n.count);
    }
  }
  for (const [w, m] of [...byWine].sort((a, b) => b[1].size - a[1].size)) {
    const name = w === "x" ? "(no es vino de esta bodega)" : parsed.wines[w]?.nombre;
    console.log(`\n${name}${m.size > 1 ? `  ← ${m.size} fichas hoy` : ""}`);
    for (const [t, n] of m) console.log(`   · ${t} (${n})`);
  }
}

const main = { run, status, probe }[cmd];
if (!main) {
  console.error(`comando desconocido: ${cmd} (run | status | probe)`);
  process.exit(2);
}
Promise.resolve(main()).catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
