import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WineImage } from "@/components/WineImage";
import { displayWineName } from "@/lib/displayWineName";
import { displayBrand, formatArs, snapshot, storeName } from "@/lib/snapshot";
import { brandedName } from "@/lib/brandedName";
import { alertsEnabled } from "@/lib/alerts";
import {
  gems,
  storeContext,
  GEM_MIN_DISCOUNT,
  GEM_MIN_REFERENCE,
  GEM_MIN_STORES,
  GEM_TIER_LABELS,
  type Gem,
  type GemTier,
} from "@/lib/gems";

const SITE = "https://vinndex.com.ar";

/**
 * /joyitas — vinos de alta gama que una vinoteca vende muy por debajo del
 * resto del mercado. Complementa a /ofertas (bajas contra el pasado del
 * mismo vino) con la otra mitad de la pregunta: ¿alguien lo tiene mucho
 * más barato que todos los demás? Regla en lib/gems.ts.
 */

function pct(g: Gem): number {
  return Math.round(g.discount * 100);
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
  const list = gems();
  const max = list.length ? Math.max(...list.map(pct)) : 0;
  const title = list.length
    ? `Joyitas: ${list.length} vinos de alta gama hasta ${max}% más baratos que en el resto · Vinndex`
    : "Joyitas: vinos de alta gama a precio de oportunidad · Vinndex";
  const description = `Vinos de más de ${formatArs(GEM_MIN_REFERENCE)} que una vinoteca online vende muy por debajo de lo que lo cobran las demás. Comparamos ${GEM_MIN_STORES}+ vinotecas por vino. Actualizado el ${fechaLarga(snapshot.generatedAt)}.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/joyitas` },
    openGraph: {
      title,
      description,
      url: `${SITE}/joyitas`,
      siteName: "Vinndex",
      type: "website",
      locale: "es_AR",
      images: ["/opengraph-image"],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function whatsappHref(list: Gem[]): string {
  const lines = list.slice(0, 6).map(
    (g) =>
      `- ${brandedName(g.brand, g.canonicalName)}: ${formatArs(g.price)} en ${storeName(g.storeSlug)} (el resto lo cobra ~${formatArs(g.reference)})`,
  );
  const text = [
    `Joyitas de hoy en Vinndex — vinos de alta gama muy por debajo del mercado:`,
    ...lines,
    `Todas: ${SITE}/joyitas`,
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

const TIERS: GemTier[] = ["100k+", "50-100k", "25-50k"];

export default function JoyitasPage() {
  const list = gems();
  const fecha = fechaLarga(snapshot.generatedAt);
  const nuevas = list.filter((g) => g.isNew);
  const byTier = new Map<GemTier, Gem[]>();
  for (const t of TIERS) byTier.set(t, []);
  for (const g of list) byTier.get(g.tier)!.push(g);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Joyitas de vino al ${fecha}`,
    numberOfItems: list.length,
    itemListElement: list.slice(0, 50).map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE}/vino/${g.slug}`,
      name: brandedName(g.brand, g.canonicalName),
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
      { "@type": "ListItem", position: 2, name: "Joyitas", item: `${SITE}/joyitas` },
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

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Joyitas</span>
          </div>
          <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-4">
            Alta gama a precio de oportunidad · {fecha}
          </p>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Joyitas: el mismo vino,{" "}
            <span className="italic font-normal">mucho más barato</span> en
            una vinoteca.
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            {list.length > 0 ? (
              <>
                <strong className="text-ink">{list.length} vinos</strong> que
                el resto del mercado cobra más de {formatArs(GEM_MIN_REFERENCE)}{" "}
                y que hoy una vinoteca vende al menos un{" "}
                {Math.round(GEM_MIN_DISCOUNT * 100)}% más barato.
                {nuevas.length > 0 && (
                  <>
                    {" "}
                    <strong className="text-ink">{nuevas.length}</strong>{" "}
                    aparecieron en los últimos días.
                  </>
                )}
              </>
            ) : (
              <>Hoy no encontramos joyitas. Revisamos los precios todas las mañanas.</>
            )}
          </p>
          {list.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={whatsappHref(list)}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-wine inline-flex items-center gap-2 min-h-11 bg-green2 text-snow font-semibold px-5 py-2.5 rounded-full text-sm hover:opacity-90 transition-opacity"
              >
                Reenviar por WhatsApp
              </a>
              <nav aria-label="Rangos de precio" className="flex flex-wrap gap-2">
                {TIERS.filter((t) => byTier.get(t)!.length > 0).map((t) => (
                  <a
                    key={t}
                    href={`#rango-${t}`}
                    className="inline-flex items-center min-h-11 px-4 rounded-full border border-ink/15 bg-white text-sm text-ink hover:border-cobalt hover:text-cobalt"
                  >
                    {GEM_TIER_LABELS[t]}{" "}
                    <span className="ml-1.5 text-graphite text-xs tabular-nums">
                      {byTier.get(t)!.length}
                    </span>
                  </a>
                ))}
              </nav>
            </div>
          )}
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        {TIERS.map((t) => {
          const items = byTier.get(t)!;
          if (items.length === 0) return null;
          return (
            <section
              key={t}
              id={`rango-${t}`}
              aria-labelledby={`h-${t}`}
              className="mb-14 scroll-mt-24"
            >
              <h2 id={`h-${t}`} className="display text-2xl md:text-3xl font-semibold text-ink mb-6">
                <span className="block text-[11px] font-sans uppercase tracking-[0.18em] text-graphite font-semibold mb-1">
                  Vinos que el resto cobra
                </span>
                {GEM_TIER_LABELS[t]}
                <span className="text-graphite text-base font-normal ml-2">
                  {items.length}
                </span>
              </h2>
              <ol className="space-y-3">
                {items.map((g) => (
                  <li key={g.slug}>
                    <GemRow gem={g} />
                  </li>
                ))}
              </ol>
            </section>
          );
        })}

        <section className="mt-16 pt-10 border-t border-ink/10 grid md:grid-cols-2 gap-8 max-w-4xl">
          <div>
            <h2 className="display text-xl font-semibold text-ink mb-3">
              Qué es una joyita
            </h2>
            <p className="text-graphite leading-relaxed text-sm">
              Un vino que al menos {GEM_MIN_STORES} vinotecas venden online,
              cuya mediana de precio en el resto es de{" "}
              {formatArs(GEM_MIN_REFERENCE)} o más, y que una vinoteca tiene
              un {Math.round(GEM_MIN_DISCOUNT * 100)}% o más por debajo de esa
              mediana — y también claramente por debajo de la segunda más
              barata. Si la vinoteca ya es barata en todo, le pedimos que esté
              bastante más abajo que su costumbre. Botella de 750 ml con
              stock, misma añada; nada de cajas, magnums ni precios
              sospechosos.
            </p>
          </div>
          <div>
            <h2 className="display text-xl font-semibold text-ink mb-3">
              ¿Y lo que bajó esta semana?
            </h2>
            <p className="text-graphite leading-relaxed text-sm">
              {alertsEnabled() && (
                <>
                  En cada ficha podés pedir que te avisemos por mail cuando el
                  vino baje de precio.{" "}
                </>
              )}
              Lo que bajó respecto de la semana pasada en la misma vinoteca
              está en{" "}
              <Link href="/ofertas" className="text-cobalt underline hover:no-underline">
                ofertas
              </Link>
              . Las vinotecas más baratas en general, en el{" "}
              <Link href="/vinotecas" className="text-cobalt underline hover:no-underline">
                índice de vinotecas
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function GemRow({ gem: g }: { gem: Gem }) {
  const ctx = storeContext(g);
  return (
    <div className="bg-white rounded-2xl border border-ink/10 hover:border-cobalt transition-colors p-3 sm:p-4 grid grid-cols-[48px_minmax(0,1fr)_auto] sm:grid-cols-[72px_minmax(0,1fr)_auto] gap-3 sm:gap-4 items-center relative">
      <div className="relative w-12 h-[72px] sm:w-16 sm:h-24 bg-snow rounded-lg overflow-hidden">
        <WineImage
          src={g.imageUrl}
          name={g.canonicalName}
          brand={g.brand}
          fill
          sizes="64px"
          className="object-contain"
        />
      </div>
      <div className="min-w-0">
        {g.isNew && (
          <span className="inline-block mb-1 text-[11px] font-semibold text-malbec bg-malbec/10 rounded-full px-2 py-0.5">
            Nueva · apareció en los últimos días
          </span>
        )}
        <p className="text-xs uppercase tracking-wide text-graphite truncate">
          {displayBrand(g.brand) || "Sin bodega identificada"}
        </p>
        <Link
          href={`/vino/${g.slug}`}
          className="display text-base sm:text-lg md:text-xl font-semibold text-ink leading-tight line-clamp-2 after:absolute after:inset-0"
        >
          {displayWineName(g.canonicalName)}
        </Link>
        <p className="mt-1 text-xs text-graphite line-clamp-2">
          en <strong className="text-ink font-semibold">{storeName(g.storeSlug)}</strong>
          {" · "}las otras {g.storeCount - 1} lo cobran entre {formatArs(g.othersMin)} y{" "}
          {formatArs(g.othersMax)}
          {ctx && <> · {ctx}</>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="display text-lg sm:text-xl md:text-2xl font-semibold text-cobalt tabular-nums whitespace-nowrap">
          {formatArs(g.price)}
        </p>
        <p className="mt-0.5 inline-block text-xs font-semibold text-terracota bg-terracota/15 rounded-full px-2 py-0.5 tabular-nums">
          −{pct(g)}% vs. el resto
        </p>
        <p className="mt-1 text-[11px] text-graphite tabular-nums">
          ahorrás ~{formatArs(g.savingArs)}
        </p>
      </div>
    </div>
  );
}
