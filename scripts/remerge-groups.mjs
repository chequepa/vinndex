#!/usr/bin/env node
/**
 * Post-process: find near-duplicate groups in the shipped snapshot and
 * merge them. Safe to run against the stripped snapshot that doesn't
 * carry the raw products[] array.
 *
 * Two groups are considered the same wine when:
 *   1. canonicalName (stripped of accents + casing) matches
 *   2. vintage + format match
 *   3. Their brands are either equal, or both resolve to the same value
 *      via NAME_PREFIX_TO_BRAND (the label-on-bottle rule)
 *
 * If all three hold, offers get concatenated (dedup by store+url), stats
 * are recomputed from in-stock offers, and the smaller groups are
 * dropped. The primary (highest storeCount) keeps its slug so SEO URLs
 * don't break.
 *
 * Kept out of build-groups.mjs because build-groups needs raw products
 * that CI strips from the shipped snapshot — this script works against
 * what we actually ship.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");

// Keep in sync with scripts/build-groups.mjs NAME_PREFIX_TO_BRAND.
// When you add an entry there, add it here too (or the post-process
// won't merge existing shipped groups that still have the old brands).
const NAME_PREFIX_TO_BRAND = {
  // Noemia labels
  "a lisa": "A Lisa",
  "a. lisa": "A Lisa",
  "j alberto": "J. Alberto",
  "j. alberto": "J. Alberto",
  // Catena family
  "dv catena": "DV Catena",
  alamos: "Alamos",
  "saint felicien": "Saint Felicien",
  luca: "Luca",
  "nicolas catena": "Nicolas Catena Zapata",
  "angelica zapata": "Catena Zapata",
  "angélica zapata": "Catena Zapata",
  adrianna: "Catena Zapata",
  nicasia: "Catena Zapata",
  argentino: "Catena Zapata",
  // Ernesto Catena
  "alma negra": "Alma Negra",
  padrillos: "Padrillos",
  tikal: "Tikal",
  // Vigil / Enemigo
  "el enemigo": "El Enemigo",
  "gran enemigo": "Gran Enemigo",
  // Salentein
  portillo: "Salentein",
  numina: "Salentein",
  primus: "Salentein",
  killka: "Salentein",
  pyros: "Salentein",
  alyda: "Salentein",
  // Zuccardi
  concreto: "Zuccardi",
  emma: "Zuccardi",
  aluvional: "Zuccardi",
  fosil: "Zuccardi",
  "piedra infinita": "Zuccardi",
  "finca piedra infinita": "Zuccardi",
  poligonos: "Zuccardi",
  polígonos: "Zuccardi",
  "serie a": "Zuccardi",
  "santa julia": "Santa Julia",
  // Rutini
  encuentro: "Rutini",
  antologia: "Rutini",
  antología: "Rutini",
  expresiones: "Rutini",
  trumpeter: "Trumpeter",
  apartado: "Rutini Apartado",
  // Luigi Bosca
  paradigma: "Luigi Bosca",
  "finca los nobles": "Luigi Bosca",
  "la linda": "La Linda",
  "finca la linda": "La Linda",
  // Norton
  perdriel: "Norton",
  "cosecha especial": "Norton",
  "sexy fish": "Sexy Fish",
  "lote negro": "Lote Negro",
  // Trapiche
  medalla: "Trapiche",
  broquel: "Trapiche",
  iscay: "Trapiche",
  "costa & pampa": "Trapiche",
  alaris: "Trapiche",
  // Independents
  "la posta": "La Posta",
  "los intocables": "Los Intocables",
  "domaine nico": "Domaine Nico",
  callia: "Callia",
  "baron b": "Baron B",
  "barón b": "Baron B",
  mumm: "Mumm",
  chacabuco: "Chacabuco",
  cruzat: "Cruzat",
  pascual: "Pascual Toso",
  "don david": "Trapiche",
  colome: "Colome",
  colomé: "Colome",
  garzon: "Garzon",
  garzón: "Garzon",
  argento: "Argento",
  dada: "Dada",
  privada: "Norton Privada",
  particular: "Bianchi Particular",
  "cheval des andes": "Cheval Des Andes",
  "cheval-des-andes": "Cheval Des Andes",
  // More labels discovered via find-duplicates.mjs (round 2 QA)
  malamado: "Malamado",
  felino: "Felino",
  "casa boher": "Casa Boher",
  amalaya: "Amalaya",
  chandon: "Chandon",
  araucana: "Araucana",
  "perro callejero": "Perro Callejero",
  monteagrelo: "Monteagrelo",
  festivo: "Festivo",
  "terrazas reserva": "Terrazas de los Andes",
  "zuccardi q": "Zuccardi",
  hey: "Hey",
  bramare: "Viña Cobos",
  "el esteco": "El Esteco",
  "achaval ferrer": "Achaval Ferrer",
  quimera: "Achaval Ferrer",
  coquena: "Coquena",
  demencial: "Demencial",
  "conejo verde": "Conejo Verde",
  aperol: "Aperol",
  animal: "Animal",
  "cuchillo de palo": "Cuchillo de Palo",
  catalpa: "Catalpa",
  // Other common label-as-line patterns
  "zuccardi fosil": "Zuccardi",
  frizze: "Frizze",
  cafayate: "Etchart",
  // More labels (round 2 continued)
  aruma: "Aruma",
  "casa de herrero": "Casa de Herrero",
  benmarco: "Benmarco",
  "casillero del diablo": "Casillero del Diablo",
  "mil demonios": "Mil Demonios",
  cocodrilo: "Viña Cobos",
  puramun: "Salentein",
  otronia: "Otronia",
  "familia gascon": "Familia Gascón",
  "familia gascón": "Familia Gascón",
  crios: "Susana Balbo",
  // Round 3
  "petite fleur": "Monteviejo",
  hermandad: "Hermandad",
  vallisto: "Vallisto",
  serbal: "Atamisque",
  "latitud 33": "Chandon",
  "la cayetana": "Ver Sacrum",
  teho: "Teho",
  alandes: "Alandes",
  mendel: "Mendel",
  septima: "Séptima",
  séptima: "Séptima",
  catamarca: "La Riojana",
  "gaia by mosquita muerta": "Mosquita Muerta",
  "mosquita muerta": "Mosquita Muerta",
  salentein: "Salentein",
  "sangre azul": "Sottano",
  pulenta: "Pulenta Estate",
  // Typos and final cleanups
  otornia: "Otronia",
  "veuve cliquot": "Veuve Clicquot",
  "veuve clicquot": "Veuve Clicquot",
  andillian: "La Coste de los Andes",
  "los cardos": "Doña Paula",
  "almacen de la quebrada": "Almacén de la Quebrada",
  "almacén de la quebrada": "Almacén de la Quebrada",
};

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(s) {
  return stripAccents(String(s ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Leading descriptive words that don't contribute to product identity.
// Stripped before NAME_PREFIX_TO_BRAND matching so "Espumante Latitud
// 33 Extra Brut" matches the "latitud 33" prefix, and "Vino A Lisa
// Malbec" matches "a lisa".
const LEADING_NOISE =
  /^(?:vino|vinos?|espumante|champagne|champaña|champana|botella|bot|bote|tinto|blanco|rosado|rose|rosé|dulce|seco|brut|reserva|premium)\s+/i;

function resolveBrandFromName(rawName, originalBrand) {
  if (!rawName) return originalBrand ?? null;
  let lower = stripAccents(String(rawName))
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Peel up to 2 leading noise words ("Vino Espumante X") before checking.
  for (let i = 0; i < 2; i++) {
    const next = lower.replace(LEADING_NOISE, "");
    if (next === lower) break;
    lower = next;
  }
  for (const prefix of Object.keys(NAME_PREFIX_TO_BRAND)) {
    if (lower === prefix || lower.startsWith(prefix + " ")) {
      return NAME_PREFIX_TO_BRAND[prefix];
    }
  }
  return originalBrand ?? null;
}

// Brand values that are clearly garbage (placeholder/generic) and
// should be treated as null for merge-compat purposes. Keep this
// aligned with BAD_BRAND_LITERALS in build-groups.mjs so CI and
// post-process agree on what's a real brand.
const BAD_BRAND_LITERALS = new Set([
  "sin definir",
  "sin reglas",
  "sin marca",
  "sin identificar",
  "no definido",
  "varios",
  "otros",
  "s/d",
  "s/m",
  "select",
  "cosecha",
  "cuvee",
  "cuvée",
  "fran",
  "centenario",
  "del valle",
  "gualtallary",
  "avinea",
  "the trouble maker",
  "a",
  "b",
  "c",
  "x",
]);

function isBadBrand(raw) {
  if (!raw) return false;
  const lower = stripAccents(raw)
    .toLowerCase()
    .replace(/^\s*(bodegas?|familia)\s+/i, "")
    .trim();
  return BAD_BRAND_LITERALS.has(lower);
}

/** Levenshtein distance for typo tolerance on long brands. Skip for
 * short brands (≤ 4 chars) where 1 edit is half the string and could
 * match unrelated brands. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function brandsAreCompatible(brands) {
  // Treat bad brands as null for compat — they're placeholders that
  // don't identify a real bodega, so they shouldn't block a merge.
  const effective = brands.map((b) => (isBadBrand(b) ? null : b));
  const nonNull = effective.filter(Boolean);
  if (nonNull.length <= 1) return true;
  const normalized = nonNull.map((b) =>
    stripAccents(b).toLowerCase().trim(),
  );
  // Equal check
  if (new Set(normalized).size === 1) return true;
  // Substring check — one brand wraps all others
  for (let i = 0; i < normalized.length; i++) {
    let wrapsAll = true;
    for (let j = 0; j < normalized.length; j++) {
      if (i === j) continue;
      if (!normalized[i].includes(normalized[j])) {
        wrapsAll = false;
        break;
      }
    }
    if (wrapsAll) return true;
  }
  // Typo tolerance: all brands within Levenshtein ≤ 1 per 5 chars of
  // the longer side. Catches "Veuve Cliquot" vs "Veuve Clicquot",
  // "Otornia" vs "Otronia". Refuses when any brand is shorter than 5
  // chars (too noisy).
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i];
      const b = normalized[j];
      if (a.length < 5 || b.length < 5) return false;
      const tolerance = Math.max(1, Math.floor(Math.max(a.length, b.length) / 10));
      if (levenshtein(a, b) > tolerance) return false;
    }
  }
  return true;
}

function recomputeStats(primary) {
  const offers = primary.offers ?? [];
  const inStock = offers.filter((o) => o.inStock);
  const prices = inStock
    .map((o) => o.priceArs)
    .filter((p) => typeof p === "number" && p > 0);
  primary.minPrice = prices.length ? Math.min(...prices) : null;
  primary.maxPrice = prices.length ? Math.max(...prices) : null;
  primary.storeCount = new Set(inStock.map((o) => o.storeSlug)).size;
  primary.offerCount = offers.length;
  primary.inStockOfferCount = inStock.length;
  primary.totalStoreCount = new Set(offers.map((o) => o.storeSlug)).size;
}

function mergeBucket(bucket) {
  // Sort by storeCount desc; primary keeps its slug.
  bucket.sort((a, b) => (b.storeCount ?? 0) - (a.storeCount ?? 0));
  const primary = bucket[0];
  const others = bucket.slice(1);

  // Offers: concat all, dedup by (storeSlug, externalUrl) keeping the
  // lowest price when there's a collision.
  const offerMap = new Map();
  for (const g of bucket) {
    for (const o of g.offers ?? []) {
      const k = `${o.storeSlug}|${o.externalUrl ?? ""}|${o.name ?? ""}`;
      const existing = offerMap.get(k);
      if (
        !existing ||
        (o.priceArs != null &&
          existing.priceArs != null &&
          o.priceArs < existing.priceArs)
      ) {
        offerMap.set(k, o);
      }
    }
  }
  primary.offers = [...offerMap.values()];

  // Inherit the best brand: prefer a NAME_PREFIX_TO_BRAND resolution
  // over whatever the scraper captured.
  const resolvedBrand = resolveBrandFromName(primary.canonicalName, null);
  if (resolvedBrand) {
    primary.brand = resolvedBrand;
  } else if (!primary.brand) {
    primary.brand = bucket.find((g) => g.brand)?.brand ?? null;
  }

  // Inherit image/varietals/region/type from whoever has them if we don't.
  for (const key of ["imageUrl", "varietals", "region", "type"]) {
    if (!primary[key] || (Array.isArray(primary[key]) && primary[key].length === 0)) {
      const donor = bucket.find((g) => g[key] && (!Array.isArray(g[key]) || g[key].length));
      if (donor) primary[key] = donor[key];
    }
  }

  recomputeStats(primary);
  return { primary, droppedSlugs: others.map((g) => g.groupSlug) };
}

function main() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const groups = snapshot.productGroups ?? [];
  console.log(`Loaded ${groups.length} groups from snapshot.`);

  // Bucket by (normalizedName, vintage, format)
  const buckets = new Map();
  for (const g of groups) {
    const key = `${normalizeName(g.canonicalName)}|${g.vintage ?? ""}|${g.format ?? ""}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }

  const dropSet = new Set();
  let mergedBuckets = 0;
  let rejectedBuckets = 0;
  const examples = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    // Brand compat: after NAME_PREFIX_TO_BRAND normalization, the brands
    // should either agree or be null. Reject anything with conflicting
    // non-null brands — could be genuinely different wines that share a
    // generic name like "Malbec Reserva".
    const resolvedBrands = bucket.map((g) =>
      resolveBrandFromName(g.canonicalName, g.brand),
    );
    const rawBrands = bucket.map((g) => g.brand);
    if (
      !brandsAreCompatible(resolvedBrands) &&
      !brandsAreCompatible(rawBrands)
    ) {
      rejectedBuckets++;
      if (examples.length < 50) {
        const totalSc = bucket.reduce(
          (sum, g) => sum + (g.storeCount ?? 0),
          0,
        );
        examples.push({
          reason: "brand-conflict",
          totalSc,
          names: bucket.map(
            (g) => `sc=${g.storeCount ?? 0} · ${g.brand ?? "∅"}: ${g.canonicalName}`,
          ),
        });
      }
      continue;
    }

    const { primary, droppedSlugs } = mergeBucket(bucket);
    for (const s of droppedSlugs) dropSet.add(s);
    mergedBuckets++;
    if (mergedBuckets <= 5) {
      examples.push({
        reason: "merged",
        kept: primary.groupSlug,
        dropped: droppedSlugs,
        brand: primary.brand,
        name: primary.canonicalName,
      });
    }
  }

  snapshot.productGroups = groups.filter((g) => !dropSet.has(g.groupSlug));
  snapshot.groupCount = snapshot.productGroups.length;
  snapshot.multiStoreGroupCount = snapshot.productGroups.filter(
    (g) => (g.storeCount ?? 0) >= 2,
  ).length;

  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot));

  console.log(`\n=== Remerge report ===`);
  console.log(
    `Merged ${mergedBuckets} buckets, dropped ${dropSet.size} duplicate groups.`,
  );
  console.log(`Rejected ${rejectedBuckets} buckets (brand conflict).`);
  console.log(
    `Groups: ${groups.length} → ${snapshot.groupCount} (−${groups.length - snapshot.groupCount})`,
  );
  console.log(`Multi-store: ${snapshot.multiStoreGroupCount}`);

  // Sort examples so the most impactful rejects appear first
  examples.sort((a, b) => (b.totalSc ?? 0) - (a.totalSc ?? 0));

  console.log(`\nExamples (top rejects by total stores):`);
  for (const e of examples.slice(0, 30)) {
    if (e.reason === "brand-conflict") {
      console.log(`  [conflict, total_sc=${e.totalSc}]`);
      for (const n of e.names) console.log(`    ${n}`);
    } else {
      console.log(JSON.stringify(e, null, 2));
    }
  }
}

main();
