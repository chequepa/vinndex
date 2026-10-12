/**
 * Joyitas: vinos de alta gama que HOY una vinoteca vende muy por debajo
 * de lo que lo cobra el resto del mercado.
 *
 * Por qué no alcanza con /ofertas: las bajas de precio comparan cada
 * vino contra SU PROPIO pasado (mediana de 7 días). El caso que motivó
 * esto — Kung Fu Malbec a $24.740 en Bebiendo Estrellas cuando las otras
 * 8 vinotecas lo tienen entre $35.900 y $45.000 — no es una baja: ese
 * precio está así desde hace semanas. Es una diferencia ENTRE TIENDAS, y
 * el detector de bajas no la ve nunca.
 *
 * La regla (calibrada sobre el snapshot del 11/10/2026):
 *
 *   1. Alta gama: la mediana de las OTRAS vinotecas es ≥ $25.000.
 *   2. Mercado de verdad: ≥ 4 vinotecas con la botella comparable en
 *      stock (un precio por vinoteca, el más barato de cada una). Con
 *      menos, "la mediana del resto" son uno o dos precios.
 *   3. Descuento: el mejor precio está entre 30% y 55% abajo de la
 *      mediana del resto. Más de 55% es casi siempre otra cosa (añada
 *      vieja, ficha mezclada, error de carga), no una oportunidad.
 *   4. Que se despegue: también ≥ 15% abajo del SEGUNDO más barato. Si
 *      dos vinotecas están igual de bajas, es el precio de mercado
 *      partido en dos, no una joyita.
 *   5. Misma añada: si la oferta barata declara cosecha y difiere en más
 *      de un año de la del resto, se descarta (un 2019 más barato que un
 *      2023 no es la misma compra).
 *   6. Ficha con bodega identificada. "Malbec" a secas no es un vino.
 *
 *   7. Más allá de la costumbre de la tienda: algunas vinotecas son
 *      estructuralmente baratas (índice 0,73–0,77). El precio tiene que
 *      estar ≥ 10% abajo de su nivel habitual (GEM_MAX_RATIO_VS_STORE_INDEX)
 *      y la tarjeta igual lo aclara ("esta vinoteca suele estar X% abajo").
 *
 * Todo sale del snapshot inmutable: se calcula una vez por proceso.
 */
import type { ProductGroup, ProductOffer } from "./matching";
import { groups, isPriceBasisOffer } from "./snapshot";
import { isJunkWineGroup } from "./junkSlugs";
import { getPriceHistory } from "./priceHistory";
import { storeIndex } from "./storeIndex";

export const GEM_MIN_REFERENCE = 25_000;
export const GEM_MIN_STORES = 4;
export const GEM_MIN_DISCOUNT = 0.3;
export const GEM_MAX_DISCOUNT = 0.55;
export const GEM_MIN_GAP_TO_SECOND = 0.15;
/**
 * El precio tiene que estar ≥ 10% abajo de lo que esa vinoteca suele
 * cobrar respecto del mercado (su índice). Frappé o Bebiendo Estrellas
 * están ~25% abajo en TODO: sin este filtro la página era su catálogo
 * (312 "joyitas" el 11/10, 200 con el filtro). Kung Fu en Bebiendo
 * Estrellas pasa: 0,66 del mercado contra un índice de 0,77.
 */
export const GEM_MAX_RATIO_VS_STORE_INDEX = 0.9;
/** Días en que una joyita se considera "nueva" (apareció de golpe). */
const NEW_DAYS = 3;
/** Frontera de identidad v2 — ver scripts/detect-price-drops.mjs. */
const IDENTITY_EPOCH = "2026-07-03";

export type GemTier = "25-50k" | "50-100k" | "100k+";

export type Gem = {
  slug: string;
  canonicalName: string;
  brand: string | null;
  imageUrl: string | null;
  storeSlug: string;
  /** URL de la oferta en la vinoteca (para el CTA directo). */
  offerUrl: string;
  price: number;
  /** Mediana de las otras vinotecas (un precio por tienda). */
  reference: number;
  /** Precio del segundo más barato. */
  secondPrice: number;
  /** Rango del resto del mercado. */
  othersMin: number;
  othersMax: number;
  /** 0–1. */
  discount: number;
  savingArs: number;
  storeCount: number;
  tier: GemTier;
  /** Índice de la vinoteca (0,77 = suele estar 23% abajo). null = sin índice. */
  storeIndex: number | null;
  /** El precio del vino cayó a este nivel en los últimos NEW_DAYS días. */
  isNew: boolean;
  /** Primer día (desde el epoch v2, rolling 30d) en que el mínimo ya estaba en este nivel. */
  since: string | null;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function tierFor(reference: number): GemTier {
  if (reference >= 100_000) return "100k+";
  if (reference >= 50_000) return "50-100k";
  return "25-50k";
}

export const GEM_TIER_LABELS: Record<GemTier, string> = {
  "25-50k": "$25.000 a $50.000",
  "50-100k": "$50.000 a $100.000",
  "100k+": "Más de $100.000",
};

/** Un precio por vinoteca: la oferta comparable más barata de cada una. */
function bestPerStore(g: ProductGroup): ProductOffer[] {
  const byStore = new Map<string, ProductOffer>();
  for (const o of g.offers) {
    if (!o.inStock || o.priceArs == null || !isPriceBasisOffer(o)) continue;
    const prev = byStore.get(o.storeSlug);
    if (!prev || (o.priceArs as number) < (prev.priceArs as number)) {
      byStore.set(o.storeSlug, o);
    }
  }
  return [...byStore.values()].sort(
    (a, b) => (a.priceArs as number) - (b.priceArs as number),
  );
}

/** ¿Desde cuándo el mínimo de la ficha está en este nivel? */
function priceSince(slug: string, price: number): { since: string | null; isNew: boolean } {
  const h = getPriceHistory(slug).filter((e) => e.date >= IDENTITY_EPOCH);
  if (h.length === 0) return { since: null, isNew: false };
  let since: string | null = null;
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].min > 0 && h[i].min <= price * 1.02) since = h[i].date;
    else break;
  }
  if (!since) return { since: null, isNew: false };
  // Nueva sólo si ANTES de `since` hay historia más cara: si la serie
  // arranca ya en este precio, no sabemos cuándo empezó. Y si el mínimo
  // bajó el mismo día que la ficha sumó vinotecas, es una fusión (o una
  // tienda nueva), no un precio que apareció — misma regla que
  // fellWhileGainingStores en scripts/detect-price-drops.mjs.
  const firstIdx = h.findIndex((e) => e.date === since);
  if (firstIdx > 0 && (h[firstIdx].stores ?? 0) > (h[firstIdx - 1].stores ?? 0)) {
    return { since, isNew: false };
  }
  const last = h[h.length - 1].date;
  const ageDays = Math.round(
    (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000,
  );
  return { since, isNew: firstIdx > 0 && ageDays < NEW_DAYS };
}

