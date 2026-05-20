import { entriesForBucket, renderUrlset } from "@/lib/sitemap-buckets";

/**
 * Sub-sitemap por tipo. URLs como /sitemap/static.xml, /sitemap/vinos-1.xml,
 * etc. El path param `type` viene con `.xml`; lo pelamos antes de mapear
 * al bucket id en lib/sitemap-buckets.ts.
 *
 * Next 16: `params` es `Promise<{...}>` — hay que await.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ type: string }> },
) {
  const { type } = await ctx.params;
  const id = type.endsWith(".xml") ? type.slice(0, -".xml".length) : type;
  const entries = await entriesForBucket(id);
  if (entries === null) {
    return new Response("Not Found", { status: 404 });
  }
  const xml = renderUrlset(entries);
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
