/**
 * lib-store-activity.mjs — ¿la vinoteca sigue viva?
 *
 * Una tienda cuyo catálogo no cambió UN solo precio en dos meses (con la
 * inflación argentina) no está vendiendo a esos precios: es un catálogo
 * abandonado que el scraper sigue leyendo. Medido el 30/09/2026 contra el
 * snapshot del 10/07: 11 vinotecas con el 100 % de sus precios idénticos
 * 85 días después (Galo Wines 611/611, Vinoteca Vito 202/202, Vinos
 * Directos 223/223…), y sus precios viejos aparecían como "mejor precio"
 * en las fichas y en el ranking de /vinotecas.
 *
 * Acá vive el registro: por vinoteca, la última fecha en que se vio un
 * precio distinto (o un producto nuevo) respecto del snapshot anterior.
 * Lo actualiza merge-snapshots.mjs cada corrida (es el único que tiene
 * el snapshot anterior y el nuevo a la vez); build-groups-v2.mjs lo lee
 * para marcar `stale` las ofertas de tiendas sin movimiento en
 * STALE_DAYS, que salen de la base de precio (como los sospechosos) y se
 * muestran con la etiqueta "Precio sin actualizar".
 */

export const STALE_DAYS = 60;

export const ACTIVITY_DOC =
  "Actividad de precios por vinoteca. lastPriceChange = última fecha en que la tienda mostró algún precio distinto (o un producto nuevo) respecto del snapshot anterior; firstSeen = primera vez observada; lastCheck = última corrida que la vio. Lo escribe merge-snapshots.mjs (o build-store-activity.mjs --backfill); lo lee build-groups-v2.mjs para marcar ofertas `stale` (sin movimiento en STALE_DAYS) y lib/storeIndex.ts para sacar esas vinotecas del ranking.";

/** Map(storeSlug → Map(externalUrl → priceArs)) desde una lista de ofertas/productos. */
export function priceMapByStore(items) {
  const m = new Map();
  for (const o of items ?? []) {
    if (!o || !o.storeSlug || !o.externalUrl) continue;
    const p = typeof o.priceArs === "string" ? Number(o.priceArs) || null : o.priceArs ?? null;
    if (!m.has(o.storeSlug)) m.set(o.storeSlug, new Map());
    m.get(o.storeSlug).set(o.externalUrl, p);
  }
  return m;
}

/** Ofertas de un snapshot publicado (productGroups) o crudo (products). */
export function snapshotItems(snapshot) {
  if (Array.isArray(snapshot?.products) && snapshot.products.length) return snapshot.products;
  const out = [];
  for (const g of snapshot?.productGroups ?? []) for (const o of g.offers ?? []) out.push(o);
  return out;
}

/**
 * Actualiza el registro comparando el snapshot anterior con el nuevo.
 * `today` en YYYY-MM-DD. Muta y devuelve `activity`.
 */
export function updateActivity(activity, prevMap, curMap, today) {
  activity.stores ??= {};
  for (const [slug, cur] of curMap) {
    const entry = activity.stores[slug] ?? { firstSeen: today, lastPriceChange: null, lastCheck: null, offers: 0 };
    entry.lastCheck = today;
    entry.offers = cur.size;
    const prev = prevMap.get(slug);
    if (!prev) {
      // Primera vez que la vemos: no hay con qué comparar. Cuenta como
      // actividad (una tienda nueva no es un catálogo abandonado).
      if (!entry.lastPriceChange) entry.lastPriceChange = today;
      activity.stores[slug] = entry;
      continue;
    }
    let changed = 0, compared = 0, fresh = 0;
    for (const [url, price] of cur) {
      if (!prev.has(url)) { fresh++; continue; }
      compared++;
      if (prev.get(url) !== price) changed++;
    }
    if (changed > 0 || fresh > 0) entry.lastPriceChange = today;
    entry.compared = compared;
    entry.changedLast = changed;
    entry.newLast = fresh;
    activity.stores[slug] = entry;
  }
  activity.updatedAt = today;
  activity._doc = ACTIVITY_DOC;
  return activity;
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Vinotecas sin movimiento de precios en `days` días (default STALE_DAYS).
 * Sólo una tienda observada durante al menos `days` días puede ser stale:
 * a la que llegó hace dos semanas no la juzgamos todavía.
 */
export function staleStores(activity, today, days = STALE_DAYS) {
  const out = new Map(); // slug → lastPriceChange
  for (const [slug, e] of Object.entries(activity?.stores ?? {})) {
    if (!e.firstSeen || daysBetween(e.firstSeen, today) < days) continue;
    const last = e.lastPriceChange ?? e.firstSeen;
    if (daysBetween(last, today) >= days) out.set(slug, last);
  }
  return out;
}
