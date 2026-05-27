import { NextResponse } from "next/server";
import { readPriceDrops } from "@/lib/priceDrops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Devuelve la lista actual de price-drops (snapshot del último
 * daily-scrape). Usado por:
 *   - components/FavoritesDropsBadge.tsx para marcar favoritos que
 *     bajaron sin tener que computarlo per-row.
 *   - components/HomeFavDrops.tsx para la sección "Tus favoritos
 *     que bajaron" en la home.
 *
 * Devuelve solo lo mínimo (slug → dropPct) para mantener el payload
 * chico, ya que esto se fetcha desde el browser.
 */
export async function GET() {
  const report = await readPriceDrops();
  if (!report) {
    return NextResponse.json(
      { drops: [], generatedAt: null },
      {
        headers: {
          "cache-control": "public, max-age=300",
          "access-control-allow-origin": "*",
        },
      },
    );
  }
  return NextResponse.json(
    {
      generatedAt: report.generatedAt,
      drops: report.drops.map((d) => ({
        slug: d.slug,
        dropPct: d.dropPct,
        currentPrice: d.currentPrice,
        medianPrice7d: d.medianPrice7d,
      })),
    },
    {
      headers: {
        // 5 minutos de cache · el detector corre 1x/día, no necesita
        // ser real-time.
        "cache-control": "public, max-age=300, s-maxage=300",
        "access-control-allow-origin": "*",
      },
    },
  );
}
