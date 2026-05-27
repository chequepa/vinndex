import { snapshot } from "@/lib/snapshot";
import { listBuckets, renderIndex } from "@/lib/sitemap-buckets";

/**
 * Sitemap index · entry point que robots.txt declara y Google consume
 * primero. Lista los sub-sitemaps por tipo en `/sitemap/[id].xml`.
 *
 * El bucketing y la generación viven en `lib/sitemap-buckets.ts` y se
 * comparten con `app/sitemap/[type]/route.ts` para evitar duplicar.
 */
export async function GET() {
  const xml = renderIndex(listBuckets(), new Date(snapshot.generatedAt));
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // 1h en el edge; el daily-scrape regenera datos a las 03:00 ART
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
