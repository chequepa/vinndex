import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BodegasFilter } from "@/components/BodegasFilter";
import { snapshot } from "@/lib/snapshot";
import {
  storeIndexAll,
  formatIndexPct,
  indexTone,
  MIN_SAMPLE,
  STALE_DAYS,
  MIN_STORES_PER_WINE,
  type StoreIndex,
} from "@/lib/storeIndex";

export const metadata: Metadata = {
  title: "¿Cuál es la vinoteca más barata de Argentina? Índice Vinndex · Vinndex",
  description:
    "Ranking de vinotecas online de Argentina por precio: comparamos los mismos vinos en las mismas tiendas y medimos cuánto cobra cada una respecto al mercado. Actualizado a diario.",
  keywords: [
    "vinoteca más barata",
    "vinotecas online argentina",
    "ranking vinotecas",
    "dónde comprar vino más barato",
    "comparar vinotecas",
  ],
  alternates: { canonical: "https://vinndex.com.ar/vinotecas" },
  openGraph: {
    title: "¿Cuál es la vinoteca más barata de Argentina?",
    description:
      "Índice Vinndex de vinotecas: los mismos vinos, las mismas tiendas, un número por vinoteca.",
    url: "https://vinndex.com.ar/vinotecas",
    type: "website",
    locale: "es_AR",
    siteName: "Vinndex",
  },
};

const TONE_CLASS = {
  below: "tag-green",
  neutral: "tag-neutral",
  above: "tag-terracota",
} as const;

