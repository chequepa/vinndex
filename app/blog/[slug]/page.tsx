import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { POST_SLUGS, type PostMeta, type PostSlug } from "@/content/blog/posts";
import Link from "next/link";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return POST_SLUGS.map((slug) => ({ slug }));
}

function isValidSlug(s: string): s is PostSlug {
  return (POST_SLUGS as readonly string[]).includes(s);
}

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidSlug(slug)) return { title: "Post no encontrado — Vinndex" };
  const mod = await import(`@/content/blog/${slug}.mdx`);
  const meta = mod.metadata as PostMeta;
  return {
    title: `${meta.title} — Vinndex`,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "article",
      url: `/blog/${slug}`,
      publishedTime: meta.publishedAt,
      modifiedTime: meta.updatedAt ?? meta.publishedAt,
      authors: [meta.author],
      tags: meta.tags,
    },
    alternates: { canonical: `/blog/${slug}` },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const { default: Post, metadata: rawMeta } = await import(
    `@/content/blog/${slug}.mdx`
  );
  const meta = rawMeta as PostMeta;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: meta.title,
    description: meta.description,
    author: { "@type": "Organization", name: meta.author },
    publisher: {
      "@type": "Organization",
      name: "Vinndex",
      url: "https://vinndex.com.ar",
    },
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt ?? meta.publishedAt,
    mainEntityOfPage: `https://vinndex.com.ar/blog/${slug}`,
    keywords: meta.tags.join(", "),
  };

  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main id="contenido" className="flex-1 max-w-3xl w-full mx-auto px-4 lg:px-8 py-10">
        <article>
          <header className="mb-10">
            <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wide mb-5">
              <Link href="/" className="hover:text-ink">
                Inicio
              </Link>
              <span>/</span>
              <Link href="/blog" className="hover:text-ink">
                Blog
              </Link>
            </div>
            <time className="text-xs text-terracota uppercase tracking-[0.2em] font-semibold">
              {formatDate(meta.publishedAt)}
            </time>
            <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mt-3">
              {meta.title}
            </h1>
            <p className="text-graphite mt-4 text-lg leading-relaxed">
              {meta.description}
            </p>
          </header>
          <div className="border-t border-ink/10 pt-10">
            <Post />
          </div>
          {meta.tags.length > 0 && (
            <footer className="mt-12 pt-8 border-t border-ink/10">
              <p className="text-xs text-graphite uppercase tracking-wide mb-3">
                Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {meta.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-3 py-1 rounded-full bg-snow text-graphite border border-ink/10"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </footer>
          )}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
