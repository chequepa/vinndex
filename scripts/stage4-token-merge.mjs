#!/usr/bin/env node
/**
 * Stage 4.5 — capa de merge por TOKEN RARO (IDF) con gates duros.
 *
 * El cuello del pipeline: el LLM (Stage 3) sólo juzga pares con similitud
 * de embedding en [0.85, 0.93]. Los duplicados de nombre divergente —el
 * mismo vino que una tienda lista "El Bayeh Pequeños Parceleros Tinto de
 * Tilcara" y otra "Parceleros Criolla Tilcara"— caen por debajo de ese
 * piso y NUNCA se comparan. Encima, hoy la MARCA está horneada en la clave
 * canónica, así que cuando una tienda la atribuye mal ("Andillian" a un
 * El Bayeh) el grupo se parte.
 *
 * Esta capa ataca las dos cosas SIN tocar la clave canónica (eso churnearía
 * el 76% de los slugs indexados): corre sobre los productGroups ya armados,
 * bloquea por co-ocurrencia de tokens RAROS (idf alto), y para cada par
 * candidato decide con:
 *
 *   GATES DUROS (vetan el merge, prioridad #1 = cero quimeras):
 *     · varietal: si ambos tienen varietal y no se cruzan → veto
 *     · type:     Tinto/Blanco/Espumante/Rosado distinto → veto
 *     · color:    color explícito en el nombre distinto → veto
 *     · format:   volumen/caja/magnum distinto → veto
 *     · tier/parcela: si el set {gran, reserva, single-vineyard, Tilcara,
 *       Purmamarca, Gualtallary, ...} difiere → veto. Esto separa
 *       "El Enemigo" de "Gran Enemigo" y "Tilcara" de "Purmamarca".
 *
 *   CAMINOS DE MERGE (sólo si pasó TODOS los gates):
 *     A. EAN compartido entre ofertas → merge (ground truth)
 *     B. IDF-weighted Jaccard >= SCORE_MERGE → merge (nombres ricos)
 *     C. >= 2 tokens de contenido raros compartidos (idf >= RARE_IDF)
 *        → merge (ancla por etiqueta/parcela; un solo token raro NO
 *        alcanza: "tilcara" solo podría ser homónimo de otra bodega)
 *
 * La marca NO se usa como gate (ese es el punto: dejá de partir grupos por
 * marca mal atribuida). La zona gris (score en [SCORE_GRAY, SCORE_MERGE) o
 * 1 solo token raro) se vuelca a data/stage4-graymerge-candidates.json para
 * que el LLM (futuro) o una cola de revisión manual los cierre — NO se
 * auto-mergean.
 *
 * Cluster-safety: el union-find puede encadenar A~B~C donde A y C son
 * incompatibles (ej. varietal Malbec vs Cabernet vía un puente
 * multi-varietal). Validamos cada cluster: si ALGÚN par interno viola un
 * gate, descartamos el merge de ese cluster entero (un merge faltante es
 * mejor que una quimera).
 *
 * Output:
 *   - data/snapshot.json reescrito con los grupos colapsados
 *   - data/group-merges.json (absorbed-slug → kept-slug) para los redirects
 *     308 en app/vino/[slug]/page.tsx (no romper SEO)
 *   - data/stage4-graymerge-candidates.json (cola de revisión)
 *
 * Corre DESPUÉS de remerge-groups.mjs (Stage 4) y ANTES de
 * find-duplicates.mjs en el daily-scrape.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { stripAccents, contentTokens, NAME_PREFIX_TO_BRAND } from "./lib-identity.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SNAPSHOT = resolve(ROOT, "data/snapshot.json");
const MERGES_OUT = resolve(ROOT, "data/group-merges.json");
const GRAY_OUT = resolve(ROOT, "data/stage4-graymerge-candidates.json");
const PARCELS = resolve(ROOT, "data/parcels.json");

// ── Umbrales (ver doc arriba) ──
const BLOCK_IDF = 5.0; // sólo indexamos tokens con idf >= esto para blocking
const BLOCK_CAP = 600; // tokens en > este nº de grupos = demasiado comunes, skip
const DISTINCT_IDF = 4.5; // un token-set IGUAL debe tener ≥1 token con idf >= esto (no sólo {malbec,cabernet} genéricos)
const ANCHOR_DF = 5; // token "ancla": aparece en ≤ este nº de grupos = casi un id único
const SCORE_GRAY = 0.5; // pares con score >= esto que NO son equal → cola gris (Fase 2)

// ── Léxico de discriminadores ──
const parcelsCfg = JSON.parse(readFileSync(PARCELS, "utf8"));
const DISCRIMINATORS = [
  ...parcelsCfg.parcels.map((p) => stripAccents(p).toLowerCase()),
  ...parcelsCfg.tiers.map((t) => stripAccents(t).toLowerCase()),
];
// Tokens single-word de parajes (para el anchor path). Multi-palabra se
// parten en tokens; los genéricos ("vista","flores") quedan, pero el filtro
// de df<=ANCHOR_DF del anchor los descarta si son comunes.
const PARCEL_TOKENS = new Set(
  parcelsCfg.parcels.flatMap((p) => stripAccents(p).toLowerCase().split(/\s+/)),
);

/** Set de discriminadores (parcela/tier) presentes en un nombre. */
function discriminatorSet(name) {
  const s = " " + stripAccents(name).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ") + " ";
  const out = new Set();
  for (const d of DISCRIMINATORS) {
    // word-boundary por padding de espacios (sirve para frases multi-palabra)
    if (s.includes(" " + d + " ")) out.add(d);
  }
  return out;
}
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// Color/estilo. Orden importa: rosado/naranjo/blanco/dulce ganan sobre
// espumante y tinto, porque un "Brut Rosé" es rosado (≠ el "Extra Brut"
// blanco) y un "Espumante Dulce" es dulce. "rosa" cuenta como rosado
// (caso real: "Finca El Portillo ROSA. Malbec" es un rosado, no el tinto;
// "Baron B Brut Rosé" ≠ "Baron B Extra Brut").
const COLOR_RE = {
  rosado: /\b(rosado|rosados|rose|rosa|blush)\b/,
  naranjo: /\b(naranjo|naranja|orange\s*wine)\b/,
  dulce: /\b(dulce|tardia|tardio|late\s*harvest|cosecha\s*tardia)\b/,
  blanco: /\b(blanco|white|blanc)\b/,
  espumante: /\b(espumante|extra\s*brut|brut|nature|champagne|champ|cava|prosecco|frizz)\b/,
  tinto: /\b(tinto|red|malbec|cabernet|bonarda|syrah|shiraz|merlot|tempranillo|pinot\s*noir|tannat|petit\s*verdot)\b/,
};
function colorOf(name) {
  const s = stripAccents(name).toLowerCase();
  for (const [k, re] of Object.entries(COLOR_RE)) if (re.test(s)) return k;
  return null;
}

