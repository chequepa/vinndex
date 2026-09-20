/**
 * Fichas que el scrape NO vio hoy pero que siguen existiendo.
 * ============================================================
 *
 * EL PROBLEMA (medido el 20/09/2026). Una ficha existe sólo si alguna
 * tienda listó el producto en el scrape de HOY. Pero la búsqueda de VTEX
 * (Carrefour, Día, Disco) devuelve un set distinto cada día: el producto
 * está en la tienda y no aparece en la respuesta. La ficha desaparece del
 * snapshot, su URL pasa a 404, y al día siguiente vuelve.
 *
 * Medición sobre los 8 snapshots del 13 al 20/09: **638 fichas que
 * estuvieron vivas 5 o más de los 7 días anteriores no están hoy**, y 149
 * slugs de hoy no estaban ayer. Muestra de 40 de esas 638 contra
 * producción: **33 devuelven 404** (7 tienen redirect porque además
 * cambiaron de slug). Extrapolado, del orden de 500 URLs en 404 por día
 * que mañana vuelven a existir.
 *
 * Google las ve caer. `/vino/fusta-malbec` tiene 263 impresiones en los
 * últimos 28 días, posición 10, y está en 404 hoy — es la tercera página
 * de la lista de oportunidad de CTR del reporte de Search Console. La
 * misma firma explica buena parte de las 9.560 URLs en "Not found (404)"
 * del informe de indexación.
 *
 * LA REGLA. El registro de slugs ya dice, desde que existe:
 *
 *   "Nunca se borra una entrada — un vino sin stock hoy puede volver
 *    mañana y su URL tiene que ser la misma."
 *
 * Esto es esa misma doctrina un escalón más arriba: si ayer publicamos una
 * ficha y hoy ninguna de sus ofertas apareció en el scrape, la ficha se
 * arrastra hasta CARRYOVER_DAYS días. No inventa nada: es la ficha de
 * ayer, **sin un solo precio**, con todas sus ofertas sin stock. Queda
 * igual que las 8.272 fichas sin stock que el sitio ya publica — 200,
 * sin precio, y fuera del sitemap por el filtro que ya existe
 * (`lib/sitemap-buckets.ts` saca las que no tienen ninguna oferta con
 * stock). No se le pide a Google que las visite; se deja de decirle que
 * no existen.
 *
 * Por qué sin precio: doctrina del PR #129 — un precio que no verificamos
 * hoy no se publica. Mejor sin precio que con un precio falso.
 *
 * Por qué con ventana: a los CARRYOVER_DAYS días sin verla, el 404 pasa a
 * ser la respuesta correcta y la ficha se cae sola. La ventana acota el
 * daño de arrastrar un producto realmente discontinuado.
 */

/** Días que una ficha sobrevive sin que ninguna tienda la liste. */
export const CARRYOVER_DAYS = 7;

/** Fecha (YYYY-MM-DD) de un ISO, para comparar por día y no por hora. */
export function dayOf(iso) {
  return String(iso ?? "").slice(0, 10);
}

