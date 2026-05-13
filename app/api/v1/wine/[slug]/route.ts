import { findGroup, storeName } from "@/lib/snapshot";
import { getScoresForSlug } from "@/lib/scores";
import { apiJson, apiError, preflightOK } from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

export function OPTIONS() {
  return preflightOK();
}

/**
 * GET /api/v1/wine/<slug>
 *
 * Devuelve info estandarizada de un vino + offers de cada vinoteca.
 * Pensado para clientes externos (apps, agentes IA, scripts).
 *
 * No requiere auth. Read-only.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const g = findGroup(slug);
  if (!g) {
    return apiError("not_found", `No existe el vino con slug "${slug}".`, 404);
  }

  const scores = getScoresForSlug(slug).map((s) => ({
    critic: s.critic,
    score: s.score,
    maxScore: s.maxScore,
    normalizedScore: Math.round((s.score / s.maxScore) * 100),
    year: s.year,
    note: s.note ?? null,
    source: s.source ?? null,
  }));

  const offers = (g.offers ?? []).map((o) => ({
    storeSlug: o.storeSlug,
    storeName: storeName(o.storeSlug),
    url: o.externalUrl,
    externalSku: o.externalSku,
    name: o.name,
    priceArs: o.priceArs,
    inStock: o.inStock,
    isCollector: o.isCollector ?? false,
  }));

  return apiJson({
    slug: g.groupSlug,
    canonicalName: g.canonicalName,
    brand: g.brand,
    vintage: g.vintage,
    format: g.format,
    varietals: g.varietals ?? [],
    region: g.region ?? null,
    type: g.type ?? null,
    imageUrl: g.imageUrl,
    minPrice: g.minPrice,
    maxPrice: g.maxPrice,
    storeCount: g.storeCount,
    offerCount: g.offerCount,
    totalStoreCount: g.totalStoreCount ?? g.storeCount,
    totalOfferCount: g.totalOfferCount ?? g.offerCount,
    inStockOfferCount: g.inStockOfferCount ?? null,
    scores,
    offers,
    permalink: `https://vinndex.com.ar/vino/${g.groupSlug}`,
  });
}
