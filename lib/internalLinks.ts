/**
 * Enlazado interno entre fichas /vino.
 *
 * Medido el 26/09 sobre el snapshot: de las 21.609 fichas del sitemap,
 * 9.400 no recibían NI UN link interno desde una página rastreable —
 * sólo existían en el sitemap. Las páginas de bodega, varietal y región
 * muestran su top 24/48 (siempre las mismas multi-tienda) y el bloque
 * "Te pueden gustar" de cada ficha elige por puntaje, así que también
 * converge en las mismas ~2.000 fichas populares. Una URL que sólo está
 * en el sitemap es la receta de "Discovered/Crawled – currently not
 * indexed" en Search Console.
 *
 * Dos "anillos" deterministas garantizan que cada ficha rastreable reciba
 * links de sus vecinas:
 *
 *   · por bodega: la lista de vinos de la bodega ordenada por cobertura;
 *     cada ficha linkea a las N siguientes (circular). Toda ficha con
 *     bodega recibe N links de sus hermanas.
 *   · por precio dentro del varietal (o tipo): la lista ordenada por
 *     precio; cada ficha linkea a las más cercanas por arriba y por
 *     abajo. Además de cobertura es útil para quien compra ("otros
 *     Malbec de precio parecido").
 *
 * Se calculan una vez por proceso (el snapshot es inmutable).
 */
import type { ProductGroup } from "./matching";
import { groups, feedsBrandPage, brandPageSlug } from "./snapshot";
import { isJunkSlug, isJunkWineGroup } from "./junkSlugs";

/**
 * Ficha que le pedimos a Google que rastree: la misma regla que el
 * sitemap (con imagen, vino de verdad, al menos una oferta con stock).
 */
export function isCrawlTargetWine(g: ProductGroup): boolean {
  return (
    g.imageUrl !== null &&
    !isJunkWineGroup(g) &&
    !isJunkSlug(g.groupSlug) &&
    (g.offers ?? []).some((o) => o.inStock)
  );
}

type Rings = {
  byBrand: Map<string, ProductGroup[]>;
  byPrice: Map<string, ProductGroup[]>;
  pos: Map<string, { brand: number; price: number }>;
};

let rings: Rings | null = null;

function priceKey(g: ProductGroup): string {
  return (g.varietals?.[0] ?? g.type ?? "vino").toLowerCase();
}

function buildRings(): Rings {
  const byBrand = new Map<string, ProductGroup[]>();
  const byPrice = new Map<string, ProductGroup[]>();
  for (const g of groups) {
    if (!isCrawlTargetWine(g)) continue;
    if (g.brand && feedsBrandPage(g)) {
      const k = brandPageSlug(g.brand);
      if (k) {
        let arr = byBrand.get(k);
        if (!arr) byBrand.set(k, (arr = []));
        arr.push(g);
      }
    }
    if (g.minPrice != null && g.minPrice > 0) {
      const k = priceKey(g);
      let arr = byPrice.get(k);
      if (!arr) byPrice.set(k, (arr = []));
      arr.push(g);
    }
  }
  const pos = new Map<string, { brand: number; price: number }>();
  for (const arr of byBrand.values()) {
    arr.sort(
      (a, b) =>
        b.storeCount - a.storeCount ||
        a.groupSlug.localeCompare(b.groupSlug),
    );
    arr.forEach((g, i) => pos.set(g.groupSlug, { brand: i, price: -1 }));
  }
  for (const arr of byPrice.values()) {
    arr.sort(
      (a, b) =>
        (a.minPrice ?? 0) - (b.minPrice ?? 0) ||
        a.groupSlug.localeCompare(b.groupSlug),
    );
    arr.forEach((g, i) => {
      const p = pos.get(g.groupSlug);
      if (p) p.price = i;
      else pos.set(g.groupSlug, { brand: -1, price: i });
    });
  }
  return { byBrand, byPrice, pos };
}

function getRings(): Rings {
  if (!rings) rings = buildRings();
  return rings;
}

/** Todas las fichas rastreables de una bodega (para /bodega/[slug]). */
export function brandCrawlTargets(bodegaSlug: string): ProductGroup[] {
  return getRings().byBrand.get(bodegaSlug) ?? [];
}

/**
 * Hasta `n` vinos de la misma bodega: los que siguen a esta ficha en el
 * orden por cobertura (circular). Si la ficha no está en el anillo (sin
 * stock, sin imagen), arranca desde el tope.
 */
export function brandSiblings(g: ProductGroup, n = 6): ProductGroup[] {
  if (!g.brand) return [];
  const arr = getRings().byBrand.get(brandPageSlug(g.brand));
  if (!arr || arr.length === 0) return [];
  const start = getRings().pos.get(g.groupSlug)?.brand ?? -1;
  const out: ProductGroup[] = [];
  for (let i = 1; i <= arr.length && out.length < n; i++) {
    const cand = arr[(start + i + arr.length) % arr.length];
    if (cand.groupSlug !== g.groupSlug) out.push(cand);
  }
  return out;
}

/**
 * Hasta `n` vinos del mismo varietal (o tipo) con el precio más cercano:
 * mitad más baratos, mitad más caros. `exclude` evita repetir los que la
 * ficha ya muestra en otro bloque.
 */
export function priceNeighbors(
  g: ProductGroup,
  n = 6,
  exclude: Set<string> = new Set(),
): ProductGroup[] {
  if (g.minPrice == null || g.minPrice <= 0) return [];
  const arr = getRings().byPrice.get(priceKey(g));
  if (!arr || arr.length < 2) return [];
  let at = getRings().pos.get(g.groupSlug)?.price ?? -1;
  if (at < 0) {
    // No está en el anillo: ubicarla por precio.
    at = arr.findIndex((x) => (x.minPrice ?? 0) >= (g.minPrice ?? 0));
    if (at < 0) at = arr.length - 1;
  }
  const out: ProductGroup[] = [];
  const skip = (x: ProductGroup) =>
    x.groupSlug === g.groupSlug || exclude.has(x.groupSlug);
  for (let d = 1; out.length < n && (at - d >= 0 || at + d < arr.length); d++) {
    const lo = arr[at - d];
    const hi = arr[at + d];
    if (lo && !skip(lo) && out.length < n) out.push(lo);
    if (hi && !skip(hi) && out.length < n) out.push(hi);
  }
  return out.sort((a, b) => (a.minPrice ?? 0) - (b.minPrice ?? 0));
}
