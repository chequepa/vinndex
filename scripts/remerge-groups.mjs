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
  "dv adrianna": "DV Catena",
  "dv catena adrianna": "DV Catena",
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
  // Round 4 — diagnostic on fresh post-CI snapshot
  "nicola catena": "Nicolas Catena Zapata",
  "un mundo chiquito": "Un Mundo Chiquito",
  judas: "Sottano",
  patriota: "Tikal",
  exploracion: "Las Perdices",
  exploración: "Las Perdices",
  "la flor de pulenta": "Pulenta Estate",
  "primeras viñas": "Lagarde",
  "primeras vinas": "Lagarde",
  "lagarde primeras": "Lagarde",
  "cafayate terroir": "Etchart",
  "don nicanor": "Don Nicanor",
  emilia: "Nieto Senetiner",
  cadus: "Cadus",
  "alta vista": "Alta Vista",
  riglos: "Riglos",
  "texto subito": "Texto Subito",
  "casa boher gran": "Casa Boher",
  "casa tano": "Casa Tano",
  "estancia mendoza": "Estancia Mendoza",
  "finca las moras": "Finca Las Moras",
  abremundos: "Abremundos",
  // Mendel sub-lines: Unus + Lunta sometimes attributed wrong
  "mendel unus": "Mendel",
  lunta: "Mendel",
  // Round 4b — second pass on rejects
  rutini: "Rutini",
  zaha: "Zaha",
  "humberto canale": "Humberto Canale",
  "la poderosa": "La Poderosa",
  "pequeñas producciones": "Escorihuela",
  "pequenas producciones": "Escorihuela",
  "casa ambrosia": "Finca Ambrosía",
  "casa ambrosía": "Finca Ambrosía",
  "sapo de otro pozo": "Mosquita Muerta",
  "chateau subsonico": "Falasco Wines",
  yacochuya: "San Pedro de Yacochuya",
  // Round 4c — final pass
  "cuvelier los andes": "Cuvelier Los Andes",
  sophenia: "Sophenia",
  antigal: "Antigal",
  kriptos: "Kriptos Wines",
  "de mono rojo": "De Moño Rojo",
  "de moño rojo": "De Moño Rojo",
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

// Generic descriptors stripped from the canonical-name secondary key
// after the strict bucket key (brand+varietals+format+type) is set.
// Excludes varietals — those live in their own field and are part of
// the strict key. Includes "reserva", "gran", "clásico" (stylistic
// qualifiers that don't define product identity).
const SECONDARY_NOISE_TOKENS = new Set([
  "vino",
  "vinos",
  "tinto",
  "blanco",
  "rosado",
  "rose",
  "espumante",
  "champagne",
  "brut",
  "dulce",
  "seco",
  "reserva",
  "gran",
  "clasico",
  "clásico",
  "premium",
  "750ml",
  "750",
  "ml",
  "cc",
  "750cc",
  "1500ml",
  "botella",
  "bot",
  "x",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "con",
  "sin",
  // Common varietals: still drop them from the secondary key — the
  // varietals[] field handles discrimination at the strict-key level,
  // and a name with the varietal vs without should still match.
  "malbec",
  "cabernet",
  "sauvignon",
  "chardonnay",
  "bonarda",
  "syrah",
  "shiraz",
  "pinot",
  "noir",
  "grigio",
  "merlot",
  "torrontes",
  "torrontés",
  "tempranillo",
  "franc",
  "petit",
  "verdot",
  "viognier",
  "semillon",
  "semillón",
  "tannat",
  "riesling",
  "moscatel",
  "criolla",
  "blanc",
  "blancs",
  // Wine industry phrasing that's marketing fluff, not identity
  "vineyard",
  "vineyards",
  "designated",
  "designation",
  "single",
  "estate",
  "edition",
  "selection",
  "seleccion",
  "selección",
  "limited",
  "limitada",
  "old",
  "vines",
  "viejas",
  "natural",
]);

// Producers that often appear as a leading word in canonicalNames where
// the actual wine identity is the *next* token(s) (e.g., "Noemia A Lisa"
// where the wine is A Lisa). Strip these from the start when bucketing.
// Built dynamically from NAME_PREFIX_TO_BRAND values + a curated set of
// well-known parent bodegas.
const KNOWN_PRODUCERS = new Set(
  [
    // Both KEYS (e.g., "adrianna") and VALUES (e.g., "Catena Zapata")
    // of the prefix map count as strippable producer prefixes — adrianna
    // is a Catena line so when it appears mid-name like "DV Catena
    // Adrianna" the iterative strip should peel both "dv catena" and
    // "adrianna".
    ...Object.keys(NAME_PREFIX_TO_BRAND),
    ...Object.values(NAME_PREFIX_TO_BRAND).map((v) =>
      stripAccents(v).toLowerCase(),
    ),
    "noemia",
    "catena zapata",
    "catena",
    "trapiche",
    "norton",
    "salentein",
    "zuccardi",
    "rutini",
    "luigi bosca",
    "doña paula",
    "dona paula",
    "ernesto catena",
    "viña cobos",
    "vina cobos",
    "mendel",
    "achaval ferrer",
    "etchart",
    "colome",
    "alta vista",
    "lagarde",
    "septima",
    "séptima",
    "bressia",
    "riccitelli",
    "atamisque",
    "monteviejo",
    "susana balbo",
    "nieto senetiner",
    "casa boher",
    "rosell boher",
    "garzon",
    "garzón",
    "argento",
    "santa julia",
    "familia zuccardi",
    "sottano",
    "humberto canale",
    "casarena",
    "bianchi",
    "pulenta",
    "pulenta estate",
    "los haroldos",
    "finca las moras",
    "tikal",
    "el porvenir",
  ].sort((a, b) => b.length - a.length), // longest-first so "catena zapata" matches before "catena"
);

