import { findRanking, applyRanking } from "@/lib/rankings";
import { apiJson, apiError, preflightOK } from "@/lib/api-v1";
import { storeName } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

export function OPTIONS() {
  return preflightOK();
}

/**
 * GET /api/v1/rankings/<slug>
 *
 * Devuelve la lista expandida de items en un ranking — los mismos
 * que se muestran en `/ranking/<slug>` pero como JSON listo para
 * consumir programáticamente.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const ranking = findRanking(slug);
  if (!ranking) {
    return apiError(
      "not_found",
      `No existe el ranking "${slug}". Listá los disponibles en /api/v1/rankings.`,
      404,
    );
  }
  const items = applyRanking(ranking).map((g, i) => {
    const bestOffer = (g.offers ?? []).find(
      (o) => o.inStock && !o.isCollector,
    );
    return {
      position: i + 1,
      slug: g.groupSlug,
      canonicalName: g.canonicalName,
      brand: g.brand,
      vintage: g.vintage,
      varietals: g.varietals ?? [],
      region: g.region ?? null,
      type: g.type ?? null,
      imageUrl: g.imageUrl,
      minPrice: g.minPrice,
      storeCount: g.storeCount,
      bestStoreSlug: bestOffer?.storeSlug ?? null,
      bestStoreName: bestOffer ? storeName(bestOffer.storeSlug) : null,
      permalink: `https://vinndex.com.ar/vino/${g.groupSlug}`,
    };
  });

  return apiJson({
    slug: ranking.slug,
    title: ranking.title,
    description: ranking.description,
    permalink: `https://vinndex.com.ar/ranking/${ranking.slug}`,
    count: items.length,
    items,
  });
}
