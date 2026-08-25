/**
 * Reintento de fallas TRANSITORIAS para los scrapers.
 *
 * Por qué existe: los scrapers no reintentaban nunca, así que un solo 403
 * anti-bot en la página 1 dejaba la tienda entera en 0 productos por 24
 * horas. Medido sobre los 8 snapshots del 17 al 24/08/2026: 14 tiendas
 * cayeron a 0 al menos un día y volvieron solas al siguiente, con ~8.800
 * ofertas entrando y saliendo del sitio. El 20/08 cayeron 11 tiendas el
 * MISMO día y el total bajó de ~69.400 a 62.659 ofertas.
 *
 * Eso no es una tienda que cierra: es el bloqueo anti-bot pegando por
 * ráfagas a las IPs de data-center del runner. Y como el precio mínimo de
 * una ficha sale de las ofertas que tenemos, si la vinoteca más barata
 * parpadea la ficha publica un mínimo más caro ese día.
 *
 * La política salió de `scrape-woocommerce.mjs` (PR #154) y se extrajo acá
 * para que los otros scrapers no la reimplementen distinta.
 */

// La página 1 es la que mata a la tienda, así que se insiste más ahí. Las
// páginas siguientes ya eran no-fatales en los scrapers (el loop hacía
// `continue`), alcanza con un reintento corto.
export const RETRY_DELAYS_FIRST_PAGE_MS = [2000, 6000, 15000];
export const RETRY_DELAYS_MS = [2000];

/** 404 nunca entra acá: lo resuelve `isDone` (fin del paginado, no falla). */
export function isTransientStatus(status) {
  return status === 403 || status === 429 || status >= 500;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pide una página reintentando las fallas transitorias.
 *
 * @param {object}   o
 * @param {number}   o.page     — número de página (1 insiste más).
 * @param {object}   o.stats    — acumulador `{ retries, recovered }`; queda
 *                                en la metadata del snapshot para poder
 *                                MEDIR si el reintento sirve.
 * @param {Function} o.doFetch  — `() => Promise<Response>`; puede tirar
 *                                (timeout / error de red) y se reintenta.
 * @param {Function} o.readBody — `(res) => Promise<any>`; si tira, se toma
 *                                como cuerpo corrupto y se reintenta.
 * @param {Function} o.isDone   — `(status, page) => boolean`; el fin del
 *                                paginado, que cambia según la plataforma.
 *
 * @returns {Promise<{value:any}|{done:true}|{failure:string}>}
 */
export async function fetchPageWithRetry({
  page,
  stats,
  doFetch,
  readBody,
  isDone,
}) {
  const delays = page === 1 ? RETRY_DELAYS_FIRST_PAGE_MS : RETRY_DELAYS_MS;
  let failure = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      stats.retries++;
      await sleep(delays[attempt - 1]);
    }

    let res;
    try {
      res = await doFetch();
    } catch (err) {
      failure = `fetch failed (${err.message})`;
      continue;
    }

    if (!res.ok) {
      if (isDone(res.status, page)) return { done: true };
      failure = `HTTP ${res.status}`;
      // Un status no transitorio (401, 402, 410…) no mejora insistiendo.
      if (!isTransientStatus(res.status)) break;
      continue;
    }

    try {
      const value = await readBody(res);
      if (attempt > 0) stats.recovered = true;
      return { value };
    } catch {
      failure = "cuerpo ilegible";
    }
  }

  return { failure };
}