function IndexChip({ index }: { index: number }) {
  return (
    <span
      className={`tag ${TONE_CLASS[indexTone(index)]} tabular-nums`}
      title={`Índice ${index.toLocaleString("es-AR", { maximumFractionDigits: 2 })}: mediana de sus precios respecto a la mediana del mercado en los mismos vinos`}
    >
      {formatIndexPct(index)}
    </span>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

function StoreLink({ s }: { s: StoreIndex }) {
  return (
    <a
      href={s.baseUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Ir a la tienda de ${s.name} (abre en otra pestaña)`}
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-graphite hover:text-cobalt hover:bg-snow transition-colors"
    >
      <ExternalIcon />
    </a>
  );
}

export default function VinotecasIndex() {
  const all = storeIndexAll();
  const ranked = all.filter((s) => s.index !== null);
  const small = all.filter((s) => s.index === null && !s.stale);
  const stale = all.filter((s) => s.stale);
  const fechaCorta = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${iso}T12:00:00-03:00`))
      : "hace más de dos meses";
  const nf = new Intl.NumberFormat("es-AR");
  const updated = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(snapshot.generatedAt));
  const winner = ranked[0];

  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: "https://vinndex.com.ar" },
      { "@type": "ListItem", position: 2, name: "Vinotecas", item: "https://vinndex.com.ar/vinotecas" },
    ],
  };
  const listJsonLd = {
    "@context": "https://schema.org/",
    "@type": "ItemList",
    name: "Índice Vinndex de vinotecas",
    description:
      "Vinotecas online de Argentina ordenadas por su índice de precios (mediana de sus precios respecto al mercado en los mismos vinos).",
    url: "https://vinndex.com.ar/vinotecas",
    numberOfItems: ranked.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: ranked.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.name,
      url: `https://vinndex.com.ar/vinoteca/${s.slug}`,
    })),
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }}
      />
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Vinotecas</span>
          </div>
          <p className="text-terracota text-xs sm:text-sm tracking-[0.2em] uppercase font-semibold mb-4">
            Índice Vinndex de vinotecas · actualizado el {updated}
          </p>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-5 max-w-4xl">
            ¿Cuál es la vinoteca más{" "}
            <span className="italic font-normal">barata</span> de Argentina?
          </h1>
          <p className="text-graphite text-base md:text-lg leading-relaxed max-w-3xl">
            Comparamos los mismos vinos en las mismas vinotecas y medimos
            cuánto cobra cada una respecto a la mediana del mercado. Un
            índice de 0,91 quiere decir que esa vinoteca vende, en general,
            un 9% más barato que el resto; 1,12, un 12% más caro.
          </p>
          {winner && winner.index !== null && (
            <p className="mt-6 text-ink text-base md:text-lg">
              Hoy la más barata es{" "}
              <Link
                href={`/vinoteca/${winner.slug}`}
                className="font-semibold underline decoration-mustard decoration-2 underline-offset-4 hover:text-cobalt"
              >
                {winner.name}
              </Link>
              : {Math.round((1 - winner.index) * 100)}% por debajo del mercado en{" "}
              {nf.format(winner.comparableCount)} vinos comparables, con el
              mejor precio en {nf.format(winner.bestPriceCount)}.
            </p>
          )}
        </div>
      </section>

      <main id="contenido" className="max-w-6xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="display text-2xl md:text-3xl font-semibold text-ink">
              El ranking
            </h2>
            <p className="text-graphite text-sm mt-1">
              {nf.format(ranked.length)} vinotecas con al menos {MIN_SAMPLE}{" "}
              vinos comparables. De más barata a más cara.
            </p>
          </div>
        </div>

        <BodegasFilter
          totalCount={all.length}
          noun="vinotecas"
          placeholder="Filtrar por nombre… (ej: Jumbo, Enotek)"
        />

        <div className="overflow-x-auto -mx-4 lg:mx-0">
          <table className="w-full text-sm">
            <thead>
              {/* Cabeceras cortas en mobile con `sm:hidden` / `hidden sm:inline`
                  (no `sr-only sm:not-sr-only`: el `.sr-only` custom de
                  globals.css le gana al `not-sr-only` de Tailwind y la
                  cabecera larga queda invisible también en desktop). */}
              <tr className="text-left text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider text-graphite border-b border-ink/10">
                <th className="py-2 pl-4 pr-2 font-semibold text-right w-8">#</th>
                <th className="py-2 px-2 font-semibold">Vinoteca</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                  <span className="sm:hidden">Índice</span>
                  <span className="hidden sm:inline">vs. mercado</span>
                </th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                  <span className="sm:hidden">Vinos</span>
                  <span className="hidden sm:inline">Comparables</span>
                </th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap hidden sm:table-cell">
                  Mejor precio en
                </th>
                <th className="py-2 pl-2 pr-4 font-semibold text-right hidden sm:table-cell">
                  <span className="sr-only">Tienda</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s) => {
                const first = s.rank === 1;
                return (
                  <tr
                    key={s.slug}
                    data-search={s.name.toLowerCase()}
                    className={`border-b border-ink/5 transition-colors ${
                      first ? "bg-mustard/15" : "hover:bg-snow/50"
                    }`}
                  >
                    <td className="py-2.5 pl-4 pr-2 text-right tabular-nums text-graphite">
                      {s.rank}
                    </td>
                    <td className="py-2.5 px-2">
                      <Link
                        href={`/vinoteca/${s.slug}`}
                        className="text-ink hover:text-cobalt font-medium"
                      >
                        {s.name}
                      </Link>
                      {first && (
                        <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide bg-mustard/35 text-ink whitespace-nowrap">
                          ★ La más barata
                        </span>
                      )}
                      <div className="sm:hidden text-xs text-graphite tabular-nums mt-0.5">
                        mejor precio en {nf.format(s.bestPriceCount)}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap">
                      <IndexChip index={s.index as number} />
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-ink">
                      {nf.format(s.comparableCount)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-ink hidden sm:table-cell">
                      {nf.format(s.bestPriceCount)}{" "}
                      <span className="text-graphite">
                        vino{s.bestPriceCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="py-1.5 pl-2 pr-3 text-right hidden sm:table-cell">
                      <StoreLink s={s} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {small.length > 0 && (
          <section className="mt-14">
            <h2 className="display text-2xl font-semibold text-ink">
              Muestra chica
            </h2>
            <p className="text-graphite text-sm mt-1 mb-4 max-w-3xl">
              {nf.format(small.length)} vinotecas con menos de {MIN_SAMPLE} vinos
              comparables: catálogos chicos, muy de nicho o con poco solapamiento
              con el resto. No entran al ranking porque el número no sería
              defendible, pero tienen su página con precios.
            </p>
            <div className="overflow-x-auto -mx-4 lg:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider text-graphite border-b border-ink/10">
                    <th className="py-2 px-4 font-semibold">Vinoteca</th>
                    <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                      <span className="sm:hidden">Vinos</span>
                      <span className="hidden sm:inline">Comparables</span>
                    </th>
                    <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                      Relevados
                    </th>
                    <th className="py-2 pl-2 pr-4 font-semibold text-right hidden sm:table-cell">
                      <span className="sr-only">Tienda</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {small.map((s) => (
                    <tr
                      key={s.slug}
                      data-search={s.name.toLowerCase()}
                      className="border-b border-ink/5 hover:bg-snow/50 transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <Link
                          href={`/vinoteca/${s.slug}`}
                          className="text-ink hover:text-cobalt font-medium"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-ink">
                        {nf.format(s.comparableCount)}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-ink">
                        {nf.format(s.totalWines)}
                      </td>
                      <td className="py-1.5 pl-2 pr-3 text-right hidden sm:table-cell">
                        <StoreLink s={s} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {stale.length > 0 && (
          <section className="mt-14">
            <h2 className="display text-2xl font-semibold text-ink">
              Sin movimiento de precios
            </h2>
            <p className="text-graphite text-sm mt-1 mb-4 max-w-3xl">
              {nf.format(stale.length)} vinotecas que no cambiaron ni un precio en
              los últimos {STALE_DAYS} días. Con la inflación que hay, eso no es
              estabilidad: es un catálogo que quedó sin actualizar. Sus precios
              se muestran en las fichas como &ldquo;sin actualizar&rdquo; y no
              entran al ranking hasta que vuelvan a moverse.
            </p>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              {stale.map((s) => (
                <li key={s.slug} className="flex items-baseline justify-between gap-3 min-h-10 border-b border-ink/5 py-2">
                  <Link href={`/vinoteca/${s.slug}`} className="text-ink hover:text-cobalt font-medium truncate">
                    {s.name}
                  </Link>
                  <span className="text-xs text-graphite shrink-0">
                    último cambio {fechaCorta(s.lastPriceChange)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="metodologia" className="mt-14 postcard p-6 md:p-8 max-w-3xl">
          <p className="text-terracota text-xs tracking-[0.2em] uppercase font-semibold mb-3">
            Metodología
          </p>
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Cómo se calcula el índice
          </h2>
          <ul className="text-sm text-graphite leading-relaxed space-y-2 list-disc pl-5">
            <li>
              Precios relevados una vez por día en cada vinoteca, sin envío.
              Solo botella de 750 ml suelta: cajas, estuches, magnums y
              medias botellas quedan afuera.
            </li>
            <li>
              Entran las fichas donde compiten al menos {MIN_STORES_PER_WINE}{" "}
              vinotecas con stock. Por vinoteca y ficha se toma su precio más
              bajo.
            </li>
            <li>
              El precio de cada vinoteca se divide por la mediana de esa ficha.
              El índice es la mediana de todos esos cocientes: un precio mal
              cargado o una oferta puntual no lo mueve.
            </li>
            <li>
              Publicamos el índice con {MIN_SAMPLE} o más vinos comparables.
              &quot;Mejor precio en N vinos&quot; cuenta las fichas donde la
              vinoteca tiene el precio más bajo; los empates cuentan.
            </li>
            <li>
              No vendemos vino ni cobramos comisión. Confirmá el precio en la
              vinoteca antes de comprar: puede haber cambiado desde el último
              relevamiento.
            </li>
          </ul>
          <p className="text-sm text-graphite mt-5">
            ¿Tenés una vinoteca?{" "}
            <Link href="/sumate" className="text-cobalt hover:underline">
              Sumala al relevamiento
            </Link>{" "}
            o, si ya está, pedí tu badge en su página.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
