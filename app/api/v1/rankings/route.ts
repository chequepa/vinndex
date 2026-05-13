import { RANKINGS, applyRanking } from "@/lib/rankings";
import { apiJson, preflightOK } from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return preflightOK();
}

/**
 * GET /api/v1/rankings
 *
 * Lista los rankings disponibles + cantidad de items en cada uno.
 * Para los items concretos: GET /api/v1/rankings/<slug>.
 */
export async function GET() {
  const rankings = RANKINGS.map((r) => ({
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    keywords: r.keywords,
    itemCount: applyRanking(r).length,
    permalink: `https://vinndex.com.ar/ranking/${r.slug}`,
    apiUrl: `https://vinndex.com.ar/api/v1/rankings/${r.slug}`,
  }));
  return apiJson({ count: rankings.length, rankings });
}
