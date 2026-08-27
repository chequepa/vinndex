#!/usr/bin/env node
/**
 * build-groups-v2.mjs — Identidad v2, paso 2: agrupar ofertas por VINO.
 *
 * Reemplaza la cadena Stage 0→6.5 (clave por bolsa-de-tokens + 7 capas de
 * merge/split que se corrigen entre sí) por UN paso determinístico:
 *
 *   oferta → parseOffer() → asignación contra data/wine-catalog.json →
 *   página por vino, variantes por formato adentro.
 *
 * Reglas:
 *   · VINO = bodega + línea + varietal + color/dulzor + expresión
 *     (parcela/edición sólo si el catálogo dice que distinguen).
 *   · La comparación de precios de la ficha usa SOLO ofertas comparables:
 *     botella suelta de 750ml, sin estuche/copa, con stock, no-collector.
 *     El resto (375, magnum, cajas, estuches) queda en `variants`.
 *   · Slugs: se PRESERVA el slug v1 dominante de cada vino (SEO) — un
 *     vino nuevo o separado de una quimera recibe slug nuevo; los slugs
 *     v1 absorbidos van al mapa de redirects.
 *
 * Modo shadow: NO toca data/snapshot.json. Escribe:
 *   --out    → snapshot v2 (default data/snapshot-v2.json)
 *   --report → métricas + casos de estudio (default data/identity-v2-report.json)
 *
 * Uso:
 *   node scripts/build-groups-v2.mjs [--offers data/offers.json]
 *        [--out data/snapshot-v2.json] [--report data/identity-v2-report.json]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseOffer,
  fallbackWineKey,
  isComparable,
  stripAccents,
  normalizeBodegaKey,
} from "./lib-offer-identity.mjs";
import { colorOf, hardConflict, lineRelation } from "./stage4-token-merge.mjs";
import { applyManualOverlay } from "./lib-catalog-manual.mjs";
import { toEan } from "./lib-ean.mjs";

// ── Compat v1: facets de región y varietal con los MISMOS nombres display
// que usaba build-groups.mjs — /region/* y /varietal/* filtran por estos
// strings exactos. (Listas copiadas de build-groups.mjs, que se retira.)
const V1_VARIETALS = [
  { name: "Malbec", re: /\bmalbec\b/i },
  { name: "Cabernet Sauvignon", re: /\bcabernet\s+sauvignon\b/i },
  { name: "Cabernet Franc", re: /\bcabernet\s+franc\b/i },
  { name: "Cabernet", re: /\bcabernet\b/i },
  { name: "Chardonnay", re: /\bchardonnay\b/i },
  { name: "Sauvignon Blanc", re: /\bsauvignon\s+blanc\b/i },
  { name: "Merlot", re: /\bmerlot\b/i },
  { name: "Bonarda", re: /\bbonarda\b/i },
  { name: "Pinot Noir", re: /\bpinot\s+noir\b/i },
  { name: "Pinot Grigio", re: /\bpinot\s+grigio\b/i },
  { name: "Torrontés", re: /\btorront[eé]s\b/i },
  { name: "Syrah", re: /\b(syrah|shiraz)\b/i },
  { name: "Tempranillo", re: /\btempranillo\b/i },
  { name: "Petit Verdot", re: /\bpetit\s+verdot\b/i },
  { name: "Riesling", re: /\briesling\b/i },
  { name: "Viognier", re: /\bviognier\b/i },
  { name: "Semillón", re: /\bsemill[oó]n\b/i },
  { name: "Tannat", re: /\btannat\b/i },
  { name: "Barbera", re: /\bbarbera\b/i },
  { name: "Sangiovese", re: /\bsangiovese\b/i },
  { name: "Nebbiolo", re: /\bnebbiolo\b/i },
  { name: "Criolla", re: /\bcriolla\b/i },
  { name: "Moscatel", re: /\bmoscatel\b/i },
  { name: "Gewürztraminer", re: /\bgew[uü]rztraminer\b/i },
  { name: "Verdejo", re: /\bverdejo\b/i },
  { name: "Albariño", re: /\balbari[nñ]o\b/i },
];
const V1_REGIONS = [
  { name: "Mendoza", re: /\bmendoza\b/i },
  { name: "Valle de Uco", re: /\b(valle\s+de\s+uco|uco\s+valley|tupungato|vista\s+flores|gualtallary|tunuyan|altamira)\b/i },
  { name: "Luján de Cuyo", re: /\b(luj[aá]n\s+de\s+cuyo|agrelo|vistalba|perdriel)\b/i },
  { name: "Maipú", re: /\bmaip[uú]\b/i },
  { name: "San Juan", re: /\bsan\s+juan\b/i },
  { name: "Salta", re: /\b(salta|cafayate|valles\s+calchaqu|molinos|colom[eé])\b/i },
  { name: "Patagonia", re: /\b(patagonia|r[ií]o\s+negro|neuqu[eé]n|chubut)\b/i },
  { name: "La Rioja", re: /\bla\s+rioja\b/i },
  { name: "Catamarca", re: /\bcatamarca\b/i },
];
// Aliases de marca (mismo dict que build-groups) para lookupear
// data/bodega-regions.json, cuyas keys vienen de normalizeBrandAlias.
const V1_BRAND_ALIASES = [
  ["zucardi", "zuccardi"], ["familia zuccardi", "zuccardi"], ["familia zucardi", "zuccardi"],
  ["cheval des andes", "cheval"], ["bodega catena zapata", "catena"], ["catena zapata", "catena"],
  ["bodega norton", "norton"], ["bodegas norton", "norton"], ["bodega trapiche", "trapiche"],
  ["bodega salentein", "salentein"], ["bodegas salentein", "salentein"], ["luigi bosca", "luigibosca"],
  ["el esteco", "elesteco"], ["finca las moras", "lasmoras"], ["las moras", "lasmoras"],
  ["don david", "dondavid"], ["baron b", "baronb"],
];
function brandRegionKey(bodega) {
  if (!bodega) return null;
  let s = stripAccents(String(bodega)).toLowerCase()
    .replace(/^bodega(s)?\s+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [from, to] of V1_BRAND_ALIASES) {
    if (s === from) { s = to; break; }
  }
  return s;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
// --publish = CUTOVER: escribe data/snapshot.json (preservando la
// metadata de stores del snapshot vigente), aplica los redirects a
// data/group-merges.json y persiste el registro de slugs. Sin el flag
// corre en shadow (snapshot-v2.json, no toca lo publicado).
const PUBLISH = args.includes("--publish");
const OFFERS_PATH = argVal("--offers", resolve(ROOT, "data/offers.json"));
const OUT_PATH = PUBLISH
  ? resolve(ROOT, "data/snapshot.json")
  : argVal("--out", resolve(ROOT, "data/snapshot-v2.json"));
const REPORT_PATH = argVal("--report", resolve(ROOT, "data/identity-v2-report.json"));
const CATALOG_PATH = resolve(ROOT, "data/wine-catalog.json");
const SLUG_REGISTRY_PATH = resolve(ROOT, "data/wine-slugs.json");
const MERGES_PATH = resolve(ROOT, "data/group-merges.json");
const MANUAL_REDIRECTS_PATH = resolve(ROOT, "data/redirects-manual.json");

function norm(s) {
  return stripAccents(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}
function slugify(s) {
  return norm(s).replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

// ── Catálogo → índices de asignación ──
function buildCatalogIndex(catalog) {
  const exact = new Map();   // bodega|linea-alias|varietal|color|dulzor → wine
  const byLine = new Map();  // bodega|linea-alias → [wines]
  for (const w of catalog.wines ?? []) {
    const b = normalizeBodegaKey(w.bodega);
    for (const alias of w.lineAliases?.length ? w.lineAliases : [""]) {
      const lineKey = alias.split(" ").filter(Boolean).sort().join(" ");
      exact.set(`${b}|${lineKey}|${w.varietal ?? ""}|${w.color ?? ""}|${w.dulzor ?? ""}`, w);
      const lk = `${b}|${lineKey}`;
      if (!byLine.has(lk)) byLine.set(lk, []);
      if (!byLine.get(lk).includes(w)) byLine.get(lk).push(w);
    }
  }
  return { exact, byLine };
}

/** Asigna una oferta parseada a un vino del catálogo, o null. */
function assign(p, idx) {
  if (!p.bodega) return null;
  const b = normalizeBodegaKey(p.bodega);
  const lineKey = p.lineTokens.join(" "); // ya vienen sorted
  const w = idx.exact.get(`${b}|${lineKey}|${p.varietal ?? ""}|${p.color ?? ""}|${p.dulzor ?? ""}`);
  if (w) return w;
  // Herencia de varietal: oferta sin varietal en el nombre + línea con
  // UN solo vino en catálogo → es ese ("Zuccardi Concreto" → Concreto
  // Malbec). Con 2+ varietales de la línea es ambiguo → no asignamos.
  if (!p.varietal) {
    const cands = idx.byLine.get(`${b}|${lineKey}`) ?? [];
    if (cands.length === 1) return cands[0];
    // mismo color al menos
    const sameColor = cands.filter((w2) => !p.color || !w2.color || w2.color === p.color);
    if (sameColor.length === 1) return sameColor[0];
  }
  return null;
}

