import { NextResponse } from "next/server";
import {
  searchGroups,
  storeName,
  formatArs,
  displayBrand,
} from "@/lib/snapshot";

export const dynamic = "force-dynamic";

/**
 * Autocomplete search endpoint. Returns top matches for a query,
 * minimal shape — just enough to render the dropdown in SearchInput
 * without blowing up the JSON payload.
 *
 * Kept short (limit 8) since the dropdown is a preview, not the full
 * /buscar results list.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 8), 1),
    20,
  );

  if (q.length < 2) {
    return NextResponse.json({ query: q, groups: [] });
  }

  const results = searchGroups(q, limit, { sort: "relevance" });

  const out = results.map((g) => {
    const inStockOffer = g.offers?.find((o) => o.inStock);
    return {
      groupSlug: g.groupSlug,
      canonicalName: g.canonicalName,
      brand: displayBrand(g.brand),
      vintage: g.vintage,
      imageUrl: g.imageUrl ?? null,
      minPrice: g.minPrice ?? null,
      minPriceFormatted: g.minPrice != null ? formatArs(g.minPrice) : null,
      storeCount: g.storeCount,
      bestStoreName: inStockOffer ? storeName(inStockOffer.storeSlug) : null,
    };
  });

  return NextResponse.json({ query: q, groups: out });
}
