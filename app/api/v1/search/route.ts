import { searchGroups, storeName } from "@/lib/snapshot";
import { apiJson, preflightOK } from "@/lib/api-v1";
import type { SortKey } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return preflightOK();
}

/**
 * GET /api/v1/search
 *
 * Query params:
 *   q          string  — texto libre (opcional). Si vacío, devuelve
 *                        catálogo completo paginado por relevance.
 *   varietal   string  — filtro exact (case-insensitive)
 *   region     string  — filtro exact
 *   type       string  — Tinto | Blanco | Rosado | Espumante | Dulce
 *   multi      "1"     — sólo vinos en ≥2 vinotecas
 *   instock    "1"     — sólo vinos con stock
 *   priceMin   number  — piso de precio
 *   priceMax   number  — techo de precio
 *   sort       string  — relevance | price-asc | price-desc | stores-desc | score-desc | name-asc
 *   limit      number  — máx 100 (default 24)
 *
 * Devuelve { count, results: [{slug, name, brand, ...}] }
 */

function isValidSort(s: string | undefined): s is SortKey {
  return (
    s === "relevance" ||
    s === "price-asc" ||
    s === "price-desc" ||
    s === "stores-desc" ||
    s === "score-desc" ||
    s === "name-asc"
  );
}

function toIntOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(Number(sp.get("limit") ?? 24), 1),
    100,
  );
  const sort = isValidSort(sp.get("sort") ?? undefined)
    ? (sp.get("sort") as SortKey)
    : undefined;

  const results = searchGroups(q, limit, {
    varietal: sp.get("varietal") ?? null,
    type: sp.get("type") ?? null,
    region: sp.get("region") ?? null,
    multiStoreOnly: sp.get("multi") === "1",
    inStockOnly: sp.get("instock") === "1",
    priceMin: toIntOrNull(sp.get("priceMin")),
    priceMax: toIntOrNull(sp.get("priceMax")),
    sort,
  });

  // Shape consistente con /api/v1/wine pero más compacto (sin offers
  // — sólo el bestStoreSlug para que el cliente sepa dónde comprar).
  const shaped = results.map((g) => {
    const bestOffer = (g.offers ?? []).find(
      (o) => o.inStock && !o.isCollector,
    );
    return {
      slug: g.groupSlug,
      canonicalName: g.canonicalName,
      brand: g.brand,
      vintage: g.vintage,
      varietals: g.varietals ?? [],
      region: g.region ?? null,
      type: g.type ?? null,
      imageUrl: g.imageUrl,
      minPrice: g.minPrice,
      maxPrice: g.maxPrice,
      storeCount: g.storeCount,
      bestStoreSlug: bestOffer?.storeSlug ?? null,
      bestStoreName: bestOffer ? storeName(bestOffer.storeSlug) : null,
      permalink: `https://vinndex.com.ar/vino/${g.groupSlug}`,
    };
  });

  return apiJson({
    query: q,
    sort: sort ?? (q ? "relevance" : "price-asc"),
    count: shaped.length,
    limit,
    results: shaped,
  });
}