// Productos NO mergeables por esta capa: hay que excluirlos del blocking.
//   1. Espirituosas / no-vino: whiskies (Johnnie Walker Red/Black/Gold...),
//      vodka, gin, etc. tienen discriminadores que no modelamos.
//   2. Bundles / promos / multi-vino: "4 DV Catena + 2 Saint Felicien de
//      Regalo", "Mix de Bodegas", "Degustación...", "VERTICAL 2015-2019".
//      Estos nombran VARIOS vinos y, vía la aglomeración transitiva,
//      puentean grupos no relacionados → quimeras gigantes. Mejor dejarlos
//      como están (un bundle ES un SKU aparte de todos modos).
const SPIRIT_RE = /\b(whisky|whiskey|whisk|vodka|\bgin\b|ginebra|\bron\b|rhum|tequila|mezcal|cognac|brandy|fernet|vermouth|vermut|aperitivo|aperol|campari|licor|grappa|pisco|absenta|cerveza|gancia|aperitif|johnnie|walker|chivas|jack\s*daniel|ballantines?|wild\s*turkey|jameson|dewars?|grants?|bourbon|escoces|famous\s*grouse|old\s*smuggler|criadores|100\s*pipers|etiqueta\s*(negra|roja|azul)|blue\s*label|red\s*label|black\s*label|gold\s*label|green\s*label)\b/i;
const BUNDLE_RE = /\b(mix|promo|promocion|regalo|degustaci|vertical|combo|surtido|kit|bag\s*in\s*box|six\s*pack)\b|\+|\d+\s*x\s*\d+\s*(?:un|u|bot|botellas|x|750)|[a-z]\s*-\s*\d+\s*[a-z]|\b\d+\s*(?:un|unidades)\b.*\b\d+\s*(?:un|unidades)\b/i;
// Gift cards / tarjetas: no son vino y la denominación ($) las distingue.
const CARD_RE = /\b(gift\s*card|wine\s*card|tarjeta\s*(de\s*)?(regalo|gift)?|e?-?gift|voucher)\b/i;
function isExcluded(name) {
  const s = stripAccents(name).toLowerCase();
  if (SPIRIT_RE.test(s)) return true;
  if (BUNDLE_RE.test(s)) return true;
  if (CARD_RE.test(s)) return true;
  return false;
}

