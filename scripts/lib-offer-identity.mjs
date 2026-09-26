#!/usr/bin/env node
/**
 * lib-offer-identity.mjs — Identidad estructurada v2: parser POR OFERTA.
 *
 * Pieza central del rediseño del sistema de agrupación. En vez de
 * preguntar "¿estos dos GRUPOS son el mismo vino?" (pairwise, O(n²),
 * sin contexto — el modelo que generó las quimeras Serie A ⊕ Concreto y
 * los splits Concreto / Concreto Paraje Altamira), parseamos CADA OFERTA
 * a una identidad estructurada y agrupamos por esa identidad:
 *
 *   VINO (la página)  = bodega + línea + varietal + color/dulzor + expresión
 *   VARIANTE (oferta) = volumenMl + pack + estuche/copa + vintage
 *
 * El formato (375ml / magnum / caja x6 / estuche / "+copa") deja de
 * mezclarse en la comparación de precios: la ficha compara botellas
 * sueltas de 750 y lista el resto como variantes.
 *
 * Los extractores duros (color, dulzor, varietal, paraje, pack, volumen,
 * edición) se importan de stage4-token-merge.mjs — son los gates del
 * harness dorado, la parte más blindada del sistema actual.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  colorOf,
  sweetnessOf,
  styleSet,
  packSig,
  volMl,
  editionNums,
  discriminatorSet,
  isExcluded,
  lineTokens,
} from "./stage4-token-merge.mjs";
import {
  stripAccents,
  decodeEntities,
  canonicalizeName,
  contentTokens,
  CONTENT_STOPWORDS,
  NAME_PREFIX_TO_BRAND,
} from "./lib-identity.mjs";

// ── Bodega: resolución por prefijo del nombre + brand del scraper ──

const PREFIX_KEYS_BY_LENGTH = Object.keys(NAME_PREFIX_TO_BRAND).sort(
  (a, b) => b.length - a.length,
);

const LEADING_NOISE_RE =
  /^(?:vino|vinos?|espumante|champagne|champana|botella|bot|tinto|blanco|rosado|rose|dulce|seco|brut|reserva|premium)\s+/;

function normalizeLoose(s) {
  return stripAccents(canonicalizeName(s))
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bodega canónica desde el nombre (prefijo o mid-name) y/o el brand del
 * scraper. Devuelve string canónico o null. */
export function resolveBodega(name, brand) {
  let lower = normalizeLoose(name);
  for (let i = 0; i < 2; i++) {
    const n = lower.replace(LEADING_NOISE_RE, "");
    if (n === lower) break;
    lower = n;
  }
  // Prefijo del nombre (longest-first): "Concreto Malbec" → Zuccardi
  for (const k of PREFIX_KEYS_BY_LENGTH) {
    if (lower === k || lower.startsWith(k + " ")) return NAME_PREFIX_TO_BRAND[k];
  }
  // Mid-name (word boundary): "Vino Serie A Malbec Bodega Zuccardi"
  const padded = " " + lower + " ";
  for (const k of PREFIX_KEYS_BY_LENGTH) {
    if (k.length < 4) continue; // mid-name sólo con keys largas (evita falsos hits)
    if (padded.includes(" " + k + " ")) return NAME_PREFIX_TO_BRAND[k];
  }
  // Brand del scraper (limpio de "Bodega(s)/Familia" y de puntuación:
  // "SIN MARCA." con punto se saltaba el placeholder y publicaba 157
  // fichas con bodega "Sin Marca.").
  const b = normalizeLoose(brand).replace(/[.\/]/g, " ").replace(/\s+/g, " ").trim().replace(/^(bodegas?|familia)\s+/, "");
  if (!b || PLACEHOLDER_BRANDS.has(b)) return null;
  for (const k of PREFIX_KEYS_BY_LENGTH) {
    if (b === k || b.startsWith(k + " ")) return NAME_PREFIX_TO_BRAND[k];
  }
  return cleanScraperBrand(brand);
}