export function evaluateGem(g: ProductGroup): Gem | null {
  if (!g.brand || isJunkWineGroup(g)) return null;
  const offers = bestPerStore(g);
  if (offers.length < GEM_MIN_STORES) return null;
  const [best, ...others] = offers;
  const price = best.priceArs as number;
  const otherPrices = others.map((o) => o.priceArs as number);
  const reference = median(otherPrices);
  if (reference < GEM_MIN_REFERENCE) return null;
  const discount = 1 - price / reference;
  if (discount < GEM_MIN_DISCOUNT || discount > GEM_MAX_DISCOUNT) return null;
  const secondPrice = otherPrices[0];
  if (1 - price / secondPrice < GEM_MIN_GAP_TO_SECOND) return null;
  const otherVintages = others
    .map((o) => o.vintage)
    .filter((v): v is number => typeof v === "number");
  if (typeof best.vintage === "number" && otherVintages.length > 0) {
    if (Math.abs(best.vintage - median(otherVintages)) > 1) return null;
  }
  const idx = storeIndex(best.storeSlug)?.index ?? null;
  if (idx != null && price / reference / idx > GEM_MAX_RATIO_VS_STORE_INDEX) return null;
  const { since, isNew } = priceSince(g.groupSlug, price);
  return {
    slug: g.groupSlug,
    canonicalName: g.canonicalName,
    brand: g.brand,
    imageUrl: g.imageUrl ?? best.imageUrl ?? null,
    storeSlug: best.storeSlug,
    offerUrl: best.externalUrl,
    price,
    reference,
    secondPrice,
    othersMin: Math.min(...otherPrices),
    othersMax: Math.max(...otherPrices),
    discount,
    savingArs: Math.round(reference - price),
    storeCount: offers.length,
    tier: tierFor(reference),
    storeIndex: idx,
    isNew,
    since,
  };
}

let cache: Gem[] | null = null;

/** Todas las joyitas de hoy: nuevas primero, después por descuento. */
export function gems(): Gem[] {
  if (cache) return cache;
  const out: Gem[] = [];
  for (const g of groups) {
    const gem = evaluateGem(g);
    if (gem) out.push(gem);
  }
  out.sort(
    (a, b) =>
      Number(b.isNew) - Number(a.isNew) ||
      b.discount - a.discount ||
      b.savingArs - a.savingArs,
  );
  cache = out;
  return out;
}

let bySlug: Map<string, Gem> | null = null;
export function gemFor(slug: string): Gem | undefined {
  if (!bySlug) bySlug = new Map(gems().map((g) => [g.slug, g]));
  return bySlug.get(slug);
}

/**
 * Selección para el home: la vidriera tiene que ser creíble antes que
 * espectacular. Un −55% en la portada es más probable que sea una ficha
 * mal agrupada que una ganga, así que acá van los descuentos de 30–45%
 * con 5+ vinotecas detrás, ordenados por ahorro en pesos (lo que pesa en
 * alta gama). Nuevas primero. No más de 2 por vinoteca, para que no sea
 * el catálogo de la tienda más barata del día.
 */
export function featuredGems(limit = 6): Gem[] {
  const pool = gems()
    .filter((g) => g.discount <= 0.45 && g.storeCount >= 5)
    .sort(
      (a, b) => Number(b.isNew) - Number(a.isNew) || b.savingArs - a.savingArs,
    );
  const perStore = new Map<string, number>();
  const out: Gem[] = [];
  for (const g of pool) {
    const n = perStore.get(g.storeSlug) ?? 0;
    if (n >= 2) continue;
    perStore.set(g.storeSlug, n + 1);
    out.push(g);
    if (out.length >= limit) break;
  }
  return out;
}

/** "suele estar 23% abajo del mercado" — sólo si la tienda es estructuralmente barata. */
export function storeContext(gem: Gem): string | null {
  if (gem.storeIndex == null || gem.storeIndex > 0.9) return null;
  return `esta vinoteca suele estar ${Math.round((1 - gem.storeIndex) * 100)}% abajo del mercado`;
}