// Número de EDICIÓN/EDAD: números en el nombre que NO son vintage (19xx/
// 20xx) ni volumen (ml/cc/l o whitelist). Distinguen SKUs: "Tonel Único
// #248" ≠ "#119", "Ballantines 12 años" ≠ "17", "Montchenot 10 años" ≠
// "5". Si dos nombres tienen sets de edición distintos → SKU distinto.
const VOL_WHITELIST = new Set(["187", "250", "375", "500", "750", "1000", "1500", "3000", "5000"]);
function editionNums(name) {
  const s = stripAccents(name).toLowerCase();
  const out = new Set();
  const re = /(\d{1,4})\s*(ml|cc|cm3|cm|l|lt|lts|litros?|cl)?\b/g;
  let m;
  while ((m = re.exec(s))) {
    const num = m[1], unit = m[2];
    if (unit) continue; // es volumen
    if (/^(19\d{2}|20[0-2]\d)$/.test(num)) continue; // vintage
    if (VOL_WHITELIST.has(num)) continue; // volumen sin unidad
    out.add(num);
  }
  return out;
}

// Varietales reconocidos en el NOMBRE (no en group.varietals, que viene
// vacío en casos como "FELINO RED BLEND"). "blend"/"corte" se tratan como
// un "varietal" más: un blend NO es lo mismo que el monovarietal.
const VARIETAL_RE = [
  ["cabernet franc", /\bcabernet\s+franc\b/], ["cabernet", /\bcabernet\b/],
  ["malbec", /\bmalbec\b/], ["bonarda", /\bbonarda\b/], ["syrah", /\b(syrah|shiraz)\b/],
  ["merlot", /\bmerlot\b/], ["tempranillo", /\btempranillo\b/], ["pinot noir", /\bpinot\s+noir\b/],
  ["chardonnay", /\bchardonnay\b/], ["sauvignon blanc", /\bsauvignon\s+blanc\b/],
  ["torrontes", /\btorrontes\b/], ["viognier", /\bviognier\b/], ["riesling", /\briesling\b/],
  ["semillon", /\bsemillon\b/], ["tannat", /\btannat\b/], ["criolla", /\bcriolla\b/],
  ["pinot grigio", /\bpinot\s+grigio\b/], ["petit verdot", /\bpetit\s+verdot\b/],
  ["moscatel", /\bmoscatel\b/], ["sangiovese", /\bsangiovese\b/], ["nebbiolo", /\bnebbiolo\b/],
  ["barbera", /\bbarbera\b/], ["garnacha", /\b(garnacha|grenache)\b/], ["chenin", /\bchenin\b/],
  ["gewurztraminer", /\bgew[uü]?rztraminer\b/], ["marselan", /\bmarselan\b/],
  ["ancellotta", /\bancellotta\b/], ["fiano", /\bfiano\b/], ["pedro gimenez", /\bpedro\s+gim[eé]nez\b/],
  ["blend", /\b(blend|corte|assemblage|ensamble|tinto\s+de\s+mesa)\b/],
];
function styleSet(g) {
  const s = stripAccents(typeof g === "string" ? g : g.canonicalName).toLowerCase();
  const out = new Set();
  for (const [k, re] of VARIETAL_RE) {
    if (re.test(s)) {
      if (k === "cabernet" && out.has("cabernet franc")) continue;
      out.add(k);
    }
  }
  // Fallback: varietales que build-groups extrajo (group.varietals), por si
  // el nombre del grupo no los menciona pero el dato existe.
  if (typeof g !== "string" && Array.isArray(g.varietals)) {
    for (const v of g.varietals) {
      const vn = stripAccents(v).toLowerCase().trim();
      if (vn) out.add(vn === "cabernet sauvignon" ? "cabernet" : vn);
    }
  }
  return out;
}

