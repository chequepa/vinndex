#!/usr/bin/env node
/**
 * Índice Vinndex de precios del vino.
 *
 * Responde "¿cuánto subió el vino en Argentina?" con datos propios: los
 * snapshots diarios que el daily-scrape commitea en `data/snapshot.json`.
 * Es material de prensa/redes ("el vino subió X% en 90 días según
 * Vinndex") y alimenta la página evergreen /indice y `/api/v1/indice`.
 *
 * Modos:
 *   node scripts/build-price-index.mjs --backfill
 *       Reconstruye la serie entera desde git: toma el ÚLTIMO snapshot
 *       commiteado de cada semana ISO desde la del 2026-07-06 (primera
 *       semana completa con slugs estables, cutover identidad v2 del
 *       03/07) y el snapshot vigente de `data/snapshot.json` para la
 *       semana en curso. Se corre una vez a mano.
 *   node scripts/build-price-index.mjs
 *       Modo diario (daily-scrape): agrega o reemplaza el punto de la
 *       semana en curso con `data/snapshot.json`. Un punto por semana; si
 *       ya hay uno de esta semana lo pisa. Idempotente: correrlo dos
 *       veces el mismo día deja los archivos byte a byte iguales.
 *
 * Metodología (en castellano llano, la misma que publica /indice):
 *
 *   1. PRECIO DE UNA FICHA EN UNA FECHA. Para cada vino (ficha, slug
 *      canónico) tomamos las ofertas comparables con stock: botella
 *      suelta de 750 ml (`comparable`, o volumen 750 / pack 0 cuando el
 *      snapshot no trae el campo), precio ≥ $1.000, sin precio sospechoso
 *      ni ediciones de colección, y sólo de vinotecas vigentes en
 *      `data/stores.json`. Si una vinoteca lista más de una oferta
 *      comparable del mismo vino, cuenta la más barata. El precio de la
 *      ficha es la MEDIANA entre vinotecas, y sólo entran fichas con al
 *      menos 3 vinotecas ese día (una sola tienda no es "el mercado").
 *      Las fichas que no son vino (destilados, vermú, licores, gift
 *      cards, almacén) quedan afuera.
 *
 *   2. ÍNDICE ENCADENADO. Entre dos puntos consecutivos, la variación es
 *      el promedio recortado de las variaciones (en log, sacando el 5%
 *      más extremo de cada lado) de las fichas presentes en AMBOS puntos,
 *      identificadas por slug canónico siguiendo la cadena de
 *      `data/group-merges.json`. Es un índice geométrico tipo Jevons (el
 *      que usan los IPC para agregados elementales) con recorte contra
 *      errores de scrapeo. El índice arranca en 100 en el primer punto y
 *      cada eslabón multiplica al anterior. Comparar sólo fichas comunes
 *      evita el sesgo de composición: si una semana entran 300 vinos
 *      caros nuevos, el índice no se mueve por eso. También absorbe los
 *      cambios del pipeline que fusionan o parten fichas (13/09, 26/09):
 *      una ficha que cambia de identidad simplemente no entra en ese
 *      eslabón.
 *
 *      Por qué NO la mediana de variaciones: los precios son pegajosos.
 *      Medido el 30/09 sobre eslabones reales, entre el 54% y el 63% de
 *      las fichas no cambia de precio de una semana a la otra, así que la
 *      mediana de las variaciones semanales es exactamente 0 y el índice
 *      quedaba clavado en 100 aunque el mercado se moviera. El promedio
 *      recortado sí lo ve, y el recorte del 5% por cola deja afuera los
 *      cambios de añada mal fusionados y los typos de precio. Cada
 *      eslabón guarda además cuántas fichas subieron, bajaron o no se
 *      movieron.
 *
 *   3. SEGMENTOS. Cada uno tiene su propia serie encadenada sobre su
 *      subconjunto de fichas: varietales (Malbec, Cabernet Sauvignon,
 *      Chardonnay, Torrontés, como único varietal; Blend/corte = dos o más
 *      varietales o "blend"/"corte" en el nombre, tintos), Espumantes por
 *      `type`, bandas de precio según la mediana del PRIMER punto donde
 *      aparece la ficha (hasta $10.000 / $10.000–$25.000 / más de
 *      $25.000, así un vino no cambia de banda porque subió) y el "top
 *      100": las 100 fichas con más vinotecas hoy, canasta fija.
 *
 *   4. SANIDAD. Un eslabón con menos de 200 fichas comunes (30 para un
 *      segmento) o con una variación semanal mayor a ±15% se publica
 *      igual pero marcado `lowSample: true` y avisado en consola.
 *
 *   5. LO QUE NO ES. Son precios de lista online de ~109 vinotecas, sin
 *      envío ni descuentos por medio de pago; no es el INDEC ni un índice
 *      de consumo. Es "cuánto cambió el precio publicado del mismo vino".
 *
 * Salida:
 *   data/price-index.json        chico (<200 KB), lo lee la web y la API.
 *   data/price-index-state.json  estado de trabajo para el modo diario
 *                                (mediana por ficha del ancla y del punto
 *                                actual, primer precio visto por ficha
 *                                para las bandas, canasta top 100). El
 *                                daily-scrape usa checkout shallow, así
 *                                que no puede leer snapshots viejos de git.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");
const MERGES = path.join(ROOT, "data/group-merges.json");
const STORES = path.join(ROOT, "data/stores.json");
const OUT = path.join(ROOT, "data/price-index.json");
const STATE = path.join(ROOT, "data/price-index-state.json");

/** Semana ISO del 2026-07-06 (lunes): primera semana completa post-cutover. */
const START_WEEK = "2026-W28";
const MIN_PRICE_ARS = 1000;
const MIN_STORES = 3;
const MIN_LINKS_TOTAL = 200;
const MIN_LINKS_SEGMENT = 30;
const MAX_WEEKLY_MOVE = 0.15;
/** Recorte por cola del promedio de variaciones (5% + 5%). */
const TRIM = 0.05;
const TOP_N = 100;
/** Cortes de banda ($): hasta 10k · 10k–25k · más de 25k. */
const BAND_CUTS = [10000, 25000];
const STATE_VERSION = 1;

