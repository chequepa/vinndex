/**
 * /bodega/{slug} que ya no es página: adónde va en vez de un 404.
 *
 * Una bodega tiene página con ≥3 fichas (`brandPages`). Dos cosas la
 * sacan de ahí sin que Google se entere, y la URL indexada queda en 404:
 *
 *  - Las fusiones del sommelier (#200, grupos −18%) dejan bodegas chicas
 *    con 1 o 2 fichas. Naviero: 135 impresiones a 90 días en posición 8,5,
 *    y hoy 2 fichas en 3 vinotecas.
 *  - La identidad corrige marcas que eran una línea: "Angélica Zapata" es
 *    Catena Zapata, "Judas" es Sottano, "Latitud 33" es Chandon. La URL
 *    vieja nombraba una bodega que ya no existe.
 *
 * Medido el 18/10 contra Search Console: 358 de 920 /bodega/ con
 * impresiones a 90 días daban 404 (29% de las impresiones de bodega).
 *
 * Funciones puras (todo por parámetro) para poder probarlas con node
 * pelado: ver scripts/test-brand-fallback.mjs.
 */

export type BrandFallback<G> =
  /** 2 fichas: la página se arma igual, fuera del sitemap. */
  | { kind: "small"; groups: G[] }
  /** 1 ficha: una página de bodega con un vino no compara nada. */
  | { kind: "wine"; groupSlug: string }
  /** Línea que se tomaba por bodega: a la bodega madre. */
  | { kind: "brand"; slug: string };

export type FallbackDeps<G> = {
  /** Fichas que alimentan páginas de bodega, cada una con su slug de bodega. */
  byBrand: Map<string, G[]>;
  /** Slugs que hoy SÍ tienen página (≥3 fichas). */
  pageSlugs: Set<string>;
  /**
   * [slug del nombre, slug de su bodega, peso] de las mismas fichas. El
   * peso es la cantidad de vinotecas: "Gran Enemigo" está en 36 tiendas
   * como El Enemigo y en fichas sueltas de 1 tienda como Catena Zapata.
   */
  names: Array<[string, string, number]>;
  groupSlugOf: (g: G) => string;
  /** ¿La ficha es vino (tiene tipo o varietal)? Para la página chica. */
  isWine: (g: G) => boolean;
};

/** Mínimo de fichas que nombran la línea para creerle. */
const LINE_MIN_HITS = 3;
/** Qué parte del peso (vinotecas) tiene que ser de la misma bodega. */
const LINE_MIN_SHARE = 0.8;

export function resolveBrandFallback<G>(
  slug: string,
  deps: FallbackDeps<G>,
): BrandFallback<G> | null {
  if (!slug || deps.pageSlugs.has(slug)) return null;

  const own = deps.byBrand.get(slug) ?? [];
  if (own.length === 2) {
    // Una "bodega" de 2 fichas sin tipo ni varietal es un licor o una
    // cerveza que se coló (Hesperidina, Buchanan's): no revive.
    return own.some(deps.isWine) ? { kind: "small", groups: own } : null;
  }
  if (own.length === 1) return { kind: "wine", groupSlug: deps.groupSlugOf(own[0]) };
  if (own.length > 2) return null; // tendría página: no debería pasar

  // La línea como frase entera del nombre ("angelica-zapata" adentro de
  // "angelica-zapata-malbec-alta"), nunca como sub-palabra: "sol" no es
  // "soledad". Un slug de una sola palabra corta matchea demasiado.
  if (slug.length < 4) return null;
  const needle = `-${slug}-`;
  const counts = new Map<string, number>();
  let hits = 0;
  let total = 0;
  for (const [name, brand, weight] of deps.names) {
    if (!`-${name}-`.includes(needle)) continue;
    hits++;
    const w = Math.max(1, weight);
    total += w;
    counts.set(brand, (counts.get(brand) ?? 0) + w);
  }
  if (hits < LINE_MIN_HITS) return null;
  let best: string | null = null;
  let bestN = 0;
  for (const [b, n] of counts) {
    if (n > bestN) {
      best = b;
      bestN = n;
    }
  }
  if (!best || best === slug || !deps.pageSlugs.has(best)) return null;
  if (bestN / total < LINE_MIN_SHARE) return null;
  return { kind: "brand", slug: best };
}