// Tokens que NUNCA son parte del nombre de una bodega. Varios scrapers
// mandan el nombre del producto como marca ("Nampe Malbec 750 cc",
// "Lagarde Guarda Malbec DOC"): medido el 13/09, 724 pares de fichas
// partidas sólo porque una tienda escribía la bodega con esa cola.
const BRAND_ARTICLES = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "sin", "un", "una"]);
const BRAND_JUNK_TOKENS = new Set([
  ...[...CONTENT_STOPWORDS].filter((t) => !BRAND_ARTICLES.has(t)),
  "malbec", "cabernet", "sauvignon", "blanc", "franc", "merlot", "syrah", "shiraz",
  "bonarda", "chardonnay", "torrontes", "tempranillo", "pinot", "noir",
  "grigio", "blend", "corte", "tannat", "viognier", "riesling", "semillon",
  "criolla", "moscatel", "petit", "verdot", "sangiovese", "nebbiolo",
  "barbera", "garnacha", "gewurztraminer", "chenin", "marselan",
  "reserva", "reserve", "gran", "roble", "joven", "organico", "organic",
  "doc", "nature", "extra", "rose", "rosado", "tinto", "blanco",
]);
/** Marca del scraper sin la cola de producto. Conserva el casing original
 * de las palabras que quedan. null si no queda nada. */
export function cleanScraperBrand(brand) {
  const words = String(brand ?? "").trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => {
    const t = stripAccents(w).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!t) return false;
    if (/^\d+$/.test(t)) return false;
    if (/^(19\d{2}|20[0-2]\d)$/.test(t)) return false;
    if (/^\d+(ml|cc|cm3|l|lt|lts|cl)$/.test(t)) return false;
    if (/^x\d+$/.test(t)) return false;
    return !BRAND_JUNK_TOKENS.has(t);
  });
  // "de"/"del"/"la" al principio o al final son restos ("Malbec de La
  // Rural" → "La Rural" está bien; "Trapiche de" no).
  while (kept.length && /^(de|del|la|el|los|las|y|por)$/i.test(stripAccents(kept[kept.length - 1]))) kept.pop();
  while (kept.length && /^(de|del|y|por|en)$/i.test(stripAccents(kept[0]))) kept.shift();
  const out = kept.join(" ").trim();
  if (!out) return null;
  // Lo que queda tiene que parecer una bodega: "Sauvignon Blanc" → "Blanc",
  // "Casa Hofmann Té" → "Casa", "Gin" → "Gin" son ruido, no bodegas.
  return isJunkBodegaKey(normalizeBodegaKey(out)) ? null : out;
}

// "Bodegas" de una palabra que son artículos, genéricos o categorías. Un
// scraper que manda "Casa", "San", "The" o "Gin" como marca no está
// diciendo la bodega, y el colapso por corpus tampoco puede usar esas
// claves como destino (13/09: "Casa Agostino" → "casa", "San Telmo" →
// "san", "Don Valentín" → "don" — 700 fichas bajo bodegas fantasma).
const GENERIC_BODEGA_TOKENS = new Set([
  "the", "casa", "san", "santa", "don", "dona", "gin", "vodka", "whisky",
  "whiskey", "ron", "rum", "aceite", "chateau", "domaine", "finca", "bodega",
  "bodegas", "vina", "vinas", "estate", "cerveza", "licor", "agua", "jugo",
  "blanc", "blanco", "rouge", "rose", "rosado", "tinto", "gran", "viejo",
  "nuevo", "alta", "alto", "tierra", "valle", "vino", "vinos", "bebida",
  "bebidas", "wine", "wines", "winery", "cellar", "cellars", "familia",
  "family", "grupo", "sur", "norte", "este", "oeste", "mar", "rio", "monte",
  "sierra", "los", "las", "el", "la", "de", "del", "importado", "nacional",
  "premium", "select", "selecto", "reserva", "cosecha", "varietal", "vinedo",
  "vinedos", "copa", "botella", "estuche", "caja", "pack", "kit", "set",
  "mix", "combo", "promo", "oferta", "regalo", "marca", "sin", "s", "n",
  "generico", "generica", "otro", "otra", "otras", "varios", "varias",
]);
export function isJunkBodegaKey(key) {
  if (!key) return true;
  const toks = key.split(" ").filter(Boolean);
  if (toks.length === 1) {
    return toks[0].length <= 3 || /^\d+$/.test(toks[0]) || GENERIC_BODEGA_TOKENS.has(toks[0]);
  }
  return toks.every((t) => t.length <= 2 || GENERIC_BODEGA_TOKENS.has(t));
}

