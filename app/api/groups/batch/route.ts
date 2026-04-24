import { NextResponse } from "next/server";
import { findGroup, storeName, formatArs } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("slugs") ?? "";
  const slugs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);

  const out = slugs
    .map((slug) => {
      const g = findGroup(slug);
      if (!g) return null;
      const inStockOffer = g.offers?.find((o) => o.inStock);
      return {
        groupSlug: g.groupSlug,
        canonicalName: g.canonicalName,
        brand: g.brand,
        vintage: g.vintage,
        type: g.type,
        region: g.region,
        varietals: g.varietals ?? [],
        imageUrl: g.imageUrl ?? null,
        minPrice: g.minPrice ?? null,
        maxPrice: g.maxPrice ?? null,
        minPriceFormatted: g.minPrice != null ? formatArs(g.minPrice) : null,
        storeCount: g.storeCount,
        offerCount: g.offerCount ?? 0,
        inStockOfferCount: g.inStockOfferCount ?? 0,
        bestStoreSlug: inStockOffer?.storeSlug ?? null,
        bestStoreName: inStockOffer ? storeName(inStockOffer.storeSlug) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ groups: out });
}
