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
];

export function findRanking(slug: string): Ranking | undefined {
  return RANKINGS.find((r) => r.slug === slug);
}

/** Aplica el ranking sobre el snapshot y devuelve los grupos top. */
export function applyRanking(ranking: Ranking): ProductGroup[] {
  const limit = ranking.limit ?? 24;
  return groups.filter(ranking.filter).sort(ranking.sort).slice(0, limit);
}