// Pack/caja vs botella. Caja, estuche, pack, combo, kit, "con copa", "x6",
// "6 x 750" → SKU distinto de la botella suelta. Devolvemos una "firma" de
// pack: 0 = botella suelta, N = N unidades, -1 = pack sin nº claro. Dos
// firmas distintas (incluida 0 vs N) → SKU distinto.
const PACK_WORD_RE = /\b(caja|cajas|estuche|estuches|pack|combo|kit|cofre|sixpack|six\s*pack)\b|\bcon\s+copa|\bc\/\s*copa/i;
function packSig(name) {
  const s = stripAccents(name).toLowerCase();
  // nº de unidades explícito: "x6", "x 6", "6x750", "6 x 750", "6u", "6 un"
  let m = s.match(/\bx\s*([2-9]|1[0-9]|2[0-4])\b/) ||
          s.match(/\b([2-9]|1[0-9]|2[0-4])\s*x\s*\d{2,4}\b/) ||
          s.match(/\b([2-9]|1[0-9]|2[0-4])\s*(?:un|u|unid|unidades|bot|botellas)\b/);
  if (m) return Number(m[1]);
  if (PACK_WORD_RE.test(s)) return -1; // pack sin nº → distinto de botella
  return 0;
}

// Volumen en ml inferido del nombre. 750 = default (null). magnum/1.5L =
// 1500. Detecta 187/250/375/500/1000/1500/3000/5000 con sufijo ml/cc/cm3
// o "1.5 l"/"1,5l", y "magnum".
function volMl(name) {
  const s = stripAccents(name).toLowerCase();
  if (/\bmagnum\b/.test(s)) return 1500;
  let m = s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litro|litros)\b/);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 1000);
  m = s.match(/\b(\d+(?:[.,]\d+)?)\s*cl\b/); // centilitros: 300cl = 3000ml
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 10);
  m = s.match(/\b(187|250|375|500|1000|1500|3000|5000)\s*(?:ml|cc|cm3|cm³)\b/);
  if (m) return Number(m[1]);
  m = s.match(/\b(187|375|500|1500|3000|5000)\b/); // bare whitelist (no 750/1000 → ambiguo)
  if (m) return Number(m[1]);
  return 750; // default
}

// ── Compatibilidad de MARCA (gate suave pero necesario) ──
// Sin esta restricción, nombres genéricos ("La Linda Malbec" ↔ "Etchart
// Malbec") se encadenan en quimeras vía productos puente. La marca se trata
// generosamente: null/placeholder = compatible (no bloquea), igualdad,
// substring, y typo-tolerance por Levenshtein. Marca resuelta vía
// NAME_PREFIX_TO_BRAND (label → bodega) primero. NOTA: esto manda los casos
// de marca MAL atribuida (Andillian→El Bayeh) a la cola gris (Fase 2 LLM),
// no los auto-mergea — es el precio de cero quimeras.
const LEADING_NOISE_RE = /^(?:vino|vinos?|espumante|champagne|champana|botella|bot|tinto|blanco|rosado|rose|dulce|seco|brut|reserva|premium)\s+/;
const BAD_BRAND = new Set([
  "", "null", "vino", "varios", "otros", "sin marca", "sin identificar",
  "sin definir", "no definido", "s/d", "s/m", "select", "cosecha", "varietal",
]);
function resolveBrand(g) {
  let lower = stripAccents(g.canonicalName ?? "").toLowerCase().replace(/[^a-z0-9\s.]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) { const n = lower.replace(LEADING_NOISE_RE, ""); if (n === lower) break; lower = n; }
  for (const prefix of Object.keys(NAME_PREFIX_TO_BRAND)) {
    if (lower === prefix || lower.startsWith(prefix + " ")) return NAME_PREFIX_TO_BRAND[prefix];
  }
  return g.brand ?? null;
}
function brandKey(g) {
  const b = stripAccents(resolveBrand(g) ?? "").toLowerCase().replace(/^bodegas?\s+/, "").trim();
  return BAD_BRAND.has(b) ? null : b;
}
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
function brandsCompatible(a, b) {
  const ba = brandKey(a), bb = brandKey(b);
  if (!ba || !bb) return true; // null/placeholder no bloquea
  if (ba === bb) return true;
  if (ba.includes(bb) || bb.includes(ba)) return true; // "luigi bosca" ⊃ "bosca"
  if (ba.length >= 5 && bb.length >= 5) {
    const tol = Math.max(1, Math.floor(Math.max(ba.length, bb.length) / 10));
    if (levenshtein(ba, bb) <= tol) return true; // "otornia"/"otronia"
  }
  return false;
}