/** Días enteros entre dos YYYY-MM-DD. */
export function daysBetween(fromDay, toDay) {
  const a = Date.parse(fromDay + "T00:00:00Z");
  const b = Date.parse(toDay + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.round((b - a) / 86400000);
}

/**
 * Deja una ficha sin un solo precio y sin stock, conservando lo que la
 * página necesita para renderizar (nombre, imagen, bodega, vinotecas).
 * `totalStoreCount`/`totalOfferCount` se conservan: son los que hacen que
 * el título diga "sin stock en N vinotecas".
 */
export function stripPrices(group, lastSeenDay) {
  return {
    ...group,
    storeCount: 0,
    offerCount: 0,
    inStockOfferCount: 0,
    minPrice: null,
    maxPrice: null,
    comparableBasis: 0,
    variants: (group.variants ?? []).map((v) => ({ ...v, minPrice: null })),
    offers: (group.offers ?? []).map((o) => ({ ...o, priceArs: null, inStock: false })),
    // Marcas de arrastre. `lastSeenAt` es el último día en que una tienda
    // SÍ la listó; no se pisa en cada corrida, por eso la ventana corre.
    carriedOver: true,
    lastSeenAt: lastSeenDay,
  };
}

/**
 * Decide qué fichas se arrastran a la corrida de hoy.
 *
 * @param {object} p
 * @param {Array}  p.prevGroups  grupos publicados en la corrida anterior
 *                               (los que `merge-snapshots.mjs` ve antes de
 *                               pisar el snapshot).
 * @param {Set<string>} p.liveUrls  `externalUrl` de TODAS las ofertas que
 *                               el scrape de hoy trajo.
 * @param {Array}  p.prevCarry   fichas ya arrastradas en corridas previas.
 * @param {string} p.today       ISO de la corrida de hoy.
 * @param {string} [p.prevRunAt] ISO de la corrida anterior. Es el último
 *                               día en que una tienda SÍ listó los
 *                               `prevGroups`, así que la ventana cuenta
 *                               desde ahí (no desde hoy).
 * @param {number} [p.days]      ventana; por defecto CARRYOVER_DAYS.
 * @returns {{groups: Array, stats: object}}
 */
export function planCarryover({ prevGroups = [], liveUrls, prevCarry = [], today, prevRunAt, days = CARRYOVER_DAYS }) {
  const todayDay = dayOf(today);
  // Los grupos de la corrida anterior se vieron por última vez ESE día.
  const prevDay = dayOf(prevRunAt) || todayDay;
  const urls = liveUrls instanceof Set ? liveUrls : new Set(liveUrls ?? []);
  // Una ficha ya arrastrada conserva SU lastSeenAt original: si no, cada
  // corrida lo empujaría un día y la ventana no cerraría nunca.
  const seenBefore = new Map();
  for (const g of prevCarry) {
    if (g?.groupSlug) seenBefore.set(g.groupSlug, dayOf(g.lastSeenAt) || prevDay);
  }

  const out = [];
  const stats = { candidatas: 0, vivas: 0, vencidas: 0, arrastradas: 0 };
  // Candidatas = todo lo que se publicó antes: los grupos de ayer más las
  // fichas que ya venían arrastrándose (ésas no están en prevGroups).
  const candidates = [...prevGroups, ...prevCarry];
  const yaVisto = new Set();
  for (const g of candidates) {
    if (!g?.groupSlug || yaVisto.has(g.groupSlug)) continue;
    yaVisto.add(g.groupSlug);
    // Si ALGUNA de sus ofertas apareció hoy, la ficha se reconstruye sola
    // en el pipeline normal. No se arrastra.
    const offers = g.offers ?? [];
    if (offers.some((o) => o.externalUrl && urls.has(o.externalUrl))) { stats.vivas++; continue; }
    stats.candidatas++;
    // Último día en que una tienda SÍ la listó. Si ya venía arrastrada, el
    // de entonces; si se publicó ayer con ofertas reales, ayer.
    const lastSeen = seenBefore.get(g.groupSlug) || dayOf(g.lastSeenAt) || prevDay;
    if (daysBetween(lastSeen, todayDay) > days) { stats.vencidas++; continue; }
    out.push(stripPrices(g, lastSeen));
    stats.arrastradas++;
  }
  return { groups: out, stats };
}

/**
 * Filtra las fichas arrastradas que YA NO corresponde publicar porque el
 * pipeline de hoy produjo algo para esa URL o esa identidad:
 *   · el slug volvió a ser una ficha viva (el producto reapareció), o
 *   · la wineKey se publicó bajo otro slug (cambio de identidad: de eso se
 *     encarga el redirect 308, no el arrastre), o
 *   · el slug es origen de un redirect acumulado (una página viva ya lo
 *     reclama; la doctrina del repo es que la página gana).
 */
export function dropResolved(carried, { liveSlugs, liveWineKeys, redirectFrom }) {
  const slugs = liveSlugs instanceof Set ? liveSlugs : new Set(liveSlugs ?? []);
  const keys = liveWineKeys instanceof Set ? liveWineKeys : new Set(liveWineKeys ?? []);
  const from = redirectFrom instanceof Set ? redirectFrom : new Set(redirectFrom ?? []);
  return carried.filter(
    (g) => !slugs.has(g.groupSlug) && !keys.has(g.wineKey) && !from.has(g.groupSlug),
  );
}