// ── Filtro "¿es vino?" ─────────────────────────────────────────────────
// El sitio usa `isNonWineGroup` (lib/junkSlugs.ts) pero el frontend y los
// scripts no comparten código. Acá el criterio es más estricto a
// propósito: además de excluir por nombre, la ficha tiene que traer alguna
// señal de vino (catálogo, varietal, tipo o una palabra de vino en el
// nombre). Medido el 30/09 sobre las 2.979 fichas con ≥3 vinotecas: saca
// 130 más que el sitio (Cynar, Cointreau, whiskies por marca, vermú) y
// deja pasar cero de las que el sitio excluye. Unas 20 fichas de vino real
// sin varietal ni tipo se pierden (0,7%): irrelevante para una mediana.
const NON_WINE_RE =
  /\b(whisky|whiskey|whisk\w*|single\s*malt|blended\s+scotch|bourbon|vodka|gin|ginebra|ron|rhum|tequila|mezcal|cognac|brandy|fernet|vermouth|vermut|vermu|aperitivo|aperitif|aperol|campari|cynar|gancia|cinzano|martini|carpano|licor|liqueur|grappa|grapa|pisco|absenta|cerveza|beer|lager|sidra|cider|cachaca|limoncello|amaretto|baileys|jagermeister|jägermeister|sambuca|bitter|amargo|angostura|cointreau|frangelico|malibu|bacardi|hesperidina|johnnie|walker|chivas|jack\s*daniels?|ballantines?|jameson|dewars?|macallan|glenfiddich|glenlivet|talisker|lagavulin|laphroaig|jim\s*beam|bulleit|smirnoff|absolut|belvedere|beefeater|tanqueray|bombay|gordon'?s?|hendrick'?s?|bulldog|energizante|gaseosa|speed|gift\s*cards?|vouchers?|aceite\s+de\s+oliva|aceto|sacacorchos|decanter|copas?\s+de|jarra)\b/i;
