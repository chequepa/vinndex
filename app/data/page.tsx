import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getMarketStats } from "@/lib/marketStats";
import { formatArs } from "@/lib/snapshot";

export const metadata: Metadata = {
  title: "Estado del mercado · datos del vino argentino — Vinndex",
  description:
    "Datos agregados del mercado de vinos online en Argentina: distribución por varietal, región y precio. Precio mediana por varietal. Top bodegas por cobertura. Actualizado todos los días.",
  keywords: [
    "mercado vino argentina",
    "datos vino argentino",
    "estadísticas vinos",
    "precio promedio vino argentina",
    "distribución varietales argentina",
  ],
  alternates: { canonical: "https://vinndex.com.ar/data" },
  openGraph: {
    title: "Estado del mercado · datos del vino argentino — Vinndex",
    description:
      "Distribución por varietal, región, precio. Precio mediana por varietal. Top bodegas. Actualizado a diario.",
    url: "https://vinndex.com.ar/data",
    siteName: "Vinndex",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Estado del mercado · datos del vino argentino — Vinndex",
    description:
      "Distribución por varietal, región y precio. Precio mediana por varietal. Top bodegas. Actualizado a diario.",
  },
};

function formatPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function formatDateRelative(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DataPage() {
  const stats = getMarketStats();
  const maxVarietalCount = stats.varietals[0]?.count ?? 1;
  const maxRegionCount = stats.regions[0]?.count ?? 1;
  const maxBandCount = Math.max(
    ...stats.priceBands.map((b) => b.count),
    1,
  );

  // Dataset schema — habilita aparición en Google Dataset Search.
  // Audiencia natural: data journalists, analistas de e-commerce AR,
  // estudiantes de marketing. Vector posible de backlinks editoriales.
  const datasetJsonLd = {
    "@context": "https://schema.org/",
    "@type": "Dataset",
    name: "Mercado de vinos online argentinos",
    description:
      "Dataset agregado con distribución por varietal, región, banda de precio y top bodegas del mercado de vinos online en Argentina. Actualizado a diario.",
    url: "https://vinndex.com.ar/data",
    keywords: [
      "vino argentino",
      "mercado vino Argentina",
      "precio vino",
      "varietales",
      "Malbec",
      "Mendoza",
      "e-commerce vinos",
    ],
    creator: {
      "@type": "Organization",
      name: "Vinndex",
      url: "https://vinndex.com.ar",
    },
    dateModified: stats.snapshotGeneratedAt,
    temporalCoverage: new Date(stats.snapshotGeneratedAt)
      .getFullYear()
      .toString(),
    spatialCoverage: {
      "@type": "Place",
      name: "Argentina",
      address: { "@type": "PostalAddress", addressCountry: "AR" },
    },
    variableMeasured: [
      "Cantidad de vinos por varietal",
      "Cantidad de vinos por región",
      "Distribución por banda de precio",
      "Precio mediana por varietal",
      "Cobertura por bodega",
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: "https://vinndex.com.ar/api/v1/search",
        name: "API REST pública (sin auth)",
      },
    ],
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-4">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Data</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-4">
            Estado del mercado
          </h1>
          <p className="text-graphite text-base md:text-lg leading-relaxed max-w-3xl">
            Datos agregados del vino argentino online — distribución por
            varietal, región, precio. Actualizado a diario con el snapshot de
            las {stats.totals.storeCount} vinotecas relevadas.
          </p>
          <p className="text-xs text-graphite mt-3">
            Última actualización: {formatDateRelative(stats.snapshotGeneratedAt)}{" "}
            · Los porcentajes son sobre{" "}
            {stats.totals.multiStoreGroupCount.toLocaleString("es-AR")} vinos
            comparables (presentes en ≥2 vinotecas con precio relevado).
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14 space-y-14"
      >
        {/* Totales */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Cobertura total
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat
              value={stats.totals.storeCount.toString()}
              label="vinotecas online"
            />
            <Stat
              value={stats.totals.brandCount.toLocaleString("es-AR")}
              label="bodegas"
              href="/bodegas"
            />
            <Stat
              value={stats.totals.groupCount.toLocaleString("es-AR")}
              label="vinos únicos"
            />
            <Stat
              value={stats.totals.multiStoreGroupCount.toLocaleString("es-AR")}
              label="comparables"
              href="/buscar?multi=1"
            />
            <Stat
              value={stats.totals.productCount.toLocaleString("es-AR")}
              label="ofertas"
            />
          </div>
        </section>

        {/* Distribución por varietal */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-2">
            Top varietales del mercado
          </h2>
          <p className="text-sm text-graphite mb-6 max-w-3xl">
            El Malbec sigue dominando la oferta argentina, pero los varietales
            blancos (Chardonnay, Torrontés, Sauvignon Blanc) muestran un share
            importante. Precio mediana calculado sobre el mínimo de cada vino.
          </p>
          <ul className="space-y-2 -mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0 sm:overflow-visible">
            {stats.varietals.map((v) => {
              const pct = v.count / maxVarietalCount;
              return (
                <li
                  key={v.name}
                  className="grid grid-cols-[180px_minmax(140px,1fr)_80px_90px] gap-3 items-center text-sm"
                >
                  <Link
                    href={`/buscar?varietal=${encodeURIComponent(v.name)}`}
                    className="text-ink font-medium hover:text-cobalt truncate"
                  >
                    {v.name}
                  </Link>
                  <div className="h-3 bg-snow rounded overflow-hidden">
                    <div
                      className="h-full bg-cobalt"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-ink">
                    {v.count.toLocaleString("es-AR")}{" "}
                    <span className="text-graphite">
                      ({formatPct(v.pct)})
                    </span>
                  </span>
                  <span className="text-right tabular-nums text-graphite text-xs">
                    {v.medianPrice ? `~${formatArs(v.medianPrice)}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Distribución por región */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-2">
            Regiones vinícolas
          </h2>
          <p className="text-sm text-graphite mb-6 max-w-3xl">
            La concentración de Mendoza (Valle de Uco + Luján de Cuyo) es
            evidente. Salta y Patagonia con presencia secundaria. Considerá
            que sólo contamos vinos con región identificada en el nombre o la
            etiqueta — el resto cuenta como &ldquo;sin región&rdquo;.
          </p>
          <ul className="space-y-2 -mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0 sm:overflow-visible">
            {stats.regions.map((r) => {
              const pct = r.count / maxRegionCount;
              return (
                <li
                  key={r.name}
                  className="grid grid-cols-[180px_minmax(140px,1fr)_80px_90px] gap-3 items-center text-sm"
                >
                  <Link
                    href={`/region/${encodeURIComponent(
                      r.name.toLowerCase().replace(/\s+/g, "-").replace(/[áéíóú]/g, (c) => "aeiou"["áéíóú".indexOf(c)] ?? c),
                    )}`}
                    className="text-ink font-medium hover:text-cobalt truncate"
                  >
                    {r.name}
                  </Link>
                  <div className="h-3 bg-snow rounded overflow-hidden">
                    <div
                      className="h-full bg-malbec"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-ink">
                    {r.count.toLocaleString("es-AR")}{" "}
                    <span className="text-graphite">
                      ({formatPct(r.pct)})
                    </span>
                  </span>
                  <span className="text-right tabular-nums text-graphite text-xs">
                    {r.medianPrice ? `~${formatArs(r.medianPrice)}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Distribución por banda de precio */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-2">
            ¿Cuánto cuesta un vino argentino?
          </h2>
          <p className="text-sm text-graphite mb-6 max-w-3xl">
            Distribución del precio mínimo (mejor oferta) de cada vino
            comparable. La banda con más oferta indica el rango donde se
            concentra el catálogo accesible.
          </p>
          <ul className="space-y-2 -mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0 sm:overflow-visible">
            {stats.priceBands.map((b) => {
              const pct = b.count / maxBandCount;
              return (
                <li
                  key={b.label}
                  className="grid grid-cols-[180px_minmax(140px,1fr)_120px] gap-3 items-center text-sm"
                >
                  <span className="text-ink font-medium">{b.label}</span>
                  <div className="h-3 bg-snow rounded overflow-hidden">
                    <div
                      className="h-full bg-mustard"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-ink">
                    {b.count.toLocaleString("es-AR")}{" "}
                    <span className="text-graphite">
                      ({formatPct(b.pct)})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Top bodegas */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-2">
            Top bodegas por cobertura
          </h2>
          <p className="text-sm text-graphite mb-6 max-w-3xl">
            Bodegas con mayor presencia en vinotecas online. Cobertura se
            mide en vinotecas distintas que las stockean —{" "}
            <Link href="/bodegas" className="text-cobalt underline">
              ver todas las {stats.totals.brandCount.toLocaleString("es-AR")}{" "}
              bodegas
            </Link>
            .
          </p>
          <ol className="space-y-1.5 -mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0 sm:overflow-visible">
            {stats.topBrands.map((b, i) => (
              <li
                key={b.slug}
                className="grid grid-cols-[32px_minmax(140px,1fr)_100px_120px] gap-3 items-center text-sm border-b border-ink/5 pb-1.5"
              >
                <span className="text-graphite tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/bodega/${b.slug}`}
                  className="text-ink font-medium hover:text-cobalt truncate"
                >
                  {b.name}
                </Link>
                <span className="text-right tabular-nums text-ink">
                  {b.storeCount.toLocaleString("es-AR")} vinotecas
                </span>
                <span className="text-right tabular-nums text-graphite text-xs">
                  {b.groupCount.toLocaleString("es-AR")} vinos
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Methodology */}
        <section className="bg-snow rounded-2xl p-6 lg:p-8 text-sm text-graphite leading-relaxed">
          <h2 className="display text-lg font-semibold text-ink mb-3">
            Metodología
          </h2>
          <p className="mb-2">
            Los datos vienen del snapshot diario de Vinndex, generado a las
            03:00 ART por un crawler que recorre las{" "}
            {stats.totals.storeCount} vinotecas online relevadas. El pipeline
            colapsa el mismo vino vendido en N vinotecas en un grupo único
            usando: EAN cuando está disponible, normalización textual de
            nombre + bodega + varietal + formato, embeddings (OpenAI{" "}
            <code className="text-xs">text-embedding-3-small</code>) para
            gray-zone, y un splitter para chimeras.
          </p>
          <p>
            &ldquo;Comparables&rdquo; = vinos presentes en al menos 2
            vinotecas con precio relevado. El precio mediana es la mediana
            del precio mínimo (mejor oferta) de cada vino en su grupo. Sin
            ponderación por volumen — cada vino cuenta una vez. Detalle
            técnico del matching:{" "}
            <Link href="/como-funciona" className="text-cobalt underline">
              cómo funciona Vinndex
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Stat({
  value,
  label,
  href,
}: {
  value: string;
  label: string;
  href?: string;
}) {
  const body = (
    <div className="bg-snow rounded-2xl p-4 border border-ink/10 h-full">
      <p className="display text-2xl md:text-3xl font-semibold text-ink tabular-nums">
        {value}
      </p>
      <p className="text-xs uppercase tracking-wider text-graphite mt-1">
        {label}
      </p>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block hover:opacity-80 transition-opacity">
        {body}
      </Link>
    );
  }
  return body;
}
