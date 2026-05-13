import scoresJson from "@/data/scores.json";

export type WineScore = {
  critic: string;
  score: number;
  maxScore: number;
  year: number;
  note?: string;
  source?: string;
};

const MAP = scoresJson as unknown as Record<string, WineScore[]>;

/** Skip the _meta doc stub when iterating. */
function isScoreKey(k: string): boolean {
  return !k.startsWith("_");
}

/** Returns scores for a given slug, sorted highest score first (normalized to /100). */
export function getScoresForSlug(slug: string): WineScore[] {
  if (!isScoreKey(slug)) return [];
  const raw = MAP[slug];
  if (!Array.isArray(raw)) return [];
  return [...raw].sort(
    (a, b) => b.score / b.maxScore - a.score / a.maxScore,
  );
}

/** "95/100" or "17.5/20" depending on the scale used by the critic. */
export function formatScore(s: WineScore): string {
  return `${s.score}/${s.maxScore}`;
}

/**
 * Mejor puntaje normalizado /100 que tenemos para un slug — usado
 * para ordenar resultados por "más premiado primero". Devuelve 0 si
 * no hay scores. Es O(1) por la memoization implícita del MAP.
 */
export function bestScoreFor(slug: string): number {
  const list = getScoresForSlug(slug);
  if (list.length === 0) return 0;
  // getScoresForSlug ya viene sorted desc por score/maxScore.
  const top = list[0];
  return (top.score / top.maxScore) * 100;
}

/** For aggregate summary "Tiene puntaje alto en X y Y". */
export function scoreSummary(scores: WineScore[]): string | null {
  if (scores.length === 0) return null;
  const critics = Array.from(new Set(scores.map((s) => s.critic)));
  if (critics.length === 1) return critics[0];
  return `${critics.slice(0, -1).join(", ")} y ${critics[critics.length - 1]}`;
}