/** Gate duro por NOMBRE: devuelve el gate que veta, o null si compatible.
 * NO incluye marca: el auto-merge usa token-set IGUAL, que ya implica mismo
 * vino (mismos tokens distintivos) — el gate de marca sólo restaba los
 * casos de marca mal atribuida que justamente queremos unir. brandsCompatible
 * se usa abajo sólo para anotar/priorizar la cola gris.
 * EXPORT para el harness dorado (scripts/test-matching.mjs). */
export function hardConflict(a, b) {
  const an = a.canonicalName, bn = b.canonicalName;
  if (a.type && b.type && a.type !== b.type) return "type";
  const ca = colorOf(an), cb = colorOf(bn);
  if (ca && cb && ca !== cb) return "color";
  const sa = styleSet(a), sb = styleSet(b);
  if (sa.size && sb.size) {
    let hit = false;
    for (const v of sa) if (sb.has(v)) hit = true;
    if (!hit) return "varietal";
  }
  if (packSig(an) !== packSig(bn)) return "pack";
  if (volMl(an) !== volMl(bn)) return "volumen";
  if (!setsEqual(discriminatorSet(an), discriminatorSet(bn))) return "tier/parcela";
  if (!setsEqual(editionNums(an), editionNums(bn))) return "edicion";
  return null;
}

// EAN por grupo (set de barcodes de sus ofertas)
function eansOf(g) {
  const out = new Set();
  for (const o of g.offers ?? []) {
    const sku = (o.externalSku ?? "").toString().trim();
    if (/^\s*\d{12,14}\s*$/.test(sku)) out.add(sku.replace(/\s/g, ""));
  }
  return out;
}
function shareEan(ea, eb) {
  for (const x of ea) if (eb.has(x)) return true;
  return false;
}

function recomputeStats(primary) {
  const offers = primary.offers ?? [];
  const inStock = offers.filter((o) => o.inStock);
  const basis = inStock.length > 0 ? inStock : offers;
  const prices = basis.map((o) => o.priceArs).filter((p) => typeof p === "number" && p > 0);
  primary.minPrice = prices.length ? Math.min(...prices) : null;
  primary.maxPrice = prices.length ? Math.max(...prices) : null;
  primary.storeCount = new Set(inStock.map((o) => o.storeSlug)).size;
  primary.offerCount = inStock.length;
  primary.inStockOfferCount = inStock.length;
  primary.totalStoreCount = new Set(offers.map((o) => o.storeSlug)).size;
  primary.totalOfferCount = offers.length;
}

