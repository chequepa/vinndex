import { NextResponse } from "next/server";
import { scrapeTiendanube } from "@/lib/adapters/tiendanube";
import { getStore, STORES } from "@/lib/stores";
import { requireScrapeAuth } from "@/lib/auth-scrape";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;

  // `_list` es read-only — devuelve sólo metadata estática de tiendas
  // y no dispara fetch externo, así que lo dejamos sin auth para
  // facilitar diagnóstico/UI interna. Cualquier slug real que sí
  // gatille scraping pasa por el guard.
  if (slug === "_list") {
    return NextResponse.json({
      stores: STORES.map(({ slug, name, platform, baseUrl }) => ({
        slug,
        name,
        platform,
        baseUrl,
      })),
    });
  }

  const authFail = requireScrapeAuth(req);
  if (authFail) return authFail;

  const store = getStore(slug);
  if (!store) {
    return NextResponse.json(
      { error: `unknown store "${slug}"`, available: STORES.map((s) => s.slug) },
      { status: 404 },
    );
  }

  const url = new URL(req.url);
  const maxPagesParam = url.searchParams.get("maxPages");
  const maxPages = maxPagesParam ? Math.max(1, Number(maxPagesParam)) : 3;
  const full = url.searchParams.get("full") === "1";

  const result = await scrapeTiendanube(store, {
    maxPages: full ? 80 : maxPages,
  });

  return NextResponse.json(
    {
      store: { slug: store.slug, name: store.name },
      startedAt: result.startedAt,
      durationMs: result.durationMs,
      pagesFetched: result.pagesFetched,
      productCount: result.productCount,
      sample: result.products.slice(0, 10),
      ...(full ? { products: result.products } : {}),
      errors: result.errors,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
