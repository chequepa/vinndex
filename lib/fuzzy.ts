/**
 * Tolerancia a typos para /buscar.
 *
 * "catena sapata" devolvía 0 resultados porque el matcheo de la búsqueda
 * es por substring exacto de cada token. Acá vive la parte pura (sin
 * snapshot): la distancia Damerau-Levenshtein en su variante OSA
 * (inserción, borrado, sustitución y transposición de adyacentes) y la
 * búsqueda del vecino más cercano en un vocabulario con frecuencias.
 *
 * El vocabulario lo arma `lib/snapshot.ts` UNA sola vez (tokens de
 * `canonicalName` y `brand` de todos los grupos). La búsqueda de vecinos
 * recorre el vocabulario sólo para los tokens que no existen en él, con
 * poda por diferencia de largo, así que el costo por búsqueda fallida es
 * de unos pocos milisegundos y cero para las búsquedas que encuentran.
 */

/** token normalizado → cantidad de grupos en los que aparece. */
export type Vocabulary = Map<string, number>;

const MIN_TOKEN_LEN = 3;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Tokens de un texto tal como entran al vocabulario: sin acentos,
 * minúsculas, sólo letras/números, largo ≥ 3. */
export function tokenizeForVocab(s: string): string[] {
  return stripAccents(s.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}

/** Arma el vocabulario. Cada token cuenta una vez por texto (un vino que
 * dice "Malbec Malbec" no pesa doble). */
export function buildVocabulary(texts: Iterable<string>): Vocabulary {
  const vocab: Vocabulary = new Map();
  for (const text of texts) {
    for (const t of new Set(tokenizeForVocab(text))) {
      vocab.set(t, (vocab.get(t) ?? 0) + 1);
    }
  }
  return vocab;
}

/** Distancia máxima admitida para considerar dos tokens "el mismo con
 * un typo": 1 para tokens cortos (≤5), 2 para largos. */
export function maxDistanceFor(token: string): number {
  return token.length <= 5 ? 1 : 2;
}

/**
 * Damerau-Levenshtein (optimal string alignment). Devuelve `max + 1`
 * apenas sabe que la distancia supera `max`, para no gastar en pares
 * que no van a calificar.
 */
export function damerauLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Tres filas alcanzan para OSA (necesita i-2 para la transposición).
  let prev2: number[] = new Array(lb + 1);
  let prev: number[] = new Array(lb + 1);
  let cur: number[] = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        prev[j] + 1, // borrado
        cur[j - 1] + 1, // inserción
        prev[j - 1] + cost, // sustitución
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        v = Math.min(v, prev2[j - 2] + 1); // transposición
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Si toda la fila supera `max`, la distancia final también.
    if (rowMin > max) return max + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[lb];
}

export type Candidate = { token: string; distance: number; freq: number };

/**
 * Vecinos de un token desconocido, mejores primero. Primero los que
 * están a distancia ≤ umbral (distancia asc, frecuencia desc); después
 * los del vocabulario que EMPIEZAN con el token ("zap" → "zapata"),
 * por frecuencia. Devuelve hasta `limit`.
 */
export function nearestTokens(
  token: string,
  vocab: Vocabulary,
  limit = 3,
): Candidate[] {
  const max = maxDistanceFor(token);
  const byDistance: Candidate[] = [];
  const byPrefix: Candidate[] = [];
  for (const [t, freq] of vocab) {
    const d = damerauLevenshtein(token, t, max);
    if (d <= max) {
      byDistance.push({ token: t, distance: d, freq });
    } else if (t.length > token.length && t.startsWith(token)) {
      byPrefix.push({ token: t, distance: t.length - token.length, freq });
    }
  }
  byDistance.sort((a, b) => a.distance - b.distance || b.freq - a.freq);
  byPrefix.sort((a, b) => b.freq - a.freq || a.distance - b.distance);
  return [...byDistance, ...byPrefix].slice(0, limit);
}

export type Correction = {
  /** Query corregida (tokens unidos por espacio). */
  query: string;
  /** true si al menos un token cambió. */
  changed: boolean;
  /** Por token: candidatos ordenados (vacío si el token ya existía o no
   * tiene vecinos). Sirve para armar "¿Quisiste decir…?". */
  candidates: Candidate[][];
};

/**
 * Corrige cada token que NO existe en el vocabulario por su mejor vecino.
 * Los tokens conocidos y los que no tienen vecino quedan como están.
 */
export function correctTokens(tokens: string[], vocab: Vocabulary): Correction {
  const out: string[] = [];
  const candidates: Candidate[][] = [];
  let changed = false;
  for (const t of tokens) {
    if (t.length < MIN_TOKEN_LEN || vocab.has(t)) {
      out.push(t);
      candidates.push([]);
      continue;
    }
    const near = nearestTokens(t, vocab);
    candidates.push(near);
    if (near.length > 0) {
      out.push(near[0].token);
      changed = true;
    } else {
      out.push(t);
    }
  }
  return { query: out.join(" "), changed, candidates };
}

/**
 * Hasta `limit` variantes de la query combinando, por posición, el
 * i-ésimo candidato de cada token desconocido (los tokens sin i-ésimo
 * candidato usan el mejor que tengan). Sin duplicados ni la original.
 */
export function suggestQueries(
  tokens: string[],
  correction: Correction,
  limit = 3,
): string[] {
  const original = tokens.join(" ");
  const out: string[] = [];
  const depth = Math.max(0, ...correction.candidates.map((c) => c.length));
  for (let i = 0; i < depth && out.length < limit; i++) {
    const variant = tokens
      .map((t, idx) => {
        const c = correction.candidates[idx];
        if (c.length === 0) return t;
        return c[Math.min(i, c.length - 1)].token;
      })
      .join(" ");
    if (variant !== original && !out.includes(variant)) out.push(variant);
  }
  return out;
}