function main() {
  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const groups = snap.productGroups ?? [];
  const N = groups.length;
  console.log(`Stage 4.5 token-merge sobre ${N} grupos`);

  // ── IDF sobre content tokens ──
  const df = new Map();
  const toks = new Array(N);
  for (let i = 0; i < N; i++) {
    const t = [...new Set(contentTokens(groups[i].canonicalName))];
    toks[i] = t;
    for (const x of t) df.set(x, (df.get(x) ?? 0) + 1);
  }
  const idf = (t) => Math.log((N + 1) / ((df.get(t) ?? 0) + 1));

  // ── Blocking: índice invertido sobre tokens raros ──
  // Excluimos espirituosas (whisky/gin/etc): la capa es para vino y sus
  // discriminadores (Red/Black/Gold Label) no están modelados.
  const inv = new Map();
  let excluded = 0;
  for (let i = 0; i < N; i++) {
    if (isExcluded(groups[i].canonicalName)) { excluded++; continue; }
    for (const t of toks[i]) {
      if (idf(t) < BLOCK_IDF) continue;
      if ((df.get(t) ?? 0) > BLOCK_CAP) continue;
      if (!inv.has(t)) inv.set(t, []);
      inv.get(t).push(i);
    }
  }
  console.log(`  excluidas del blocking (espirituosas/bundles): ${excluded}`);

  // pre-cache por grupo: set de tokens, varietal/discriminator/ean
  const tokSet = toks.map((t) => new Set(t));
  const eanCache = groups.map(eansOf);

  function weightedJaccard(i, j) {
    const ta = tokSet[i], tb = tokSet[j];
    let inter = 0, uni = 0;
    const all = new Set([...ta, ...tb]);
    for (const t of all) {
      const w = idf(t);
      if (ta.has(t) && tb.has(t)) inter += w;
      uni += w;
    }
    return uni === 0 ? 0 : inter / uni;
  }
  /** Relación de sets: "equal" | "subset" | "overlap". */
  function setRelation(i, j) {
    const ta = tokSet[i], tb = tokSet[j];
    if (ta.size === tb.size) {
      for (const t of ta) if (!tb.has(t)) return "overlap";
      return "equal";
    }
    const [small, big] = ta.size < tb.size ? [ta, tb] : [tb, ta];
    for (const t of small) if (!big.has(t)) return "overlap";
    return "subset";
  }

  // ── Generar pares candidatos y clasificar ──
  // AUTO-MERGE (determinístico, provablemente cero quimeras): EAN
  // ground-truth, o token-set de contenido IGUAL con ≥2 tokens y al menos
  // uno DISTINTIVO (idf alto). Token-set igual ⟹ mismos tokens
  // distintivos ⟹ mismo vino; es una relación de equivalencia (sin fuga
  // transitiva). Arregla los splits por marca mal atribuida ("El Enemigo
  // Malbec" vs "ENEMIGO MALBEC"+brand=Gran → tokens {enemigo,malbec}
  // iguales → merge) SIN gate de marca. Los gates de color/varietal/pack/
  // volumen/parcela siguen porque contentTokens stripea esas palabras.
  // Lo divergente (subset, overlap de score alto: El Bayeh pelado, líneas
  // premium) NO se auto-mergea: va a la cola gris para Fase 2 (LLM/manual).
  function hasDistinctive(i) {
    let n = 0, distinctive = false;
    for (const t of tokSet[i]) { n++; if (idf(t) >= DISTINCT_IDF) distinctive = true; }
    return n >= 2 && distinctive;
  }
  // "Parece vino": tiene tipo (Tinto/Blanco/...), varietal, o color en el
  // nombre. El catálogo tiene basura no-vino (fideos, sal, perfume, maní,
  // escabeche, bottle holders) y el anchor path (1 token raro compartido)
  // los uniría entre sí. Sólo aplicamos anchor a grupos que parecen vino.
  function isWineLike(g) {
    return !!g.type || styleSet(g).size > 0 || colorOf(g.canonicalName) !== null;
  }
  const seen = new Set();
  const edges = [];
  const gray = [];
  let candidates = 0, gated = 0;
  const gateCounts = {};
  for (const [, idxs] of inv) {
    if (idxs.length < 2 || idxs.length > BLOCK_CAP) continue;
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x], j = idxs[y];
        const key = i < j ? i * N + j : j * N + i;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates++;
        const a = groups[i], b = groups[j];
        const gate = hardConflict(a, b);
        if (gate) { gated++; gateCounts[gate] = (gateCounts[gate] ?? 0) + 1; continue; }
        const ean = shareEan(eanCache[i], eanCache[j]);
        const rel = setRelation(i, j);
        const score = weightedJaccard(i, j);
        // Ancla por PARAJE raro: un paraje del léxico (Tilcara, Purmamarca…)
        // que aparece en ≤ ANCHOR_DF grupos de todo el catálogo es casi un
        // identificador único del vino de ese productor chico. Restringido
        // al léxico de parcels — NO cualquier token raro, porque tokens de
        // estilo ("noirs") o apellidos ("pato") también son raros y unirían
        // productores distintos. "gualtallary" (en 73 grupos) queda fuera
        // por el filtro de df. Captura el caso El Bayeh ("Parceleros Criolla
        // Tilcara" + "El Bayeh Tinto de Tilcara") con marca compatible-o-nula.
        let anchor = false;
        for (const t of tokSet[i]) {
          if (tokSet[j].has(t) && PARCEL_TOKENS.has(t) && (df.get(t) ?? 0) <= ANCHOR_DF) { anchor = true; break; }
        }
        let via = null;
        if (ean) via = "ean";
        else if (rel === "equal" && hasDistinctive(i)) via = "equal";
        else if (anchor && brandsCompatible(a, b) && isWineLike(a) && isWineLike(b)) via = "anchor";
        if (via) {
          edges.push({ i, j, via, score });
        } else if (score >= SCORE_GRAY) {
          gray.push({
            score: +score.toFixed(3), rel,
            brandCompat: brandsCompatible(a, b),
            a: { slug: a.groupSlug, name: a.canonicalName, brand: a.brand },
            b: { slug: b.groupSlug, name: b.canonicalName, brand: b.brand },
          });
        }
      }
    }
  }
  console.log(`  candidatos: ${candidates} · vetados por gate: ${gated} ${JSON.stringify(gateCounts)}`);
  console.log(`  edges de merge: ${edges.length} · gray-zone: ${gray.length}`);

  // ── Aglomeración con RESTRICCIÓN ──
  // En vez de union-find ciego + rechazo del cluster entero (que perdía
  // merges buenos cuando un solo grupo incompatible contaminaba el cluster),
  // procesamos los edges por confianza (ean > +tokens raros > +score) y
  // sólo unimos dos clusters si NINGÚN par cruzado viola un gate. Así el
  // cluster nunca contiene una quimera y no perdemos los merges legítimos.
  const confRank = { ean: 3, equal: 2, anchor: 1 };
  edges.sort((a, b) => {
    if (confRank[b.via] !== confRank[a.via]) return confRank[b.via] - confRank[a.via];
    return (b.score ?? 0) - (a.score ?? 0);
  });
  const parent = new Array(N).fill(0).map((_, i) => i);
  const members = new Array(N).fill(0).map((_, i) => [i]);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  let blockedEdges = 0;
  for (const e of edges) {
    const ri = find(e.i), rj = find(e.j);
    if (ri === rj) continue;
    // chequear conflicto entre todos los miembros de ambos clusters
    let conflict = false;
    for (const m of members[ri]) {
      for (const n of members[rj]) {
        if (hardConflict(groups[m], groups[n])) { conflict = true; break; }
      }
      if (conflict) break;
    }
    if (conflict) { blockedEdges++; continue; }
    // unir rj en ri
    parent[rj] = ri;
    members[ri] = members[ri].concat(members[rj]);
    members[rj] = [];
  }
  const clusters = new Map();
  for (let i = 0; i < N; i++) {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(i);
  }

  // ── Materializar clusters ──
  const mergeMap = {}; // absorbed slug → kept slug
  const dropIdx = new Set();
  let mergedClusters = 0;
  const rejectedClusters = blockedEdges;
  const examples = [];
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    // primary = mayor storeCount, luego totalOfferCount
    idxs.sort((a, b) => {
      const ga = groups[a], gb = groups[b];
      if ((gb.storeCount ?? 0) !== (ga.storeCount ?? 0)) return (gb.storeCount ?? 0) - (ga.storeCount ?? 0);
      return (gb.totalOfferCount ?? gb.offers?.length ?? 0) - (ga.totalOfferCount ?? ga.offers?.length ?? 0);
    });
    const primary = groups[idxs[0]];
    // pool de ofertas, dedup por (store|url|name) quedándose con menor precio
    const offerMap = new Map();
    for (const k of idxs) {
      for (const o of groups[k].offers ?? []) {
        const ok = `${o.storeSlug}|${o.externalUrl ?? ""}|${o.name ?? ""}`;
        const ex = offerMap.get(ok);
        if (!ex || (o.priceArs != null && ex.priceArs != null && o.priceArs < ex.priceArs)) offerMap.set(ok, o);
      }
    }
    primary.offers = [...offerMap.values()].sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return (a.priceArs ?? Infinity) - (b.priceArs ?? Infinity);
    });
    // heredar varietals/region/type/imageUrl si faltan
    const varSet = new Set();
    for (const k of idxs) for (const v of groups[k].varietals ?? []) varSet.add(v);
    if (varSet.size) primary.varietals = [...varSet].slice(0, 3);
    for (const key of ["imageUrl", "region", "type"]) {
      if (!primary[key]) {
        const donor = idxs.map((k) => groups[k]).find((g) => g[key]);
        if (donor) primary[key] = donor[key];
      }
    }
    recomputeStats(primary);
    for (let m = 1; m < idxs.length; m++) {
      const absorbed = groups[idxs[m]];
      mergeMap[absorbed.groupSlug] = primary.groupSlug;
      dropIdx.add(idxs[m]);
    }
    mergedClusters++;
    if (examples.length < 25) {
      examples.push({
        kept: primary.groupSlug,
        absorbed: idxs.slice(1).map((k) => groups[k].canonicalName),
        keptName: primary.canonicalName,
        storeCount: primary.storeCount,
      });
    }
  }

  // ── Materializar ──
  const newGroups = groups.filter((_, i) => !dropIdx.has(i));
  newGroups.sort((a, b) => {
    if ((b.storeCount ?? 0) !== (a.storeCount ?? 0)) return (b.storeCount ?? 0) - (a.storeCount ?? 0);
    return (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity);
  });
  const multi = newGroups.filter((g) => (g.storeCount ?? 0) >= 2).length;

  // mapa acumulativo: respetar merges previos (de corridas anteriores) y
  // resolver cadenas a destino final
  let prevMerges = {};
  if (existsSync(MERGES_OUT)) {
    try { prevMerges = JSON.parse(readFileSync(MERGES_OUT, "utf8")); } catch { /* vacío */ }
  }
  const liveSlugs = new Set(newGroups.map((g) => g.groupSlug));
  const allMerges = { ...prevMerges, ...mergeMap };
  // colapsar cadenas: A→B→C ⇒ A→C; descartar destinos que ya no existen
  function finalDest(slug, depth = 0) {
    if (depth > 10) return slug;
    const d = allMerges[slug];
    if (!d) return slug;
    return finalDest(d, depth + 1);
  }
  const resolved = {};
  for (const from of Object.keys(allMerges)) {
    const to = finalDest(from);
    if (to !== from && liveSlugs.has(to)) resolved[from] = to;
  }

  snap.productGroups = newGroups;
  snap.groupCount = newGroups.length;
  snap.multiStoreGroupCount = multi;
  snap.stage4GeneratedAt = new Date().toISOString();
  snap.stage4Merges = mergedClusters;

  writeFileSync(SNAPSHOT, JSON.stringify(snap));
  writeFileSync(MERGES_OUT, JSON.stringify(resolved, null, 2));
  writeFileSync(GRAY_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: gray.length, items: gray.slice(0, 500) }, null, 2));

  console.log(`\n=== Stage 4.5 report ===`);
  console.log(`Clusters mergeados: ${mergedClusters} · rechazados por conflicto interno: ${rejectedClusters}`);
  console.log(`Grupos: ${N} → ${newGroups.length} (−${N - newGroups.length})`);
  console.log(`Multi-tienda: ${multi}`);
  console.log(`Redirects en group-merges.json: ${Object.keys(resolved).length}`);
  console.log(`Gray-zone para revisión: ${gray.length}`);
  console.log(`\nEjemplos de merge:`);
  for (const e of examples) console.log(`  [sc=${e.storeCount}] ${e.keptName}  ⊃  ${JSON.stringify(e.absorbed)}`);
}

// Sólo corre main() cuando se invoca directamente (node stage4-token-merge.mjs),
// no cuando el harness lo importa para testear los gates.
const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
