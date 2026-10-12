/**
 * Compra combinada (ver lib/basket.ts): ¿en qué vinoteca compro TODO?
 *
 * Regla de producto (12/10/2026, tras la v1): la respuesta es SIEMPRE una
 * sola vinoteca. Repartir la compra en varias tiendas es justo lo que la
 * persona quiere evitar (varios envíos, varios checkouts), así que no se
 * ofrece como recomendación. Se ordenan las vinotecas por cuántos de los
 * vinos tienen (todas primero) y, a igual cobertura, por total.
 *
 * Módulo puro (sin snapshot), testeable y sin dependencias.
 */
/** Cómo compra esa cantidad en esa vinoteca. */
export type BasketCell = {
  total: number;
  /** Precio efectivo por botella (total / qty). */
  unit: number;
  /** Cajas cerradas usadas (0 = todo suelto). */
  cases: number;
  caseSize: number | null;
  /** Link a la oferta que más pesa (la caja si se usó, si no la botella). */
  url: string;
};

export type BasketItem = {
  slug: string;
  /** Slug pedido originalmente, si la ficha se fusionó con otra. */
  requestedSlug: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  qty: number;
  /** storeSlug → celda. Sólo vinotecas que pueden cubrir la cantidad. */
  byStore: Record<string, BasketCell>;
};

export type BasketMatrix = {
  items: BasketItem[];
  /** Pedidos que no encontramos (slug inexistente). */
  missing: string[];
  stores: { slug: string; name: string }[];
};

export type StoreOption = {
  storeSlug: string;
  /** Una línea por vino que la tienda tiene. */
  lines: { itemSlug: string; cell: BasketCell }[];
  /** Vinos del pedido que esta tienda no tiene (en esa cantidad). */
  missing: string[];
  total: number;
};

/**
 * Vinotecas ordenadas: primero las que tienen TODOS los vinos (más barata
 * primero); después, si hace falta, las que tienen más vinos. Los vinos que
 * ninguna tienda tiene no cuentan como faltante de nadie (no hay dónde
 * comprarlos) y la UI los avisa aparte.
 */
export function rankStores(matrix: BasketMatrix): StoreOption[] {
  const buyable = matrix.items.filter((i) => Object.keys(i.byStore).length > 0);
  const options: StoreOption[] = matrix.stores.map(({ slug }) => {
    const lines: StoreOption["lines"] = [];
    const missing: string[] = [];
    for (const it of buyable) {
      const cell = it.byStore[slug];
      if (cell) lines.push({ itemSlug: it.slug, cell });
      else missing.push(it.slug);
    }
    return { storeSlug: slug, lines, missing, total: lines.reduce((a, l) => a + l.cell.total, 0) };
  });
  return options
    .filter((o) => o.lines.length > 0)
    .sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);
}
