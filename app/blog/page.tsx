import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { POST_SLUGS, type PostMeta } from "@/content/blog/posts";

export const metadata: Metadata = {
  title: "Blog — Vinndex",
  description:
    "Notas sobre vinos argentinos: regiones, varietales, bodegas y cómo comparar precios de forma honesta.",
  openGraph: {
    title: "Blog — Vinndex",
    description:
      "Notas sobre vinos argentinos: regiones, varietales, bodegas y cómo comparar precios de forma honesta.",
    type: "website",
    url: "/blog",
  },
  alternates: {
    canonical: "/blog",
    types: {
      "application/atom+xml": "/blog/feed.xml",
    },
  },
};

async function loadPosts() {
  const entries = await Promise.all(
    POST_SLUGS.map(async (slug) => {
      const mod = await import(`@/content/blog/${slug}.mdx`);
      return { slug, meta: mod.metadata as PostMeta };
    }),
  );
  return entries.sort((a, b) =>
    b.meta.publishedAt.localeCompare(a.meta.publishedAt),
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogIndex() {
  const posts = await loadPosts();

  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 lg:px-8 py-10">
        <header className="mb-10 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-3">
              Blog
            </p>
            <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05]">
              Notas sobre vinos argentinos
            </h1>
            <p className="text-graphite mt-4 text-lg max-w-xl">
              Regiones, varietales, bodegas y cómo leer el mercado sin caer
              en marketing.
            </p>
          </div>
          <a
            href="/blog/feed.xml"
            className="cursor-wine inline-flex items-center gap-2 text-xs text-graphite hover:text-terracota transition shrink-0 mt-2"
            title="Feed Atom"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 4.44v2.83a12.73 12.73 0 0 1 12.73 12.73h2.83A15.56 15.56 0 0 0 4 4.44zm0 5.66v2.83a7.07 7.07 0 0 1 7.07 7.07h2.83A9.9 9.9 0 0 0 4 10.1z" />
            </svg>
            RSS / Atom
          </a>
        </header>
        <ul className="space-y-10 border-t border-ink/10 pt-10">
          {posts.map(({ slug, meta }) => (
            <li key={slug}>
              <a href={`/blog/${slug}`} className="group block">
                <time className="text-xs text-graphite uppercase tracking-wide">
                  {formatDate(meta.publishedAt)}
                </time>
                <h2 className="display text-2xl md:text-3xl font-semibold text-ink group-hover:text-cobalt transition leading-tight mt-2">
                  {meta.title}
                </h2>
                <p className="text-graphite mt-2 leading-relaxed">
                  {meta.description}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {meta.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-snow text-graphite border border-ink/10 uppercase tracking-wide"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
