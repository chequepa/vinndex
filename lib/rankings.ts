import { groups } from "./snapshot";
import type { ProductGroup } from "./matching";

/**
 * Rankings curados para descubrimiento — páginas SEO tipo "top
 * malbecs baratos", "top espumantes", "vinos bajo 10.000", etc.
 *
 * Cada ranking define:
 *   - `slug`: URL final (/ranking/<slug>)
 *   - `title` / `subtitle`: header de la página (también se reusa en
 *     metadata title)
 *   - `description`: para meta description y header copy
 *   - `keywords`: para metadata keywords
 *   - `filter`: predicado puro sobre ProductGroup
 *   - `sort`: comparator para ordenar
 *   - `limit`: cuántos mostrar (default 24)
 *   - `priceCapHint`: si aplica, lo usamos en el copy ("hasta $X")
 *
 * Pensados para responder a queries reales de Google sobre el mercado
 * de vino argentino. NO listas patrocinadas — el orden es el real del
 * snapshot bajo el criterio del ranking.
 */
export type Ranking = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  filter: (g: ProductGroup) => boolean;
  sort: (a: ProductGroup, b: ProductGroup) => number;
  limit?: number;
  priceCapHint?: string;
};

// Comparadores reutilizables.
const byPriceAsc = (a: ProductGroup, b: ProductGroup) =>
  (a.minPrice ?? Number.POSITIVE_INFINITY) -
  (b.minPrice ?? Number.POSITIVE_INFINITY);

const byStoresDesc = (a: ProductGroup, b: ProductGroup) => {
  const sd = b.storeCount - a.storeCount;
  if (sd !== 0) return sd;
  return byPriceAsc(a, b);
};

// Helpers de filtro.
const hasInStockPrice = (g: ProductGroup) =>
  typeof g.minPrice === "number" && g.minPrice > 0 && g.storeCount >= 1;

const isMultiStore = (g: ProductGroup) => g.storeCount >= 2;

const hasVarietal =
  (varietal: string) =>
  (g: ProductGroup): boolean =>
    (g.varietals ?? []).some((v) => v.toLowerCase() === varietal.toLowerCase());

const isType =
  (type: string) =>
  (g: ProductGroup): boolean =>
    g.type?.toLowerCase() === type.toLowerCase();

const priceBelow =
  (cap: number) =>
  (g: ProductGroup): boolean =>
    typeof g.minPrice === "number" && g.minPrice > 0 && g.minPrice <= cap;

const priceAbove =
  (floor: number) =>
  (g: ProductGroup): boolean =>
    typeof g.minPrice === "number" && g.minPrice >= floor;

// Reglas anti-noise: descartamos rosés/blancos cuando se pide tinto,
// vinos sin brand (suelen ser registros sucios), grupos huérfanos.
const isCleanProduct = (g: ProductGroup) =>
  !!g.brand &&
  g.brand.length >= 2 &&
  hasInStockPrice(g) &&
  // Filtro de tokens raros que delatan vino "no-vino" o data sucia.
  !/jack daniels|fernet|cynar|aperol|smirnoff|gin |whisky|whisk[eí]|cerveza/i.test(
    g.canonicalName ?? "",
  );

const hasBrand =
  (brand: string) =>
  (g: ProductGroup): boolean =>
    (g.brand ?? "").toLowerCase() === brand.toLowerCase();

const hasRegion =
  (region: string) =>
  (g: ProductGroup): boolean =>
    g.region?.toLowerCase() === region.toLowerCase();

const isTinto = (g: ProductGroup) =>
  (g.type ?? "").toLowerCase() === "tinto";
const isBlanco = (g: ProductGroup) =>
  (g.type ?? "").toLowerCase() === "blanco";

const matchesName =
  (re: RegExp) =>
  (g: ProductGroup): boolean =>
    re.test(g.canonicalName ?? "");

const priceBetween =
  (low: number, high: number) =>
  (g: ProductGroup): boolean =>
    typeof g.minPrice === "number" &&
    g.minPrice >= low &&
    g.minPrice <= high;

