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
} from "./lib-sommelier.mjs";

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

function bodegaNeedsWork(unit, verdicts, state) {
  if ((state.failures[unit.unitKey] ?? 0) >= MAX_FAILURES) return false;
  const v = verdicts.units[unit.unitKey];
  if (!v?.passes?.A || !v?.passes?.B) return true;
  const covered = new Set(v.names);
  const fresh = unit.names.filter((k) => !covered.has(k)).length;
  return fresh >= Math.max(RECHECK_MIN_NEW, 0.1 * unit.names.length);
}

function bodegaRequests(unit, verdicts) {
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
      meta: { kind: "bodega", unitKey: unit.unitKey, family: unit.family, pass, inputHash: unit.inputHash, names: unit.names, labeled },
      estUsd: estimateCost(SYSTEM_BODEGA.length + text.length, (small ? 1_500 : 3_000) + unit.fichas.length * 130),
      params: {
        model: SOMMELIER_MODEL,
        max_tokens: Math.min(128_000, 16_000 + unit.fichas.length * 200),
        system: [{ type: "text", text: SYSTEM_BODEGA, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: text }],
        // Bodegas chicas (≤15 fichas): medium alcanza; las grandes, donde
        // están las líneas parecidas, piensan más.
        output_config: { effort: small ? "medium" : "high", format: { type: "json_schema", schema: SCHEMA_BODEGA } },
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
  const pending = units
    .filter((u) => bodegaNeedsWork(u, verdicts, state))
    // Primero lo que no tiene veredicto completo (nunca revisado o con una
    // pasada colgada); dentro de eso, lo que más ofertas mueve.
    .sort((a, b) => (verdicts.units[a.unitKey]?.passes?.B ? 1 : 0) - (verdicts.units[b.unitKey]?.passes?.B ? 1 : 0) || b.offers - a.offers);
  return { prep, units, pending };
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
    log(state, `batch ${inf.batchId} en proceso: ${c.processing} procesando · ${c.succeeded} listos · ${c.errored} con error`);
    return false;
  }
  const metas = readJson(INFLIGHT_PATH, { requests: {} }).requests;
  const ck = cycleKey();
  let usdTotal = 0, ok = 0, bad = 0;
  for await (const r of await client.messages.batches.results(inf.batchId)) {
    const meta = metas[r.custom_id];
    if (!meta) continue;
    const failKey = meta.unitKey ?? meta.kind;
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
      const rs = bodegaRequests(u, verdicts);
      const c = rs.reduce((s, r) => s + r.estUsd, 0);
      if (requests.length + rs.length > MAX_REQUESTS) break;
      if (est + c > remaining) continue; // una unidad grande no frena a las chicas
      requests.push(...rs);
      est += c;
    }
  }
  if (!requests.length) {
    log(state, pending.length || prep.length ? `nada entra en el presupuesto que queda ($${remaining.toFixed(2)})` : "todo revisado: no hay nada pendiente");
    if (!dry) save(verdicts, state);
    return;
  }
  const kinds = requests.reduce((m, r) => m.set(r.meta.kind, (m.get(r.meta.kind) ?? 0) + 1), new Map());
  console.log(`a mandar: ${requests.length} pedidos (${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}) · estimado $${est.toFixed(2)}`);

  if (dry) {
    const out = resolve(argVal("--out", resolve(tmpdir(), "sommelier-dry-run.json")));
    writeFileSync(out, JSON.stringify(requests.slice(0, 4).map((r) => ({ custom_id: r.custom_id, estUsd: r.estUsd, system: r.params.system.map((s) => s.text.slice(0, 400)), user: r.params.messages[0].content.slice(0, 6000) })), null, 1));
    console.log(`(dry-run) ejemplo de pedidos en ${out}`);
    for (const u of pending.slice(0, 15)) console.log(`  · ${u.unitKey} — ${u.fichas.length} fichas, ${u.names.length} nombres, ${u.offers} ofertas`);
    const all = pending.flatMap((u) => bodegaRequests(u, verdicts));
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
