import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WineImage } from "@/components/WineImage";
import { displayWineName } from "@/lib/displayWineName";
import { readPriceDrops, type PriceDrop } from "@/lib/priceDrops";
import { monthLows, type MonthLow } from "@/lib/monthLows";
import { displayBrand, formatArs, storeName } from "@/lib/snapshot";
import { brandedName } from "@/lib/brandedName";

const SITE = "https://vinndex.com.ar";

/**
 * /ofertas — lo que bajó de precio HOY, en una sola página que se pueda
 * reenviar por WhatsApp. El home muestra 4 bajas; acá van todas, más los
 * vinos que hoy están en su precio más bajo del mes.
 *
 * Es una página de captación: "ofertas de vino", "descuentos vino
 * online" son búsquedas con intención de compra, y un listado que cambia
 * todos los días le da a Google (y a la gente) un motivo para volver.
 */

function pct(drop: PriceDrop): number {
  return Math.round(drop.dropPct * 100);
}

function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "hoy";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00-03:00`);
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const report = await readPriceDrops();
  const drops = report?.drops ?? [];
  const max = drops.length ? Math.max(...drops.map(pct)) : 0;
  const title = drops.length
    ? `Vinos que bajaron de precio hoy: ${drops.length} ofertas, hasta ${max}% menos · Vinndex`
    : "Vinos que bajaron de precio hoy · Vinndex";
  const description = drops.length
    ? `${drops.length} vinos que hoy cuestan menos que la semana pasada en la misma vinoteca online, y los que están en su precio más bajo del mes. Actualizado el ${fechaLarga(report?.snapshotGeneratedAt)}.`
    : "Bajas de precio de vinos en vinotecas online de Argentina, actualizadas todos los días.";
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/ofertas` },
    openGraph: {
      title,
      description,
      url: `${SITE}/ofertas`,
      siteName: "Vinndex",
      type: "website",
      locale: "es_AR",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function whatsappHref(drops: PriceDrop[], generatedAt: string | null | undefined): string {
  const lines = drops.slice(0, 6).map(
    (d) =>
      `- ${brandedName(d.brand, d.canonicalName)}: ${formatArs(d.currentPrice)} en ${storeName(d.storeSlug)}, ${pct(d)}% menos`,
  );
  const text = [
    `Vinos que bajaron de precio hoy (${fechaLarga(generatedAt)}), según Vinndex:`,
    ...lines,
    `Todas las bajas: ${SITE}/ofertas`,
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export default async function OfertasPage() {
  const report = await readPriceDrops();
  const drops = report?.drops ?? [];
  const lows = monthLows(30);
  const fecha = fechaLarga(report?.snapshotGeneratedAt);
  const dropSlugs = new Set(drops.map((d) => d.slug));
  // Un vino que ya está en las bajas del día no se repite en los mínimos.
  const lowsShown = lows.filter((l) => !dropSlugs.has(l.slug)).slice(0, 30);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Vinos que bajaron de precio el ${fecha}`,
    numberOfItems: drops.length,
    itemListElement: drops.slice(0, 50).map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE}/vino/${d.slug}`,
      name: brandedName(d.brand, d.canonicalName),
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
      { "@type": "ListItem", position: 2, name: "Ofertas", item: `${SITE}/ofertas` },
    ],
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
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
            <span>Ofertas</span>
          </div>
          <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-4">
            Bajas de precio · {fecha}
          </p>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Vinos que bajaron de precio{" "}
            <span className="italic font-normal">hoy.</span>
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            {drops.length > 0 ? (
              <>
                <strong className="text-ink">{drops.length} vinos</strong> cuestan
                hoy menos que la semana pasada en la misma vinoteca online, y
                abajo van los que están en su precio más bajo del mes. Botella
                de 750 con stock; nada de cajas ni magnums.
              </>
            ) : (
              <>Hoy no detectamos bajas de precio. El relevamiento se repite todas las mañanas.</>
            )}
          </p>
          {drops.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={whatsappHref(drops, report?.snapshotGeneratedAt)}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-wine inline-flex items-center gap-2 min-h-11 bg-green2 text-snow font-semibold px-5 py-2.5 rounded-full text-sm hover:opacity-90 transition-opacity"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
                </svg>
                Reenviar por WhatsApp
              </a>
              <span className="text-xs text-graphite">
                Manda las {Math.min(6, drops.length)} bajas más grandes con el link a esta página.
              </span>
            </div>
          )}
          <p className="text-xs text-graphite mt-6">
            Comparamos el precio de hoy con la mediana de los últimos 7 días en
            esa misma vinoteca · Sin patrocinios · Precios relevados una vez por día
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        {drops.length > 0 && (
          <section aria-labelledby="bajas-hoy">
            <h2 id="bajas-hoy" className="display text-2xl md:text-3xl font-semibold text-ink mb-6">
              Las bajas de hoy
            </h2>
            <ol className="space-y-3">
              {drops.map((d, i) => (
                <li key={`${d.slug}-${d.storeSlug}`}>
                  <Link
                    href={`/vino/${d.slug}`}
                    className="block bg-white rounded-2xl border border-ink/10 hover:border-cobalt transition-colors p-3 sm:p-4 grid grid-cols-[24px_48px_minmax(0,1fr)_auto] sm:grid-cols-[48px_72px_minmax(0,1fr)_auto] gap-3 sm:gap-4 items-center"
                  >
                    <span className="display text-lg sm:text-3xl font-semibold text-cobalt/60 text-center tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="relative w-12 h-[72px] sm:w-16 sm:h-24 bg-snow rounded-lg overflow-hidden">
                      <WineImage
                        src={d.imageUrl}
                        name={d.canonicalName}
                        brand={d.brand}
                        fill
                        sizes="64px"
                        className="object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-graphite truncate">
                        {displayBrand(d.brand) || "Sin bodega identificada"}
                      </p>
                      <p className="display text-base sm:text-lg md:text-xl font-semibold text-ink leading-tight line-clamp-2">
                        {displayWineName(d.canonicalName)}
                      </p>
                      <p className="mt-1 text-xs text-graphite line-clamp-2">
                        {`en ${storeName(d.storeSlug)} · antes ~${formatArs(d.medianPrice7d)} · ${d.storeCount} vinoteca${d.storeCount === 1 ? "" : "s"} lo venden`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="display text-lg sm:text-xl md:text-2xl font-semibold text-cobalt tabular-nums whitespace-nowrap">
                        {formatArs(d.currentPrice)}
                      </p>
                      <p className="mt-0.5 inline-block text-xs font-semibold text-terracota bg-terracota/15 rounded-full px-2 py-0.5 tabular-nums">
                        −{pct(d)}%
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {lowsShown.length > 0 && (
          <section aria-labelledby="minimos-mes" className="mt-16 pt-10 border-t border-ink/10">
            <h2 id="minimos-mes" className="display text-2xl md:text-3xl font-semibold text-ink mb-2">
              En su precio más bajo del mes
            </h2>
            <p className="text-graphite mb-6 max-w-3xl">
              Vinos con 3 o más vinotecas cuyo mejor precio de hoy es el más
              bajo de los últimos 30 días. No es una baja de un día: es el
              momento más barato del mes para comprarlos.
            </p>
            <ol className="space-y-3">
              {lowsShown.map((l: MonthLow) => (
                <li key={l.slug}>
                  <Link
                    href={`/vino/${l.slug}`}
                    className="block bg-white rounded-2xl border border-ink/10 hover:border-cobalt transition-colors p-3 sm:p-4 grid grid-cols-[48px_minmax(0,1fr)_auto] sm:grid-cols-[72px_minmax(0,1fr)_auto] gap-3 sm:gap-4 items-center"
                  >
                    <div className="relative w-12 h-[72px] sm:w-16 sm:h-24 bg-snow rounded-lg overflow-hidden">
                      <WineImage
                        src={l.imageUrl}
                        name={l.canonicalName}
                        brand={l.brand}
                        fill
                        sizes="64px"
                        className="object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-graphite truncate">
                        {displayBrand(l.brand) || "Sin bodega identificada"}
                      </p>
                      <p className="display text-base sm:text-lg md:text-xl font-semibold text-ink leading-tight line-clamp-2">
                        {displayWineName(l.canonicalName)}
                      </p>
                      <p className="mt-1 text-xs text-graphite line-clamp-2">
                        {`mínimo anterior del mes ${formatArs(l.previousMin)} · ${l.storeCount} vinotecas`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="display text-lg sm:text-xl md:text-2xl font-semibold text-cobalt tabular-nums whitespace-nowrap">
                        {formatArs(l.minPrice)}
                      </p>
                      <p className="mt-0.5 inline-block text-xs font-semibold text-green2 bg-green2/10 rounded-full px-2 py-0.5 tabular-nums">
                        mínimo del mes
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mt-16 pt-10 border-t border-ink/10 grid md:grid-cols-2 gap-8 max-w-4xl">
          <div>
            <h2 className="display text-xl font-semibold text-ink mb-3">
              Cómo detectamos una baja
            </h2>
            <p className="text-graphite leading-relaxed text-sm">
              Relevamos los precios de {report ? "más de 100" : "las"} vinotecas
              online una vez por día. Una oferta cuenta como baja cuando el
              precio de hoy está al menos un{" "}
              {Math.round((report?.threshold ?? 0.15) * 100)}% por debajo de la
              mediana de los últimos 7 días en esa misma vinoteca. Descartamos
              precios sospechosos (errores de carga, cajas, magnums) para que
              una baja sea una baja de verdad.
            </p>
          </div>
          <div>
            <h2 className="display text-xl font-semibold text-ink mb-3">
              Guardá tus vinos y enterate primero
            </h2>
            <p className="text-graphite leading-relaxed text-sm">
              Si marcás un vino como favorito, el home te avisa cuando baja de
              precio.{" "}
              <Link href="/favoritos" className="text-cobalt underline hover:no-underline">
                Ver mis favoritos
              </Link>
              . Y si querés mirar todo el mercado de un vistazo, los{" "}
              <Link href="/ranking" className="text-cobalt underline hover:no-underline">
                rankings
              </Link>{" "}
              se actualizan con el mismo snapshot.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
