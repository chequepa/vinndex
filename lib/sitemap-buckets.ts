/**
 * Buckets del sitemap segmentado.
 *
 * Antes era UN sitemap monolítico (22.6k URLs, 4MB). Google asigna mejor
 * crawl budget con sitemap index + sub-sitemaps por tipo. Importa para
 * Vinndex porque la indexación es el cuello (dominio nuevo, ~1 de 22.633
 * páginas indexadas al 2026-05-20).
 *
 * Nota Next 16: probé `app/sitemap.ts` con `generateSitemaps()` pero la
 * convención genera `/sitemap/[id].xml` SIN un `/sitemap.xml` index
 * automático — robots.txt lo declaraba y daba 404. Por eso movemos todo
 * a route handlers explícitos (`app/sitemap.xml/route.ts` y
 * `app/sitemap/[type]/route.ts`) y este helper centraliza la lógica.
 */

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

export const SITE = "https://vinndex.com.ar";

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
};

const WINE_CHUNK_SIZE = 10_000; // límite Google = 50k/sitemap; chunks chicos = más amistoso al crawler

function eligibleWineGroups() {
  // Filtro + orden alfabético estable: cada vino siempre cae en el mismo
  // bucket entre runs (el snapshot reordena por storeCount cada
  // daily-scrape, lo que rompería el chunking si no ordenáramos).
  return groups
    .filter((g) => g.imageUrl !== null)
    .filter((g) => !isJunkSlug(g.groupSlug))
    .slice()
    .sort((a, b) => a.groupSlug.localeCompare(b.groupSlug));
}

function wineChunkCount(): number {
  return Math.max(1, Math.ceil(eligibleWineGroups().length / WINE_CHUNK_SIZE));
}

/** Lista de buckets (ids) que existen en este momento. Estable entre
 *  requests; el array cambia sólo si crece/decrece el catálogo. */
export function listBuckets(): string[] {
  const wines = wineChunkCount();
  return [
    "static",
    "rankings",
    "varietals",
    "regions",
    "bodegas",
    "vs",
    "blog",
    ...Array.from({ length: wines }, (_, i) => `vinos-${i + 1}`),
  ];
}

function winePriority(storeCount: number): number {
  if (storeCount >= 10) return 0.9;
  if (storeCount >= 5) return 0.8;
  if (storeCount >= 3) return 0.7;
  if (storeCount >= 2) return 0.6;
  return 0.4;
}

function bodegaPriority(storeCount: number): number {
  if (storeCount >= 10) return 0.9;
  if (storeCount >= 5) return 0.8;
  if (storeCount >= 3) return 0.7;
  return 0.5;
}

/** Devuelve las URLs de un bucket dado, o `null` si el id no existe. */
export async function entriesForBucket(
  id: string,
): Promise<SitemapEntry[] | null> {
  const generatedAt = new Date(snapshot.generatedAt);

  if (id.startsWith("vinos-")) {
    const n = parseInt(id.slice("vinos-".length), 10) - 1;
    if (!Number.isFinite(n) || n < 0 || n >= wineChunkCount()) return null;
    const all = eligibleWineGroups();
    const start = n * WINE_CHUNK_SIZE;
    const end = start + WINE_CHUNK_SIZE;
    return all.slice(start, end).map((g) => {
      const allOut = !g.offers?.some((o) => o.inStock);
      return {
        url: `${SITE}/vino/${g.groupSlug}`,
        lastModified: generatedAt,
        changeFrequency: allOut ? "weekly" : "daily",
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
        changeFrequency: "daily",
        priority: 0.85,
      }));

    case "varietals":
      return varietalPages().map((v) => ({
        url: `${SITE}/varietal/${v.slug}`,
        lastModified: generatedAt,
        changeFrequency: "daily",
        priority: v.groupCount >= 50 ? 0.9 : 0.7,
      }));

    case "regions":
      return regionPages().map((r) => ({
        url: `${SITE}/region/${r.slug}`,
        lastModified: generatedAt,
        changeFrequency: "daily",
        priority: r.groupCount >= 50 ? 0.8 : 0.6,
      }));

    case "bodegas":
      // storeCount<2 = bodega con catálogo en 1 sola tienda → la página
      // marca `noindex` en su generateMetadata. No la mandamos al sitemap
      // para no dar señales contradictorias a Google.
      return brandPages()
        .filter((b) => b.storeCount >= 2)
        .map((b) => ({
          url: `${SITE}/bodega/${b.slug}`,
          lastModified: generatedAt,
          changeFrequency: "daily",
          priority: bodegaPriority(b.storeCount),
        }));

    case "vs": {
      const vsPairsFile = await readVsPairs();
      return (vsPairsFile?.pairs ?? []).map((p) => ({
        url: `${SITE}/vs/${p.slug}`,
        lastModified: generatedAt,
        changeFrequency: "daily",
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
        changeFrequency: "monthly",
        priority: 0.7,
      }));
    }
  }

  return null;
}

/** XML escape para los pocos chars peligrosos en URLs/fechas. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Serializa una lista de entries al formato sitemap urlset. */
export function renderUrlset(entries: SitemapEntry[]): string {
  const items = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(e.url)}</loc>`];
      if (e.lastModified)
        parts.push(`    <lastmod>${e.lastModified.toISOString()}</lastmod>`);
      if (e.changeFrequency)
        parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority !== undefined)
        parts.push(`    <priority>${e.priority.toFixed(2)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

/** Serializa el sitemap index referenciando los sub-sitemaps. */
export function renderIndex(bucketIds: string[], lastMod: Date): string {
  const items = bucketIds
    .map((id) => {
      const url = `${SITE}/sitemap/${xmlEscape(id)}.xml`;
      return `  <sitemap>\n    <loc>${url}</loc>\n    <lastmod>${lastMod.toISOString()}</lastmod>\n  </sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}