/** Clave de grupo final (vino + expresión residual). */
/**
 * Colapsa discriminadores contenidos: "altamira" ⊂ "paraje altamira" son
 * EL MISMO paraje escrito distinto por tiendas distintas — sin esto,
 * Polígonos Paraje Altamira (19 tiendas) y Polígonos Altamira (5) eran
 * dos páginas. Se queda la frase más larga.
 */
function collapseContainedPhrases(phrases) {
  const kept = [];
  for (const ph of [...phrases].sort((a, b) => b.length - a.length)) {
    const toks = new Set(ph.split(" "));
    const contained = kept.some((k) => {
      const kt = new Set(k.split(" "));
      return [...toks].every((t) => kt.has(t));
    });
    if (!contained) kept.push(ph);
  }
  return kept.sort();
}

function wineKeyOf(p, w) {
  if (!w) return { key: `fb|${fallbackWineKey(p)}`, expr: null };
  const dropP = new Set((w.parajesNoDistinguen ?? []).map(norm));
  const dropT = new Set((w.tiersNoDistinguen ?? []).map(norm));
  const residual = p.discriminadores.filter((d) => !dropP.has(norm(d)) && !dropT.has(norm(d)));
  // "paraje altamira" y "altamira" son el mismo discriminador — si el
  // catálogo dropea la frase, dropea también sus tokens sueltos.
  const dropTokens = new Set([...dropP].flatMap((d) => d.split(" ")));
  const residual2 = residual.filter((d) => !d.split(" ").every((t) => dropTokens.has(t)));
  const exprPhrases = collapseContainedPhrases(residual2.map(norm));
  // Ediciones que el catálogo declara que NO distinguen. Hasta acá las
  // ediciones se colaban enteras a la clave, sin pasar por las listas de
  // drop — o sea el catálogo podía decir "este paraje no distingue" pero
  // no "este número no distingue". Es el caso del Colón Frutos Rojos: el
  // nombre de producto de Jumbo termina en "7" y eso solo abría una
  // ficha aparte. Cortar dígitos finales por regla general NO es opción
  // (rompe Tonel #248 y Alma 4), así que se declara por vino.
  const dropE = new Set((w.edicionesNoDistinguen ?? []).map(norm));
  const ediciones = p.ediciones.filter((e) => !dropE.has(norm(e)));
  const expr = [...exprPhrases, ...ediciones].sort().join(" ");
  if (!expr) return { key: w.id, expr: null };
  return { key: `${w.id}::${slugify(expr)}`, expr };
}

