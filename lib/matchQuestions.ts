import questionsJson from "@/data/match-questions.json";

/**
 * Preguntas "¿es el mismo vino?" que se muestran en las fichas.
 *
 * Las genera `scripts/build-match-questions.mjs` a partir de los pares que
 * comparten código de barras pero que los gates del pipeline separaron —
 * o sea, donde el sistema está genuinamente en duda.
 */

export type MatchSide = {
  slug: string;
  name: string;
  image: string;
  stores: number;
};

export type MatchQuestionData = {
  id: string;
  ean: string;
  gate: string | null;
  a: MatchSide;
  b: MatchSide;
};

const QUESTIONS = (questionsJson as { questions: MatchQuestionData[] })
  .questions;

let bySlug: Map<string, MatchQuestionData> | null = null;

/**
 * Una sola pregunta por ficha. Si una ficha aparece en varios pares nos
 * quedamos con el primero: el archivo viene ordenado por peso (fichas con
 * más tiendas primero), así que preguntamos lo que más impacto tiene.
 */
function index(): Map<string, MatchQuestionData> {
  if (bySlug) return bySlug;
  const m = new Map<string, MatchQuestionData>();
  for (const q of QUESTIONS) {
    if (!m.has(q.a.slug)) m.set(q.a.slug, q);
    if (!m.has(q.b.slug)) m.set(q.b.slug, q);
  }
  bySlug = m;
  return m;
}

/** La pregunta para esta ficha, con el lado propio primero. */
export function questionForSlug(slug: string): MatchQuestionData | null {
  const q = index().get(slug) ?? null;
  if (!q) return null;
  // Que el vino de la ficha aparezca a la izquierda: la pregunta se lee
  // como "¿este que estás viendo es el mismo que aquel?".
  return q.a.slug === slug ? q : { ...q, a: q.b, b: q.a };
}
