/**
 * Casos dorados del reintento de fallas transitorias.
 *
 * No se puede probar contra tiendas reales: desde una IP residencial estas
 * tiendas responden 200 siempre y el 403 sólo pasa en el runner de CI. Así
 * que se prueba la función real con las respuestas stubbeadas.
 *
 * Correr: node scripts/test-fetch-retry.mjs
 */
import {
  fetchPageWithRetry,
  isTransientStatus,
} from "./lib-fetch-retry.mjs";

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✅  ${name}  →  ${detail}`);
  } else {
    fail++;
    console.log(`  ❌ FALLA  ${name}  →  ${detail}`);
  }
}

/** Devuelve un doFetch que va consumiendo `respuestas` en orden. */
function stub(respuestas) {
  let i = 0;
  const calls = { n: 0 };
  const doFetch = async () => {
    calls.n++;
    const r = respuestas[Math.min(i++, respuestas.length - 1)];
    if (r === "timeout") throw new Error("The operation was aborted");
    return {
      ok: r >= 200 && r < 300,
      status: r,
      json: async () => [{ id: 1 }],
      text: async () => "<html>ok</html>",
    };
  };
  return { doFetch, calls };
}

const jsonBody = async (res) => {
  const b = await res.json();
  return Array.isArray(b) ? b : [];
};
const woo = { readBody: jsonBody, isDone: (s) => s === 404 };
const tn = { readBody: (res) => res.text(), isDone: (s, p) => s === 404 && p > 1 };

// Los delays reales suman ~23s; para el test se parchea el reloj.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);

console.log("\n=== POLÍTICA DE STATUS ===");
check("403 es transitorio", isTransientStatus(403) === true, "reintenta");
check("429 es transitorio", isTransientStatus(429) === true, "reintenta");
check("503 es transitorio", isTransientStatus(503) === true, "reintenta");
check("401 NO es transitorio", isTransientStatus(401) === false, "corta");
check("402 NO es transitorio", isTransientStatus(402) === false, "corta");

console.log("\n=== WOOCOMMERCE ===");
{
  const { doFetch, calls } = stub([403, 403, 200]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 1, stats, doFetch, ...woo });
  check(
    "recupera tras 403,403,200 en la página 1",
    r.value?.length === 1 && stats.recovered === true && stats.retries === 2,
    `${calls.n} intentos, retries=${stats.retries}, recovered=${stats.recovered}`,
  );
}
{
  const { doFetch, calls } = stub([403]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 1, stats, doFetch, ...woo });
  check(
    "corta a los 4 intentos si el 403 es permanente",
    !!r.failure && calls.n === 4,
    `${calls.n} intentos, failure="${r.failure}"`,
  );
}
{
  const { doFetch, calls } = stub([401]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 1, stats, doFetch, ...woo });
  check(
    "NO reintenta un 401",
    !!r.failure && calls.n === 1,
    `${calls.n} intento`,
  );
}
{
  const { doFetch, calls } = stub([404]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 3, stats, doFetch, ...woo });
  check(
    "404 corta el paginado sin reintentar",
    r.done === true && calls.n === 1,
    `done=${r.done}, ${calls.n} intento`,
  );
}
{
  const { doFetch, calls } = stub(["timeout", 200]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 1, stats, doFetch, ...woo });
  check(
    "recupera de un timeout",
    !!r.value && stats.recovered === true,
    `${calls.n} intentos`,
  );
}
{
  const { doFetch, calls } = stub([200]);
  const stats = { retries: 0, recovered: false };
  await fetchPageWithRetry({ page: 1, stats, doFetch, ...woo });
  check(
    "no gasta reintentos con un 200",
    calls.n === 1 && stats.retries === 0,
    `${calls.n} intento, retries=0`,
  );
}
{
  const { doFetch, calls } = stub([403]);
  const stats = { retries: 0, recovered: false };
  await fetchPageWithRetry({ page: 3, stats, doFetch, ...woo });
  check(
    "backoff corto en la página 3 (insiste menos que en la 1)",
    calls.n === 2,
    `${calls.n} intentos`,
  );
}

console.log("\n=== TIENDANUBE (HTML, 404 distinto) ===");
{
  const { doFetch, calls } = stub([403, 200]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 1, stats, doFetch, ...tn });
  check(
    "recupera un 403 en la página 1 (el que mataba la tienda)",
    r.value === "<html>ok</html>" && stats.recovered === true,
    `${calls.n} intentos, recovered=${stats.recovered}`,
  );
}
{
  const { doFetch } = stub([404]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 5, stats, doFetch, ...tn });
  check("404 en la página 5 es fin de paginado", r.done === true, `done=true`);
}
{
  const { doFetch, calls } = stub([404]);
  const stats = { retries: 0, recovered: false };
  const r = await fetchPageWithRetry({ page: 1, stats, doFetch, ...tn });
  check(
    "404 en la página 1 NO es fin de paginado, es error",
    !!r.failure && r.done !== true,
    `failure="${r.failure}" tras ${calls.n} intento`,
  );
}

globalThis.setTimeout = realSetTimeout;

console.log();
if (fail === 0) {
  console.log(`✅ Todos los casos dorados del reintento pasan (${pass}).`);
} else {
  console.log(`❌ ${fail} caso(s) fallan de ${pass + fail}.`);
  process.exit(1);
}