const WINE_WORD_RE =
  /\b(malbec|cabernet|merlot|syrah|shiraz|bonarda|pinot|chardonnay|sauvignon|torrontes|tempranillo|tannat|petit\s*verdot|semillon|viognier|riesling|garnacha|grenache|champagne|espumante|blend|corte|assemblage|cepas|tinto|blanco|rosado|rose|brut|nature|reserva|vino|cosecha|tardia|dulce|moet|chandon|veuve|taittinger)\b/i;
const BOURBON_MATURATION_RE = /\bbourbon\s+(barrel|cask)\b/g;

function stripAccentsLower(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function isWineGroup(g) {
  const n = stripAccentsLower(g.canonicalName).replace(BOURBON_MATURATION_RE, " ");
  if (NON_WINE_RE.test(n)) return false;
  if (g.catalogId) return true;
  if (Array.isArray(g.varietals) && g.varietals.length > 0) return true;
  if (g.type) return true;
  return WINE_WORD_RE.test(n);
}

// ── Helpers de fecha ───────────────────────────────────────────────────

/** Fecha YYYY-MM-DD en hora Argentina (UTC-3, sin horario de verano). */
function arDate(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error(`Fecha inválida: ${iso}`);
  return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Semana ISO "YYYY-Www" de una fecha YYYY-MM-DD. */
function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // jueves de esa semana
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Thu = new Date(jan4);
  week1Thu.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
  const week = 1 + Math.round((d - week1Thu) / (7 * 86400 * 1000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

// ── Helpers numéricos ──────────────────────────────────────────────────

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/**
 * Promedio recortado: ordena, saca `trim` (fracción) de cada extremo y
 * promedia lo que queda. Con trim=0.05 sobre 2.400 variaciones se van las
 * 120 más altas y las 120 más bajas.
 */
function trimmedMean(values, trim) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const k = Math.floor(s.length * trim);
  const t = s.slice(k, s.length - k);
  if (t.length === 0) return null;
  return t.reduce((a, b) => a + b, 0) / t.length;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── Identidad ──────────────────────────────────────────────────────────

function loadMerges() {
  if (!fs.existsSync(MERGES)) return {};
  const raw = JSON.parse(fs.readFileSync(MERGES, "utf8"));
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** Sigue la cadena viejo → vigente (con freno anti-ciclo). */
function canonicalSlug(slug, merges) {
  let cur = slug;
  for (let i = 0; i < 20; i++) {
    const next = merges[cur];
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

const VARIETAL_ALIASES = { cabernet: "Cabernet Sauvignon" };
function normalizeVarietals(vs) {
  const out = [];
  for (const v of Array.isArray(vs) ? vs : []) {
    if (typeof v !== "string") continue;
    const n = VARIETAL_ALIASES[v.trim().toLowerCase()] ?? v.trim();
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

// ── Canasta de un snapshot ─────────────────────────────────────────────

function isComparableOffer(o) {
  if (typeof o.comparable === "boolean") return o.comparable;
  return o.volumeMl === 750 && (o.pack ?? 0) === 0 && !o.estuche && !o.copa;
}

/**
 * Map slugCanónico → { median, stores, varietals, type, name, blendName }
 * con la base de precio del paso 1 de la metodología.
 */
function buildBasket(snapshot, merges, activeStores) {
  const acc = new Map();
  for (const g of snapshot.productGroups ?? []) {
    if (!g || typeof g.groupSlug !== "string") continue;
    if (!isWineGroup(g)) continue;
    const slug = canonicalSlug(g.groupSlug, merges);
    let e = acc.get(slug);
    if (!e) {
      e = {
        perStore: new Map(),
        varietals: normalizeVarietals(g.varietals),
        type: g.type ?? null,
        name: g.canonicalName ?? "",
        stores: 0,
      };
      acc.set(slug, e);
    } else if (e.varietals.length === 0 && Array.isArray(g.varietals)) {
      e.varietals = normalizeVarietals(g.varietals);
      if (!e.type && g.type) e.type = g.type;
    }
    for (const o of g.offers ?? []) {
      if (!o || !o.inStock) continue;
      if (typeof o.priceArs !== "number" || o.priceArs < MIN_PRICE_ARS) continue;
      if (o.priceSuspect || o.isCollector) continue;
      if (!activeStores.has(o.storeSlug)) continue;
      if (!isComparableOffer(o)) continue;
      const prev = e.perStore.get(o.storeSlug);
      if (prev == null || o.priceArs < prev) e.perStore.set(o.storeSlug, o.priceArs);
    }
  }
  const basket = new Map();
  for (const [slug, e] of acc) {
    if (e.perStore.size < MIN_STORES) continue;
    basket.set(slug, {
      median: median([...e.perStore.values()]),
      stores: e.perStore.size,
      varietals: e.varietals,
      type: e.type,
      name: e.name,
    });
  }
  return basket;
}

// ── Segmentos ──────────────────────────────────────────────────────────

const BLEND_NAME_RE = /\b(blend|corte|assemblage)\b/i;
const RED_OR_UNKNOWN = new Set(["Tinto", null]);

function isSingleVarietal(e, name) {
  return e.type !== "Espumante" && e.varietals.length === 1 && e.varietals[0] === name;
}
function isBlend(e) {
  if (!RED_OR_UNKNOWN.has(e.type)) return false;
  if (e.varietals.length >= 2) return true;
  return e.varietals.length === 0 && BLEND_NAME_RE.test(stripAccentsLower(e.name));
}
function bandOf(firstMedian) {
  if (firstMedian == null) return -1;
  if (firstMedian <= BAND_CUTS[0]) return 0;
  if (firstMedian <= BAND_CUTS[1]) return 1;
  return 2;
}

/** ctx: { firstSeen: Map slug→median del primer punto, top100: Set } */
const SEGMENTS = [
  { key: "total", label: "Todos los vinos", test: () => true },
  { key: "malbec", label: "Malbec", test: (e) => isSingleVarietal(e, "Malbec") },
  {
    key: "cabernet-sauvignon",
    label: "Cabernet Sauvignon",
    test: (e) => isSingleVarietal(e, "Cabernet Sauvignon"),
  },
  { key: "blend", label: "Blend / corte (tintos)", test: (e) => isBlend(e) },
  { key: "chardonnay", label: "Chardonnay", test: (e) => isSingleVarietal(e, "Chardonnay") },
  { key: "torrontes", label: "Torrontés", test: (e) => isSingleVarietal(e, "Torrontés") },
  { key: "espumantes", label: "Espumantes", test: (e) => e.type === "Espumante" },
  {
    key: "banda-hasta-10k",
    label: "Hasta $10.000",
    test: (e, slug, ctx) => bandOf(ctx.firstSeen.get(slug)) === 0,
  },
  {
    key: "banda-10k-25k",
    label: "$10.000 a $25.000",
    test: (e, slug, ctx) => bandOf(ctx.firstSeen.get(slug)) === 1,
  },
  {
    key: "banda-mas-25k",
    label: "Más de $25.000",
    test: (e, slug, ctx) => bandOf(ctx.firstSeen.get(slug)) === 2,
  },
  {
    key: "top-100",
    label: "Top 100 (los de más vinotecas)",
    test: (e, slug, ctx) => ctx.top100.has(slug),
  },
];

/**
 * Eslabón de un segmento entre `prevMedians` (Map slug→median del punto
 * anterior) y `basket` (punto actual). Devuelve factor, fichas comunes y
 * fichas del segmento en el punto actual.
 */
function chainLink(segment, prevMedians, basket, ctx) {
  const logs = [];
  let fichas = 0;
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const [slug, e] of basket) {
    if (!segment.test(e, slug, ctx)) continue;
    fichas++;
    const p = prevMedians ? prevMedians.get(slug) : undefined;
    if (p == null || p <= 0 || e.median <= 0) continue;
    const r = Math.log(e.median / p);
    logs.push(r);
    if (r > 0) up++;
    else if (r < 0) down++;
    else flat++;
  }
  const m = trimmedMean(logs, TRIM);
  return { factor: m == null ? 1 : Math.exp(m), links: logs.length, fichas, up, down, flat };
}

/**
 * Calcula el punto (todas las series) contra el ancla. Muta `series`
 * (Map key → { label, points[] }) agregando el punto, y `firstSeen`.
 */
function appendPoint({ series, basket, prevMedians, date, week, ctx, isBase }) {
  // Primer precio visto por ficha (bandas). Nunca se pisa.
  for (const [slug, e] of basket) {
    if (!ctx.firstSeen.has(slug)) ctx.firstSeen.set(slug, e.median);
  }
  for (const seg of SEGMENTS) {
    let s = series.get(seg.key);
    if (!s) {
      s = { label: seg.label, points: [] };
      series.set(seg.key, s);
    }
    const { factor, links, fichas, up, down, flat } = chainLink(seg, prevMedians, basket, ctx);
    const prevPoint = s.points[s.points.length - 1];
    const point = { date, week, index: 100, change: null, links: null, fichas };
    if (isBase || !prevPoint) {
      point.index = 100;
    } else {
      point.index = round2(prevPoint.index * factor);
      point.change = round2((factor - 1) * 100);
      point.links = links;
      point.up = up;
      point.down = down;
      point.flat = flat;
      const minLinks = seg.key === "total" ? MIN_LINKS_TOTAL : MIN_LINKS_SEGMENT;
      const absurd = Math.abs(factor - 1) > MAX_WEEKLY_MOVE;
      if (links < minLinks || absurd) {
        point.lowSample = true;
        console.warn(
          `  ⚠ ${seg.key} ${prevPoint.date} → ${date}: ${links} fichas comunes` +
            (absurd ? `, variación ${point.change}%` : "") +
            " (lowSample)",
        );
      }
    }
    s.points.push(point);
  }
}

function pickTop100(basket) {
  return [...basket.entries()]
    .sort((a, b) => b[1].stores - a[1].stores || a[0].localeCompare(b[0]))
    .slice(0, TOP_N)
    .map(([slug]) => slug);
}

// ── Headline ───────────────────────────────────────────────────────────

/** Variación del total contra el punto más cercano a `days` días atrás. */
function changeOver(points, days) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const target = addDays(last.date, -days);
  let ref = points[0];
  let best = Infinity;
  for (const p of points) {
    if (p === last) continue;
    const d = Math.abs(diffDays(target, p.date));
    if (d < best) {
      best = d;
      ref = p;
    }
  }
  return {
    pct: round2((last.index / ref.index - 1) * 100),
    from: ref.date,
    to: last.date,
    days: diffDays(ref.date, last.date),
  };
}

function buildOutput({ series, generatedAt, storeCount, top100, notes }) {
  const total = series.get("total");
  const points = total.points;
  const first = points[0];
  const last = points[points.length - 1];
  const segments = {};
  for (const seg of SEGMENTS) {
    if (seg.key === "total") continue;
    const s = series.get(seg.key);
    segments[seg.key] = { label: s.label, points: s.points };
    if (seg.key === "top-100") segments[seg.key].basket = top100;
  }
  return {
    generatedAt,
    name: "Índice Vinndex de precios del vino",
    url: "https://vinndex.com.ar/indice",
    api: "https://vinndex.com.ar/api/v1/indice",
    base: { date: first.date, index: 100 },
    latest: { date: last.date, index: last.index, fichas: last.fichas, links: last.links },
    coverage: {
      stores: storeCount,
      minStoresPerWine: MIN_STORES,
      frequency: "semanal (último snapshot de cada semana ISO)",
      currency: "ARS",
    },
    headline: {
      d30: changeOver(points, 30),
      d90: changeOver(points, 90),
      sinceStart: {
        pct: round2((last.index / first.index - 1) * 100),
        from: first.date,
        to: last.date,
        days: diffDays(first.date, last.date),
      },
    },
    method: {
      resumen:
        "Mediana del precio online de cada vino entre las vinotecas que lo venden; el índice encadena semana a semana el promedio recortado de las variaciones de los vinos presentes en ambas semanas. Base 100 = " +
        first.date +
        ".",
      pasos: [
        `Precio de un vino en una fecha: mediana entre vinotecas de la botella suelta de 750 ml con stock (precio ≥ $${MIN_PRICE_ARS.toLocaleString("es-AR")}, sin precios sospechosos ni ediciones de colección). Sólo entran vinos vendidos por al menos ${MIN_STORES} vinotecas ese día; destilados, vermú y licores quedan afuera.`,
        "Índice encadenado: entre dos semanas consecutivas, la variación es el promedio recortado (sacando el 5% más extremo de cada lado) de las variaciones de los vinos presentes en ambas semanas, y cada semana multiplica a la anterior desde una base 100. Así no pesan los vinos que entran o salen del catálogo ni las fichas que el pipeline fusiona o parte. No usamos la mediana porque más de la mitad de los vinos no cambia de precio en una semana y daría siempre cero.",
        "Segmentos: cada varietal, banda de precio y el top 100 tienen su propia serie encadenada sobre su subconjunto de vinos. La banda se fija con el primer precio visto de cada vino, así un vino no cambia de banda porque subió.",
        `Sanidad: un eslabón con menos de ${MIN_LINKS_TOTAL} vinos comunes (${MIN_LINKS_SEGMENT} en un segmento) o con una variación mayor a ±${MAX_WEEKLY_MOVE * 100}% semanal se publica igual, marcado como muestra baja.`,
        "Son precios de lista publicados online, sin envío ni descuentos por medio de pago. No mide consumo ni canasta: mide cuánto cambió el precio publicado del mismo vino.",
      ],
    },
    notes,
    points,
    segments,
  };
}

// ── Estado ─────────────────────────────────────────────────────────────

function mediansToObject(basket) {
  const o = {};
  for (const [slug, e] of [...basket.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    o[slug] = e.median;
  }
  return o;
}

/** Re-canonicaliza un objeto slug→median con el mapa de merges actual. */
function remapMedians(obj, merges) {
  const grouped = new Map();
  for (const [slug, m] of Object.entries(obj ?? {})) {
    if (typeof m !== "number") continue;
    const c = canonicalSlug(slug, merges);
    const arr = grouped.get(c) ?? [];
    arr.push(m);
    grouped.set(c, arr);
  }
  const out = new Map();
  for (const [slug, arr] of grouped) out.set(slug, median(arr));
  return out;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadActiveStores() {
  const stores = readJson(STORES);
  return new Set((Array.isArray(stores) ? stores : []).map((s) => s.slug));
}

// ── Git ────────────────────────────────────────────────────────────────

function gitSnapshotCommits() {
  const out = execFileSync(
    "git",
    ["log", "--format=%H|%aI", "--", "data/snapshot.json"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, iso] = line.split("|");
      return { sha, date: arDate(iso) };
    });
}

function gitReadSnapshot(sha) {
  const raw = execFileSync("git", ["show", `${sha}:data/snapshot.json`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

// ── Modos ──────────────────────────────────────────────────────────────

function printSeries(output) {
  console.log("\nSerie total (fecha → índice · fichas comunes del eslabón · fichas en el punto):");
  for (const p of output.points) {
    console.log(
      `  ${p.date}  ${p.index.toFixed(2).padStart(7)}  ` +
        `${p.change == null ? "   base " : `${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%`.padStart(8)}  ` +
        `links=${p.links ?? "-"}  fichas=${p.fichas}` +
        (p.links != null ? `  (↑${p.up} ↓${p.down} =${p.flat})` : "") +
        `${p.lowSample ? "  ⚠ lowSample" : ""}`,
    );
  }
  const h = output.headline;
  const fmt = (c) => (c ? `${c.pct >= 0 ? "+" : ""}${c.pct}% (${c.days} días, desde ${c.from})` : "n/a");
  console.log(`\nHeadline: 30 días ${fmt(h.d30)} · 90 días ${fmt(h.d90)} · desde el inicio ${fmt(h.sinceStart)}`);
}

function backfill() {
  const merges = loadMerges();
  const activeStores = loadActiveStores();
  const current = readJson(SNAPSHOT);
  const currentDate = arDate(current.generatedAt);
  const currentWeek = isoWeek(currentDate);

  // Último commit de cada semana ISO (git log viene del más nuevo al más
  // viejo: el primero que vemos de cada semana es el último de la semana).
  const commits = gitSnapshotCommits();
  const lastOfWeek = new Map();
  for (const c of commits) {
    const w = isoWeek(c.date);
    if (w < START_WEEK || w >= currentWeek) continue;
    if (!lastOfWeek.has(w)) lastOfWeek.set(w, c);
  }
  const weeks = [...lastOfWeek.keys()].sort();
  console.log(
    `Backfill: ${weeks.length} semanas desde git (${weeks[0]} → ${weeks[weeks.length - 1]}) + snapshot vigente (${currentDate}, ${currentWeek}).`,
  );

  // Top 100: canasta fija elegida sobre el snapshot de HOY.
  const currentBasket = buildBasket(current, merges, activeStores);
  const top100 = pickTop100(currentBasket);
  const ctx = { firstSeen: new Map(), top100: new Set(top100) };
  const series = new Map();
  const notes = [];

  let prevMedians = null;
  let prevInfo = null;
  let i = 0;
  for (const w of weeks) {
    const c = lastOfWeek.get(w);
    process.stdout.write(`  [${++i}/${weeks.length + 1}] ${w} ${c.sha.slice(0, 7)} (${c.date}) … `);
    const snap = gitReadSnapshot(c.sha);
    const date = arDate(snap.generatedAt ?? `${c.date}T12:00:00Z`);
    const basket = buildBasket(snap, merges, activeStores);
    console.log(`${basket.size} fichas con ≥${MIN_STORES} vinotecas`);
    appendPoint({ series, basket, prevMedians, date, week: w, ctx, isBase: prevMedians === null });
    const medians = new Map([...basket].map(([s, e]) => [s, e.median]));
    prevInfo = { date, week: w, medians };
    prevMedians = medians;
  }

  process.stdout.write(`  [${++i}/${weeks.length + 1}] ${currentWeek} data/snapshot.json (${currentDate}) … `);
  console.log(`${currentBasket.size} fichas con ≥${MIN_STORES} vinotecas`);
  appendPoint({
    series,
    basket: currentBasket,
    prevMedians,
    date: currentDate,
    week: currentWeek,
    ctx,
    isBase: prevMedians === null,
  });

  const output = buildOutput({
    series,
    generatedAt: current.generatedAt,
    storeCount: activeStores.size,
    top100,
    notes,
  });
  writeJson(OUT, output);

  const state = {
    version: STATE_VERSION,
    startWeek: START_WEEK,
    anchor: prevInfo
      ? { date: prevInfo.date, week: prevInfo.week, medians: Object.fromEntries([...prevInfo.medians].sort()) }
      : null,
    current: {
      date: currentDate,
      week: currentWeek,
      medians: mediansToObject(currentBasket),
    },
    firstSeen: Object.fromEntries([...ctx.firstSeen].sort()),
    top100,
  };
  writeJson(STATE, state);

  printSeries(output);
  console.log(
    `\n✓ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB) · ${path.relative(ROOT, STATE)} (${(fs.statSync(STATE).size / 1024).toFixed(1)} KB)`,
  );
}

function daily() {
  if (!fs.existsSync(STATE) || !fs.existsSync(OUT)) {
    console.error(
      "No existe data/price-index-state.json o data/price-index.json. Corré primero: node scripts/build-price-index.mjs --backfill",
    );
    process.exit(1);
  }
  const state = readJson(STATE);
  const existing = readJson(OUT);
  if (state.version !== STATE_VERSION) {
    console.error(`Estado con versión ${state.version}, esperaba ${STATE_VERSION}. Corré --backfill.`);
    process.exit(1);
  }
  const merges = loadMerges();
  const activeStores = loadActiveStores();
  const snap = readJson(SNAPSHOT);
  const date = arDate(snap.generatedAt);
  const week = isoWeek(date);

  // Ancla = último punto de una semana anterior a la de hoy. Si el punto
  // "current" del estado es de esta misma semana, se reemplaza; si es de
  // una semana anterior, pasa a ser el ancla.
  let anchor = state.anchor;
  if (state.current && state.current.week < week) anchor = state.current;
  if (!anchor) {
    console.error("El estado no tiene un punto ancla. Corré --backfill.");
    process.exit(1);
  }
  if (anchor.week >= week) {
    console.error(
      `El snapshot vigente (${date}, ${week}) no es posterior al ancla (${anchor.date}, ${anchor.week}). Nada que hacer.`,
    );
    process.exit(0);
  }

  const basket = buildBasket(snap, merges, activeStores);
  const prevMedians = remapMedians(anchor.medians, merges);
  const top100 = (state.top100 ?? []).map((s) => canonicalSlug(s, merges));
  const ctx = {
    firstSeen: remapMedians(state.firstSeen, merges),
    top100: new Set(top100),
  };
  console.log(
    `Modo diario: ${date} (${week}) contra ancla ${anchor.date} (${anchor.week}) · ${basket.size} fichas con ≥${MIN_STORES} vinotecas`,
  );

  // Reconstruimos las series sin el punto de esta semana (si existía).
  const series = new Map();
  const drop = (pts) => (pts ?? []).filter((p) => p.week < week);
  series.set("total", { label: "Todos los vinos", points: drop(existing.points) });
  for (const seg of SEGMENTS) {
    if (seg.key === "total") continue;
    const s = existing.segments?.[seg.key];
    series.set(seg.key, { label: seg.label, points: drop(s?.points) });
  }
  appendPoint({ series, basket, prevMedians, date, week, ctx, isBase: false });

  const output = buildOutput({
    series,
    generatedAt: snap.generatedAt,
    storeCount: activeStores.size,
    top100,
    notes: existing.notes ?? [],
  });
  writeJson(OUT, output);

  const newState = {
    version: STATE_VERSION,
    startWeek: state.startWeek ?? START_WEEK,
    anchor: { date: anchor.date, week: anchor.week, medians: Object.fromEntries([...prevMedians].sort()) },
    current: { date, week, medians: mediansToObject(basket) },
    firstSeen: Object.fromEntries([...ctx.firstSeen].sort()),
    top100,
  };
  writeJson(STATE, newState);

  printSeries(output);
  console.log(`\n✓ ${path.relative(ROOT, OUT)} actualizado (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
}

export {
  buildBasket,
  chainLink,
  canonicalSlug,
  isWineGroup,
  isoWeek,
  arDate,
  loadMerges,
  loadActiveStores,
  gitSnapshotCommits,
  gitReadSnapshot,
  median,
  SEGMENTS,
};

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--backfill")) backfill();
  else daily();
}