export const RANKINGS: Ranking[] = [
  {
    slug: "top-malbecs-baratos",
    title: "Top Malbecs baratos",
    subtitle:
      "Los Malbecs más accesibles del catálogo, comparados en al menos 2 vinotecas online de Argentina.",
    description:
      "Ranking actualizado de los Malbec argentinos más baratos, ordenados por precio y validados en múltiples vinotecas online. Sin patrocinios — el orden es el precio real.",
    keywords: [
      "malbec barato",
      "malbec económico",
      "vino malbec argentino",
      "comparar precio malbec",
      "ofertas malbec",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && hasVarietal("Malbec")(g),
    sort: byPriceAsc,
    limit: 24,
  },
  {
    slug: "top-malbecs-premium",
    title: "Malbecs premium con precio comparado",
    subtitle:
      "Los Malbecs argentinos de alta gama (≥ $25.000) presentes en varias vinotecas — comparalos antes de comprar.",
    description:
      "Selección de Malbecs premium argentinos relevados en múltiples vinotecas online. Útil para regalos, eventos y consumo selecto.",
    keywords: [
      "malbec premium",
      "malbec gama alta",
      "mejores malbec argentinos",
      "comparar malbec premium",
    ],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      hasVarietal("Malbec")(g) &&
      priceAbove(25_000)(g),
    sort: (a, b) => byStoresDesc(a, b),
    limit: 24,
  },
  {
    slug: "vinos-bajo-5000",
    title: "Vinos bajo $5.000",
    subtitle:
      "Vinos relevados en vinotecas online de Argentina por menos de $5.000 la botella. Stock real y comparable.",
    description:
      "Catálogo de vinos argentinos disponibles bajo $5.000 en al menos 2 vinotecas online. Actualizado a diario.",
    keywords: [
      "vinos baratos",
      "vinos económicos argentina",
      "vinos bajo 5000",
      "ofertas vinos",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && priceBelow(5_000)(g),
    sort: byPriceAsc,
    limit: 30,
    priceCapHint: "$5.000",
  },
  {
    slug: "vinos-bajo-10000",
    title: "Vinos bajo $10.000",
    subtitle:
      "Vinos argentinos comparables, todos por menos de $10.000 la botella, en stock en al menos 2 tiendas online.",
    description:
      "Selección de vinos argentinos relevados por debajo de $10.000. Comparamos precios reales en vinotecas online para que veas el mejor.",
    keywords: [
      "vinos bajo 10000",
      "vinos económicos buena calidad",
      "vinos accesibles argentina",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && priceBelow(10_000)(g),
    sort: byPriceAsc,
    limit: 30,
    priceCapHint: "$10.000",
  },
  {
    slug: "top-espumantes",
    title: "Top espumantes argentinos",
    subtitle:
      "Espumantes argentinos comparados en múltiples vinotecas online. Brut, Extra Brut, Nature, Rosé y dulces.",
    description:
      "Ranking de espumantes argentinos relevados en vinotecas online. Comparamos precios para que veas dónde conseguir cada uno al mejor valor.",
    keywords: [
      "espumante argentino",
      "champagne argentino",
      "extra brut argentino",
      "comparar espumantes",
    ],
    filter: (g) => isCleanProduct(g) && isMultiStore(g) && isType("Espumante")(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-blends",
    title: "Top blends argentinos",
    subtitle:
      "Los blends (cortes de varietales) más buscados del catálogo, presentes en al menos 2 vinotecas online.",
    description:
      "Ranking de blends argentinos (Malbec + Cabernet Sauvignon, Bonarda + Malbec, cortes bordoleses) relevados en vinotecas online de Argentina.",
    keywords: [
      "blend argentino",
      "corte de vino",
      "vino blend argentino",
      "comparar blends",
    ],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      // Los blends suelen tener ≥ 2 varietales O la palabra "blend"
      // o "corte" en el canonical name.
      ((g.varietals?.length ?? 0) >= 2 ||
        /\bblend\b|\bcorte\b/i.test(g.canonicalName ?? "")),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-cabernet-sauvignon",
    title: "Top Cabernet Sauvignon argentinos",
    subtitle:
      "Cabernet Sauvignon argentinos comparados en múltiples vinotecas online. Mendoza, Cuyo y resto del país.",
    description:
      "Ranking de Cabernet Sauvignon argentinos relevados en vinotecas online, ordenados por cobertura y precio.",
    keywords: [
      "cabernet sauvignon argentino",
      "comparar cabernet sauvignon",
      "vinos cabernet baratos",
    ],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      hasVarietal("Cabernet Sauvignon")(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-bonardas",
    title: "Top Bonardas argentinos",
    subtitle:
      "Bonarda argentinas (la otra reina argentina) en múltiples vinotecas online. Una alternativa al Malbec con cuerpo medio y precio amigo.",
    description:
      "Ranking de Bonardas argentinas relevadas en vinotecas online. La uva más plantada después del Malbec, con buena relación precio-calidad.",
    keywords: [
      "bonarda argentina",
      "vino bonarda",
      "comparar bonarda",
      "alternativa malbec",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && hasVarietal("Bonarda")(g),
    sort: byStoresDesc,
    limit: 24,
  },

  // ────────────────────────────────────────────────────────────────
  // Rankings por momento / ocasión — capturan queries tipo "vinos
  // para asado", "vinos para regalar". Filtran por tipo + precio +
  // varietales y devuelven una selección curada.
  // ────────────────────────────────────────────────────────────────
  {
    slug: "vinos-para-asado",
    title: "Vinos para asado",
    subtitle:
      "Tintos con cuerpo y entre $5.000 y $20.000 — los que aguantan un chorizo y un bife de chorizo, comparados en varias vinotecas.",
    description:
      "Selección de tintos argentinos pensados para acompañar un asado: Malbec, Cabernet, Bonarda con cuerpo y precio amigable. Comparamos en múltiples vinotecas online para que veas el mejor valor.",
    keywords: [
      "vino para asado",
      "vino asado argentina",
      "malbec asado",
      "tinto para parrilla",
    ],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      isTinto(g) &&
      priceBetween(5_000, 20_000)(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "vinos-para-regalar",
    title: "Vinos para regalar",
    subtitle:
      "Etiquetas premium ($25k–$80k) comparadas en al menos 2 vinotecas — buenos candidatos para un regalo serio o un brindis de aniversario.",
    description:
      "Selección de vinos premium argentinos relevados en múltiples vinotecas. Rango precio para regalos significativos, comparados para que veas dónde conseguirlos al mejor precio.",
    keywords: [
      "vino para regalar",
      "vino premium regalo",
      "etiqueta importante",
      "vino aniversario",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && priceBetween(25_000, 80_000)(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "vinos-blancos-para-pescado",
    title: "Vinos blancos para pescado y mariscos",
    subtitle:
      "Blancos frescos comparados en varias vinotecas — Chardonnay, Sauvignon Blanc, Torrontés y Viognier que acompañan bien pescado, ceviche y mariscos.",
    description:
      "Ranking de vinos blancos argentinos relevados en vinotecas online, ideales para pescado, mariscos y comida fresca. Comparamos precios para que veas dónde conseguirlos al mejor valor.",
    keywords: [
      "vino blanco pescado",
      "chardonnay argentino",
      "sauvignon blanc",
      "torrontés",
      "vino para mariscos",
    ],
    filter: (g) => isCleanProduct(g) && isMultiStore(g) && isBlanco(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "vinos-organicos",
    title: "Vinos orgánicos y biodinámicos argentinos",
    subtitle:
      "Vinos orgánicos / biodinámicos relevados en vinotecas online — agricultura sin químicos de síntesis, vinificación de baja intervención.",
    description:
      "Selección de vinos argentinos orgánicos y biodinámicos relevados en vinotecas online. Filtrado por mención explícita en el nombre/descripción del producto.",
    keywords: [
      "vino orgánico argentino",
      "vino biodinámico",
      "vinos naturales argentina",
    ],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      matchesName(/org[aá]nico|biodin[aá]mico|natural\b/i)(g),
    sort: byStoresDesc,
    limit: 24,
  },

  // ────────────────────────────────────────────────────────────────
  // Rankings por bodega — los productores más grandes y buscados.
  // ────────────────────────────────────────────────────────────────
  {
    slug: "top-catena-zapata",
    title: "Top Catena Zapata",
    subtitle:
      "La línea completa de Catena Zapata relevada en vinotecas online — DV Catena, Adrianna Vineyard, Angélica Zapata, Argentino y más, comparados.",
    description:
      "Catálogo de vinos Catena Zapata (y sub-marcas) en vinotecas online de Argentina. Comparamos precios entre múltiples tiendas para cada línea.",
    keywords: ["catena zapata", "dv catena", "adrianna", "argentino malbec"],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      (hasBrand("Catena Zapata")(g) ||
        hasBrand("DV Catena")(g) ||
        hasBrand("Nicolas Catena Zapata")(g)),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-salentein",
    title: "Top Salentein",
    subtitle:
      "Bodega Salentein y sus líneas (Numina, Portillo, Primus, Pyros, Killka, Alyda) comparadas en vinotecas online.",
    description:
      "Vinos Salentein y sus sub-marcas relevados en vinotecas online. Ranking con precio comparado entre múltiples tiendas.",
    keywords: ["salentein", "numina", "portillo", "primus", "pyros"],
    filter: (g) => isCleanProduct(g) && isMultiStore(g) && hasBrand("Salentein")(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-rutini",
    title: "Top Rutini",
    subtitle:
      "Bodega Rutini Wines y líneas (Encuentro, Antología, Expresiones, Trumpeter) comparadas en vinotecas online.",
    description:
      "Vinos Rutini y sub-marcas relevados en vinotecas online. Ranking ordenado por cobertura, con comparación de precio.",
    keywords: ["rutini", "trumpeter", "antología rutini", "expresiones"],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      (hasBrand("Rutini")(g) || hasBrand("Trumpeter")(g)),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-zuccardi",
    title: "Top Zuccardi",
    subtitle:
      "Familia Zuccardi y sus líneas (Emma, Concreto, Polígonos, Aluvional, Santa Julia) comparadas en vinotecas online.",
    description:
      "Vinos Zuccardi y sub-marcas relevados en vinotecas online. La bodega argentina más premiada en los últimos años, con varias líneas a distintos precios.",
    keywords: ["zuccardi", "emma zuccardi", "concreto", "santa julia"],
    filter: (g) =>
      isCleanProduct(g) &&
      isMultiStore(g) &&
      (hasBrand("Zuccardi")(g) || hasBrand("Santa Julia")(g)),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-trapiche",
    title: "Top Trapiche",
    subtitle:
      "Trapiche y sus líneas (Medalla, Broquel, Iscay, Costa & Pampa) comparadas en vinotecas online.",
    description:
      "Vinos Trapiche y sub-marcas relevados en vinotecas online. Una de las bodegas más grandes y diversas de Argentina, comparados para que veas dónde conseguirlos al mejor precio.",
    keywords: ["trapiche", "medalla trapiche", "broquel", "iscay"],
    filter: (g) => isCleanProduct(g) && isMultiStore(g) && hasBrand("Trapiche")(g),
    sort: byStoresDesc,
    limit: 24,
  },

  // ────────────────────────────────────────────────────────────────
  // Rankings por región — capturan queries de origen geográfico.
  // ────────────────────────────────────────────────────────────────
  {
    slug: "top-valle-de-uco",
    title: "Top vinos del Valle de Uco",
    subtitle:
      "Vinos del Valle de Uco (Tupungato, Tunuyán, Vista Flores, Gualtallary, Altamira) comparados en vinotecas online — la zona vinícola más prestigiada de Argentina hoy.",
    description:
      "Vinos del Valle de Uco relevados en vinotecas online. Altitud, suelos calcáreos y noches frescas — la zona favorita de los críticos del Malbec moderno.",
    keywords: [
      "valle de uco vinos",
      "tupungato",
      "gualtallary",
      "altamira",
      "malbec uco",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && hasRegion("Valle de Uco")(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-lujan-de-cuyo",
    title: "Top vinos de Luján de Cuyo",
    subtitle:
      "Vinos de Luján de Cuyo (Agrelo, Vistalba, Perdriel) — la región histórica del Malbec argentino, comparados en vinotecas online.",
    description:
      "Vinos de Luján de Cuyo relevados en vinotecas online. La zona donde el Malbec se hizo argentino, con perfiles más cálidos y bodegas tradicionales.",
    keywords: [
      "luján de cuyo",
      "agrelo",
      "vistalba",
      "perdriel",
      "malbec luján",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && hasRegion("Luján de Cuyo")(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-salta",
    title: "Top vinos de Salta y Cafayate",
    subtitle:
      "Vinos de Salta (Cafayate, Molinos, Valles Calchaquíes, Colomé) comparados en vinotecas online. Torrontés y Malbec de altura.",
    description:
      "Vinos del NOA argentino: Salta, Cafayate y los Valles Calchaquíes. Altitudes extremas, perfiles intensos. Ranking comparado entre vinotecas online.",
    keywords: [
      "vinos salta",
      "cafayate",
      "valles calchaquíes",
      "torrontés",
      "colomé",
    ],
    filter: (g) =>
      isCleanProduct(g) && isMultiStore(g) && hasRegion("Salta")(g),
    sort: byStoresDesc,
    limit: 24,
  },
  {
    slug: "top-patagonia",
    title: "Top vinos de Patagonia",
    subtitle:
      "Vinos de Patagonia (Río Negro, Neuquén, Chubut) relevados en vinotecas online. Clima frío, vinos elegantes — Pinot Noir, Malbec patagónico y blancos de calidad.",
    description:
      "Vinos patagónicos relevados en vinotecas online. La región más fría de Argentina, con perfiles más finos y elegantes.",
    keywords: [
      "vinos patagonia",
      "vinos río negro",
      "neuquén vinos",
      "chubut vinos",
      "pinot noir patagonia",
    ],
    // Patagonia produce relativamente poco — la mayoría son grupos
    // de 1 sola tienda. Si exigimos multi-store, la lista queda en
    // 0. Relajamos a in-stock + clean para tener un ranking útil.
    filter: (g) => isCleanProduct(g) && hasRegion("Patagonia")(g),
    sort: byStoresDesc,
    limit: 24,
  },
];

export function findRanking(slug: string): Ranking | undefined {
  return RANKINGS.find((r) => r.slug === slug);
}

/** Aplica el ranking sobre el snapshot y devuelve los grupos top. */
export function applyRanking(ranking: Ranking): ProductGroup[] {
  const limit = ranking.limit ?? 24;
  return groups.filter(ranking.filter).sort(ranking.sort).slice(0, limit);
}