function main() {
  const raw = JSON.parse(readFileSync(OFFERS_PATH, "utf8"));
  let offers = raw.offers ?? raw.products ?? raw;
  // Dedup global por (tienda|url|nombre) — los merges v1 podían duplicar
  // la misma oferta en más de un grupo; acá una oferta = un registro.
  {
    const seen = new Set();
    const deduped = [];
    for (const o of offers) {
      const k = `${o.storeSlug}|${o.externalUrl ?? ""}|${o.name ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(o);
    }
    if (deduped.length < offers.length) {
      console.log(`  dedup: ${offers.length - deduped.length} ofertas repetidas descartadas`);
    }
    offers = deduped;
  }
  const catalog = existsSync(CATALOG_PATH)
    ? JSON.parse(readFileSync(CATALOG_PATH, "utf8"))
    : { wines: [] };
  // El overlay curado a mano se aplica también acá, no sólo en
  // build-wine-catalog: ese paso corre con continue-on-error y se saltea
  // entero si falta OPENAI_API_KEY. Sin esto, un día que el catálogo no
  // se reconstruya las correcciones humanas no se aplicarían y las
  // fichas curadas se volverían a partir en silencio. Es idempotente.
  catalog.wines ??= [];
  const manual = applyManualOverlay(catalog.wines);
  const idx = buildCatalogIndex(catalog);
  console.log(
    `v2 grouping — ${offers.length} ofertas · catálogo ${catalog.wines.length} vinos` +
      (manual.total ? ` (overlay manual: ${manual.added}+ ${manual.patched}~ ${manual.removed}-)` : ""),
  );

  // ── Inferencia de marca por corpus (port del Stage 1 de v1) ──
  // Muchas tiendas no mandan brand. Sin esto el mismo vino se parte en
  // clave-con-bodega vs clave-sin-bodega según qué tienda lo liste
  // (multi-tienda cayó ~20% en el primer run fresco del cutover). Dos
  // pasadas, ambas conservadoras:
  //   1. nombre-contiene-marca: si el nombre menciona una marca conocida
  //      del corpus con word-boundary, la oferta la hereda.
  //   2. token-de-línea → marca: un token que aparece en ≥3 ofertas de
  //      EXACTAMENTE una marca es distintivo de esa marca ("concreto" →
  //      Zuccardi); las ofertas sin marca que lo tienen la heredan.
  {
    const GENERIC_BRAND = new Set([
      "vino", "vinos", "wine", "wines", "bodega", "bodegas", "familia",
      "reserva", "estate", "cellars", "finca", "winery",
    ]);
    const brandCanonical = new Map(); // lower → casing original
    for (const o of offers) {
      const b = (o.brand ?? "").trim();
      if (b.length < 3) continue;
      const lower = stripAccents(b).toLowerCase();
      if (!brandCanonical.has(lower)) brandCanonical.set(lower, b);
    }
    const entries = [...brandCanonical.entries()]
      .filter(([lower]) => {
        const words = lower.split(/\s+/).filter(Boolean);
        return !(words.length === 1 && GENERIC_BRAND.has(words[0]));
      })
      .sort((a, b) => b[0].length - a[0].length)
      .map(([lower, original]) => ({
        original,
        re: new RegExp(
          `\\b${lower.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
          "i",
        ),
      }));
    let inferred1 = 0;
    for (const o of offers) {
      if (o.brand) continue;
      const name = stripAccents(o.name ?? "").toLowerCase();
      if (!name) continue;
      for (const e of entries) {
        if (e.re.test(name)) { o.brand = e.original; inferred1++; break; }
      }
    }
    // Pasada 2: tokens de línea distintivos de una sola marca.
    const tokenBrand = new Map(); // token → Map(brandLower → count)
    for (const o of offers) {
      if (!o.brand) continue;
      const bl = stripAccents(o.brand).toLowerCase().trim();
      if (bl.length < 3) continue;
      const brandToks = new Set(bl.split(/\s+/).filter((t) => t.length >= 3));
      const p = parseOffer(o.name, null);
      for (const t of p.lineTokens) {
        if (t.length < 4 || brandToks.has(t)) continue;
        if (!tokenBrand.has(t)) tokenBrand.set(t, new Map());
        const m = tokenBrand.get(t);
        m.set(bl, (m.get(bl) ?? 0) + 1);
      }
    }
    const distinctive = new Map();
    for (const [t, m] of tokenBrand) {
      if (m.size !== 1) continue;
      const [[bl, n]] = m;
      if (n >= 3) distinctive.set(t, brandCanonical.get(bl) ?? bl);
    }
    let inferred2 = 0;
    for (const o of offers) {
      if (o.brand) continue;
      const p = parseOffer(o.name, null);
      for (const t of p.lineTokens) {
        const b = distinctive.get(t);
        if (b) { o.brand = b; inferred2++; break; }
      }
    }
    console.log(`  inferencia de marca: +${inferred1} por nombre, +${inferred2} por línea distintiva (${distinctive.size} tokens)`);
  }

  // Snapshot vigente: fuente de (a) el mapping URL→slug v1 para preservar
  // slugs indexados, y (b) la metadata de stores/counts que el publish
  // debe conservar (el frontend tipa Snapshot con storeCount/stores/etc).
  // Se lee ANTES de escribir porque en modo publish lo pisamos.
  let prevSnapshotMeta = null;
  {
    const snapPath = resolve(ROOT, "data/snapshot.json");
    if (existsSync(snapPath)) {
      try {
        const snap = JSON.parse(readFileSync(snapPath, "utf8"));
        const { productGroups: _g, products: _p, ...meta } = snap;
        // Campos fósiles del pipeline v1 (stage2Pairs, stage4Merges...)
        // no viajan al snapshot v2.
        for (const k of Object.keys(meta)) {
          if (/^stage\d/.test(k)) delete meta[k];
        }
        if (meta.stores || meta.storeCount) prevSnapshotMeta = meta;
        // Fallback para correr a mano con un offers.json que no traiga
        // v1Slug. En el daily-scrape NO puede funcionar y no debe
        // preocupar: merge-snapshots.mjs ya pisó data/snapshot.json con uno
        // que tiene products[] y no productGroups[], así que acá el mapa
        // sale vacío. Por eso el v1Slug lo escribe merge-snapshots.mjs,
        // que es el único que ve el snapshot anterior antes de pisarlo.
        if (!offers.some((o) => o.v1Slug)) {
          const byUrl = new Map();
          for (const g of snap.productGroups ?? []) {
            for (const o of g.offers ?? []) {
              if (o.externalUrl) byUrl.set(o.externalUrl, g.groupSlug);
            }
          }
          let mapped = 0;
          for (const o of offers) {
            const s = byUrl.get(o.externalUrl);
            if (s) { o.v1Slug = s; mapped++; }
          }
          console.log(`  v1Slug mapeado por URL para ${mapped} ofertas`);
        }
      } catch { /* sin snapshot v1 → todos los slugs se acuñan nuevos */ }
    }
  }

  // Regiones por bodega (compat v1 — /region/* filtra por este facet).
  let BODEGA_REGIONS = {};
  try {
    BODEGA_REGIONS = JSON.parse(
      readFileSync(resolve(ROOT, "data/bodega-regions.json"), "utf8"),
    ).regions ?? {};
  } catch { /* sin dict seguimos — región queda por regex de nombre */ }

  const COLLECTOR_CUTOFF = new Date().getFullYear() - 5;

  // ── Asignación ──
  const groups = new Map(); // wineKey → { wine|null, offers: [] }
  let assigned = 0;
  for (const o of offers) {
    if (!o.name) continue;
    const p = parseOffer(o.name, o.brand);
    const w = assign(p, idx);
    if (w) assigned++;
    const { key, expr } = wineKeyOf(p, w);
    let g = groups.get(key);
    if (!g) {
      g = { wine: w ?? null, expr: expr ?? null, offers: [] };
      groups.set(key, g);
    }
    g.offers.push({
      storeSlug: o.storeSlug,
      externalUrl: o.externalUrl,
      externalSku: o.externalSku,
      name: o.name,
      priceArs: o.priceArs,
      inStock: o.inStock,
      imageUrl: o.imageUrl,
      vintage: p.vintage ?? undefined,
      volumeMl: p.volumeMl,
      pack: p.pack,
      estuche: p.estuche || undefined,
      copa: p.copa || undefined,
      comparable: isComparable(p) || undefined,
      isCollector:
        p.vintage !== null && p.vintage <= COLLECTOR_CUTOFF ? true : undefined,
      _v1Slug: o.v1Slug, // sólo para el mapping de slugs; se borra al final
    });
  }
  console.log(`  asignadas a catálogo: ${assigned} (${((100 * assigned) / offers.length).toFixed(1)}%) · grupos: ${groups.size}`);

  // ── Evidencia EAN (gateada) ──
  // Un barcode compartido entre tiendas es evidencia fuerte de mismo
  // vino — cierra splits de nombre divergente que el catálogo aún no
  // cubre. Pero NO es autoridad absoluta (las tiendas cargan mal EANs):
  //   · nunca fusiona dos vinos DISTINTOS del catálogo (el conocimiento
  //     del catálogo gana sobre el barcode),
  //   · exige cero hardConflict (volumen/pack/color/edición/parcela) y
  //     lineRelation equal/subset entre los nombres representativos.
  {
    const eanToKeys = new Map();
    for (const [key, g] of groups) {
      for (const o of g.offers) {
        const ean = toEan(o.externalSku);
        if (!ean) continue;
        if (!eanToKeys.has(ean)) eanToKeys.set(ean, new Set());
        eanToKeys.get(ean).add(key);
      }
    }
    const repName = (g) =>
      g.offers.slice().sort((a, b) => a.name.length - b.name.length)[0].name;
    let eanMerges = 0, eanBlocked = 0;
    for (const [, keys] of eanToKeys) {
      if (keys.size < 2) continue;
      const live = [...keys].filter((k) => groups.has(k));
      if (live.length < 2) continue;
      // El grupo con vino de catálogo absorbe al fallback (nunca al
      // revés); entre pares del mismo tipo gana el más grande.
      live.sort((a, b) => {
        const ga = groups.get(a), gb = groups.get(b);
        if (!!gb.wine !== !!ga.wine) return gb.wine ? 1 : -1;
        return gb.offers.length - ga.offers.length;
      });
      const target = groups.get(live[0]);
      for (const k of live.slice(1)) {
        const src = groups.get(k);
        if (!src) continue;
        // catálogo vs catálogo distinto → jamás (Serie A ≠ Concreto aunque
        // una tienda repita el barcode por error de carga)
        if (target.wine && src.wine && target.wine.id !== src.wine.id) { eanBlocked++; continue; }
        const a = { canonicalName: repName(target) };
        const b = { canonicalName: repName(src) };
        const rel = lineRelation(a.canonicalName, b.canonicalName);
        if (hardConflict(a, b) || (rel !== "equal" && rel !== "subset")) { eanBlocked++; continue; }
        target.offers.push(...src.offers);
        groups.delete(k);
        eanMerges++;
      }
    }
    console.log(`  evidencia EAN: ${eanMerges} merges · ${eanBlocked} bloqueados por gates/catálogo`);
  }

  // ── Slugs: preservar el slug v1 dominante ──
  // dominante(v1Slug) = wineKey con más ofertas de ese v1Slug
  const v1Count = new Map(); // v1Slug → Map(wineKey → n)
  for (const [key, g] of groups) {
    for (const o of g.offers) {
      if (!o._v1Slug) continue;
      if (!v1Count.has(o._v1Slug)) v1Count.set(o._v1Slug, new Map());
      const m = v1Count.get(o._v1Slug);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  const dominantOf = new Map(); // v1Slug → wineKey
  for (const [s, m] of v1Count) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    dominantOf.set(s, best[0]);
  }
  // ── Registro persistente de slugs (data/wine-slugs.json) ──
  // wineKey → slug, committeado por el cron. Garantiza que el slug de un
  // vino NUNCA cambia entre corridas (en v1 la quimera fue
  // malbec-serie-zuccardi el 28/6 y concreto-malbec-zuccardi el 2/7 —
  // URLs flapeando = veneno SEO). Prioridad: registro > slug v1 dominante
  // (primera corrida / vinos nuevos) > mint.
  let slugRegistry = {};
  if (existsSync(SLUG_REGISTRY_PATH)) {
    try { slugRegistry = JSON.parse(readFileSync(SLUG_REGISTRY_PATH, "utf8")).slugs ?? {}; } catch { /* fresco */ }
  }
  const slugOf = new Map(); // wineKey → slug
  const claimed = new Set();
  let fromRegistry = 0;
  for (const [key] of groups) {
    const reg = slugRegistry[key];
    if (reg && !claimed.has(reg)) {
      slugOf.set(key, reg);
      claimed.add(reg);
      fromRegistry++;
    }
  }
  // cada wineKey (sin slug registrado) elige el v1Slug que domina
  for (const [key, g] of groups) {
    if (slugOf.has(key)) continue;
    const cands = new Map(); // v1Slug → count en este grupo
    for (const o of g.offers) {
      if (o._v1Slug && dominantOf.get(o._v1Slug) === key) {
        cands.set(o._v1Slug, (cands.get(o._v1Slug) ?? 0) + 1);
      }
    }
    const best = [...cands.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && !claimed.has(best[0])) {
      slugOf.set(key, best[0]);
      claimed.add(best[0]);
    }
  }
  // mint para los que no preservan
  const used = new Set(claimed);
  for (const [key, g] of groups) {
    if (slugOf.has(key)) continue;
    const w = g.wine;
    const base = w
      ? slugify(`${w.linea} ${w.varietal ?? ""} ${w.bodega}`)
      : slugify(
          g.offers
            .slice()
            .sort((a, b) => a.name.length - b.name.length)[0]
            .name.slice(0, 60),
        ) || "vino";
    let s = base, n = 1;
    while (used.has(s)) s = `${base}-${++n}`;
    used.add(s);
    slugOf.set(key, s);
  }
  // redirects: v1Slug → slug v2 del wineKey dominante (si cambia)
  const redirects = {};
  for (const [v1s, key] of dominantOf) {
    const v2s = slugOf.get(key);
    if (v2s && v2s !== v1s) redirects[v1s] = v2s;
  }

  // ── Materializar grupos ──
  const outGroups = [];
  for (const [key, g] of groups) {
    const offersOut = g.offers.map(({ _v1Slug, ...rest }) => rest);

    const inStock = offersOut.filter((o) => o.inStock);

    // ── Sanidad de precios ──
    // Precios basura del scraper ($20 un Escorihuela, $510.000 una
    // Corona) contaminan min/max, el hero ("ahorrá 99%") y el histórico
    // que alimenta price-drops. Con ≥4 comparables con stock, un precio
    // a <25% o >4× de la MEDIANA del grupo es casi seguro un error de
    // parseo/carga: se marca priceSuspect y sale de las estadísticas y
    // de la tabla comparativa (la UI lo muestra aparte). Piso absoluto
    // $1.500: ningún vino real argentino baja de eso hoy.
    {
      const cmpPrices = inStock
        .filter((o) => o.comparable && !o.isCollector)
        .map((o) => o.priceArs)
        .filter((p) => typeof p === "number" && p > 0)
        .sort((a, b) => a - b);
      const med =
        cmpPrices.length >= 4
          ? cmpPrices.length % 2
            ? cmpPrices[(cmpPrices.length - 1) / 2]
            : (cmpPrices[cmpPrices.length / 2 - 1] + cmpPrices[cmpPrices.length / 2]) / 2
          : null;
      for (const o of offersOut) {
        if (typeof o.priceArs !== "number" || o.priceArs <= 0) continue;
        const floor = o.priceArs < 1500;
        const outlier = med !== null && (o.priceArs < med * 0.25 || o.priceArs > med * 4);
        if (floor || outlier) {
          o.priceSuspect = true;
          if (o.comparable) o.comparable = undefined;
        }
      }
    }

    // Sort DESPUÉS de la sanidad: los sospechosos pierden `comparable` y
    // se van al fondo con el resto de no-comparables.
    offersOut.sort((a, b) => {
      if (!!a.inStock !== !!b.inStock) return a.inStock ? -1 : 1;
      const ac = a.comparable ? 0 : 1;
      const bc = b.comparable ? 0 : 1;
      if (ac !== bc) return ac - bc;
      const acol = a.isCollector ? 1 : 0;
      const bcol = b.isCollector ? 1 : 0;
      if (acol !== bcol) return acol - bcol;
      return (a.priceArs ?? Infinity) - (b.priceArs ?? Infinity);
    });

    // El último recurso NUNCA re-admite sospechosos: si lo hace, el precio
    // basura que la sanidad de arriba acaba de marcar vuelve a ser el
    // minPrice publicado. Y bottleStats() (lib/snapshot.ts) cae a
    // g.minPrice cuando no le queda ninguna botella limpia, así que ese
    // precio termina en el hero, el <title>, la meta description y el
    // JSON-LD de la ficha: "Estéreo Cabernet franc · ahorrá hasta 99%",
    // "Desde $ 1.000", con la tienda española espacioanelis.com cotizando
    // en euros. Sin ninguna oferta limpia preferimos NO publicar precio
    // (minPrice = null): la ficha ya sabe renderizar ese caso.
    let basis = inStock.filter((o) => o.comparable && !o.isCollector);
    if (basis.length === 0) basis = inStock.filter((o) => !o.isCollector && !o.priceSuspect);
    if (basis.length === 0) basis = inStock.filter((o) => !o.priceSuspect);
    const prices = basis
      .map((o) => o.priceArs)
      .filter((p) => typeof p === "number" && p > 0);

    // variantes por formato (para la sección "otros formatos" de la ficha)
    const variants = new Map();
    for (const o of offersOut) {
      const vk = `${o.volumeMl}|${o.pack}|${o.estuche ? "estuche" : ""}${o.copa ? "copa" : ""}`;
      if (!variants.has(vk)) {
        variants.set(vk, {
          volumeMl: o.volumeMl,
          pack: o.pack,
          estuche: !!o.estuche,
          copa: !!o.copa,
          offerCount: 0,
          minPrice: null,
        });
      }
      const v = variants.get(vk);
      v.offerCount++;
      if (o.inStock && !o.priceSuspect && typeof o.priceArs === "number" && o.priceArs > 0) {
        v.minPrice = v.minPrice === null ? o.priceArs : Math.min(v.minPrice, o.priceArs);
      }
    }

    const w = g.wine;
    // Nombre: línea + EXPRESIÓN + varietal display.
    //  - La expresión (paraje/edición) VA en el nombre: "Aluvional
    //    Gualtallary Malbec" ≠ "Aluvional Altamira Malbec" — sin esto,
    //    todas las expresiones de una línea multi-paraje compartían
    //    título ("Aluvional Malbec" × 4 páginas = títulos duplicados
    //    para Google y fichas indistinguibles para el usuario).
    //  - Sin duplicar varietal cuando la línea ya lo contiene ("Pinot
    //    Noir" + varietal pinot noir daba "Pinot Noir Pinot noir").
    let canonicalName;
    if (w) {
      const varietalDisplay = w.varietal
        ? w.varietal.split("+").map((v) => v[0].toUpperCase() + v.slice(1)).join(" ")
        : "";
      const lineaNorm = norm(w.linea);
      const needsVarietal =
        varietalDisplay &&
        !w.varietal.split("+").every((v) => lineaNorm.includes(norm(v)));
      const exprDisplay = g.expr
        ? g.expr
            .split(" ")
            .map((t) => (t.length > 2 ? t[0].toUpperCase() + t.slice(1) : t))
            .join(" ")
        : "";
      canonicalName = [
        w.linea,
        exprDisplay && !lineaNorm.includes(norm(exprDisplay)) ? exprDisplay : "",
        needsVarietal ? varietalDisplay : "",
      ]
        .filter(Boolean)
        .join(" ");
    } else {
      canonicalName = offersOut
        .slice()
        .sort((a, b) => a.name.length - b.name.length)[0].name;
    }

    // Facets del contrato v1 (lib/matching.ts ProductGroup): varietals y
    // región con los MISMOS nombres display que v1 — /varietal/* y
    // /region/* filtran por string exacto. vintage/format son null por
    // diseño (pooled / movidos a variants).
    const varietalCounts = new Map();
    for (const o of offersOut) {
      const seen = new Set();
      for (const v of V1_VARIETALS) {
        if (v.re.test(o.name) && !seen.has(v.name)) {
          if (v.name === "Cabernet" && (seen.has("Cabernet Sauvignon") || seen.has("Cabernet Franc"))) continue;
          seen.add(v.name);
        }
      }
      for (const v of seen) varietalCounts.set(v, (varietalCounts.get(v) ?? 0) + 1);
    }
    const varietals = [...varietalCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([v]) => v);
    const TYPE_BY_COLOR = { tinto: "Tinto", blanco: "Blanco", rosado: "Rosado", espumante: "Espumante", dulce: "Dulce" };
    const wineColor = w?.color ?? colorOf(canonicalName);
    const type = wineColor ? TYPE_BY_COLOR[wineColor] ?? null : null;

    // Región: regex sobre nombres de ofertas, fallback por bodega.
    let region = null;
    for (const o of offersOut) {
      for (const r of V1_REGIONS) {
        if (r.re.test(o.name)) { region = r.name; break; }
      }
      if (region) break;
    }
    if (!region) {
      const bodega = w?.bodega ?? null;
      const rk = brandRegionKey(bodega);
      if (rk && BODEGA_REGIONS[rk]) region = BODEGA_REGIONS[rk];
      else if (rk && BODEGA_REGIONS[rk.replace(/\s+/g, "")]) region = BODEGA_REGIONS[rk.replace(/\s+/g, "")];
    }

    outGroups.push({
      groupSlug: slugOf.get(key),
      wineKey: key,
      catalogId: w?.id ?? null,
      canonicalName,
      brand: w?.bodega ?? null,
      vintage: null,
      format: null,
      varietals,
      type,
      region,
      imageUrl: offersOut.find((o) => o.imageUrl)?.imageUrl ?? null,
      storeCount: new Set(basis.map((o) => o.storeSlug)).size,
      offerCount: basis.length,
      totalStoreCount: new Set(offersOut.map((o) => o.storeSlug)).size,
      totalOfferCount: offersOut.length,
      inStockOfferCount: inStock.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      comparableBasis: basis.length,
      variants: [...variants.values()].sort((a, b) => (a.volumeMl ?? 0) - (b.volumeMl ?? 0)),
      offers: offersOut,
    });
  }

  outGroups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    return (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity);
  });

  const multi = outGroups.filter((g) => g.storeCount >= 2).length;
  // En publish conservamos la metadata del snapshot vigente (stores,
  // storeCount, productCount, sources) — el frontend la tipa y /admin la
  // muestra. Los products[] no se re-incluyen (redundantes con offers).
  const out = {
    ...(prevSnapshotMeta ?? {}),
    generatedAt: prevSnapshotMeta?.generatedAt ?? new Date().toISOString(),
    generator: prevSnapshotMeta?.generator ?? "build-groups-v2.mjs",
    identityV2: true,
    groupCount: outGroups.length,
    multiStoreGroupCount: multi,
    groupsGeneratedAt: new Date().toISOString(),
    catalogWines: catalog.wines?.length ?? 0,
    productGroups: outGroups,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out));

  if (PUBLISH) {
    // Registro de slugs: lo ya registrado + lo asignado en esta corrida.
    // Nunca se borra una entrada — un vino sin stock hoy puede volver
    // mañana y su URL tiene que ser la misma.
    const mergedRegistry = { ...slugRegistry };
    for (const [key, slug] of slugOf) mergedRegistry[key] = slug;
    writeFileSync(
      SLUG_REGISTRY_PATH,
      JSON.stringify({
        _doc: "wineKey → slug. Persistente entre corridas para que las URLs jamás cambien. Lo escribe build-groups-v2.mjs --publish; lo committea el daily-scrape.",
        slugs: mergedRegistry,
      }),
    );

    // Redirects 308: mapa ACUMULADO + los nuevos de esta corrida. Un slug
    // que hoy es página viva no puede ser redirect (la página gana — el
    // [slug] resuelve grupo ANTES de mirar merges, pero limpiamos igual).
    //
    // El archivo es un ARCHIVO HISTÓRICO, igual que wine-slugs.json: una
    // entrada no se borra nunca. Hasta el 27/08/2026 esta función tiraba
    // toda entrada cuyo destino no estuviera vivo ESE día, y como la
    // corrida siguiente releía el archivo ya podado, la pérdida era
    // definitiva. Un vino que se queda sin stock una mañana (o una tienda
    // que ese día no lo lista) borraba para siempre los redirects que
    // apuntaban a él, y no volvían cuando el vino reponía. Un trinquete
    // que sólo perdía: 13.494 redirects el 29/07 → 10.018 el 27/08, o sea
    // ~3.500 URLs indexadas de vuelta en 404 sin que nadie tocara nada.
    //
    // No hace falta podar acá porque el runtime ya decide: resolveMergedSlug()
    // en lib/snapshot.ts sigue la cadena y sólo redirige si findGroup()
    // encuentra el destino entre los grupos publicados (que además ya
    // excluye no-vinos y grupos sin ofertas). Un destino sin stock hoy
    // simplemente no resuelve → 404, exactamente lo que pasaba antes,
    // pero la entrada sobrevive y vuelve a servir cuando el vino repone.
    let prevMerges = {};
    if (existsSync(MERGES_PATH)) {
      try { prevMerges = JSON.parse(readFileSync(MERGES_PATH, "utf8")); } catch { /* fresco */ }
    }
    // Overlay curado a mano (data/redirects-manual.json). Va ÚLTIMO: le
    // gana a lo acumulado y a lo que calculó esta corrida. Existe para el
    // caso que la reconstrucción automática rechaza con razón — el Colón
    // del issue #147, que el gate de color de rebuild-legacy-redirects.mjs
    // separa porque una tienda dice "rosado" y otra "dulce". El gate está
    // bien; lo que falta es la excepción curada. JSON inválido revienta el
    // build a propósito: mejor no publicar que publicar redirects rotos.
    const manualRedirects = {};
    if (existsSync(MANUAL_REDIRECTS_PATH)) {
      const manual = JSON.parse(readFileSync(MANUAL_REDIRECTS_PATH, "utf8"));
      for (const r of manual.redirects ?? []) {
        if (!r?.from || !r?.to) continue;
        manualRedirects[r.from] = r.to;
      }
      console.log(`  redirects manuales: ${Object.keys(manualRedirects).length}`);
    }
    const liveSlugs = new Set(outGroups.map((g) => g.groupSlug));
    const allMerges = { ...prevMerges, ...redirects, ...manualRedirects };
    // Colapsa cadenas con detección de ciclos: si volvemos a pisar un slug
    // ya visto la cadena no tiene final y se descarta entera (antes el tope
    // de profundidad devolvía el slug del medio, que dejaba encadenados).
    const finalDest = (slug) => {
      const seen = new Set([slug]);
      let cur = slug;
      while (allMerges[cur]) {
        const next = allMerges[cur];
        if (seen.has(next)) return null; // ciclo
        seen.add(next);
        cur = next;
      }
      return cur;
    };
    const resolved = {};
    for (const from of Object.keys(allMerges)) {
      if (liveSlugs.has(from)) continue; // la página viva gana
      const to = finalDest(from);
      if (to && to !== from) resolved[from] = to;
    }
    writeFileSync(MERGES_PATH, JSON.stringify(resolved, null, 2));
    console.log(`  PUBLISH: snapshot.json + wine-slugs.json (${Object.keys(mergedRegistry).length}) + group-merges.json (${Object.keys(resolved).length} redirects)`);
  }

  // ── Casos dorados de negocio (auto-evaluación diaria del shadow) ──
  function groupOfName(frag, store) {
    const f = norm(frag);
    for (const g of outGroups) {
      for (const o of g.offers) {
        if (norm(o.name).includes(f) && (!store || o.storeSlug === store)) return g;
      }
    }
    return null;
  }
  const gSerie = groupOfName("zuccardi serie a malbec");
  const gConcreto = groupOfName("zuccardi concreto malbec 750", "el-lagar") ?? groupOfName("zuccardi concreto malbec");
  const gAltamira = groupOfName("concreto malbec paraje altamira");
  const goldenCases = {
    serieConcretoSeparados:
      !!gSerie && !!gConcreto && gSerie.groupSlug !== gConcreto.groupSlug,
    altamiraUnificadoConConcreto:
      !!gAltamira && !!gConcreto && gAltamira.groupSlug === gConcreto.groupSlug,
    concreto: gConcreto && {
      slug: gConcreto.groupSlug,
      offers: gConcreto.totalOfferCount,
      comparables: gConcreto.comparableBasis,
      minPrice: gConcreto.minPrice,
      maxPrice: gConcreto.maxPrice,
    },
    serieA: gSerie && {
      slug: gSerie.groupSlug,
      offers: gSerie.totalOfferCount,
      minPrice: gSerie.minPrice,
      maxPrice: gSerie.maxPrice,
    },
  };

  // ── Report ──
  const report = {
    generatedAt: out.generatedAt,
    offers: offers.length,
    assignedToCatalog: assigned,
    groups: outGroups.length,
    multiStore: multi,
    slugsPreserved: claimed.size,
    redirects: Object.keys(redirects).length,
    goldenCases,
    redirectMap: redirects,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
  console.log(`  golden: Serie≠Concreto=${goldenCases.serieConcretoSeparados ? "✅" : "❌"} · Altamira∈Concreto=${goldenCases.altamiraUnificadoConConcreto ? "✅" : "❌"} · Concreto min=$${goldenCases.concreto?.minPrice ?? "?"}`);

  console.log(`  grupos v2: ${outGroups.length} · multi-tienda: ${multi}`);
  console.log(`  slugs v1 preservados: ${claimed.size} · redirects nuevos: ${Object.keys(redirects).length}`);
  console.log(`  → ${OUT_PATH}\n  → ${REPORT_PATH}`);
}

main();
