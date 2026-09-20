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
  buildBodegaCollapser,
  collapseContainedPhrases,
  isJunkBodegaKey,
  isStoreBrand,
} from "./lib-offer-identity.mjs";
import { NAME_PREFIX_TO_BRAND, contentTokens } from "./lib-identity.mjs";
import { colorOf, hardConflict, lineRelation, lineTokens, discriminatorSet } from "./stage4-token-merge.mjs";
import { collapseRedirects } from "./lib-redirects.mjs";
import { dropResolved } from "./lib-carryover.mjs";
import { applyManualOverlay } from "./lib-catalog-manual.mjs";
import { toEan } from "./lib-ean.mjs";
import { adjudicatePairs, jevPolicy, pairKey, JEV_MAX_MERGES_PER_RUN } from "./lib-jev.mjs";

// ── Compat v1: facets de región y varietal con los MISMOS nombres display
// que usaba build-groups.mjs — /region/* y /varietal/* filtran por estos
// strings exactos. (Listas copiadas de build-groups.mjs, que se retira.)
const V1_VARIETALS = [
  { name: "Malbec", re: /\bmalbec\b/i },
  { name: "Cabernet Sauvignon", re: /\bcabernet\s+sauvignon\b/i },
  { name: "Cabernet Franc", re: /\bcabernet\s+franc\b/i },
  // "Cabernet" a secas es Cabernet Sauvignon en el retail argentino. Antes
  // eran dos facetas ("Cabernet" 753 · "Cabernet Sauvignon" 1.743) y una
  // ficha podía llevar las dos etiquetas a la vez (auditoría 13/09).
  { name: "Cabernet Sauvignon", re: /\bcabernet\b/i, bare: true },
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
const JEV_CACHE_PATH = resolve(ROOT, "data/jev-cache.json");
const JEV_SUSPECTS_PATH = resolve(ROOT, "data/jev-gate-suspects.json");
const CARRYOVER_PATH = resolve(ROOT, "data/carryover.json");

function norm(s) {
  return stripAccents(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}
function slugify(s) {
  return norm(s).replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

// ── Catálogo → índices de asignación ──
// Tokens de gama en el nombre de una línea del catálogo ("Gran Medalla",
// "Alma Mora Reserva"). Cuando dos entradas comparten alias — "Medalla" y
// "Gran Medalla" tienen las dos el alias "medalla", porque lineTokens()
// saca los tiers — se queda la de BASE (menos tiers en la línea): la
// oferta "Gran Medalla Malbec" cae en Medalla con expresión "gran" y la
// "Medalla Malbec" en Medalla a secas. Antes ganaba la última en el Map:
// las dos caían en "Gran Medalla" y la ficha del Medalla común se
// titulaba "Gran Medalla Malbec" (el mismo mecanismo que puso "Apartado
// Gran Malbec" de título al Colección Malbec de Rutini, auditoría 13/09).
const LINE_TIER_RE = /\b(gran|reserva|reserve|single|vineyard|parcela|icono|coleccion|edicion limitada)\b/g;
function lineTierCount(linea) {
  return (norm(linea).match(LINE_TIER_RE) ?? []).length;
}
function buildCatalogIndex(catalog) {
  const exact = new Map();   // bodega|linea-alias|varietal|color|dulzor → wine
  const byLine = new Map();  // bodega|linea-alias → [wines]
  for (const w of catalog.wines ?? []) {
    const b = normalizeBodegaKey(w.bodega);
    // Alias implícito: el propio nombre de la línea, tokenizado como lo
    // haría el parser con una oferta ("Colección" → "coleccion"). Los
    // aliases minados dependen del parser del día que se minaron; el
    // nombre de la línea no.
    const bodegaToks = new Set(b.split(" ").filter((t) => t.length > 1));
    const implicit = [...lineTokens(w.linea)].filter((t) => !bodegaToks.has(t)).sort().join(" ");
    const aliases = new Set(w.lineAliases?.length ? w.lineAliases : [""]);
    if (implicit) aliases.add(implicit);
    // Tiers del NOMBRE de la línea que sí distinguen ("Gran Medalla" ⇒
    // "gran"): una oferta sólo puede ser este vino si los trae. Ver assign().
    const dropped = new Set([...(w.tiersNoDistinguen ?? []), ...(w.parajesNoDistinguen ?? [])].map(norm));
    w._requiredDiscs = [...discriminatorSet(w.linea)].filter((d) => !dropped.has(norm(d)));
    for (const alias of aliases) {
      const lineKey = alias.split(" ").filter(Boolean).sort().join(" ");
      const ek = `${b}|${lineKey}|${w.varietal ?? ""}|${w.color ?? ""}|${w.dulzor ?? ""}`;
      const prev = exact.get(ek);
      const better =
        !prev ||
        lineTierCount(w.linea) < lineTierCount(prev.linea) ||
        (lineTierCount(w.linea) === lineTierCount(prev.linea) && (w.storeCount ?? 0) > (prev.storeCount ?? 0));
      if (better) exact.set(ek, w);
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
  // Consistencia de tiers: si el nombre de la línea del catálogo lleva un
  // tier que distingue ("Gran Medalla" ⇒ gran), la oferta tiene que
  // traerlo. Sin esto "Medalla Malbec" matcheaba por alias ("medalla")
  // la entrada "Gran Medalla" y las dos fichas se fundían (o, antes del
  // 13/09, la del Medalla común se titulaba "Gran Medalla Malbec").
  const discs = new Set(p.discriminadores.map(norm));
  const tiersOk = (w2) => (w2._requiredDiscs ?? []).every((d) => discs.has(norm(d)));
  const w = idx.exact.get(`${b}|${lineKey}|${p.varietal ?? ""}|${p.color ?? ""}|${p.dulzor ?? ""}`);
  if (w) return tiersOk(w) ? w : null;
  // Compatibilidad de color/dulzor para HEREDAR un vino de la línea. Un
  // espumante sólo hereda un espumante con el MISMO dulzor: "Chandon
  // Extra Brut" no es "Chandon Rosé" ni "Chandon Demi Sec" aunque sean
  // el único candidato de la línea vacía (13/09: sin esto, 237 ofertas de
  // toda la gama Chandon cayeron en la ficha del Rosé). Para vinos
  // tranquilos, color nulo de un lado es compatible (el catálogo o la
  // tienda no lo dicen).
  const compat = (w2) => {
    if (!tiersOk(w2)) return false;
    if ((w2.dulzor ?? null) !== (p.dulzor ?? null)) return false;
    if (p.color === "espumante" || w2.color === "espumante") return w2.color === p.color;
    // La oferta declara color y el vino del catálogo no: "Salentein Rosé"
    // no hereda "Salentein Chardonnay" (color null) por ser el único.
    if (p.color && !w2.color) return false;
    return !p.color || w2.color === p.color;
  };
  // Herencia de varietal: oferta sin varietal en el nombre + línea con
  // UN solo vino compatible en catálogo → es ese ("Zuccardi Concreto" →
  // Concreto Malbec). Con 2+ candidatos es ambiguo → no asignamos.
  if (!p.varietal) {
    const cands = (idx.byLine.get(`${b}|${lineKey}`) ?? []).filter(compat);
    if (cands.length === 1) return cands[0];
  } else {
    // "Nicasia Malbec" contra un catálogo que tiene "Nicasia Blend Malbec":
    // las tiendas omiten "blend"/"red blend" todo el tiempo. Sólo si en la
    // línea hay EXACTAMENTE un vino cuyo varietal es el de la oferta más
    // "blend" (el match exacto ya falló, así que no hay un "Nicasia
    // Malbec" propio en el catálogo).
    const cands = idx.byLine.get(`${b}|${lineKey}`) ?? [];
    const want = [...p.varietal.split("+"), "blend"].sort().join("+");
    const hit = cands.filter((w2) => w2.varietal === want && compat(w2));
    if (hit.length === 1) return hit[0];
  }
  return null;
}

/** Clave de grupo final (vino + expresión residual). El colapso de
 * discriminadores contenidos ("altamira" ⊂ "paraje altamira") vive en
 * lib-offer-identity (collapseContainedPhrases) porque también lo usa la
 * clave de fallback. */
function wineKeyOf(p, w) {
  if (!w) return { key: `fb|${fallbackWineKey(p)}`, expr: null };
  const dropP = new Set((w.parajesNoDistinguen ?? []).map(norm));
  const dropT = new Set((w.tiersNoDistinguen ?? []).map(norm));
  // Un discriminador que YA es parte del nombre de la línea no distingue
  // nada: "Rutini Colección Cabernet" (línea "Colección") abría una ficha
  // "::coleccion" aparte de "Rutini Cabernet"; "Apartado Gran Malbec"
  // (línea "Apartado Gran") una "::gran". Auditoría 13/09: era la causa
  // de casi todas las líneas de Rutini partidas en dos.
  const lineaTokens = new Set(norm(w.linea).split(" ").filter(Boolean));
  const residual = p.discriminadores.filter((d) => {
    const n = norm(d);
    if (dropP.has(n) || dropT.has(n)) return false;
    return !n.split(" ").every((t) => lineaTokens.has(t));
  });
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

async function main() {
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

  // ── Parse por oferta + colapso de bodegas por corpus ──
  // "Manos Negras Artesano", "Alfa Crux Fournier", "Zuccardi Santa Julia"
  // son la bodega establecida más una cola: se colapsan a la corta y la
  // cola vuelve a la línea (ver buildBodegaCollapser). Las bodegas del
  // diccionario nunca se colapsan.
  const PROTECTED_BODEGAS = new Set(
    Object.values(NAME_PREFIX_TO_BRAND).map((b) => normalizeBodegaKey(b)),
  );
  const parsed = offers.map((o) => (o.name ? parseOffer(o.name, o.brand) : null));
  // La tienda no es la bodega: si la "bodega" parseada es el nombre de la
  // vinoteca que publica la oferta, no sabemos la bodega.
  let storeAsBrand = 0;
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (!p?.bodega) continue;
    if (isStoreBrand(p.bodega, offers[i].storeSlug)) {
      parsed[i] = parseOffer(offers[i].name, offers[i].brand, { bodega: null });
      storeAsBrand++;
    }
  }
  if (storeAsBrand) console.log(`  marca = nombre de la tienda (descartada): ${storeAsBrand} ofertas`);
  // casing de display por clave de bodega: la del diccionario si existe,
  // si no la forma cruda más frecuente en el corpus.
  const bodegaDisplay = new Map(); // key → raw
  {
    const cnt = new Map(); // key → Map(raw → n)
    for (const p of parsed) {
      if (!p?.bodega) continue;
      const k = normalizeBodegaKey(p.bodega);
      if (!cnt.has(k)) cnt.set(k, new Map());
      cnt.get(k).set(p.bodega, (cnt.get(k).get(p.bodega) ?? 0) + 1);
    }
    const dict = new Map(Object.values(NAME_PREFIX_TO_BRAND).map((b) => [normalizeBodegaKey(b), b]));
    for (const [k, m] of cnt) {
      bodegaDisplay.set(k, dict.get(k) ?? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    }
  }
  const collapse = buildBodegaCollapser(
    parsed
      .map((p, i) => (p?.bodega ? { bodegaKey: normalizeBodegaKey(p.bodega), storeSlug: offers[i].storeSlug } : null))
      .filter(Boolean),
    { protect: PROTECTED_BODEGAS },
  );
  let collapsedOffers = 0;
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (!p?.bodega) continue;
    const to = collapse.get(normalizeBodegaKey(p.bodega));
    if (!to) continue;
    parsed[i] = parseOffer(offers[i].name, offers[i].brand, { bodega: bodegaDisplay.get(to) ?? to });
    collapsedOffers++;
  }
  console.log(`  colapso de bodegas por corpus: ${collapse.size} claves · ${collapsedOffers} ofertas re-parseadas`);
  // tiendas por bodega (para decidir si una bodega de scraper es confiable)
  const bodegaStores = new Map();
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (!p?.bodega) continue;
    const k = normalizeBodegaKey(p.bodega);
    if (!bodegaStores.has(k)) bodegaStores.set(k, new Set());
    bodegaStores.get(k).add(offers[i].storeSlug);
  }

  // ── Asignación ──
  const groups = new Map(); // wineKey → { wine|null, offers: [] }
  let assigned = 0;
  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    const p = parsed[i];
    if (!p) continue;
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
      _bodega: p.bodega ? (bodegaDisplay.get(normalizeBodegaKey(p.bodega)) ?? p.bodega) : null,
    });
  }
  console.log(`  asignadas a catálogo: ${assigned} (${((100 * assigned) / offers.length).toFixed(1)}%) · grupos: ${groups.size}`);

  // ── Fold de fallbacks: varietal/color nulo → hermano único ──
  // Misma regla que el catálogo aplica a sus entradas (fold varietal-null),
  // pero para las claves de fallback: "Rutini Antología 38" (sin varietal)
  // y "Rutini Antología 38 Blend" son el mismo vino cuando en esa
  // bodega+línea+edición no hay otro varietal posible. Ídem color nulo
  // ("Antología 38 Blend" vs "Vino Tinto Antología 38 Blend") y "X Malbec"
  // vs "X Blend Malbec". Conservador: sólo con UN hermano candidato.
  {
    const byBase = new Map(); // bodega|linea|dulzor|disc|ed → [keys]
    for (const key of groups.keys()) {
      if (!key.startsWith("fb|")) continue;
      const parts = key.slice(3).split("|");
      if (!parts[0]) continue; // sin bodega no se pliega nada
      const base = [parts[0], parts[1], parts[4], parts[5], parts[6]].join("|");
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(key);
    }
    let folded = 0;
    const mergeInto = (src, dst) => {
      const g = groups.get(src);
      const t = groups.get(dst);
      t.offers.push(...g.offers);
      groups.delete(src);
      folded++;
    };
    // Si la oferta declara color, el hermano tiene que declarar el MISMO
    // (13/09: "Luigi Bosca Rosé" (rosado, sin varietal) se plegaba en
    // "Luigi Bosca Gewürztraminer" (color nulo) por ser el único hermano).
    const colorOk = (a, b) => (!a.color ? true : a.color === b.color);
    for (const [base, keys] of byBase) {
      if (keys.length < 2) continue;
      // Con línea VACÍA la oferta sin varietal ("Luigi Bosca Rosé", "Norton
      // tinto") es ambigua por naturaleza: no se pliega en un varietal.
      const emptyLine = base.split("|")[1] === "";
      const info = keys.map((k) => {
        const pz = k.slice(3).split("|");
        return { k, varietal: pz[2], color: pz[3] };
      });
      const live = () => info.filter((x) => groups.has(x.k));
      // (c) "X Malbec" → "X Blend Malbec"
      for (const nu of emptyLine ? [] : live().filter((x) => x.varietal && !x.varietal.split("+").includes("blend"))) {
        if (!groups.has(nu.k)) continue;
        const want = [...nu.varietal.split("+"), "blend"].sort().join("+");
        const sib = live().filter((x) => x.varietal === want && colorOk(nu, x));
        if (sib.length === 1) mergeInto(nu.k, sib[0].k);
      }
      // (b) color nulo → único hermano del mismo varietal con color
      for (const nu of live().filter((x) => x.varietal && !x.color)) {
        if (!groups.has(nu.k)) continue;
        const sib = live().filter((x) => x.varietal === nu.varietal && x.color);
        if (sib.length === 1) mergeInto(nu.k, sib[0].k);
      }
      // (a) varietal nulo → único hermano con varietal (color compatible)
      for (const nu of emptyLine ? [] : live().filter((x) => !x.varietal)) {
        if (!groups.has(nu.k)) continue;
        const sib = live().filter((x) => x.varietal && colorOk(nu, x));
        if (sib.length === 1) mergeInto(nu.k, sib[0].k);
      }
    }
    console.log(`  fold de fallbacks (varietal/color nulo → hermano único): ${folded} · grupos: ${groups.size}`);
  }

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
    const eanStores = new Map(); // ean → Set(store)
    for (const [key, g] of groups) {
      for (const o of g.offers) {
        const ean = toEan(o.externalSku);
        if (!ean) continue;
        if (!eanToKeys.has(ean)) eanToKeys.set(ean, new Set());
        eanToKeys.get(ean).add(key);
        if (!eanStores.has(ean)) eanStores.set(ean, new Set());
        eanStores.get(ean).add(o.storeSlug);
      }
    }
    // Representante = el nombre más frecuente (normalizado) del grupo, no
    // el más corto: un "DV CATENA" pelado como representante dejaba al
    // grupo sin varietal y los gates dejaban pasar un Pinot Noir adentro
    // del Cabernet (13/09).
    const repName = (g) => pickCanonicalName(g.offers);
    // Pares candidatos por EAN, en el orden en que se van a evaluar. Se
    // arman ANTES de fusionar para poder consultar a Jev en lote.
    const eanPlan = [];
    for (const [ean, keys] of eanToKeys) {
      if (keys.size < 2) continue;
      // Un barcode que sólo carga UNA tienda no es evidencia entre fichas:
      // es esa tienda reutilizando el código (13/09: un Luigi Bosca
      // Gewürztraminer se fundió con el Emblema Rosé por un EAN de una
      // sola vinoteca). Dos tiendas coincidiendo sí lo es.
      if ((eanStores.get(ean)?.size ?? 0) < 2) continue;
      const live = [...keys].filter((k) => groups.has(k));
      if (live.length < 2) continue;
      // El grupo con vino de catálogo absorbe al fallback (nunca al
      // revés); entre pares del mismo tipo gana el más grande.
      live.sort((a, b) => {
        const ga = groups.get(a), gb = groups.get(b);
        if (!!gb.wine !== !!ga.wine) return gb.wine ? 1 : -1;
        return gb.offers.length - ga.offers.length;
      });
      eanPlan.push({ ean, live });
    }

    // ── Jev: juez de los pares que sólo veta la relación de LÍNEA ──
    // Nunca pasa por encima de un gate duro ni del catálogo (lib-jev.mjs).
    const jevAsk = [];
    for (const { live } of eanPlan) {
      const target = groups.get(live[0]);
      for (const k of live.slice(1)) {
        const src = groups.get(k);
        if (target.wine && src.wine && target.wine.id !== src.wine.id) continue;
        const an = repName(target), bn = repName(src);
        const gate = hardConflict({ canonicalName: an }, { canonicalName: bn });
        if (gate === "pack" || gate === "volumen") continue; // obvio, no se pregunta
        const rel = lineRelation(an, bn);
        if (!gate && (rel === "equal" || rel === "subset")) continue; // ya fusiona solo
        jevAsk.push([an, bn]);
      }
    }
    const { verdicts: jev, stats: jevStats } = await adjudicatePairs(jevAsk, {
      apiKey: process.env.TYPESAFE_API_KEY,
      cachePath: PUBLISH ? JEV_CACHE_PATH : null,
    });
    let jevEligible = 0;
    for (const [an, bn] of jevAsk) {
      const v = jev.get(pairKey(an, bn));
      const gate = hardConflict({ canonicalName: an }, { canonicalName: bn });
      if (v && jevPolicy({ pMismo: v.pMismo, gate, catalogConflict: false }) === "merge") jevEligible++;
    }
    const jevEnabled = jevEligible <= JEV_MAX_MERGES_PER_RUN;
    console.log(
      `  jev: ${jevStats.pares} pares · ${jevStats.enCache} en caché · ${jevStats.consultados} consultados · ${jevStats.errores} errores` +
        (jevStats.sinClave ? " · SIN TYPESAFE_API_KEY (sólo caché)" : "") +
        ` · ${jevEligible} fusionables` +
        (jevEnabled ? "" : ` · CIRCUIT BREAKER: > ${JEV_MAX_MERGES_PER_RUN}, Jev no fusiona en esta corrida`),
    );

    let eanMerges = 0, eanBlocked = 0, jevMerges = 0;
    const gateSuspects = [];
    for (const { ean, live } of eanPlan) {
      const target = groups.get(live[0]);
      if (!target) continue;
      for (const k of live.slice(1)) {
        const src = groups.get(k);
        if (!src) continue;
        // catálogo vs catálogo distinto → jamás (Serie A ≠ Concreto aunque
        // una tienda repita el barcode por error de carga)
        if (target.wine && src.wine && target.wine.id !== src.wine.id) { eanBlocked++; continue; }
        const a = { canonicalName: repName(target) };
        const b = { canonicalName: repName(src) };
        const gate = hardConflict(a, b);
        const rel = lineRelation(a.canonicalName, b.canonicalName);
        if (!gate && (rel === "equal" || rel === "subset")) {
          target.offers.push(...src.offers);
          groups.delete(k);
          eanMerges++;
          continue;
        }
        const v = jev.get(pairKey(a.canonicalName, b.canonicalName));
        const decision = v ? jevPolicy({ pMismo: v.pMismo, gate, catalogConflict: false }) : "no";
        if (decision === "merge" && jevEnabled) {
          target.offers.push(...src.offers);
          groups.delete(k);
          eanMerges++;
          jevMerges++;
          continue;
        }
        if (decision === "gate-sospechoso") {
          gateSuspects.push({ ean, gate, pMismo: Number(v.pMismo.toFixed(3)), a: a.canonicalName, b: b.canonicalName });
        }
        eanBlocked++;
      }
    }
    console.log(`  evidencia EAN: ${eanMerges} merges (${jevMerges} por Jev) · ${eanBlocked} bloqueados por gates/catálogo · ${gateSuspects.length} gates sospechosos`);
    if (PUBLISH) {
      gateSuspects.sort((x, y) => y.pMismo - x.pMismo);
      writeFileSync(
        JEV_SUSPECTS_PATH,
        JSON.stringify(
          {
            _doc: "Pares que comparten EAN en 2+ tiendas, que Jev da como el mismo vino con ≥0,9 y que un gate duro veta. NO se fusionan: son candidatos a gate que parte de más (así salió la taquigrafía del #174). Lo escribe build-groups-v2.mjs.",
            generatedAt: new Date().toISOString(),
            count: gateSuspects.length,
            pairs: gateSuspects,
          },
          null,
          1,
        ),
      );
    }
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
  let registryOverruled = 0;
  const registryRedirects = {}; // slug del registro desplazado → slug elegido
  // Los grupos grandes eligen primero: si dos claves pretenden el mismo
  // slug, se lo queda la que tiene más ofertas (la página con tráfico).
  const byKeySize = [...groups.entries()].sort((a, b) => b[1].offers.length - a[1].offers.length);
  for (const [key, g] of byKeySize) {
    const reg = slugRegistry[key];
    const cands = new Map(); // v1Slug → count en este grupo
    for (const o of g.offers) {
      if (o._v1Slug && dominantOf.get(o._v1Slug) === key) {
        cands.set(o._v1Slug, (cands.get(o._v1Slug) ?? 0) + 1);
      }
    }
    const top = [...cands.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const regCount = reg ? (g.offers.filter((o) => o._v1Slug === reg).length) : 0;
    // El registro manda (URLs estables)… salvo que la clave haya absorbido
    // una página claramente más grande que la que tenía ese slug: cuando
    // el DV Catena Malbec-Malbec (40 ofertas en /vino/catena-malbec-malbec)
    // cayó en una clave cuyo registro decía "estuche-catena-dv-malbec-2010-
    // x3" (2 ofertas), la ficha flagship heredaba el slug del estuche. La
    // página grande conserva su URL y el slug chico redirige a ella.
    let chosen = null;
    if (reg && !claimed.has(reg)) {
      const overruled = top && !claimed.has(top[0]) && top[0] !== reg && top[1] >= 2 * Math.max(regCount, 1);
      if (overruled) {
        chosen = top[0];
        registryOverruled++;
        registryRedirects[reg] = chosen;
      } else {
        chosen = reg;
        fromRegistry++;
      }
    } else if (top && !claimed.has(top[0])) {
      chosen = top[0];
    }
    if (chosen) {
      slugOf.set(key, chosen);
      claimed.add(chosen);
    }
  }
  console.log(`  slugs: ${fromRegistry} del registro · ${registryOverruled} del registro desplazados por la página dominante`);
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
  // --trace-slug a,b: diagnóstico de por qué un slug quedó donde quedó.
  for (const ts of (argVal("--trace-slug", "") || "").split(",").filter(Boolean)) {
    const key = dominantOf.get(ts);
    const g = key ? groups.get(key) : null;
    console.log(`  [trace ${ts}] dominantOf=${key ?? "(ninguna)"} · slugOf(key)=${key ? slugOf.get(key) : "-"} · registry(key)=${key ? slugRegistry[key] : "-"} · ofertas=${g?.offers.length ?? 0} · v1 en grupo=${g ? JSON.stringify([...g.offers.reduce((m, o) => m.set(o._v1Slug, (m.get(o._v1Slug) ?? 0) + 1), new Map())]) : "-"}`);
  }
  // redirects: v1Slug → slug v2 del wineKey dominante (si cambia)
  const redirects = {};
  for (const [v1s, key] of dominantOf) {
    const v2s = slugOf.get(key);
    if (v2s && v2s !== v1s) redirects[v1s] = v2s;
  }
  // + los slugs del registro desplazados, si no quedaron como página viva
  for (const [from, to] of Object.entries(registryRedirects)) {
    if (!claimed.has(from) && !redirects[from]) redirects[from] = to;
  }

  // ── Nombre canónico de un grupo sin catálogo ──
  // La forma normalizada más frecuente entre las ofertas (sin volumen,
  // añada, pack ni ruido de retail); desempate: la más corta. Antes era
  // "el nombre más corto", que podía ser "MALBEC" a secas o el título de
  // una tienda cualquiera (auditoría 13/09: "botellas-cabernet-cabernet-
  // cabernet-malbec-merlot-por-rutini-syrah").
  function pickCanonicalName(offersOut) {
    const cnt = new Map();
    for (const o of offersOut) {
      const k = contentTokens(o.name).join(" ");
      if (!k) continue;
      const e = cnt.get(k) ?? { n: 0, best: o.name };
      e.n++;
      if (o.name.length < e.best.length) e.best = o.name;
      cnt.set(k, e);
    }
    const ranked = [...cnt.values()].sort((a, b) => b.n - a.n || a.best.length - b.best.length);
    return (
      ranked[0]?.best ??
      offersOut.slice().sort((a, b) => a.name.length - b.name.length)[0].name
    );
  }
  // ── Bodega de un grupo sin catálogo ──
  // Antes `brand` salía SOLO del catálogo: el 90% de las fichas mostraba
  // "Sin bodega identificada" aunque el parser hubiera resuelto la bodega
  // (estaba en la clave fb|…). Ahora: la bodega mayoritaria entre sus
  // ofertas, siempre que sea del diccionario, la usen ≥2 tiendas, o sea
  // un nombre corto (una marca de scraper larga y de una sola tienda
  // suele ser basura).
  function pickBrand(g) {
    if (g.wine) return g.wine.bodega;
    const cnt = new Map();
    for (const o of g.offers) {
      if (!o._bodega) continue;
      cnt.set(o._bodega, (cnt.get(o._bodega) ?? 0) + 1);
    }
    const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const key = normalizeBodegaKey(best[0]);
    if (!PROTECTED_BODEGAS.has(key) && isJunkBodegaKey(key)) return null;
    const trusted =
      PROTECTED_BODEGAS.has(key) ||
      (bodegaStores.get(key)?.size ?? 0) >= 2 ||
      key.split(" ").length <= 4;
    return trusted ? best[0] : null;
  }
  let brandFilled = 0;

  // ── Materializar grupos ──
  const outGroups = [];
  for (const [key, g] of groups) {
    const offersOut = g.offers.map(({ _v1Slug, _bodega, ...rest }) => rest);
    const brand = pickBrand(g);
    if (!g.wine && brand) brandFilled++;

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
    const bodegaToksW = w ? new Set(normalizeBodegaKey(w.bodega).split(" ").filter((t) => t.length > 1)) : null;
    const lineaHasBodega = w && norm(w.linea).split(" ").some((t) => bodegaToksW.has(t));
    if (w && lineaHasBodega) {
      // "Catena D.V. Cabernet" como línea es el LLM confundiendo la bodega
      // con la etiqueta; el nombre más frecuente entre las tiendas ("DV
      // Catena Cabernet-Cabernet") es mejor título.
      canonicalName = pickCanonicalName(offersOut);
    } else if (w) {
      const varietalDisplay = w.varietal
        ? w.varietal.split("+").map((v) => v[0].toUpperCase() + v.slice(1)).join(" ")
        : "";
      const lineaNorm = norm(w.linea);
      const needsVarietal =
        varietalDisplay &&
        !w.varietal.split("+").every((v) => lineaNorm.includes(norm(v)));
      const cap = (s) =>
        s
          .split(" ")
          .map((t) => (t.length > 2 ? t[0].toUpperCase() + t.slice(1) : t))
          .join(" ");
      // "Gran" va ADELANTE de la línea ("Gran Medalla Malbec", "Gran
      // Enemigo"); el resto de la expresión (paraje, reserva, edición) atrás.
      const exprTokens = g.expr ? g.expr.split(" ").filter((t) => !lineaNorm.includes(t)) : [];
      const pre = exprTokens.filter((t) => t === "gran");
      const post = exprTokens.filter((t) => t !== "gran");
      // Un rosado del catálogo cuya línea/varietal no lo dicen ("Trumpeter
      // Reserva Malbec" para el Rosé de Malbec) lleva "Rosé" en el título.
      const needsRose =
        w.color === "rosado" && !/\b(rose|rosado|rosada)\b/.test(norm(`${w.linea} ${w.varietal ?? ""}`));
      canonicalName = [
        pre.length ? cap(pre.join(" ")) : "",
        w.linea,
        post.length ? cap(post.join(" ")) : "",
        needsVarietal ? varietalDisplay : "",
        needsRose ? "Rosé" : "",
      ]
        .filter(Boolean)
        .join(" ");
    } else {
      canonicalName = pickCanonicalName(offersOut);
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
          if (v.bare && seen.has("Cabernet Franc")) continue;
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
      const bodega = brand ?? null;
      const rk = brandRegionKey(bodega);
      if (rk && BODEGA_REGIONS[rk]) region = BODEGA_REGIONS[rk];
      else if (rk && BODEGA_REGIONS[rk.replace(/\s+/g, "")]) region = BODEGA_REGIONS[rk.replace(/\s+/g, "")];
    }

    outGroups.push({
      groupSlug: slugOf.get(key),
      wineKey: key,
      catalogId: w?.id ?? null,
      canonicalName,
      brand,
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

  // ── Fichas que el scrape de hoy no vio ──
  // merge-snapshots.mjs las apartó antes de pisar el snapshot (es el único
  // que ve los grupos de ayer). Se republican SIN precio para que su URL no
  // caiga en 404 un día y vuelva al siguiente. No entran al sitemap: el
  // filtro de lib/sitemap-buckets.ts ya saca todo lo que no tiene una sola
  // oferta con stock. Medición y doctrina: scripts/lib-carryover.mjs.
  {
    let carried = [];
    if (existsSync(CARRYOVER_PATH)) {
      try { carried = JSON.parse(readFileSync(CARRYOVER_PATH, "utf8")).groups ?? []; } catch { /* ignorar */ }
    }
    if (carried.length) {
      // Un slug que hoy es página viva, o una identidad que se republicó
      // bajo otro slug (de eso se encarga el redirect 308), o un slug que ya
      // es origen de un redirect: la página viva siempre gana.
      let redirectFrom = new Set();
      if (existsSync(MERGES_PATH)) {
        try { redirectFrom = new Set(Object.keys(JSON.parse(readFileSync(MERGES_PATH, "utf8")))); } catch { /* ignorar */ }
      }
      const keep = dropResolved(carried, {
        liveSlugs: new Set(outGroups.map((g) => g.groupSlug)),
        liveWineKeys: new Set(outGroups.map((g) => g.wineKey)),
        redirectFrom,
      });
      outGroups.push(...keep);
      console.log(
        `  fichas arrastradas (el scrape no las vio hoy): ${keep.length} de ${carried.length} · ${carried.length - keep.length} ya resueltas por página viva o redirect`,
      );
    }
  }

  outGroups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    return (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity);
  });

  const multi = outGroups.filter((g) => g.storeCount >= 2).length;
  console.log(`  bodega inferida en grupos sin catálogo: ${brandFilled}`);
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
    // Colapsa cadenas; una página viva corta la cadena (ver lib-redirects:
    // sin eso, una ficha que alterna entre dos slugs perdía el redirect).
    const resolved = collapseRedirects(allMerges, liveSlugs);
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

await main();
