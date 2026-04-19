import type { MetadataRoute } from "next";
import { snapshot, groups, brandPages } from "@/lib/snapshot";

const SITE = "https://vinndex.com.ar";

export default function sitemap(): MetadataRoute.Sitemap {
  const generatedAt = new Date(snapshot.generatedAt);
  const brands = brandPages();

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
      url: `${SITE}/admin/fuentes`,
      lastModified: generatedAt,
      changeFrequency: "weekly",
      priority: 0.3,
    },
  ];

  // Only index wine pages that have real data — skip groups without price or image.
  const winePages: MetadataRoute.Sitemap = groups
    .filter((g) => g.minPrice !== null && g.imageUrl !== null)
    .map((g) => ({
      url: `${SITE}/vino/${g.groupSlug}`,
      lastModified: generatedAt,
      changeFrequency: "daily" as const,
      priority: g.storeCount >= 2 ? 0.8 : 0.5,
    }));

  const bodegaPages: MetadataRoute.Sitemap = brands.map((b) => ({
    url: `${SITE}/bodega/${b.slug}`,
    lastModified: generatedAt,
    changeFrequency: "daily" as const,
    priority: b.storeCount >= 3 ? 0.7 : 0.5,
  }));

  return [...staticRoutes, ...bodegaPages, ...winePages];
}
