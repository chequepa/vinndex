import type { MetadataRoute } from "next";
import {
  snapshot,
  groups,
  brandPages,
  varietalPages,
  regionPages,
} from "@/lib/snapshot";
import { POST_SLUGS, type PostMeta } from "@/content/blog/posts";
import { RANKINGS } from "@/lib/rankings";
import { readVsPairs } from "@/lib/vsPairs";

const SITE = "https://vinndex.com.ar";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const generatedAt = new Date(snapshot.generatedAt);
  const brands = brandPages();
  const varietals = varietalPages();
  const regions = regionPages();

  const blogPosts = await Promise.all(
    POST_SLUGS.map(async (slug) => {
      const mod = await import(`@/content/blog/${slug}.mdx`);
      return { slug, meta: mod.metadata as PostMeta };
    }),
  );

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE}/`,
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE}/buscar`,
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE}/buscar?multi=1`,
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE}/sobre`,
      lastModified: generatedAt,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE}/como-funciona`,
      lastModified: generatedAt,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE}/preguntas`,
      lastModified: generatedAt,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE}/sumate`,
      lastModified: generatedAt,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE}/opt-out`,
      lastModified: generatedAt,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE}/contacto`,
      lastModified: generatedAt,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE}/admin/fuentes`,
      lastModified: generatedAt,
      changeFrequency: "weekly",
      priority: 0.3,
    },
    {
      url: `${SITE}/blog`,
      lastModified: generatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE}/ranking`,
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const vsPairsFile = await readVsPairs();
  const vsPagesUrls: MetadataRoute.Sitemap = (vsPairsFile?.pairs ?? []).map(
    (p) => ({
      url: `${SITE}/vs/${p.slug}`,
      lastModified: generatedAt,
      // Daily — los precios y stores cambian a diario, las pages Vs
      // muestran ese delta. Priority alto porque son SEO de cola larga
      // con queries de alto intent ("X vs Y wine argentina").
      changeFrequency: "daily" as const,
      priority: 0.75,
    }),
  );

  const rankingPagesUrls: MetadataRoute.Sitemap = RANKINGS.map((r) => ({
    url: `${SITE}/ranking/${r.slug}`,
    lastModified: generatedAt,
    // Daily — los rankings dependen del precio y stock que cambian día
    // a día con el daily-scrape.
    changeFrequency: "daily" as const,
    // Alta prioridad — son páginas SEO de descubrimiento con queries
    // de alto intent ("malbec barato", "top espumantes").
    priority: 0.85,
  }));

  const blogPostsRoutes: MetadataRoute.Sitemap = blogPosts.map(
    ({ slug, meta }) => ({
      url: `${SITE}/blog/${slug}`,
      lastModified: new Date(meta.updatedAt ?? meta.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }),
  );

  /** Priority tier by storeCount — más tiendas = más relevante para ranking. */
  function winePriority(storeCount: number): number {
    if (storeCount >= 10) return 0.9;
    if (storeCount >= 5) return 0.8;
    if (storeCount >= 3) return 0.7;
    if (storeCount >= 2) return 0.6;
    return 0.4; // single-store pages still indexed but low priority
  }

  /** Reduce indexing of out-of-stock-only groups: Google might still crawl
   * but with low priority and weekly freq since nothing is purchasable. */
  const winePages: MetadataRoute.Sitemap = groups
    .filter((g) => g.imageUrl !== null)
    .map((g) => {
      const allOut = !g.offers?.some((o) => o.inStock);
      return {
        url: `${SITE}/vino/${g.groupSlug}`,
        lastModified: generatedAt,
        changeFrequency: allOut ? "weekly" : ("daily" as const),
        priority: allOut ? 0.2 : winePriority(g.storeCount),
      };
    });

  function bodegaPriority(storeCount: number): number {
    if (storeCount >= 10) return 0.9;
    if (storeCount >= 5) return 0.8;
    if (storeCount >= 3) return 0.7;
    return 0.5;
  }

  const bodegaPages: MetadataRoute.Sitemap = brands.map((b) => ({
    url: `${SITE}/bodega/${b.slug}`,
    lastModified: generatedAt,
    changeFrequency: "daily" as const,
    priority: bodegaPriority(b.storeCount),
  }));

  const varietalPagesUrls: MetadataRoute.Sitemap = varietals.map((v) => ({
    url: `${SITE}/varietal/${v.slug}`,
    lastModified: generatedAt,
    changeFrequency: "daily" as const,
    // Varietal pages are high-intent entry points from Google ("Malbec"
    // searches are huge) — keep priority high.
    priority: v.groupCount >= 50 ? 0.9 : 0.7,
  }));

  const regionPagesUrls: MetadataRoute.Sitemap = regions.map((r) => ({
    url: `${SITE}/region/${r.slug}`,
    lastModified: generatedAt,
    changeFrequency: "daily" as const,
    priority: r.groupCount >= 50 ? 0.8 : 0.6,
  }));

  return [
    ...staticRoutes,
    ...rankingPagesUrls,
    ...vsPagesUrls,
    ...blogPostsRoutes,
    ...bodegaPages,
    ...varietalPagesUrls,
    ...regionPagesUrls,
    ...winePages,
  ];
}
