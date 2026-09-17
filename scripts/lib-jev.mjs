/**
 * Jev (typesafe.ai) como juez de pares de fichas que comparten EAN.
 *
 * POR QUÉ EXISTE. Evaluado el 17/09/2026 sobre los 821 pares que comparten
 * código de barras y los gates separan, más 34 casos del harness, contra
 * 194 pares etiquetados (ver PERSONAL/vinndex-jev-eval/):
 *
 *   regla                        fusiona   bien (de 72)   fusiones malas
 *   Jev, lo que elige               96          67              29
 *   Jev, P(mismo) ≥ 0,9             42          42               0
 *   gpt-4o-mini                     40          38               2
 *
 * O sea: la ELECCIÓN de Jev no sirve (en lo ambiguo dice "mismo"), pero su
 * PROBABILIDAD está bien calibrada. Por eso sólo se usa con umbral.
 *
 * QUÉ PUEDE Y QUÉ NO (doctrina cero-quimeras, julio 2026: "Stage 3 aplica el
 * yes del LLM sin gates" fue una de las tres fábricas de quimeras):
 *   · Jev NUNCA pasa por encima de un gate duro (color, varietal, nivel,
 *     edición, formato) ni de dos vinos distintos del catálogo.
 *   · Lo único que destraba es el veto por relación de LÍNEA (crossing /
 *     disjoint), que es texto y es donde las tiendas escriben distinto.
 *   · Si Jev está seguro y un gate duro veta, el par NO se fusiona: va a
 *     data/jev-gate-suspects.json, porque suele ser un gate partiendo de
 *     más (así se encontró la taquigrafía del #174).
 *
 * NUNCA ROMPE EL BUILD. Sin clave, sin red o con la API caída devuelve lo
 * que haya en caché y el pipeline sigue como antes de Jev.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { canonicalizeName, stripAccents } from "./lib-identity.mjs";

export const JEV_MODEL = "jev-latest";
export const JEV_MERGE_MIN = 0.9;
// Circuit breaker: la evaluación dio ~130 fusiones posibles sobre 821 pares.
// Si una corrida quiere fusionar muchas más, algo cambió (el modelo, el
// prompt, los datos) y es preferible no fusionar nada y avisar.
export const JEV_MAX_MERGES_PER_RUN = 400;
// Cambiar el prompt invalida la caché entera.
export const JEV_PROMPT_VERSION = "2026-09-17";

const INSTRUCTIONS =
  "Dos tiendas online argentinas publican estas ofertas. ¿Son exactamente el mismo vino/producto, de modo que sus precios se pueden comparar? " +
  "Mismo = misma bodega, línea, varietal o corte, color, dulzor, edición/añada distintiva y formato (750 ml suelta vs caja, magnum, 375, bag in box o lata son distintos). " +
  "Ignorá errores de tipeo, abreviaturas, mayúsculas, orden de palabras y palabras de relleno como 'Vino tinto' o '750 ml'.";
const CRITERIA = {
  mismo: "Es el mismo producto; sólo cambia cómo lo escribió cada tienda",
  distinto: "Son productos distintos: difiere línea, nivel (reserva, gran reserva), varietal, color, dulzor, edición o formato",
  insuficiente: "El texto no alcanza para saberlo: a uno le falta un dato (línea, nivel, varietal) que el otro sí tiene",
};

const norm = (s) =>
  stripAccents(canonicalizeName(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();

/** Clave independiente del orden: el par (A,B) y (B,A) es el mismo. */
export function pairKey(aName, bName) {
  return [norm(aName), norm(bName)].sort().join(" ⟂ ");
}

/**
 * Decisión sobre un par. Pura, sin red: la prueba el harness.
 * @returns {"merge" | "gate-sospechoso" | "no"}
 */
export function jevPolicy({ pMismo, gate, catalogConflict }) {
  if (catalogConflict) return "no";
  if (typeof pMismo !== "number" || pMismo < JEV_MERGE_MIN) return "no";
  if (gate) return "gate-sospechoso";
  return "merge";
}

function loadCache(cachePath) {
  if (!cachePath || !existsSync(cachePath)) return {};
  try {
    const c = JSON.parse(readFileSync(cachePath, "utf8"));
    return c.promptVersion === JEV_PROMPT_VERSION ? c.entries ?? {} : {};
  } catch {
    return {};
  }
}

/**
 * Consulta a Jev los pares que no estén en caché.
 *
 * @param {Array<[string,string]>} pairs  nombres representativos
 * @param {object} o
 * @param {string} [o.apiKey]
 * @param {string} [o.cachePath]
 * @param {Function} [o.fetchImpl]  inyectable para el test
 * @param {number} [o.concurrency]
 * @returns {Promise<{verdicts: Map<string,{pMismo:number,choice:string}>, stats:object}>}
 */
export async function adjudicatePairs(pairs, o = {}) {
  const { apiKey, cachePath, fetchImpl = fetch, concurrency = 16, timeoutMs = 20_000 } = o;
  const cache = loadCache(cachePath);
  const stats = { pares: 0, enCache: 0, consultados: 0, errores: 0, sinClave: false };
  const verdicts = new Map();

  const todo = [];
  const seen = new Set();
  for (const [a, b] of pairs) {
    const key = pairKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    stats.pares++;
    if (cache[key]) {
      verdicts.set(key, cache[key]);
      stats.enCache++;
    } else {
      todo.push({ key, a, b });
    }
  }

  if (todo.length && !apiKey) stats.sinClave = true;
  if (todo.length && apiKey) {
    let i = 0;
    let abort = false;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
        while (i < todo.length && !abort) {
          const it = todo[i++];
          // Orden estable: el par se manda siempre con los nombres ordenados.
          const [A, B] = [it.a, it.b].sort((x, y) => (norm(x) < norm(y) ? -1 : 1));
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeoutMs);
          try {
            const res = await fetchImpl("https://api.typesafe.ai/v1/systemone", {
              method: "POST",
              signal: ctrl.signal,
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: JEV_MODEL,
                state: { oferta_A: A, oferta_B: B },
                questions: { match: { type: "choice", instructions: INSTRUCTIONS, criteria: CRITERIA } },
              }),
            });
            if (!res.ok) {
              stats.errores++;
              // Clave inválida o sin crédito: no tiene sentido seguir pidiendo.
              if (res.status === 401 || res.status === 402 || res.status === 403) abort = true;
              continue;
            }
            const j = await res.json();
            const ans = j?.answers?.match;
            const pMismo = ans?.probabilities?.mismo;
            if (typeof pMismo !== "number") { stats.errores++; continue; }
            const v = { pMismo, choice: ans.choice, model: j.model ?? JEV_MODEL, at: new Date().toISOString().slice(0, 10) };
            verdicts.set(it.key, v);
            cache[it.key] = v;
            stats.consultados++;
          } catch {
            stats.errores++;
          } finally {
            clearTimeout(timer);
          }
        }
      }),
    );
  }

  if (cachePath && stats.consultados > 0) {
    writeFileSync(
      cachePath,
      JSON.stringify({
        _doc: "Veredictos de Jev (typesafe.ai) por par de nombres. Lo escribe build-groups-v2.mjs; ver scripts/lib-jev.mjs.",
        promptVersion: JEV_PROMPT_VERSION,
        entries: cache,
      }),
    );
  }
  return { verdicts, stats };
}
