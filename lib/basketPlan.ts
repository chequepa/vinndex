/**
 * Combinaciones de la compra combinada (ver lib/basket.ts). Módulo PURO,
 * sin snapshot: lo importa el cliente (components/BasketPlanner.tsx) para
 * re-ordenar al instante cuando la persona cambia el costo de envío.
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

export type PlanLine = { itemSlug: string; storeSlug: string; cell: BasketCell };
export type Plan = {
  kind: "single" | "split" | "pair";
  stores: string[];
  lines: PlanLine[];
  /** Ítems que ninguna vinoteca del plan tiene. */
  uncovered: string[];
  winesTotal: number;
  shippingTotal: number;
  total: number;
};

function planFrom(
  kind: Plan["kind"],
  items: BasketItem[],
  allowed: string[] | null,
  shippingPerStore: number,
): Plan {
  const lines: PlanLine[] = [];
  const uncovered: string[] = [];
  for (const it of items) {
    let bestStore: string | null = null;
    let bestCell: BasketCell | null = null;
    for (const [s, cell] of Object.entries(it.byStore)) {
      if (allowed && !allowed.includes(s)) continue;
      if (!bestCell || cell.total < bestCell.total) {
        bestStore = s;
        bestCell = cell;
      }
    }
    if (bestStore && bestCell) lines.push({ itemSlug: it.slug, storeSlug: bestStore, cell: bestCell });
    else uncovered.push(it.slug);
  }
  const used = [...new Set(lines.map((l) => l.storeSlug))];
  const winesTotal = lines.reduce((a, l) => a + l.cell.total, 0);
  const shippingTotal = used.length * shippingPerStore;
  return { kind, stores: used, lines, uncovered, winesTotal, shippingTotal, total: winesTotal + shippingTotal };
}

/**
 * Las tres respuestas que importan:
 *   · `singles`: vinotecas que tienen TODO, de la más barata a la más cara
 *     (si ninguna tiene todo: las que más cubren);
 *   · `split`: cada vino donde está más barato, sin importar cuántas
 *     vinotecas sean;
 *   · `pair`: la mejor combinación de exactamente dos vinotecas que cubra
 *     todo (fuerza bruta: ~100 tiendas → ~5.000 pares, trivial).
 * `best` es el más barato contando envío.
 */
export function planBasket(matrix: BasketMatrix, shippingPerStore: number) {
  const items = matrix.items;
  const storeSlugs = matrix.stores.map((s) => s.slug);
  const singles = storeSlugs
    .map((s) => planFrom("single", items, [s], shippingPerStore))
    .filter((p) => p.lines.length > 0)
    .sort((a, b) => a.uncovered.length - b.uncovered.length || a.total - b.total);
  const split = planFrom("split", items, null, shippingPerStore);

  let pair: Plan | null = null;
  if (items.length >= 2) {
    // Sólo tiendas que tienen al menos un vino del pedido.
    for (let i = 0; i < storeSlugs.length; i++) {
      for (let j = i + 1; j < storeSlugs.length; j++) {
        const p = planFrom("pair", items, [storeSlugs[i], storeSlugs[j]], shippingPerStore);
        if (p.uncovered.length > 0 || p.stores.length < 2) continue;
        if (!pair || p.total < pair.total) pair = p;
      }
    }
  }

  const fullSingles = singles.filter((p) => p.uncovered.length === 0);
  const candidates = [fullSingles[0], pair, split.uncovered.length === 0 ? split : null].filter(
    (p): p is Plan => p != null,
  );
  const best = candidates.sort((a, b) => a.total - b.total || a.stores.length - b.stores.length)[0] ?? null;
  return { singles, split, pair, best };
}
