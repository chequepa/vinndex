import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import storesConfig from "@/data/stores.json";
import { formatArs, snapshot } from "@/lib/snapshot";
import {
  storeIndex,
  rankedStoreCount,
  describeIndex,
  formatIndexPct,
  indexTone,
  MIN_SAMPLE,
  MIN_STORES_PER_WINE,
  MIN_INDEXABLE_WINES,
  type StoreIndex,
} from "@/lib/storeIndex";
import { storeInitials, colorForStore } from "@/lib/storeVisual";

type Params = { params: Promise<{ slug: string }> };

const SITE = "https://vinndex.com.ar";

// Una página por tienda del config. Un slug que no está en
// data/stores.json es 404 directo (dynamicParams=false); una tienda del
// config sin ofertas vivas en el snapshot cae en notFound() más abajo.
export const dynamicParams = false;

export function generateStaticParams() {
  return (storesConfig as { slug: string }[]).map((s) => ({ slug: s.slug }));
}

const nf = new Intl.NumberFormat("es-AR");

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Frase corta del índice para title/description/hero. */
function indexPhrase(s: StoreIndex): string {
  if (s.index === null) {
    return `muestra chica: ${nf.format(s.comparableCount)} ${plural(s.comparableCount, "vino comparable", "vinos comparables")}`;
  }
  return describeIndex(s.index);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const s = storeIndex(slug);
  if (!s) return { title: "Vinoteca no encontrada · Vinndex" };
  const wines = `${nf.format(s.totalWines)} ${plural(s.totalWines, "vino", "vinos")}`;
  const title =
    s.index !== null
      ? `Precios de ${s.name}: ${wines}, ${describeIndex(s.index)} · Vinndex`
      : `Precios de ${s.name}: ${wines} relevados · Vinndex`;
  const description =
    s.index !== null
      ? `${s.name} en el índice Vinndex de vinotecas: ${describeIndex(s.index)} sobre ${nf.format(s.comparableCount)} vinos comparables, mejor precio en ${nf.format(s.bestPriceCount)}. ${wines} relevados a diario.`
      : `${s.name} en Vinndex: ${wines} relevados a diario, ${nf.format(s.comparableCount)} comparables con otras vinotecas${s.bestPriceCount > 0 ? `, mejor precio en ${nf.format(s.bestPriceCount)}` : ""}. Todavía sin índice: hace falta más solapamiento con el resto del mercado.`;
  const thin = s.totalWines < MIN_INDEXABLE_WINES;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/vinoteca/${slug}` },
    robots: thin ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `${s.name} en Vinndex`,
      description:
        s.index !== null
          ? `${describeIndex(s.index)} · mejor precio en ${nf.format(s.bestPriceCount)} vinos`
          : `${wines} relevados · ${nf.format(s.comparableCount)} comparables`,
      url: `${SITE}/vinoteca/${slug}`,
      type: "website",
      locale: "es_AR",
      siteName: "Vinndex",
    },
    twitter: {
      card: "summary",
      title: `${s.name} en Vinndex`,
      description: `${indexPhrase(s)} · ${wines} relevados`,
    },
  };
}

const TONE_TEXT = {
  below: "text-green2",
  neutral: "text-ink",
  above: "text-terracota",
} as const;

const TONE_BAR = {
  below: "bg-green2",
  neutral: "bg-ink",
  above: "bg-terracota",
} as const;

function ExternalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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

export default async function VinotecaPage({ params }: Params) {
  const { slug } = await params;
  const s = storeIndex(slug);
  if (!s) notFound();

  const ranked = rankedStoreCount();
  const tone = s.index !== null ? indexTone(s.index) : "neutral";
  const updated = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(snapshot.generatedAt));
  const badgeUrl = `${SITE}/api/badge/${s.slug}.svg`;
  const badgeAlt =
    s.bestPriceCount > 0
      ? `${s.name}: mejor precio en ${nf.format(s.bestPriceCount)} vinos según Vinndex`
      : `${s.name}: precios comparados en Vinndex`;
  const embedHtml = `<a href="${SITE}/vinoteca/${s.slug}"><img src="${badgeUrl}" alt="${badgeAlt}" width="220" height="48"></a>`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
      { "@type": "ListItem", position: 2, name: "Vinotecas", item: `${SITE}/vinotecas` },
      { "@type": "ListItem", position: 3, name: s.name, item: `${SITE}/vinoteca/${slug}` },
    ],
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/vinotecas" className="hover:text-ink">
              Vinotecas
            </Link>
            <span>/</span>
            <span className="truncate">{s.name}</span>
          </div>

          <div className="flex items-start gap-4 sm:gap-5">
            <div
              className="store-logo shrink-0 !w-16 !h-16 !text-xl"
              style={{ background: colorForStore(s.slug) }}
              aria-hidden="true"
            >
              {storeInitials(s.name)}
            </div>
            <div className="min-w-0">
              <p className="text-terracota text-xs tracking-[0.2em] uppercase font-semibold mb-2">
                {s.rank !== null
                  ? `#${s.rank} de ${ranked} en el índice · ${updated}`
                  : `Índice Vinndex · ${updated}`}
              </p>
              <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] break-words">
                {s.name}
              </h1>
            </div>
          </div>

          <p
            className={`display text-2xl md:text-4xl font-semibold mt-6 leading-tight ${TONE_TEXT[tone]}`}
          >
            {s.index !== null ? (
              describeIndex(s.index)
            ) : (
              <>
                Muestra chica:{" "}
                <span className="tabular-nums">{nf.format(s.comparableCount)}</span>{" "}
                {plural(s.comparableCount, "vino comparable", "vinos comparables")}
              </>
            )}
          </p>
          <p className="text-graphite text-base md:text-lg mt-3 max-w-2xl">
            {s.index !== null ? (
              <>
                Índice{" "}
                <span className="font-semibold text-ink tabular-nums">
                  {s.index.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>{" "}
                ({formatIndexPct(s.index)}) sobre{" "}
                <span className="font-semibold text-ink tabular-nums">
                  {nf.format(s.comparableCount)}
                </span>{" "}
                vinos que también venden otras {MIN_STORES_PER_WINE - 1} o más
                vinotecas.
              </>
            ) : (
              <>
                Publicamos el índice a partir de {MIN_SAMPLE} vinos comparables.
                Hasta entonces, acá van sus precios y dónde gana.
              </>
            )}{" "}
            <span className="font-semibold text-ink tabular-nums">
              {nf.format(s.totalWines)}
            </span>{" "}
            {plural(s.totalWines, "vino relevado", "vinos relevados")} · mejor precio en{" "}
            <span className="font-semibold text-ink tabular-nums">
              {nf.format(s.bestPriceCount)}
            </span>
            .
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={s.baseUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="cursor-wine inline-flex items-center gap-2 bg-cobalt text-snow hover:bg-ink rounded-full px-6 py-3 text-sm font-semibold transition-colors"
            >
              Ir a la tienda <ExternalIcon />
            </a>
            <Link
              href="/vinotecas"
              className="cursor-wine inline-flex items-center gap-2 border border-ink/20 text-ink hover:border-cobalt hover:text-cobalt rounded-full px-6 py-3 text-sm font-semibold transition-colors"
            >
              Ver el ranking completo
            </Link>
          </div>
        </div>
      </section>

      <main id="contenido" className="max-w-6xl mx-auto px-4 lg:px-8 py-10 lg:py-14 space-y-14">
        <section>
          <p className="text-gold text-xs tracking-[0.2em] uppercase font-semibold mb-2">
            Mejor precio
          </p>
          <h2 className="display text-2xl md:text-3xl font-semibold text-ink">
            Sus mejores precios hoy
          </h2>
          {s.bestDeals.length > 0 ? (
            <>
              <p className="text-graphite text-sm mt-1 mb-6">
                Fichas donde {s.name} tiene el precio más bajo entre{" "}
                {MIN_STORES_PER_WINE} o más vinotecas, ordenadas por ahorro
                contra la mediana del mercado.
              </p>
              <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
                {s.bestDeals.map((d) => (
                  <li
                    key={d.slug}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-ink/5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/vino/${d.slug}`}
                        className="font-medium text-ink hover:text-cobalt line-clamp-2 leading-snug"
                      >
                        {d.name}
                      </Link>
                      <div className="text-xs text-graphite tabular-nums mt-0.5">
                        mediana del mercado {formatArs(d.medianArs)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="display text-lg font-semibold text-cobalt tabular-nums leading-tight">
                        {formatArs(d.priceArs)}
                      </div>
                      <span className="tag tag-green tabular-nums">-{d.savingPct}%</span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-graphite text-sm mt-1 max-w-2xl">
              Hoy no tiene el precio más bajo en ninguna ficha con{" "}
              {MIN_STORES_PER_WINE} o más vinotecas
              {s.comparableCount > 0
                ? ` (compite en ${nf.format(s.comparableCount)}).`
                : ". Sus vinos todavía no se solapan con los de otras tiendas relevadas."}
            </p>
          )}
        </section>

        <section>
          <p className="text-terracota text-xs tracking-[0.2em] uppercase font-semibold mb-2">
            Por rango de precio
          </p>
          <h2 className="display text-2xl md:text-3xl font-semibold text-ink">
            Dónde gana
          </h2>
          <p className="text-graphite text-sm mt-1 mb-6 max-w-2xl">
            En qué porcentaje de los vinos donde compite tiene el mejor precio,
            según el precio de mercado de cada vino.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {s.cheapestShareByBand.map((b) => (
              <div key={b.key} className="postcard p-5">
                <div className="text-xs text-graphite uppercase tracking-wider font-semibold">
                  {b.label}
                </div>
                {b.sharePct !== null ? (
                  <>
                    <div className="display text-3xl font-semibold text-ink tabular-nums mt-2">
                      {b.sharePct}%
                    </div>
                    <div
                      className="mt-3 h-1.5 rounded-full bg-ink/10 overflow-hidden"
                      role="img"
                      aria-label={`${b.sharePct}% de ${b.competed} vinos`}
                    >
                      <div
                        className={`h-full rounded-full ${TONE_BAR[tone]}`}
                        style={{ width: `${b.sharePct}%` }}
                      />
                    </div>
                    <div className="text-xs text-graphite tabular-nums mt-2">
                      mejor precio en {nf.format(b.best)} de {nf.format(b.competed)}{" "}
                      {plural(b.competed, "vino", "vinos")}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-graphite mt-2">
                    No compite en este rango.
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section id="badge">
          <p className="text-cobalt text-xs tracking-[0.2em] uppercase font-semibold mb-2">
            Para vinotecas
          </p>
          <h2 className="display text-2xl md:text-3xl font-semibold text-ink">
            Badge para tu sitio
          </h2>
          <p className="text-graphite text-sm mt-1 mb-6 max-w-2xl">
            Si tu vinoteca está entre las más baratas, contalo. El badge se
            actualiza solo con cada relevamiento y linkea a esta página.
          </p>
          <div className="grid md:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
            <div className="postcard p-6 inline-flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/badge/${s.slug}.svg`}
                alt={badgeAlt}
                width={220}
                height={48}
              />
            </div>
            <div>
              <label className="block text-xs text-graphite uppercase tracking-wider font-semibold mb-2">
                Código para pegar
                <textarea
                  readOnly
                  rows={3}
                  value={embedHtml}
                  className="mt-2 w-full bg-snow border border-ink/15 rounded-2xl px-4 py-3 text-xs text-ink font-mono normal-case tracking-normal font-normal leading-relaxed resize-none focus:border-cobalt outline-none"
                />
              </label>
              <p className="text-xs text-graphite">
                Copiá el código y pegalo en tu web o en tu tienda. Si todavía
                no relevamos tu vinoteca,{" "}
                <Link href="/sumate" className="text-cobalt hover:underline">
                  sumate
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="postcard p-6 md:p-8 max-w-3xl">
          <h2 className="display text-xl font-semibold text-ink mb-3">
            Cómo se calcula
          </h2>
          <p className="text-sm text-graphite leading-relaxed">
            Precios relevados una vez por día, sin envío, solo botella de 750
            ml suelta. Cada precio de {s.name} se divide por la mediana de la
            misma ficha entre las vinotecas que la tienen con stock (mínimo{" "}
            {MIN_STORES_PER_WINE}); el índice es la mediana de esos cocientes y
            se publica con {MIN_SAMPLE} o más vinos comparables.{" "}
            <Link href="/vinotecas#metodologia" className="text-cobalt hover:underline">
              Metodología completa
            </Link>
            . Confirmá el precio en la vinoteca antes de comprar.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
