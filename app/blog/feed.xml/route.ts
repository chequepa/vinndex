import { POST_SLUGS, type PostMeta } from "@/content/blog/posts";

const SITE = "https://vinndex.com.ar";

/**
 * Atom 1.0 feed for the blog. Atom beats RSS 2.0 for correctness
 * (id required, dates mandatory, content-type in updated).
 *
 * Re-generated on each request for simplicity — blog posts are static
 * so next time we need to scale, add `export const revalidate = 3600`.
 */

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const entries = await Promise.all(
    POST_SLUGS.map(async (slug) => {
      const mod = await import(`@/content/blog/${slug}.mdx`);
      return { slug, meta: mod.metadata as PostMeta };
    }),
  );

  const sorted = entries.sort((a, b) =>
    b.meta.publishedAt.localeCompare(a.meta.publishedAt),
  );

  const updated =
    sorted[0]?.meta.updatedAt ?? sorted[0]?.meta.publishedAt ?? new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="es-AR">
  <id>${SITE}/blog</id>
  <title>Vinndex Blog</title>
  <subtitle>Notas sobre vinos argentinos: regiones, varietales, bodegas y cómo comparar precios de forma honesta.</subtitle>
  <link href="${SITE}/blog" rel="alternate" type="text/html"/>
  <link href="${SITE}/blog/feed.xml" rel="self" type="application/atom+xml"/>
  <updated>${new Date(updated).toISOString()}</updated>
  <author>
    <name>Vinndex</name>
    <uri>${SITE}</uri>
  </author>
${sorted
  .map(({ slug, meta }) => {
    const url = `${SITE}/blog/${slug}`;
    return `  <entry>
    <id>${url}</id>
    <title>${escape(meta.title)}</title>
    <summary>${escape(meta.description)}</summary>
    <link href="${url}" rel="alternate" type="text/html"/>
    <published>${new Date(meta.publishedAt).toISOString()}</published>
    <updated>${new Date(meta.updatedAt ?? meta.publishedAt).toISOString()}</updated>
    <author>
      <name>${escape(meta.author)}</name>
    </author>
${(meta.tags ?? [])
  .map((t) => `    <category term="${escape(t)}"/>`)
  .join("\n")}
  </entry>`;
  })
  .join("\n")}
</feed>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/atom+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
