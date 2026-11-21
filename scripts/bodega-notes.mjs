#!/usr/bin/env node
/**
 * Fichas de bodega con Claude + búsqueda web → data/bodega-notes.json.
 *
 * Las ~1.000 páginas /bodega/[slug] sólo tenían texto de plantilla
 * ("N etiquetas en M vinotecas"). Este script le pide a Claude que busque
 * en la web información verificable de cada bodega y escriba 2-4
 * oraciones con las fuentes. La página las muestra con sus links.
 *
 * Principio: dato falso es peor que dato ausente.
 *   - Sólo se guarda una ficha si cita al menos una fuente que el modelo
 *     efectivamente recibió de la búsqueda (se cruza contra los resultados).
 *   - Si el modelo no encuentra la bodega con certeza, se anota como
 *     "miss" y se reintenta recién a los MISS_RETRY_DAYS días.
 *   - Las fichas existentes no se regeneran (incremental, cache eterno);
 *     para rehacer una, borrala del JSON.
 *
 * Orden: bodegas con más etiquetas primero (son las páginas con más
 * tráfico potencial). Corre en .github/workflows/bodega-notes.yml.
 *
 * Uso:
 *   node scripts/bodega-notes.mjs [--max 40] [--usd 5] [--dry] [--only slug]
 * Env: ANTHROPIC_API_KEY (obligatoria salvo --dry), BODEGA_NOTES_MODEL,
 *      BODEGA_NOTES_EFFORT.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = resolve(ROOT, "data/snapshot.json");
const REGIONS_PATH = resolve(ROOT, "data/bodega-regions.json");
const OUT_PATH = resolve(ROOT, "data/bodega-notes.json");

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MAX = Number(argVal("--max", process.env.BODEGA_NOTES_MAX || "40"));
const RUN_USD = Number(argVal("--usd", process.env.BODEGA_NOTES_RUN_USD || "5"));
const DRY = args.includes("--dry");
const ONLY = argVal("--only", null);
// Qué bodegas tienen página sale del sitemap publicado (las reglas de
// brandPages() en lib/snapshot.ts filtran espirituosas, fichas no-vino,
// etc.; replicarlas acá se desalinearía). Sin red, cae al snapshot.
const SITEMAP = argVal("--sitemap", process.env.BODEGA_NOTES_SITEMAP || "https://vinndex.com.ar/sitemap.xml");
const MODEL = process.env.BODEGA_NOTES_MODEL || "claude-opus-5-5";
const EFFORT = process.env.BODEGA_NOTES_EFFORT || "medium";
const MISS_RETRY_DAYS = 90;
const MIN_GROUPS = 3; // mismo umbral que brandPages() en lib/snapshot.ts

// Precios por millón de tokens / por búsqueda, para cortar por presupuesto.
// Si cambia el modelo, ajustá esto (o el corte queda corrido).
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, search: 0.01 };

// ── Mismas reglas que lib/snapshot.ts (brandPageSlug / feedsBrandPage) ──
// Duplicado a propósito: este script corre con node puro, sin el alias "@/".
// Si cambian allá, cambialas acá; una ficha con slug desalineado sólo no se
// muestra, no rompe nada.
export function brandPageSlug(brand) {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^bodega(s)?\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const SPIRITS_BRAND_RE = /smirnoff|absolut|glen|johnnie|chivas|jack\s+daniels|ballantine|jameson|bombay|gordon|tanqueray|beefeater|bacardi|captain\s+morgan|malibu|baileys|campari|aperol|fernet|martini|cinzano|red\s+bull/i;

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** Bodegas con página, ordenadas por cantidad de etiquetas. */
export function bodegaCandidates(groups) {
  const bySlug = new Map();
  for (const g of groups) {
    if (!g.brand || SPIRITS_BRAND_RE.test(g.brand)) continue;
    const slug = brandPageSlug(g.brand);
    if (!slug) continue;
    let e = bySlug.get(slug);
    if (!e) {
      e = { slug, names: new Map(), groups: 0, samples: [], regions: new Map() };
      bySlug.set(slug, e);
    }
    e.groups++;
    e.names.set(g.brand, (e.names.get(g.brand) ?? 0) + 1);
    if (g.region) e.regions.set(g.region, (e.regions.get(g.region) ?? 0) + 1);
    if (e.samples.length < 8 && g.canonicalName) e.samples.push(g.canonicalName);
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return [...bySlug.values()]
    .filter((e) => e.groups >= MIN_GROUPS)
    .map((e) => ({ slug: e.slug, name: top(e.names), groups: e.groups, samples: e.samples, region: top(e.regions) }))
    .sort((a, b) => b.groups - a.groups);
}

const SYSTEM = `Sos editor de una guía independiente de vinos argentinos. Escribís fichas breves de bodegas para lectores que comparan precios.

Usá la búsqueda web para encontrar información VERIFICABLE sobre la bodega que te indiquen: dónde está, cuándo y quién la fundó, qué la distingue (zona, estilo, líneas conocidas). Preferí el sitio oficial de la bodega, prensa especializada y organismos (INV, Wines of Argentina).

Reglas:
- Sólo afirmaciones que estén en las fuentes que leíste. Nada de puntajes, premios ni datos que no hayas visto.
- Sin adjetivos de marketing ("excepcional", "icónica", "de clase mundial").
- Español rioplatense neutro, tercera persona, 2 a 4 oraciones, entre 50 y 110 palabras.
- No menciones precios, vinotecas ni este sitio.
- Si el nombre es ambiguo, usá los vinos de ejemplo para identificar la bodega correcta. Si no podés identificarla con certeza o no hay información confiable, no inventes: respondé encontrada=false.

Al final respondé SOLO con un objeto JSON (sin texto antes ni después, sin bloque de código):
{"encontrada": true|false, "texto": "...", "provincia": "<provincia argentina o null>", "fundacion": <año o null>, "fuentes": ["<url leída>", ...]}`;

function userPrompt(c) {
  return `Bodega: ${c.name}
Vinos de ejemplo que vende (para desambiguar): ${c.samples.slice(0, 6).join(" · ")}${c.region ? `\nRegión según nuestro catálogo (puede estar mal): ${c.region}` : ""}`;
}

function costOf(usage) {
  if (!usage) return 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return (
    ((usage.input_tokens ?? 0) * PRICE.input +
      (usage.output_tokens ?? 0) * PRICE.output +
      (usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1e6 +
    searches * PRICE.search
  );
}

/** Extrae el último objeto JSON de un texto. */
export function lastJsonObject(text) {
  const end = text.lastIndexOf("}");
  if (end < 0) return null;
  for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* probar con una llave anterior */
    }
  }
  return null;
}

function normUrl(u) {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Valida la respuesta: texto razonable y al menos una fuente que esté
 * entre los resultados que la búsqueda le devolvió al modelo.
 */
export function validate(answer, seenUrls) {
  if (!answer || answer.encontrada !== true) return { ok: false, reason: "no encontrada" };
  const texto = typeof answer.texto === "string" ? answer.texto.trim() : "";
  if (texto.length < 150 || texto.length > 900) return { ok: false, reason: `texto de ${texto.length} chars` };
  const seen = new Map([...seenUrls].map((u) => [normUrl(u), u]));
  const fuentes = [...new Set((Array.isArray(answer.fuentes) ? answer.fuentes : [])
    .map((u) => seen.get(normUrl(u)))
    .filter(Boolean))].slice(0, 4);
  if (fuentes.length === 0) return { ok: false, reason: "sin fuentes verificadas" };
  const fundacion = Number.isInteger(answer.fundacion) && answer.fundacion > 1500 && answer.fundacion <= new Date().getFullYear()
    ? answer.fundacion
    : null;
  const provincia = typeof answer.provincia === "string" && answer.provincia.trim() && answer.provincia !== "null"
    ? answer.provincia.trim()
    : null;
  return { ok: true, note: { texto, provincia, fundacion, fuentes } };
}

let client = null;
async function ask(c) {
  client ??= new Anthropic();
  const messages = [{ role: "user", content: userPrompt(c) }];
  const seenUrls = new Set();
  let cost = 0;
  let text = "";
  // pause_turn: un turno largo de búsqueda puede pausarse; se reenvía tal
  // cual para que el servidor lo continúe.
  for (let turn = 0; turn < 4; turn++) {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      output_config: { effort: EFFORT },
      messages,
    });
    cost += costOf(msg.usage);
    for (const b of msg.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r?.url) seenUrls.add(r.url);
      }
      if (b.type === "text") text += b.text;
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      text = "";
      continue;
    }
    if (msg.stop_reason !== "end_turn") {
      return { cost, error: `stop_reason=${msg.stop_reason}` };
    }
    return { cost, answer: lastJsonObject(text), seenUrls };
  }
  return { cost, error: "demasiadas pausas" };
}