/**
 * ¿La bodega está ESCRITA en el nombre de la oferta? Alcanza con una
 * palabra propia de la bodega (≥4 letras, no genérica): "El Enemigo" está
 * en "Enemigo Malbec", "Catena Zapata" en "Angélica Zapata Malbec"; "Catena
 * Zapata" NO está en "El Enemigo Malbec" aunque una tienda la cargue como
 * marca. Es la evidencia que usa el consenso de bodega por nombre.
 */
export function bodegaInName(bodega, name) {
  const key = normalizeBodegaKey(bodega);
  if (!key) return false;
  const toks = key.split(" ").filter((t) => t.length >= 4 && !GENERIC_BODEGA_TOKENS.has(t));
  if (!toks.length) return false;
  const nameToks = new Set(normalizeLoose(name).replace(/\./g, " ").split(" "));
  return toks.some((t) => nameToks.has(t));
}

// ── La tienda no es la bodega ──
// Algunas tiendas mandan SU nombre como marca de sus productos ("Aldo's
// Vinoteca" en 400 fichas). Comparamos la bodega parseada contra el nombre
// y el slug de la tienda que publica la oferta (data/stores.json).
const __dirname_oi = dirname(fileURLToPath(import.meta.url));
let STORE_NAME_KEYS = null;
function storeNameKeys() {
  if (STORE_NAME_KEYS) return STORE_NAME_KEYS;
  STORE_NAME_KEYS = new Map(); // storeSlug → Set(claves)
  try {
    const stores = JSON.parse(readFileSync(resolve(__dirname_oi, "..", "data/stores.json"), "utf8"));
    for (const s of stores) {
      const keys = new Set();
      for (const raw of [s.name ?? "", String(s.name ?? "").replace(/['’`]/g, ""), String(s.slug ?? "").replace(/-/g, " ")]) {
        const k = normalizeBodegaKey(raw);
        if (!k) continue;
        keys.add(k);
        const short = k
          .replace(/\b(vinoteca|vinotecas|vinos?|wines?|store|tienda|boutique|club|cava|cavas|enoteca|la|el|de|los|las)\b/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (short.length >= 3) keys.add(short);
      }
      STORE_NAME_KEYS.set(s.slug, keys);
    }
  } catch {
    /* sin stores.json no hay guard */
  }
  return STORE_NAME_KEYS;
}
/** true si la "bodega" es el nombre de la tienda que publica la oferta. */
export function isStoreBrand(bodega, storeSlug) {
  if (!bodega || !storeSlug) return false;
  const keys = storeNameKeys().get(storeSlug);
  if (!keys) return false;
  return keys.has(normalizeBodegaKey(bodega));
}

// Valores de brand que son placeholder del scraper, no una bodega.
const PLACEHOLDER_BRANDS = new Set([
  "sin marca", "sin identificar", "sin definir", "sin reglas", "no definido",
  "varios", "otros", "s d", "s m", "vino", "vinos", "wine", "wines",
  "select", "cosecha", "varietal", "generico", "genérico", "importado",
  "tinto", "blanco", "rosado", "malbec", "cabernet", "espumante",
  "marca", "sin marca", "s m", "s d", "sd", "sm", "n a", "na", "nn", "no aplica",
  "sin datos", "sin especificar", "otro", "otra", "otras", "varias", "generica",
]);

// ── Flags de variante (no-identidad de vino, sí de SKU) ──

const ESTUCHE_RE = /\b(estuche|estuches|cofre|gift\s*box|con\s+copa|c\/\s*copa|\+\s*copa)\b/i;
// "copa" suelta al final ("Serie A Malbec copa") = venta por copa o promo
// con copa — nunca comparable con la botella.
const COPA_RE = /\bcopa\b/i;

/**
 * parseOffer(name, brand) → identidad estructurada de la oferta.
 *
 * {
 *   bodega: "Zuccardi" | null,
 *   lineTokens: ["concreto"],        // tokens de línea, sin bodega
 *   varietal: "malbec" | "cabernet+malbec" | null,  // blend ordenado
 *   color: "tinto" | "blanco" | "rosado" | "espumante" | ... | null,
 *   dulzor: "brut" | "extrabrut" | ... | null (sólo espumantes),
 *   discriminadores: ["gualtallary"],  // parajes/tiers presentes
 *   ediciones: ["248"],               // números de edición/edad
 *   vintage: 2021 | null,
 *   volumeMl: 750,                    // default 750
 *   pack: 0 | N | -1,                 // 0=botella suelta, N=caja xN, -1=pack s/nº
 *   estuche: bool, copa: bool,
 *   excluded: bool,                   // espirituosa/bundle/gift-card
 * }
 */
export function parseOffer(rawName, rawBrand, opts = {}) {
  const name = canonicalizeName(rawName).trim();
  // `opts.bodega` la usa el colapso de bodegas por corpus (build-groups-v2
  // y build-wine-catalog): re-parsea con la bodega ya canónica para que
  // los tokens de línea se recalculen contra ELLA ("Trapiche Tesoro" →
  // "Trapiche" devuelve "tesoro" a la línea).
  const bodega = opts.bodega !== undefined ? opts.bodega : resolveBodega(name, rawBrand);

  const styles = [...styleSet(name)].sort();
  const color = colorOf(name);
  // El dulzor es identidad de los espumantes. colorOf() prefiere "rosado"
  // sobre "espumante", así que un "Chandon Brut Nature Rosé" quedaba con
  // color rosado y dulzor null — idéntico al "Chandon Rosé" (brut) y al
  // "Extra Brut Rosé" (13/09). Se lee el dulzor también cuando el nombre
  // trae un marcador inequívoco de espumante.
  const SPARKLING_MARK_RE = /\b(brut|nature|demi\s*sec|extra\s*brut)\b/i;
  const dulzor =
    color === "espumante" || SPARKLING_MARK_RE.test(stripAccents(name))
      ? sweetnessOf(name)
      : null;

  // Tokens de línea: contenido sin varietal/paraje/tier, y sin los tokens
  // de la bodega resuelta (para que "Zuccardi Concreto" y "Concreto"
  // tengan la misma línea).
  const bodegaTokens = new Set(
    bodega ? normalizeBodegaKey(bodega).split(" ").filter((t) => t.length > 1) : [],
  );
  const line = [...lineTokens(name)].filter((t) => !bodegaTokens.has(t)).sort();

  const vintageMatch = stripAccents(name).match(/\b(19\d{2}|20[0-2]\d)\b/);

  return {
    bodega,
    lineTokens: line,
    varietal: styles.length > 0 ? styles.join("+") : null,
    color,
    dulzor,
    discriminadores: [...discriminatorSet(name)].sort(),
    ediciones: [...editionNums(name)].sort(),
    vintage: vintageMatch ? Number(vintageMatch[1]) : null,
    volumeMl: volMl(name),
    pack: packSig(name),
    estuche: ESTUCHE_RE.test(stripAccents(name)),
    copa: COPA_RE.test(stripAccents(name)),
    excluded: isExcluded(name),
  };
}

/**
 * Bodega normalizada para CLAVES de agrupación: "Bodega Norton",
 * "Bodegas NORTON" y "Norton" tienen que dar la misma clave o el mismo
 * vino se parte por cómo cada tienda escribe la bodega. Colapsa
 * prefijos corporativos, "familia", puntuación y espacios.
 */
const BODEGA_NOISE_RE = /^(?:bodegas?|familia|flia\.?|fca\.?|finca|vina|vinos?|winery|wines?|grupo)\s+/;
// Cola corporativa que unas tiendas ponen y otras no: "Rutini Wines",
// "Colosso Wines", "Ernesto Catena Vineyards", "Trapiche S.A.".
const BODEGA_SUFFIX_RE = /\s+(?:wines?|winery|vineyards?|estate|s\s?a|srl)$/;
export function normalizeBodegaKey(bodega) {
  if (!bodega) return "";
  let s = normalizeLoose(bodega).replace(/\./g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) {
    const n = s.replace(BODEGA_NOISE_RE, "");
    if (n === s) break;
    s = n;
  }
  for (let i = 0; i < 2; i++) {
    const n = s.replace(BODEGA_SUFFIX_RE, "");
    if (n === s || !n) break;
    s = n;
  }
  return s;
}

/**
 * Colapso de bodegas por corpus. Devuelve `Map(claveLarga → claveCorta)`
 * para las claves de bodega que son OTRA clave más una cola de tokens
 * ("manos negras artesano" ⊃ "manos negras", "alfa crux fournier" ⊃
 * "alfa crux", "zuccardi santa julia" ⊃ "santa julia"): la corta tiene
 * que ser una bodega establecida en el corpus (≥3 tiendas) y al menos
 * tan usada como la larga. Los tokens de la cola vuelven a la LÍNEA al
 * re-parsear, así que "Trapiche Tesoro" → bodega Trapiche, línea Tesoro.
 *
 * Nunca colapsa en la dirección corta → larga ("catena" → "catena
 * zapata"): eso es una abreviatura y se declara en NAME_PREFIX_TO_BRAND,
 * porque una bodega real puede ser prefijo del nombre de otra ("San
 * Pedro" no es "San Pedro de Yacochuya").
 *
 * @param {Iterable<{bodegaKey:string, storeSlug:string}>} rows
 * @param {{protect?: Set<string>}} opts — claves que NUNCA se colapsan
 *   (las bodegas declaradas en NAME_PREFIX_TO_BRAND: "San Pedro de
 *   Yacochuya" es una bodega aunque "San Pedro" también lo sea).
 */
export function buildBodegaCollapser(rows, opts = {}) {
  const protect = opts.protect ?? new Set();
  const stores = new Map(); // key → Set(store)
  for (const r of rows) {
    if (!r.bodegaKey) continue;
    if (!stores.has(r.bodegaKey)) stores.set(r.bodegaKey, new Set());
    stores.get(r.bodegaKey).add(r.storeSlug);
  }
  const byToken = new Map(); // token → [keys]
  for (const k of stores.keys()) {
    for (const t of new Set(k.split(" "))) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(k);
    }
  }
  const out = new Map();
  for (const [k, ks] of stores) {
    const toks = k.split(" ");
    if (toks.length < 2 || protect.has(k)) continue;
    let best = null;
    const seen = new Set();
    for (const t of toks) {
      for (const cand of byToken.get(t) ?? []) {
        if (cand === k || seen.has(cand)) continue;
        seen.add(cand);
        const ct = cand.split(" ");
        if (ct.length >= toks.length) continue;
        if (!ct.every((x) => toks.includes(x))) continue;
        if (!protect.has(cand) && isJunkBodegaKey(cand)) continue;
        const cs = stores.get(cand).size;
        if (cs < 3 || cs < ks.size) continue;
        // más tokens compartidos primero, después más tiendas
        if (!best || ct.length > best.len || (ct.length === best.len && cs > best.stores)) {
          best = { key: cand, len: ct.length, stores: cs };
        }
      }
    }
    if (best) out.set(k, best.key);
  }
  // resolver cadenas (a → b → c) en una pasada acotada
  for (const [k, v] of out) {
    let cur = v, hops = 0;
    while (out.has(cur) && hops < 5) { cur = out.get(cur); hops++; }
    out.set(k, cur);
  }
  return out;
}

/**
 * Clave de VINO (= página) desde una identidad parseada + catálogo.
 *
 * Con entrada de catálogo: la identidad es el id del catálogo (que ya
 * absorbió aliases de línea y decidió si el paraje distingue).
 * Sin catálogo (fallback): clave estructurada determinística — igual que
 * hoy pero con línea/varietal/color/discriminadores explícitos, ya sin
 * volumen/pack adentro (eso es variante, no vino).
 */
/**
 * Colapsa discriminadores contenidos: "altamira" ⊂ "paraje altamira",
 * "cepillo" ⊂ "el cepillo" son EL MISMO paraje escrito distinto por
 * tiendas distintas. Se queda la frase más larga.
 */
export function collapseContainedPhrases(phrases) {
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

export function fallbackWineKey(p) {
  const parts = [
    normalizeBodegaKey(p.bodega),
    p.lineTokens.join(" "),
    p.varietal ?? "",
    p.color ?? "",
    p.dulzor ?? "",
    collapseContainedPhrases(p.discriminadores).join(" "),
    p.ediciones.join(" "),
  ];
  return parts.join("|");
}

/**
 * Color efectivo: el declarado, o el que implica la uva cuando el nombre
 * no lo dice. "Angélica Zapata Chardonnay" es blanco aunque no diga
 * "blanco"; sin esto el catálogo tenía el mismo vino dos veces (color null
 * y color blanco) y cada oferta caía en una según cómo la titulara la
 * tienda (26/09: Angélica Chardonnay, Las Perdices Riesling). Un corte con
 * uvas de los dos colores no implica nada. Nunca pisa un color declarado:
 * un "Malbec Rosé" sigue siendo rosado.
 */
const WHITE_GRAPES = new Set([
  "chardonnay", "sauvignon blanc", "torrontes", "viognier", "riesling", "semillon",
  "chenin", "pinot grigio", "gewurztraminer", "moscatel", "albarino", "verdejo",
  "fiano", "marsanne", "roussanne", "gruner", "malvasia", "pedro gimenez",
]);
const RED_GRAPES = new Set([
  "malbec", "cabernet", "cabernet franc", "merlot", "syrah", "bonarda", "tempranillo",
  "pinot noir", "tannat", "petit verdot", "sangiovese", "nebbiolo", "barbera",
  "garnacha", "marselan", "ancellotta", "carmenere", "gamay", "mourvedre",
  "aglianico", "montepulciano", "cinsault", "criolla",
]);
export function effectiveColor(color, varietal) {
  if (color) return color;
  const grapes = String(varietal ?? "").split("+").filter((v) => v && v !== "blend");
  if (!grapes.length) return null;
  if (grapes.every((g) => WHITE_GRAPES.has(g))) return "blanco";
  if (grapes.every((g) => RED_GRAPES.has(g))) return "tinto";
  return null;
}

/** Variante (dentro de la página): qué hace comparable a una oferta. */
export function variantKey(p) {
  const flags = [];
  if (p.estuche) flags.push("estuche");
  if (p.copa) flags.push("copa");
  return `${p.volumeMl}|${p.pack}|${flags.join("+")}`;
}

/** Una oferta es COMPARABLE (entra al min/max de la ficha) si es botella
 * suelta de 750, sin estuche/copa, y no es bundle/espirituosa. */
export function isComparable(p) {
  return (
    !p.excluded &&
    p.volumeMl === 750 &&
    p.pack === 0 &&
    !p.estuche &&
    !p.copa
  );
}

// Re-export de conveniencia para los scripts v2.
export { contentTokens, stripAccents, decodeEntities };