/**
 * Compute the secondary discriminator from the canonical name.
 * Iteratively strips leading producer names, then drops varietals and
 * noise. Returns the remaining token list joined by space, or empty
 * string if everything was noise (in which case the strict bucket key —
 * brand + varietals + format + type — is the discriminator).
 *
 * "A LISA MALBEC" → strip producer "A LISA" → "MALBEC" → strip varietal → ""
 * "Noemia A Lisa" → strip "Noemia" → "A Lisa" → strip "A Lisa" → ""
 * "Catena Estate Malbec" → strip "Catena" → "Estate Malbec" → strip "Malbec" → "estate"
 * "Catena Adrianna Malbec" → strip "Catena" → "Adrianna Malbec" → "adrianna"
 */
function secondaryKey(canonicalName) {
  let s = normalizeName(canonicalName).replace(/[^a-z0-9\s.]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Peel up to 3 leading noise words ("Vino Espumante X" etc.)
  for (let i = 0; i < 3; i++) {
    const next = s.replace(LEADING_NOISE, "");
    if (next === s) break;
    s = next;
  }
  // Iteratively strip leading producer names — a name like "Noemia A
  // Lisa" needs to strip both producers in sequence to land at empty.
  for (let i = 0; i < 4; i++) {
    let stripped = false;
    for (const prod of KNOWN_PRODUCERS) {
      if (s === prod) {
        s = "";
        stripped = true;
        break;
      }
      if (s.startsWith(prod + " ")) {
        s = s.slice(prod.length + 1);
        stripped = true;
        break;
      }
    }
    if (!stripped) break;
  }
  // Drop varietals + noise tokens, keep only identity tokens.
  const tokens = s
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, "")) // strip stray dots
    .filter((t) => t && !SECONDARY_NOISE_TOKENS.has(t));
  return tokens.join(" ").trim();
}

/**
 * Strict bucket key: brand + varietals + format + type + secondary.
 * Two groups bucket together only when ALL of these match. The strict
 * varietals/format/type guard is what stops "Catena Malbec" and "Catena
 * Cabernet" from accidentally merging under the secondary discriminator
 * fallback.
 */
function strictBucketKey(g, resolvedBrand) {
  const brand = stripAccents(String(resolvedBrand ?? ""))
    .toLowerCase()
    .trim();
  const varietals = (g.varietals ?? [])
    .map((v) => stripAccents(String(v)).toLowerCase().trim())
    .sort()
    .join(",");
  const format = g.format ?? "";
  const type = stripAccents(String(g.type ?? ""))
    .toLowerCase()
    .trim();
  const sec = secondaryKey(g.canonicalName);
  return `${brand}|${varietals}|${format}|${type}|${sec}`;
}

/** Two vintages are compatible if equal OR at least one is null/empty.
 * Lets us merge a vintage-null umbrella group with a specific-vintage
 * one when other criteria match. */
function vintagesCompatible(vintages) {
  const specific = vintages
    .map((v) => (v == null || v === "" ? null : v))
    .filter((v) => v !== null);
  return new Set(specific).size <= 1;
}

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
  // Round 4
  "altura",
  "agrelo",
  "la consulta",
  "primeras viñas",
  "primeras vinas",
  "saenz",
  "1888",
  "lote",
  "cortimundo",
  "agostino",
  "barrel",
  "barrel select",
  "cofre",
  "doble magnum",
  // Round 4b
  "chateau",
  "bdfm",
  "lote negro",
  "casa rojo",
  "dom perignon",
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

  // Bucket by strict key (brand + varietals + format + type + secondary).
  // Vintage is checked separately so a vintage-null umbrella group can
  // merge with a specific-vintage one (very common: some scrapers
  // extract the year from the name, others don't).
  // Skip groups that have no resolvable brand AND no varietal — they're
  // too ambiguous to bucket safely.
  const buckets = new Map();
  for (const g of groups) {
    const resolved = resolveBrandFromName(g.canonicalName, g.brand);
    if (!resolved && (!g.varietals || g.varietals.length === 0)) continue;
    const key = strictBucketKey(g, resolved);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }

  const dropSet = new Set();
  let mergedBuckets = 0;
  let rejectedBuckets = 0;
  const examples = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    // Vintage compat: at most ONE specific vintage in the bucket
    // (others must be null). Otherwise we'd merge 2017 and 2018 vintages
    // of the same wine, which is wrong for premium wines where vintage
    // matters.
    const vintages = bucket.map((g) => g.vintage ?? null);
    if (!vintagesCompatible(vintages)) {
      rejectedBuckets++;
      if (examples.length < 50) {
        examples.push({
          reason: "vintage-conflict",
          totalSc: bucket.reduce((s, g) => s + (g.storeCount ?? 0), 0),
          names: bucket.map(
            (g) =>
              `sc=${g.storeCount ?? 0} · v=${g.vintage ?? "∅"} · ${g.brand ?? "∅"}: ${g.canonicalName}`,
          ),
        });
      }
      continue;
    }

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
    // The merged primary should keep the most informative vintage —
    // if any group in the bucket had a specific vintage, that wins.
    const specificVintage = bucket
      .map((g) => g.vintage)
      .find((v) => v != null && v !== "");
    if (specificVintage) primary.vintage = specificVintage;
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
