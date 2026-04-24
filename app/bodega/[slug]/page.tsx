import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { findBrandPage, formatArs } from "@/lib/snapshot";
import { SearchInput } from "@/components/SearchInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FavoritesNavLink } from "@/components/Favorites";
import { BottleFallback } from "@/components/BottleFallback";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const b = findBrandPage(slug);
  if (!b) return { title: "Bodega no encontrada — Vinndex" };
  return {
    title: `${b.name} — ${b.groupCount} vinos en ${b.storeCount} vinotecas | Vinndex`,
    description: `Compará precios de ${b.name}. ${b.groupCount} etiquetas relevadas en ${b.storeCount} vinotecas online de Argentina.`,
    alternates: {
      canonical: `https://vinndex.com.ar/bodega/${slug}`,
    },
    openGraph: {
      title: `${b.name} en Vinndex`,
      description: `${b.groupCount} etiquetas en ${b.storeCount} vinotecas`,
      url: `https://vinndex.com.ar/bodega/${slug}`,
      type: "website",
      locale: "es_AR",
      siteName: "Vinndex",
      images: b.topGroups[0]?.imageUrl
        ? [{ url: b.topGroups[0].imageUrl }]
        : undefined,
    },
  };
}

export default async function BodegaPage({ params }: Params) {
  const { slug } = await params;
  const b = findBrandPage(slug);
  if (!b) notFound();

  const multiStore = b.topGroups.filter((g) => g.storeCount >= 2);
  const singleStore = b.topGroups.filter((g) => g.storeCount === 1);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: "https://vinndex.com.ar" },
      { "@type": "ListItem", position: 2, name: "Bodegas", item: "https://vinndex.com.ar/buscar" },
      { "@type": "ListItem", position: 3, name: b.name, item: `https://vinndex.com.ar/bodega/${slug}` },
    ],
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 shrink-0 cursor-wine">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path
                d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
                fill="#1E3FBF"
                stroke="#1E3FBF"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="24" cy="8" r="3" fill="#E8B547" />
            </svg>
            <span className="display text-xl font-semibold text-ink hidden sm:block">
              Vinndex
            </span>
          </a>
          <form action="/buscar" className="flex-1 max-w-2xl">
            <div className="relative flex items-center bg-snow rounded-full border border-ink/10 p-1 pl-4">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-graphite shrink-0"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <SearchInput
                placeholder="Malbec, Luigi Bosca, Catena Zapata..."
                className="w-full bg-transparent border-0 outline-none px-3 py-2 text-ink"
              />
              <button className="cursor-wine bg-cobalt text-snow font-semibold px-5 py-2 rounded-full text-sm">
                Buscar
              </button>
            </div>
          </form>
          <FavoritesNavLink className="text-ink shrink-0" />
          <ThemeToggle className="text-ink shrink-0" />
        </div>
      </header>

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-4">
            <a href="/" className="hover:text-ink">
              Inicio
            </a>
            <span>/</span>
            <a href="/buscar" className="hover:text-ink">
              Bodegas
            </a>
            <span>/</span>
            <span>{b.name}</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05]">
            {b.name}
          </h1>
          <p className="text-graphite text-lg mt-4 max-w-2xl">
            <span className="font-semibold text-ink">{b.groupCount}</span>{" "}
            etiquetas relevadas ·{" "}
            <span className="font-semibold text-ink">{b.wineCount}</span>{" "}
            ofertas en{" "}
            <span className="font-semibold text-ink">{b.storeCount}</span>{" "}
            vinoteca{b.storeCount === 1 ? "" : "s"}.
          </p>
          {(b.varietals.length > 0 || b.regions.length > 0) && (
            <div className="mt-4 flex gap-2 flex-wrap">
              {b.varietals.map((v) => (
                <a
                  key={v}
                  href={`/buscar?varietal=${encodeURIComponent(v)}`}
                  className="tag tag-malbec"
                >
                  {v}
                </a>
              ))}
              {b.regions.map((r) => (
                <a
                  key={r}
                  href={`/buscar?region=${encodeURIComponent(r)}`}
                  className="tag"
                  style={{ background: "#1E3FBF15", color: "#1E3FBF" }}
                >
                  {r}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        {multiStore.length > 0 && (
          <section className="mb-12">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
              <div>
                <h2 className="display text-2xl font-semibold text-ink">
                  Comparables en múltiples vinotecas
                </h2>
                <p className="text-graphite text-sm mt-1">
                  {multiStore.length} etiquetas de {b.name} que podés comparar
                  ahora mismo.
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {multiStore.map((g) => (
                <a
                  key={g.groupSlug}
                  href={`/vino/${g.groupSlug}`}
                  className="postcard p-5 flex gap-4"
                >
                  <div className="relative w-20 h-28 shrink-0 rounded-lg overflow-hidden bg-snow border border-ink/10">
                    {g.imageUrl ? (
                      <Image
                        src={g.imageUrl}
                        alt={g.canonicalName}
                        fill
                        sizes="80px"
                        className="object-contain"
                      />
                    ) : (
                      <BottleFallback name={g.canonicalName} brand={g.brand} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="display text-lg font-semibold text-ink leading-tight line-clamp-2 min-h-[2.5em]">
                      {g.canonicalName}
                    </div>
                    <div className="text-xs text-graphite mt-1">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: "#1B7A4F20", color: "#1B7A4F" }}
                      >
                        {g.storeCount} vinotecas
                      </span>
                    </div>
                    <div className="display text-xl font-semibold text-cobalt mt-2">
                      {formatArs(g.minPrice)}
                    </div>
                    {g.maxPrice && g.minPrice && g.maxPrice > g.minPrice && (
                      <div className="text-xs text-graphite">
                        hasta {formatArs(g.maxPrice)}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {singleStore.length > 0 && (
          <section>
            <h2 className="display text-2xl font-semibold text-ink mb-6">
              Etiquetas sueltas
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {singleStore.slice(0, 16).map((g) => (
                <a
                  key={g.groupSlug}
                  href={`/vino/${g.groupSlug}`}
                  className="bg-white rounded-2xl p-4 border border-ink/10 hover:shadow-lg transition-shadow flex flex-col"
                >
                  <div className="relative w-full aspect-[3/4] bg-snow rounded-lg overflow-hidden mb-3 border border-ink/10">
                    {g.imageUrl ? (
                      <Image
                        src={g.imageUrl}
                        alt={g.canonicalName}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                        className="object-contain"
                      />
                    ) : (
                      <BottleFallback name={g.canonicalName} brand={g.brand} />
                    )}
                  </div>
                  <div className="display text-sm font-semibold line-clamp-2 min-h-[2.5em] text-ink">
                    {g.canonicalName}
                  </div>
                  <div className="display text-lg font-semibold text-cobalt mt-2">
                    {formatArs(g.minPrice)}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="bg-ink text-snow/70 px-6 py-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>
            © 2026 Vinndex ·{" "}
            <a href="/" className="hover:text-snow">
              Inicio
            </a>
          </p>
          <p>Precios relevados una vez por día · Beber con moderación</p>
        </div>
      </footer>
    </div>
  );
}
