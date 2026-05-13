import { NextResponse } from "next/server";
import { scrapeAmbar } from "@/lib/adapters/ambar";
import { getStore, STORES } from "@/lib/stores";
import { requireScrapeAuth } from "@/lib/auth-scrape";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;

  if (slug === "_list") {
    return NextResponse.json({
      stores: STORES.filter(
        (s) => s.platform === "custom" && s.customAdapter === "ambar-supabase",
      ).map(({ slug, name, platform, baseUrl }) => ({
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
  if (!store || store.platform !== "custom" || store.customAdapter !== "ambar-supabase") {
    return NextResponse.json(
      {
        error: `unknown ambar store "${slug}"`,
        available: STORES.filter(
          (s) =>
            s.platform === "custom" && s.customAdapter === "ambar-supabase",
        ).map((s) => s.slug),
      },
      { status: 404 },
    );
  }

  const result = await scrapeAmbar(store);

  return NextResponse.json(
    {
      store: { slug: store.slug, name: store.name },
      startedAt: result.startedAt,
      durationMs: result.durationMs,
      pagesFetched: result.pagesFetched,
      productCount: result.productCount,
      sample: result.products.slice(0, 10),
      errors: result.errors,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
