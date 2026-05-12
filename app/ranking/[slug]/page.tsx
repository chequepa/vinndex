import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BottleFallback } from "@/components/BottleFallback";
import { displayWineName } from "@/lib/displayWineName";
import { formatArs, displayBrand } from "@/lib/snapshot";
import { findRanking, applyRanking, RANKINGS } from "@/lib/rankings";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return RANKINGS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { slug } = await params;
  const r = findRanking(slug);
  if (!r) return { title: "Ranking no encontrado — Vinndex" };
  return {
    title: `${r.title} — Vinndex`,
    description: r.description,
    keywords: r.keywords,
    alternates: { canonical: `https://vinndex.com.ar/ranking/${r.slug}` },
    openGraph: {
      title: `${r.title} — Vinndex`,
      description: r.description,
      url: `https://vinndex.com.ar/ranking/${r.slug}`,
      siteName: "Vinndex",
      type: "website",
      locale: "es_AR",
    },
    twitter: {
      card: "summary_large_image",
      title: `${r.title} — Vinndex`,
      description: r.description,
    },
  };
}

export default async function RankingPage({ params }: Params) {
  const { slug } = await params;
  const ranking = findRanking(slug);
  if (!ranking) notFound();

  const items = applyRanking(ranking);

  // JSON-LD ItemList — Google entiende rankings y los muestra como
  // rich snippet con la posición y los items. Combinado con Product
  // schema (que ya tiene cada /vino/[slug]) hace una buena foto del
  // contenido.
  const itemListJsonLd = {
    "@context": "https://schema.org/",
    "@type": "ItemList",
    name: ranking.title,
    description: ranking.description,
    numberOfItems: items.length,
    itemListElement: items.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://vinndex.com.ar/vino/${g.groupSlug}`,
      name: g.canonicalName,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: "https://vinndex.com.ar",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Rankings",
        item: "https://vinndex.com.ar/ranking",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: ranking.title,
        item: `https://vinndex.com.ar/ranking/${ranking.slug}`,
      },
    ],
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteHeader />

      {/* HERO */}
      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/ranking" className="hover:text-ink">
              Rankings
            </Link>
            <span>/</span>
            <span>{ranking.title}</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            {ranking.title}
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            {ranking.subtitle}
          </p>
          <p className="text-xs text-graphite mt-6">
            {items.length} vinos · Actualizado todos los días · Sin patrocinios
            — el orden refleja el dato real del snapshot
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        {items.length === 0 ? (
          <p className="text-graphite">
            No hay vinos que cumplan los criterios de este ranking hoy.
            Volvé mañana — el snapshot se refresca a diario.
          </p>
        ) : (
          <ol className="space-y-3">
            {items.map((g, i) => (
              <li key={g.groupSlug}>
                <Link
                  href={`/vino/${g.groupSlug}`}
                  className="block bg-white rounded-2xl border border-ink/10 hover:border-cobalt hover:shadow-md transition-all p-4 grid grid-cols-[48px_72px_1fr_auto] gap-4 items-center"
                >
                  <span className="display text-3xl font-semibold text-cobalt/40 text-center">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="relative w-16 h-24 bg-snow rounded-lg overflow-hidden">
                    {g.imageUrl ? (
                      <Image
                        src={g.imageUrl}
                        alt={g.canonicalName}
                        fill
                        sizes="64px"
                        className="object-contain"
                      />
                    ) : (
                      <BottleFallback name={g.canonicalName} brand={g.brand} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-graphite truncate">
                      {displayBrand(g.brand)}
                    </p>
                    <p className="display text-lg md:text-xl font-semibold text-ink leading-tight">
                      {displayWineName(g.canonicalName)}
                      {g.vintage && (
                        <span className="font-normal text-graphite">
                          {" · "}
                          {g.vintage}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-graphite flex-wrap">
                      <span>
                        {g.storeCount} vinoteca{g.storeCount === 1 ? "" : "s"}
                      </span>
                      {g.varietals && g.varietals.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{g.varietals.slice(0, 2).join(", ")}</span>
                        </>
                      )}
                      {g.region && (
                        <>
                          <span>·</span>
                          <span>{g.region}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="display text-xl md:text-2xl font-semibold text-cobalt">
                      {formatArs(g.minPrice)}
                    </p>
                    <p className="text-xs text-graphite mt-0.5">desde</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {/* CTA + cross-link a otros rankings */}
        <section className="mt-16 pt-10 border-t border-ink/10">
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Otros rankings
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {RANKINGS.filter((r) => r.slug !== ranking.slug).map((r) => (
              <Link
                key={r.slug}
                href={`/ranking/${r.slug}`}
                className="block bg-snow rounded-xl p-4 border border-ink/10 hover:border-cobalt hover:text-cobalt transition-colors"
              >
                <p className="display text-base font-semibold text-ink">
                  {r.title}
                </p>
                <p className="text-xs text-graphite mt-1 line-clamp-2">
                  {r.subtitle}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
