#!/usr/bin/env node
/**
 * Reads data/snapshot.json and augments it with a productGroups array.
 * Uses deterministic matching (canonical name + vintage + format).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Decode HTML entities (&amp; &#8220; &#8211; etc) so names display cleanly. */
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

const VARIETALS = [
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
];

const REGIONS = [
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

const TYPES = [
  {
    name: "Espumante",
    re: /\b(espumante|extra\s*brut|nature|champagne|champa\xf1a|brut|champenois|prosecco|cava)\b/i,
  },
  { name: "Rosado", re: /\b(rosado|ros[eé]|ros[eé]\s+de|blush)\b/i },
  { name: "Blanco", re: /\b(blanco|white|chardonnay|sauvignon\s+blanc|torront[eé]s|viognier|riesling|semill[oó]n|pinot\s+grigio)\b/i },
  { name: "Dulce", re: /\b(dulce|cosecha\s+tard[ií]a|late\s+harvest|tard[ií]o|malamado|fortificado|oporto|jerez)\b/i },
  { name: "Tinto", re: /\b(tinto|red|malbec|cabernet|merlot|bonarda|syrah|shiraz|petit\s+verdot|tempranillo|pinot\s+noir)\b/i },
];

function extractVarietals(name) {
  const out = [];
  for (const v of VARIETALS) {
    if (v.re.test(name) && !out.includes(v.name)) {
      // Special-case: don't add "Cabernet" if we already matched Cabernet Sauvignon/Franc
      if (v.name === "Cabernet" && (out.includes("Cabernet Sauvignon") || out.includes("Cabernet Franc"))) {
        continue;
      }
      out.push(v.name);
    }
  }
  return out.slice(0, 3);
}

function extractRegion(name, brand) {
  const haystack = `${name} ${brand ?? ""}`;
  for (const r of REGIONS) {
    if (r.re.test(haystack)) return r.name;
  }
  return null;
}

function extractType(name) {
  // Priority: Espumante > Rosado > Dulce > Blanco > Tinto
  // Some bottles are both "malbec" (tinto) and "espumante" — espumante wins.
  for (const t of TYPES) {
    if (t.re.test(name)) return t.name;
  }
  return null;
}

function extractVintage(name) {
  const m = name.match(/\b(19\d{2}|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
}

function extractFormat(name) {
  const lower = name.toLowerCase();
  const parts = [];
  const mPack = lower.match(/\b(caja|pack|box|estuche)\b/);
  const mXN = lower.match(/\bx\s*(\d+)\b/);
  const mMagnum = lower.match(/\bmagnum\b/);
  const mHalf = lower.match(/\b(media|half)\b/);
  const mVolL = lower.match(/\b(\d+(?:[.,]\d+)?)\s*l\b/);
  // Catálogos argentinos usan ml/cc/cm3/cm³ como sinónimos para ml.
  // El bug histórico era capturar sólo "ml", lo que dejaba que "Saint
  // Felicien Malbec 375 Cc" entrara al mismo grupo que el 750ml por no
  // tener slot de format. Lookahead (no \b) al final por el char Unicode
  // del "cm³".
  const mVolMl = lower.match(
    /\b(\d{3,4})\s*(ml|cc|cm3|cm³)(?=\s|$|[^a-z0-9])/,
  );
  if (mPack) parts.push(mPack[1]);
  if (mXN) parts.push(`x${mXN[1]}`);
  if (mMagnum) parts.push("magnum");
  if (mHalf) parts.push("half");
  if (mVolL) parts.push(`${mVolL[1].replace(",", ".")}l`);
  if (mVolMl && mVolMl[1] !== "750") parts.push(`${mVolMl[1]}ml`);
  return parts.length > 0 ? parts.sort().join("-") : null;
}

/** Common typo and alias map — collapse variants to a canonical form. */
const BRAND_ALIASES = [
  ["zucardi", "zuccardi"],
  ["familia zuccardi", "zuccardi"],
  ["familia zucardi", "zuccardi"],
  ["cheval des andes", "cheval"],
  ["bodega catena zapata", "catena"],
  ["catena zapata", "catena"],
  ["bodega norton", "norton"],
  ["bodegas norton", "norton"],
  ["bodega trapiche", "trapiche"],
  ["bodega salentein", "salentein"],
  ["bodegas salentein", "salentein"],
  ["luigi bosca", "luigibosca"],
  ["el esteco", "elesteco"],
  ["finca las moras", "lasmoras"],
  ["las moras", "lasmoras"],
  ["don david", "dondavid"],
  ["kaiken", "kaiken"],
  ["chandon", "chandon"],
  ["baron b", "baronb"],
];

/**
 * Label → bodega: cuando un scraper pone el NOMBRE DE LA LÍNEA como
 * brand (ej "Concreto" en vez de "Zuccardi"), colapsa al brand canónico.
 * Solo se incluyen aliases con asociación 1:1 no ambigua en el mercado
 * AR. Se aplica a los productos crudos antes de cualquier matching
 * (Stage 0/1/2/3) para que todo el pipeline use el mismo brand.
 */
/**
 * Name-prefix → brand overrides. Runs BEFORE any brand-based matching.
 *
 * Some labels are inconsistently attributed by scrapers: one store lists
 * "A Lisa Malbec" with brand="A Lisa" (the label), another with
 * brand="Noemia" (the producing bodega). Both versions are the same
 * wine, so we force the brand based on the product name prefix — which
 * is what the consumer actually sees on the bottle and searches for.
 *
 * Key is a lowercased, accent-stripped prefix. Match is "name starts
 * with `<prefix> `" or exact equality. Keep entries specific enough
 * that they don't over-match (e.g., "malbec" as a prefix would be a
 * disaster — it'd stomp the real brand of every Malbec in the catalog).
 *
 * Grow this list when a wine surfaces as two near-identical groups
 * with different brand attributions — check /admin/fuentes or the
 * duplicate-hunting report.
 */
/**
 * Name-prefix → brand overrides. Keep in sync with
 * scripts/remerge-groups.mjs (same map, applied post-Stage 3).
 *
 * Only add entries when:
 *   - The prefix is specific enough to NOT match generic wines
 *     (never add "malbec", "reserva", etc.)
 *   - You've confirmed multiple wines share this label with mixed
 *     brand attributions in the data (use find-duplicates.mjs)
 */
const NAME_PREFIX_TO_BRAND = {
  // ── Noemia's labels (often attributed to producer "Noemia") ──
  "a lisa": "A Lisa",
  "a. lisa": "A Lisa",
  "j alberto": "J. Alberto",
  "j. alberto": "J. Alberto",

  // ── Catena family (sometimes listed under Catena Zapata) ──
  "dv catena": "DV Catena",
  "dv adrianna": "DV Catena",
  "dv catena adrianna": "DV Catena",
  "alamos": "Alamos",
  "saint felicien": "Saint Felicien",
  "luca": "Luca",
  "nicolas catena": "Nicolas Catena Zapata",
  "angelica zapata": "Catena Zapata",
  "angélica zapata": "Catena Zapata",
  adrianna: "Catena Zapata",
  nicasia: "Catena Zapata",
  argentino: "Catena Zapata",

  // ── Ernesto Catena (Catena Zapata's brother's winery) ──
  "alma negra": "Alma Negra",
  padrillos: "Padrillos",
  "tikal": "Tikal",

  // ── Alejandro Vigil's Enemigo line ──
  "el enemigo": "El Enemigo",
  "gran enemigo": "Gran Enemigo",

  // ── Salentein labels (frequently listed as the parent bodega) ──
  portillo: "Salentein",
  numina: "Salentein",
  primus: "Salentein",
  killka: "Salentein",
  pyros: "Salentein",
  alyda: "Salentein",

  // ── Zuccardi labels ──
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

  // ── Rutini lines ──
  encuentro: "Rutini",
  antologia: "Rutini",
  antología: "Rutini",
  expresiones: "Rutini",
  trumpeter: "Trumpeter",
  apartado: "Rutini Apartado",

  // ── Luigi Bosca ──
  paradigma: "Luigi Bosca",
  "finca los nobles": "Luigi Bosca",
  "la linda": "La Linda",
  "finca la linda": "La Linda",

  // ── Norton labels ──
  perdriel: "Norton",
  "cosecha especial": "Norton",
  "sexy fish": "Sexy Fish",
  "lote negro": "Lote Negro",

  // ── Trapiche lines ──
  medalla: "Trapiche",
  broquel: "Trapiche",
  iscay: "Trapiche",
  "costa & pampa": "Trapiche",
  alaris: "Trapiche",

  // ── Independent labels commonly mis-attributed ──
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
  "privada": "Norton Privada",
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
  "mosquita muerta": "Mosquita Muerta",
  salentein: "Salentein",
  pulenta: "Pulenta Estate",
  otornia: "Otronia",
  "veuve cliquot": "Veuve Clicquot",
  "veuve clicquot": "Veuve Clicquot",
  andillian: "La Coste de los Andes",
  "los cardos": "Doña Paula",
  "almacen de la quebrada": "Almacén de la Quebrada",
  "almacén de la quebrada": "Almacén de la Quebrada",
  // Round 4
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
  "mendel unus": "Mendel",
  lunta: "Mendel",
  // Round 4b
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
  // Round 4c
  "cuvelier los andes": "Cuvelier Los Andes",
  sophenia: "Sophenia",
  antigal: "Antigal",
  kriptos: "Kriptos Wines",
  "de mono rojo": "De Moño Rojo",
  "de moño rojo": "De Moño Rojo",
};

/** Apply NAME_PREFIX_TO_BRAND. Runs before isBadBrand / resolveBrandLabel. */
function resolveBrandFromName(rawName, originalBrand) {
  if (!rawName) return originalBrand;
  const lower = stripAccents(String(rawName))
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const prefix of Object.keys(NAME_PREFIX_TO_BRAND)) {
    if (lower === prefix || lower.startsWith(prefix + " ")) {
      return NAME_PREFIX_TO_BRAND[prefix];
    }
  }
  return originalBrand;
}

const LABEL_TO_BODEGA = {
  // Zuccardi labels
  concreto: "Zuccardi",
  emma: "Zuccardi",
  "emma zuccardi": "Zuccardi",
  "zuccardi de viticultor": "Zuccardi",
  aluvional: "Zuccardi",
  fosil: "Zuccardi",
  "piedra infinita": "Zuccardi",
  "finca piedra infinita": "Zuccardi",
  "jose zuccardi": "Zuccardi",
  "serie a": "Zuccardi",
  poligonos: "Zuccardi",
  polígonos: "Zuccardi",
  // Catena Zapata labels
  adrianna: "Catena Zapata",
  "adrianna vineyard": "Catena Zapata",
  nicasia: "Catena Zapata",
  "nicasia vineyard": "Catena Zapata",
  argentino: "Catena Zapata",
  // Rutini lines
  expresiones: "Rutini",
  encuentro: "Rutini",
  antologia: "Rutini",
  antología: "Rutini",
  "rutini wines": "Rutini",
  // Luigi Bosca
  paradigma: "Luigi Bosca",
  "finca los nobles": "Luigi Bosca",
  // Trapiche
  medalla: "Trapiche",
  broquel: "Trapiche",
  iscay: "Trapiche",
  "costa & pampa": "Trapiche",
  alaris: "Trapiche",
  // Norton
  perdriel: "Norton",
  "cosecha especial": "Norton",
  // Salentein labels
  portillo: "Salentein",
  numina: "Salentein",
  primus: "Salentein",
  killka: "Salentein",
  pyros: "Salentein",
  alyda: "Salentein",
  // Alejandro Vigil / independent (NOT Catena despite association)
  "el enemigo": "El Enemigo",
  aleanna: "El Enemigo",
  // Hess Family produces Colome in Argentina
  "hess family": "Colome",
  // Mumm sometimes listed as "MUMM LEGER" etc.
  "mumm leger 750 cc.": "Mumm",
  // Familia Zuccardi / Santa Julia variants (Santa Julia is Zuccardi's entry line)
  "familia zucardi": "Zuccardi",
  "familia zuccardi": "Zuccardi",
  zucardi: "Zuccardi",
  // Durigutti / Las Compuertas etc — dejar como están
};

/** Apply LABEL_TO_BODEGA: if raw brand matches a known label, return the
 * canonical bodega; otherwise return trimmed original (null→null). */
function resolveBrandLabel(raw) {
  if (!raw) return raw;
  const trimmed = String(raw).trim();
  if (!trimmed) return trimmed;
  const lower = stripAccents(trimmed)
    .toLowerCase()
    .replace(/^\s*(bodegas?|familia)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return LABEL_TO_BODEGA[lower] ?? trimmed;
}

/**
 * Detect obviously-bad brand values that scrapers sometimes put in the
 * brand field: varietals ("Malbec"), regions ("Altamira"), wine types
 * ("Tinto"), or generic words. Returning true means we should null the
 * brand so inference/matching can assign a real one from the name.
 */
const BAD_BRAND_LITERALS = new Set([
  "vino",
  "wine",
  "wines",
  "tinto",
  "blanco",
  "rosado",
  "rose",
  "rojo",
  "red",
  "white",
  "espumante",
  "champagne",
  "champana",
  "brut",
  "dulce",
  "reserva",
  "premium",
  "gran reserva",
  "malbec",
  "cabernet",
  "cabernet sauvignon",
  "cabernet franc",
  "chardonnay",
  "merlot",
  "bonarda",
  "syrah",
  "shiraz",
  "pinot noir",
  "pinot grigio",
  "sauvignon blanc",
  "torrontes",
  "torrontés",
  "tempranillo",
  "petit verdot",
  "viognier",
  "semillon",
  "semillón",
  "tannat",
  "riesling",
  "mendoza",
  "salta",
  "cafayate",
  "patagonia",
  "san juan",
  "la rioja",
  "altamira",
  "tupungato",
  "lujan de cuyo",
  "valle de uco",
  "uco",
  "varios",
  "otros",
  "sin marca",
  "sin identificar",
  // Generic "undefined" / placeholder values from scrapers
  "sin definir",
  "sin reglas",
  "sin definido",
  "no definido",
  "otros",
  "s/d",
  "s/m",
  // Generic wine descriptors mistaken for brands
  "select",
  "cosecha",
  "cuvee",
  "cuvée",
  "fran",
  "centenario",
  "del valle",
  "gualtallary",
  // Single-character or numeric garbage
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
  "casa rojo",
  "dom perignon",
]);

function isBadBrand(raw) {
  if (!raw) return false;
  const lower = stripAccents(String(raw))
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return BAD_BRAND_LITERALS.has(lower);
}

// Words that don't carry wine identity — strip from the token set.
// KEEP varietals (Malbec/Bonarda/etc), proper nouns, and quality tiers —
// they're part of wine identity and distinguish e.g. Emma Bonarda from
// Emma Malbec.
const NOISE_TOKENS = new Set([
  "vino",
  "cosecha",
  "anada",
  "ano",
  "lata",
  "botella",
  "unidad",
  "unidades",
  "unid",
  "caja",
  "estuche",
  "pack",
  "box",
  "magnum",
  "media",
  "half",
  "750",
  "750cc",
  "cc",
  "ml",
  "tinto",
  "rojo",
  "red",
  "white",
  "x1",
  "x2",
  "x3",
  "x4",
  "x6",
  "x12",
  "de",
  "la",
  "el",
  "los",
  "las",
  "del",
  "y",
  "e",
  "o",
  "u",
  "x",
  "a",
]);

function tokenize(name) {
  const s = stripAccents(name)
    .toLowerCase()
    .replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ")
    // Coherente con extractFormat: borramos volumen en ml/cc/cm3/cm³
    // para que no aparezcan tokens "375" y "cc" sueltos en el base.
    .replace(/\b\d+\s*(ml|cc|cm3|cm³)(?=\s|$|[^a-z0-9])/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*l\b/g, " ")
    .replace(/\bx\s*\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s
    .split(" ")
    .filter((t) => t && t.length > 1 && !NOISE_TOKENS.has(t));
}

function normalizeBrandAlias(brand) {
  if (!brand) return null;
  let s = stripAccents(brand)
    .toLowerCase()
    .replace(/^bodega(s)?\s+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [from, to] of BRAND_ALIASES) {
    if (s === from) {
      s = to;
      break;
    }
  }
  return s;
}

function canonicalize(name, brand) {
  const vintage = extractVintage(name);
  const format = extractFormat(name);

  // Token-set from name: order-independent, vintage-independent
  const nameTokens = tokenize(name);

  // Also include alias-normalized brand tokens so "Zucardi Emma" and
  // "Zuccardi Emma" match. Apply alias replacement BEFORE tokenization so
  // multi-word aliases (Familia Zucardi) resolve first.
  const brandSanitized = normalizeBrandAlias(brand);
  if (brandSanitized) {
    for (const t of brandSanitized.split(" ")) {
      if (t && !NOISE_TOKENS.has(t) && !nameTokens.includes(t)) {
        nameTokens.push(t);
      }
    }
  }

  // Apply brand aliases inside the name tokens too
  const joined = nameTokens.join(" ");
  let aliased = joined;
  for (const [from, to] of BRAND_ALIASES) {
    aliased = aliased.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  const finalTokens = aliased.split(" ").filter(Boolean);

  // Sort tokens alphabetically so order of words doesn't matter
  finalTokens.sort();

  return {
    base: finalTokens.join(" "),
    vintage,
    format,
  };
}

function keyToString(k) {
  // Only base is used as the matching key. Vintage and format are kept as
  // metadata per offer — we show vintage on the ficha to let the buyer
  // decide. Pooling across vintages drastically improves group coverage
  // (Emma Bonarda 2010, 2012, 2014 all collapse into one group).
  return k.base;
}

function groupSlug(k) {
  // Slug matches the key — vintage/format are per-offer metadata, not identity.
  return k.base
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Infer brand on products where the scraper couldn't extract one, by
// matching their name against brands that OTHER products in the dataset
// do have. Helps merging — e.g. "Vino Concreto Malbec" (brand=null in
// Casa de Vinos Mendoza) will pick up brand=Zuccardi from the hundreds
// of other Concreto listings that have it. Also feeds Stage 2 embedding
// input with richer context.
const GENERIC_BRAND_TOKENS = new Set([
  // Too generic to be useful as an inference key
  "vino",
  "vinos",
  "wine",
  "wines",
  "bodega",
  "bodegas",
  "familia",
  "reserva",
  "estate",
  "cellars",
  "finca",
]);

function inferBrands(products) {
  const brandCanonical = new Map(); // lowercased → original casing
  for (const p of products) {
    if (!p.brand) continue;
    const trimmed = p.brand.trim();
    if (trimmed.length < 3) continue;
    const lower = trimmed.toLowerCase();
    if (!brandCanonical.has(lower)) brandCanonical.set(lower, trimmed);
  }
  // Filter out too-generic single-word brands
  const entries = [...brandCanonical.entries()].filter(([lower]) => {
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length === 1 && GENERIC_BRAND_TOKENS.has(words[0])) return false;
    return true;
  });
  // Sort by length desc so "Catena Zapata" beats "Catena" for a name
  // containing both.
  entries.sort((a, b) => b[0].length - a[0].length);

  let filled = 0;
  for (const p of products) {
    if (p.brand) continue;
    const name = (p.name ?? "").toLowerCase();
    if (!name) continue;
    for (const [lower, original] of entries) {
      // Word-boundary match so "Alta" doesn't match inside "Altamira"
      const re = new RegExp(
        `\\b${lower.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
        "i",
      );
      if (re.test(name)) {
        p.brand = original;
        filled++;
        break;
      }
    }
  }
  return filled;
}

// Second inference pass: infer brand from wine LINE tokens that are
// distinctive of a single bodega. E.g. "Concreto Malbec" (scraper didn't
// pick up the bodega) contains "concreto", which appears only in
// Zuccardi-branded products in our corpus → assign brand=Zuccardi.
// This catches the common case of supermarkets listing a well-known
// label without the bodega prefix in the product name.
function inferBrandsFromLine(products) {
  const tokenBrandCount = new Map(); // token → Map(brand → count)
  const brandOriginalCase = new Map(); // lower → canonical casing

  for (const p of products) {
    if (!p.brand) continue;
    const trimmed = p.brand.trim();
    const brandLower = trimmed.toLowerCase();
    if (brandLower.length < 3) continue;
    if (!brandOriginalCase.has(brandLower)) {
      brandOriginalCase.set(brandLower, trimmed);
    }
    const brandTokens = new Set(
      brandLower.split(/\s+/).filter((t) => t.length >= 3),
    );
    const tokens = new Set(
      tokenize(p.name ?? "").filter((t) => t.length >= 4),
    );
    for (const t of tokens) {
      if (brandTokens.has(t)) continue; // skip brand's own tokens
      if (!tokenBrandCount.has(t)) tokenBrandCount.set(t, new Map());
      const m = tokenBrandCount.get(t);
      m.set(brandLower, (m.get(brandLower) ?? 0) + 1);
    }
  }

  // Distinctive: token appears in ≥3 products of exactly 1 brand.
  // ≥3 (not ≥2) guards against accidental single-brand occurrences.
  const distinctive = new Map();
  for (const [token, brandMap] of tokenBrandCount) {
    if (brandMap.size !== 1) continue;
    const [[brand, count]] = brandMap;
    if (count >= 3) distinctive.set(token, brand);
  }

  let filled = 0;
  for (const p of products) {
    if (p.brand) continue;
    const tokens = tokenize(p.name ?? "");
    for (const t of tokens) {
      if (t.length < 4) continue;
      const brand = distinctive.get(t);
      if (brand) {
        p.brand = brandOriginalCase.get(brand) ?? brand;
        filled++;
        break;
      }
    }
  }
  return { filled, distinctiveCount: distinctive.size };
}

function main() {
  const inPath = resolve(REPO_ROOT, "data/snapshot.json");
  const snap = JSON.parse(readFileSync(inPath, "utf8"));
  // Decode HTML entities everywhere before building groups so names are clean
  for (const p of snap.products ?? []) {
    if (p.name) p.name = decodeEntities(p.name);
    if (p.brand) p.brand = decodeEntities(p.brand);
    if (p.description) p.description = decodeEntities(p.description);
  }
  const products = snap.products ?? [];

  // Force brand from product-name prefix for known labels that get
  // attributed inconsistently across stores (A Lisa, J. Alberto, etc.).
  // Runs FIRST so downstream cleanup works against the corrected brand.
  let prefixForced = 0;
  for (const p of products) {
    const forced = resolveBrandFromName(p.name, p.brand);
    if (forced !== p.brand) {
      p.brand = forced;
      prefixForced++;
    }
  }
  if (prefixForced > 0)
    console.log(`Name-prefix → brand forced: ${prefixForced}`);

  // Clean bad brand values (varietal/region/generic) + resolve
  // label→bodega canónico. Both run ANTES del matching para que
  // Stage 0-3 y la brand inference trabajen con brand fields limpios.
  let cleaned = 0;
  let relabeled = 0;
  for (const p of products) {
    if (isBadBrand(p.brand)) {
      p.brand = null;
      cleaned++;
    }
    const resolved = resolveBrandLabel(p.brand);
    if (resolved !== p.brand) {
      p.brand = resolved;
      relabeled++;
    }
  }
  if (cleaned > 0) console.log(`Bad brands nulled: ${cleaned}`);
  if (relabeled > 0) console.log(`Label→bodega resolved: ${relabeled}`);

  // Infer missing brands using the corpus of known brands
  const brandlessBefore = products.filter((p) => !p.brand).length;
  const inferred = inferBrands(products);
  console.log(
    `Brand inference (pass 1, name-contains-brand): ${inferred}/${brandlessBefore} gained a brand`,
  );
  // Second pass: reverse inference from distinctive wine-line tokens
  // (e.g. "Concreto" → Zuccardi). Catches products that mention the
  // wine label without the bodega prefix.
  const remaining = products.filter((p) => !p.brand).length;
  const { filled: inferredLine, distinctiveCount } =
    inferBrandsFromLine(products);
  console.log(
    `Brand inference (pass 2, line→brand): ${inferredLine}/${remaining} gained a brand (${distinctiveCount} distinctive line tokens)`,
  );

  // ============ STAGE 0: EAN grouping ============
  // Barcode (GTIN/EAN) is a globally unique product identifier. When two
  // stores list the same EAN, it's the same wine — zero false positives.
  // We pre-cluster by EAN, then canonicalize + merge-by-key picks up the
  // remaining by name tokens.
  //
  // EAN extraction: externalSku that's 12-14 digits. Strip variants like
  // "7,80E+12" (Excel export scientific notation) which we can't recover.
  function extractEan(p) {
    const sku = (p.externalSku ?? "").toString().trim();
    if (!sku) return null;
    // Drop non-EAN scientific notation and similar garbage
    if (/[eE]\+?\d/.test(sku)) return null;
    // Exact 12-14 digit barcode
    const m = sku.match(/^\s*(\d{12,14})\s*$/);
    return m ? m[1] : null;
  }

  // Assign each product to an EAN cluster (if it has one)
  const eanToProducts = new Map();
  const productEan = new Map();
  for (const p of products) {
    const ean = extractEan(p);
    if (!ean) continue;
    productEan.set(p, ean);
    const arr = eanToProducts.get(ean) ?? [];
    arr.push(p);
    eanToProducts.set(ean, arr);
  }
  const multiStoreEans = [...eanToProducts.values()].filter((items) => {
    const stores = new Set(items.map((i) => i.storeSlug));
    return stores.size >= 2;
  }).length;
  console.log(
    `  Stage 0: ${eanToProducts.size} EANs distintos, ${multiStoreEans} compartidos por 2+ tiendas`,
  );

  // ============ STAGE 1: canonical-key grouping ============
  const byKey = new Map();
  for (const p of products) {
    const k = canonicalize(p.name, p.brand);
    if (!k.base) continue;
    const ks = keyToString(k);
    const existing = byKey.get(ks);
    if (existing) existing.items.push(p);
    else byKey.set(ks, { key: k, items: [p] });
  }

  // ============ STAGE 0 + 1 merge: union EAN clusters ============
  // After Stage 1 we have key-clusters. Now we also union groups that
  // share an EAN even if their canonical keys differ.
  // Build productId -> clusterKey map
  const productToClusterKey = new Map();
  for (const [clusterKey, { items }] of byKey.entries()) {
    for (const item of items) productToClusterKey.set(item, clusterKey);
  }
  // For each multi-store EAN, merge all products' cluster keys into one
  let eanMerges = 0;
  for (const [ean, items] of eanToProducts.entries()) {
    if (items.length < 2) continue;
    // Pick target cluster: the one with the most items (most likely the
    // canonical group)
    const clusterKeys = items
      .map((i) => productToClusterKey.get(i))
      .filter(Boolean);
    if (clusterKeys.length === 0) continue;
    const clusterSize = new Map();
    for (const ck of clusterKeys) {
      clusterSize.set(ck, (clusterSize.get(ck) ?? 0) + 1);
    }
    // Pick the cluster with the most products
    const target = [...clusterSize.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0][0];
    // Merge other clusters into target
    for (const ck of new Set(clusterKeys)) {
      if (ck === target) continue;
      const src = byKey.get(ck);
      const tgt = byKey.get(target);
      if (!src || !tgt) continue;
      // Move items
      for (const item of src.items) {
        tgt.items.push(item);
        productToClusterKey.set(item, target);
      }
      byKey.delete(ck);
      eanMerges++;
    }
  }
  if (eanMerges > 0) console.log(`  Stage 0 merges: ${eanMerges}`);

  // Stage 1b: subset merge. Single-token or short groups whose tokens are a
  // strict subset of a larger multi-item group likely belong to that group
  // (e.g. "Emma Bonarda" without brand token, merged into "Emma Bonarda
  // Zuccardi"). Require the subset to have >=2 distinctive tokens and the
  // target to be unambiguous (only one multi-item group contains those
  // tokens as a subset).
  const keyEntries = [...byKey.entries()];
  const targets = keyEntries.filter(([, v]) => v.items.length >= 2);
  const targetTokens = targets.map(([k]) => ({
    key: k,
    tokens: new Set(k.split(" ").filter(Boolean)),
  }));

  const merged = new Set();
  for (const [k, v] of keyEntries) {
    if (v.items.length >= 2) continue; // only try to merge singletons
    const tokens = k.split(" ").filter(Boolean);
    if (tokens.length < 2) continue;
    // Find all targets where these tokens are a strict subset of target tokens
    const matches = targetTokens.filter(
      (t) =>
        t.key !== k &&
        tokens.every((tok) => t.tokens.has(tok)) &&
        tokens.length < t.tokens.size,
    );
    if (matches.length === 1) {
      // Unambiguous match — merge
      const target = byKey.get(matches[0].key);
      if (target) {
        target.items.push(...v.items);
        merged.add(k);
      }
    }
  }
  for (const k of merged) byKey.delete(k);

  const usedSlugs = new Map();
  const groups = [];

  for (const { key, items } of byKey.values()) {
    let slug = groupSlug(key);
    if (!slug) slug = "wine";
    const baseSlug = slug;
    const count = usedSlugs.get(baseSlug) ?? 0;
    if (count > 0) slug = `${baseSlug}-${count + 1}`;
    usedSlugs.set(baseSlug, count + 1);

    // Stock-aware summary: min/max/storeCount/offerCount reflect only
    // in-stock offers. Si NO hay ninguna in-stock, queda en null/0 y el
    // frontend muestra "Actualmente sin stock" en vez de precio (opción 3
    // acordada con Sebi, 2026-04-21). Los offers crudos siguen en el
    // detalle para que la tabla muestre las tiendas que lo tienen (con
    // badge "sin stock") pero sin sugerir un precio vigente.
    const inStockItems = items.filter((i) => i.inStock);
    const uniqueStores = new Set(inStockItems.map((i) => i.storeSlug));
    const prices = inStockItems
      .map((i) => i.priceArs)
      .filter((p) => typeof p === "number" && p > 0);

    const canonicalName =
      items.slice().sort((a, b) => a.name.length - b.name.length)[0].name;
    const brand =
      items.find((i) => i.brand)?.brand?.replace(/^Bodega(s)?\s+/i, "") ?? null;
    const imageUrl = items.find((i) => i.imageUrl)?.imageUrl ?? null;

    const offers = items
      .map((i) => ({
        storeSlug: i.storeSlug,
        externalUrl: i.externalUrl,
        externalSku: i.externalSku,
        name: i.name,
        priceArs: i.priceArs,
        inStock: i.inStock,
        imageUrl: i.imageUrl,
      }))
      .sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
        const pa = a.priceArs ?? Number.POSITIVE_INFINITY;
        const pb = b.priceArs ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      });

    // Facets: most-common varietal across the group's items, single region
    const varietalCounts = new Map();
    for (const i of items) {
      for (const v of extractVarietals(i.name)) {
        varietalCounts.set(v, (varietalCounts.get(v) ?? 0) + 1);
      }
    }
    const varietals = [...varietalCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 3);

    let region = null;
    for (const i of items) {
      region = extractRegion(i.name, i.brand ?? brand);
      if (region) break;
    }

    const typeCounts = new Map();
    for (const i of items) {
      const t = extractType(i.name);
      if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const type =
      typeCounts.size > 0
        ? [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null;

    groups.push({
      groupSlug: slug,
      canonicalName,
      brand,
      vintage: key.vintage,
      format: key.format,
      imageUrl,
      storeCount: uniqueStores.size,
      offerCount: inStockItems.length,
      totalStoreCount: new Set(items.map((i) => i.storeSlug)).size,
      totalOfferCount: items.length,
      inStockOfferCount: inStockItems.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      varietals,
      region,
      type,
      offers,
    });
  }

  groups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    const pa = a.minPrice ?? Number.POSITIVE_INFINITY;
    const pb = b.minPrice ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  const multiStore = groups.filter((g) => g.storeCount >= 2).length;
  const totalOffersInMulti = groups
    .filter((g) => g.storeCount >= 2)
    .reduce((sum, g) => sum + g.offerCount, 0);

  console.log(`Groups built:`);
  console.log(`  Total groups: ${groups.length}`);
  console.log(`  Multi-store groups (>=2 tiendas): ${multiStore}`);
  console.log(`  Offers in multi-store groups: ${totalOffersInMulti}`);
  console.log(`  Avg offers per multi-store group: ${
    multiStore > 0 ? (totalOffersInMulti / multiStore).toFixed(2) : 0
  }`);

  // Drop snapshot.products from the published snapshot — it's fully
  // redundant with productGroups[].offers[]. Saves ~18MB.
  const { products: _products, ...rest } = snap;
  const out = {
    ...rest,
    productGroups: groups,
    groupCount: groups.length,
    multiStoreGroupCount: multiStore,
    groupsGeneratedAt: new Date().toISOString(),
  };

  writeFileSync(inPath, JSON.stringify(out));
  console.log(`\nWrote ${inPath}`);
}

main();
