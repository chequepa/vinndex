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
import { isJunkSlug } from "@/lib/junkSlugs";

const SITE = "https://vinndex.com.ar";

// Antes era UN solo sitemap de 22.633 URLs (~4MB). Google asigna mejor
// crawl budget con un sitemap index + sub-sitemaps por tipo. Esto importa
// para Vinndex porque la indexación es el cuello (~1 página indexada de
// 22.633 al 2026-05-20). En Next 16 `generateSitemaps` produce el index
// automático en `/sitemap.xml` y los sub-sitemaps en `/sitemap/[id].xml`.
//
// v16.0.0 cambió `id` a `Promise<string>` (antes era number).

const WINE_CHUNK_SIZE = 10_000; // límite Google = 50k/sitemap; chunks chicos = más amistoso al crawler

function eligibleWineGroups() {
  // Mismo filtro que antes (sin imagen y junk slugs fuera) + orden
  // alfabético estable: garantiza que un vino dado SIEMPRE caiga en el
  // mismo bucket entre runs (la lista del snapshot puede reordenarse
  // entre daily-scrapes por cambios en storeCount).
  return groups
    .filter((g) => g.imageUrl !== null)
    .filter((g) => !isJunkSlug(g.groupSlug))
    .slice()
    .sort((a, b) => a.groupSlug.localeCompare(b.groupSlug));
}

function wineChunkCount(): number {
  return Math.max(1, Math.ceil(eligibleWineGroups().length / WINE_CHUNK_SIZE));
}

export async function generateSitemaps() {
  const wines = wineChunkCount();
  const ids = [
    "static",
    "rankings",
    "varietals",
    "regions",
    "bodegas",
    "vs",
    "blog",
    ...Array.from({ length: wines }, (_, i) => `vinos-${i + 1}`),
  ];
  return ids.map((id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;
  const generatedAt = new Date(snapshot.generatedAt);

  if (id.startsWith("vinos-")) {
    const n = parseInt(id.slice("vinos-".length), 10) - 1;
    if (!Number.isFinite(n) || n < 0) return [];
    const all = eligibleWineGroups();
    const start = n * WINE_CHUNK_SIZE;
    const end = start + WINE_CHUNK_SIZE;
    return all.slice(start, end).map((g) => {
      const allOut = !g.offers?.some((o) => o.inStock);
      return {
        url: `${SITE}/vino/${g.groupSlug}`,
        lastModified: generatedAt,
        changeFrequency: allOut ? ("weekly" as const) : ("daily" as const),
        priority: allOut ? 0.2 : winePriority(g.storeCount),
      };
    });
  }

  switch (id) {
    case "static":
      return [
        { url: `${SITE}/`, lastModified: generatedAt, changeFrequency: "daily", priority: 1.0 },
        { url: `${SITE}/buscar`, lastModified: generatedAt, changeFrequency: "daily", priority: 0.9 },
        { url: `${SITE}/buscar?multi=1`, lastModified: generatedAt, changeFrequency: "daily", priority: 0.9 },
        { url: `${SITE}/sobre`, lastModified: generatedAt, changeFrequency: "monthly", priority: 0.5 },
        { url: `${SITE}/como-funciona`, lastModified: generatedAt, changeFrequency: "monthly", priority: 0.5 },
        { url: `${SITE}/preguntas`, lastModified: generatedAt, changeFrequency: "monthly", priority: 0.6 },
        { url: `${SITE}/sumate`, lastModified: generatedAt, changeFrequency: "monthly", priority: 0.4 },
        { url: `${SITE}/opt-out`, lastModified: generatedAt, changeFrequency: "yearly", priority: 0.2 },
        { url: `${SITE}/contacto`, lastModified: generatedAt, changeFrequency: "monthly", priority: 0.4 },
        { url: `${SITE}/blog`, lastModified: generatedAt, changeFrequency: "weekly", priority: 0.7 },
        { url: `${SITE}/ranking`, lastModified: generatedAt, changeFrequency: "daily", priority: 0.8 },
        { url: `${SITE}/bodegas`, lastModified: generatedAt, changeFrequency: "daily", priority: 0.7 },
        { url: `${SITE}/data`, lastModified: generatedAt, changeFrequency: "daily", priority: 0.7 },
        { url: `${SITE}/developers`, lastModified: generatedAt, changeFrequency: "monthly", priority: 0.5 },
      ];

    case "rankings":
      return RANKINGS.map((r) => ({
        url: `${SITE}/ranking/${r.slug}`,
        lastModified: generatedAt,
        // Daily — los rankings dependen de precio y stock del daily-scrape.
        // Priority alta — páginas SEO de descubrimiento con queries de
        // alto intent ("malbec barato", "top espumantes").
        changeFrequency: "daily" as const,
        priority: 0.85,
      }));

    case "varietals":
      return varietalPages().map((v) => ({
        url: `${SITE}/varietal/${v.slug}`,
        lastModified: generatedAt,
        changeFrequency: "daily" as const,
        // Varietales son entry points high-intent ("Malbec" busca mucho).
        priority: v.groupCount >= 50 ? 0.9 : 0.7,
      }));

    case "regions":
      return regionPages().map((r) => ({
        url: `${SITE}/region/${r.slug}`,
        lastModified: generatedAt,
        changeFrequency: "daily" as const,
        priority: r.groupCount >= 50 ? 0.8 : 0.6,
      }));

    case "bodegas":
      return brandPages().map((b) => ({
        url: `${SITE}/bodega/${b.slug}`,
        lastModified: generatedAt,
        changeFrequency: "daily" as const,
        priority: bodegaPriority(b.storeCount),
      }));

    case "vs": {
      const vsPairsFile = await readVsPairs();
      return (vsPairsFile?.pairs ?? []).map((p) => ({
        url: `${SITE}/vs/${p.slug}`,
        lastModified: generatedAt,
        // Daily — precios/stores cambian a diario, las pages Vs muestran
        // ese delta. Priority alto — SEO de cola larga ("X vs Y wine").
        changeFrequency: "daily" as const,
        priority: 0.75,
      }));
    }

    case "blog": {
      const blogPosts = await Promise.all(
        POST_SLUGS.map(async (slug) => {
          const mod = await import(`@/content/blog/${slug}.mdx`);
          return { slug, meta: mod.metadata as PostMeta };
        }),
      );
      return blogPosts.map(({ slug, meta }) => ({
        url: `${SITE}/blog/${slug}`,
        lastModified: new Date(meta.updatedAt ?? meta.publishedAt),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      }));
    }
  }

  return [];
}

/** Priority tier by storeCount — más tiendas = más relevante para ranking. */
function winePriority(storeCount: number): number {
  if (storeCount >= 10) return 0.9;
  if (storeCount >= 5) return 0.8;
  if (storeCount >= 3) return 0.7;
  if (storeCount >= 2) return 0.6;
  return 0.4; // single-store pages still indexed but low priority
}

function bodegaPriority(storeCount: number): number {
  if (storeCount >= 10) return 0.9;
  if (storeCount >= 5) return 0.8;
  if (storeCount >= 3) return 0.7;
  return 0.5;
}