/** Slugs de /bodega/* listados en el sitemap (índice + hijos). */
async function sitemapBodegaSlugs(url) {
  const locs = async (u) => {
    const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
    return [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  };
  const top = await locs(url);
  const children = top.filter((u) => /sitemap[^/]*\.xml|\/sitemap\//.test(u));
  // Los hijos se piden al mismo origen que el índice (sirve para probar
  // contra un `next start` local, cuyo sitemap lista URLs de producción).
  const origin = new URL(url).origin;
  const sameOrigin = (u) => { const x = new URL(u); return origin + x.pathname + x.search; };
  const pages = children.length ? (await Promise.all(children.map((u) => locs(sameOrigin(u))))).flat() : top;
  const slugs = new Set();
  for (const u of pages) {
    const m = u.match(/\/bodega\/([^/?#]+)/);
    if (m) slugs.add(decodeURIComponent(m[1]));
  }
  return slugs;
}

async function main() {
  const snapshot = loadJson(SNAPSHOT_PATH, { productGroups: [] });
  const regions = loadJson(REGIONS_PATH, {});
  const store = loadJson(OUT_PATH, null) ?? {
    _doc: "Fichas de bodega para /bodega/[slug]. Las genera scripts/bodega-notes.mjs (Claude + búsqueda web, con fuentes verificadas). Para rehacer una, borrala; para corregirla, editá el texto (no se pisa).",
    notes: {},
    misses: {},
  };
  store.notes ??= {};
  store.misses ??= {};

  const now = Date.now();
  let all = bodegaCandidates(snapshot.productGroups ?? []);
  try {
    const live = await sitemapBodegaSlugs(SITEMAP);
    if (live.size > 0) {
      const before = all.length;
      all = all.filter((c) => live.has(c.slug));
      console.log(`  sitemap: ${live.size} páginas de bodega · ${all.length} de ${before} candidatas del snapshot coinciden`);
    }
  } catch (err) {
    console.log(`  sin sitemap (${String(err.message).slice(0, 80)}): uso las candidatas del snapshot`);
  }
  const todo = all.filter((c) => {
    if (ONLY) return c.slug === ONLY;
    if (store.notes[c.slug]) return false;
    const miss = store.misses[c.slug];
    return !miss || now - Date.parse(miss.at) > MISS_RETRY_DAYS * 86400e3;
  });
  // Región del dict manual, si la hay, como pista extra.
  for (const c of todo) {
    const r = regions[c.slug] ?? regions[c.name?.toLowerCase?.()];
    if (!c.region && typeof r === "string") c.region = r;
  }

  console.log(`Fichas de bodega — ${all.length} bodegas con página · ${Object.keys(store.notes).length} con ficha · ${todo.length} por hacer · esta corrida: hasta ${MAX} o $${RUN_USD}`);
  if (DRY) {
    for (const c of todo.slice(0, MAX)) console.log(`  ${c.slug} (${c.groups}) ← ${c.name}`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Sin ANTHROPIC_API_KEY: no hay nada que hacer.");
    return;
  }

  let spent = 0, ok = 0, miss = 0, failed = 0;
  for (const c of todo.slice(0, MAX)) {
    if (spent >= RUN_USD) {
      console.log(`  tope de la corrida ($${RUN_USD}) alcanzado`);
      break;
    }
    try {
      const r = await ask(c);
      spent += r.cost;
      if (r.error) {
        failed++;
        console.log(`  ✗ ${c.slug}: ${r.error} · $${r.cost.toFixed(3)}`);
        continue;
      }
      const v = validate(r.answer, r.seenUrls);
      if (v.ok) {
        store.notes[c.slug] = { name: c.name, ...v.note, model: MODEL, at: new Date().toISOString() };
        ok++;
        console.log(`  ✓ ${c.slug} · ${v.note.fuentes.length} fuentes · $${r.cost.toFixed(3)}`);
      } else {
        store.misses[c.slug] = { reason: v.reason, at: new Date().toISOString() };
        miss++;
        console.log(`  · ${c.slug}: ${v.reason} · $${r.cost.toFixed(3)}`);
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        console.error(`  ${err.constructor.name}: la key de Anthropic no sirve — corto.`);
        failed++;
        break;
      }
      failed++;
      console.log(`  ✗ ${c.slug}: ${String(err.message).slice(0, 160)}`);
      if (failed >= 5 && ok === 0) {
        console.log("  5 errores sin ningún acierto — corto para no gastar de más.");
        break;
      }
    }
    // Guardado incremental: si la corrida se corta, no se pierde lo hecho.
    writeFileSync(OUT_PATH, JSON.stringify(store, null, 1) + "\n");
  }
  writeFileSync(OUT_PATH, JSON.stringify(store, null, 1) + "\n");
  console.log(`Listo: ${ok} fichas nuevas · ${miss} sin datos confiables · ${failed} errores · gasto estimado $${spent.toFixed(2)}`);
  if (failed > 0 && ok === 0 && miss === 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
