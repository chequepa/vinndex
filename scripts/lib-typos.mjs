/**
 * Errores de tipeo de las tiendas, aprendidos del corpus.
 * ========================================================
 *
 * El mismo vino se partía porque una tienda (casi siempre un súper) escribe
 * mal una palabra: "Saint Felicen", "Piatelli", "Ruttini", "El Estaco",
 * "Guatallary", "Valle de Perdenal", "Yacuchaya", "Terraza de los Andes",
 * "Pequeñas Produccciones". Medido el 26/09 sobre los pares que comparten
 * código de barras en 2+ tiendas: 150+ quedaban separados sólo por eso, y
 * los gates los leían como otra línea u otro paraje.
 *
 * La regla no usa diccionario: una palabra RARA (la usan ≤2 tiendas) se
 * corrige a una palabra FRECUENTE del corpus si
 *   · la rara tiene ≥6 letras (≥7 si la corrección es un varietal, paraje
 *     o tier: "Sarah" no es "Syrah") y está a distancia de edición 1
 *     (hasta 8 letras) o 2 (9+), con la transposición como 1 ("Sauvginon"),
 *   · empieza con la misma letra,
 *   · la frecuente la usan ≥4 tiendas y al menos 3× más que la rara,
 *   · CONTEXTO: algún nombre con la palabra rara tiene todas sus otras
 *     palabras en algún nombre con la frecuente ("Saint Felicen Bonarda"
 *     ↔ "Saint Felicien Bonarda"),
 *   · ninguna es un número, y la rara no es una palabra que el corpus usa
 *     en serio (con ≥3 tiendas no es rara).
 * Si una palabra rara tiene dos candidatas igual de buenas, no se toca.
 *
 * Sólo cambia la IDENTIDAD (el nombre con el que se agrupa): el título que
 * ve el usuario sigue siendo el de la tienda.
 */

import { stripAccents, canonicalizeName, CONTENT_STOPWORDS } from "./lib-identity.mjs";

const RARE_MAX_STORES = 2;
const FREQ_MIN_STORES = 4;
const FREQ_RATIO = 3;

function words(name) {
  return stripAccents(canonicalizeName(name))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Damerau-Levenshtein (transposición adyacente = 1), con corte temprano. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/**
 * @param {Iterable<{name:string, storeSlug:string}>} rows
 * @returns {Map<string,string>} palabra mal escrita → palabra del corpus
 */
export function buildTypoMap(rows, opts = {}) {
  const isIdentity = opts.isIdentityToken ?? (() => false);
  const stores = new Map(); // palabra → Set(tienda)
  const namesOf = new Map(); // palabra → [Set(palabras del nombre)]
  for (const r of rows) {
    const ws = new Set(words(r.name).filter((w) => w.length >= 3 && !/^\d+$/.test(w)));
    for (const w of ws) {
      if (!stores.has(w)) stores.set(w, new Set());
      stores.get(w).add(r.storeSlug);
      if (!namesOf.has(w)) namesOf.set(w, []);
      namesOf.get(w).push(ws);
    }
  }
  // Frecuentes por primera letra.
  const freqByLetter = new Map();
  for (const [w, st] of stores) {
    if (st.size < FREQ_MIN_STORES || w.length < 5) continue;
    if (!freqByLetter.has(w[0])) freqByLetter.set(w[0], []);
    freqByLetter.get(w[0]).push(w);
  }
  // Contexto: algún nombre con la palabra rara tiene TODAS sus otras
  // palabras en algún nombre con la frecuente. "Saint Felicen Bonarda" →
  // hay un "Saint Felicien Bonarda". Sin esto "Catalina" se volvía
  // "Catalpa" y "Circo" (una marca) "Cinco".
  // El contexto tiene que tener al menos una palabra con identidad propia:
  // "Vino Histeria" no es "Historia" porque exista un "Vino Historia".
  // Con una frecuente MUY establecida (≥10 tiendas y 10× la rara) alcanza
  // con el varietal: es el título de súper "Vino blanco Sauvignon Blanc
  // Ruttini 750 ml", donde la bodega mal escrita es la única palabra propia.
  const contextOk = (w, f, loose) => {
    const fNames = namesOf.get(f);
    for (const rn of namesOf.get(w)) {
      const others = [...rn].filter((t) => t !== w);
      const meaningful = others.filter((t) => !CONTENT_STOPWORDS.has(t));
      if (!meaningful.length) continue;
      if (!loose && !meaningful.some((t) => !isIdentity(t))) continue;
      for (const fn of fNames) {
        if (meaningful.every((t) => fn.has(t))) return true;
      }
    }
    return false;
  };
  const out = new Map();
  for (const [w, st] of stores) {
    if (st.size > RARE_MAX_STORES || w.length < 6 || /\d/.test(w)) continue;
    const maxD = w.length >= 9 ? 2 : 1;
    const cands = [];
    for (const f of freqByLetter.get(w[0]) ?? []) {
      if (f === w || Math.abs(f.length - w.length) > maxD) continue;
      // Corregir HACIA un varietal, paraje o tier exige una palabra más
      // larga: "Sarah" no es "Syrah", "Chemin" no es "Chenin".
      if (isIdentity(f) && w.length < 7) continue;
      const fs = stores.get(f).size;
      if (fs < FREQ_MIN_STORES || fs < FREQ_RATIO * st.size) continue;
      const d = editDistance(w, f, maxD);
      if (d > maxD) continue;
      cands.push({ f, d, fs });
    }
    if (!cands.length) continue;
    cands.sort((a, b) => a.d - b.d || b.fs - a.fs);
    const [best, second] = cands;
    if (second && second.d === best.d && second.fs === best.fs) continue; // empate: no se toca
    // El contexto flojo nunca para una diferencia sólo de terminación
    // ("Martins"/"Martin", "Gabrielle"/"Gabriel"): suelen ser otro nombre.
    const suffixOnly = best.f.startsWith(w) || w.startsWith(best.f);
    const loose = !suffixOnly && best.fs >= 10 && best.fs >= 10 * st.size && !isIdentity(best.f);
    if (!contextOk(w, best.f, loose)) continue;
    out.set(w, best.f);
  }
  return out;
}

/** Nombre con las palabras mal escritas corregidas (sin acentos). */
export function applyTypoMap(name, map) {
  if (!map.size) return name;
  let changed = false;
  const fixed = stripAccents(String(name ?? "")).replace(/[A-Za-z0-9]+/g, (tok) => {
    const f = map.get(tok.toLowerCase());
    if (!f) return tok;
    changed = true;
    return f;
  });
  return changed ? fixed : name;
}
