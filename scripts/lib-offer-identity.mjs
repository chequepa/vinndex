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
  contentTokens,
  NAME_PREFIX_TO_BRAND,
} from "./lib-identity.mjs";

// ── Bodega: resolución por prefijo del nombre + brand del scraper ──

const PREFIX_KEYS_BY_LENGTH = Object.keys(NAME_PREFIX_TO_BRAND).sort(
  (a, b) => b.length - a.length,
);

const LEADING_NOISE_RE =
  /^(?:vino|vinos?|espumante|champagne|champana|botella|bot|tinto|blanco|rosado|rose|dulce|seco|brut|reserva|premium)\s+/;

function normalizeLoose(s) {
  return stripAccents(String(s ?? ""))
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
  // Brand del scraper (limpio de "Bodega(s)/Familia")
  const b = normalizeLoose(brand).replace(/^(bodegas?|familia)\s+/, "");
  if (!b || PLACEHOLDER_BRANDS.has(b)) return null;
  for (const k of PREFIX_KEYS_BY_LENGTH) {
    if (b === k || b.startsWith(k + " ")) return NAME_PREFIX_TO_BRAND[k];
  }
  return String(brand).trim();
}

// Valores de brand que son placeholder del scraper, no una bodega.
const PLACEHOLDER_BRANDS = new Set([
  "sin marca", "sin identificar", "sin definir", "sin reglas", "no definido",
  "varios", "otros", "s d", "s m", "vino", "vinos", "wine", "wines",
  "select", "cosecha", "varietal", "generico", "genérico", "importado",
  "tinto", "blanco", "rosado", "malbec", "cabernet", "espumante",
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
export function parseOffer(rawName, rawBrand) {
  const name = decodeEntities(String(rawName ?? "")).trim();
  const bodega = resolveBodega(name, rawBrand);

  const styles = [...styleSet(name)].sort();
  const color = colorOf(name);
  const dulzor = color === "espumante" ? sweetnessOf(name) : null;

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
const BODEGA_NOISE_RE = /^(?:bodegas?|familia|flia\.?|fca\.?|finca|vinos?|winery|wines?)\s+/;
export function normalizeBodegaKey(bodega) {
  if (!bodega) return "";
  let s = normalizeLoose(bodega).replace(/\./g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) {
    const n = s.replace(BODEGA_NOISE_RE, "");
    if (n === s) break;
    s = n;
  }
  return s;
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
export function fallbackWineKey(p) {
  const parts = [
    normalizeBodegaKey(p.bodega),
    p.lineTokens.join(" "),
    p.varietal ?? "",
    p.color ?? "",
    p.dulzor ?? "",
    p.discriminadores.join(" "),
    p.ediciones.join(" "),
  ];
  return parts.join("|");
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
