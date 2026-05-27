import { SearchInput } from "@/components/SearchInput";
import Image from "next/image";
import { BottleFallback } from "@/components/BottleFallback";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FavoritesNavLink } from "@/components/Favorites";
import { RecentlyViewedSection } from "@/components/RecentlyViewedSection";
import { HomeFavoriteDrops } from "@/components/HomeFavoriteDrops";
import Link from "next/link";
import {
  snapshotStats,
  topBrands,
  topDeals,
  formatArs,
  displayBrand,
  displayWineName,
  brandSlug,
  varietalPages,
  regionPages,
} from "@/lib/snapshot";
import { readPriceDrops } from "@/lib/priceDrops";

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    return `${k}k+`;
  }
  return String(n);
}

/**
 * Hero bottle · second iteration. More authentic Bordeaux silhouette,
 * wax-drip cap (vintage feel), full editorial label with grape cluster
 * + vine leaf, "VINNDEX MENDOZA · ARGENTINA" + EST 2026 stamp, glass
 * refraction lines on the body. Hidden below lg breakpoint.
 */
function HeroBottle() {
  return (
    <svg
      viewBox="0 0 240 560"
      className="w-[270px] xl:w-[310px] h-auto drop-shadow-[0_36px_60px_rgba(15,30,77,0.5)]"
      role="img"
      aria-label="Ilustración de una botella de vino con etiqueta Vinndex"
    >
      <defs>
        <linearGradient id="bottleBody" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#3A0E1A" />
          <stop offset="0.18" stopColor="#5A1828" />
          <stop offset="0.5" stopColor="#6B1E2E" />
          <stop offset="0.82" stopColor="#5A1828" />
          <stop offset="1" stopColor="#2D0915" />
        </linearGradient>
        <linearGradient id="labelBg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FAF4E8" />
          <stop offset="0.7" stopColor="#F5EDE0" />
          <stop offset="1" stopColor="#EBDFC4" />
        </linearGradient>
        <linearGradient id="waxCap" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7A2235" />
          <stop offset="1" stopColor="#5A1828" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse
        cx="120"
        cy="544"
        rx="92"
        ry="8"
        fill="#0F1E4D"
        opacity="0.4"
      />

      {/* Wax cap with irregular drips at the bottom edge */}
      <path
        d="M 92 14
           Q 90 14 90 16
           L 90 60
           L 94 64
           L 98 60
           L 102 65
           L 106 60
           L 112 66
           L 118 60
           L 124 67
           L 130 60
           L 136 64
           L 142 60
           L 146 64
           L 150 60
           L 150 16
           Q 150 14 148 14
           Z"
        fill="url(#waxCap)"
      />
      {/* Wax highlight */}
      <rect
        x="94"
        y="18"
        width="6"
        height="44"
        fill="#E8B547"
        opacity="0.4"
      />
      {/* Top of wax (slight darker rim) */}
      <rect x="90" y="14" width="60" height="5" fill="#3A0E1A" opacity="0.4" />

      {/* Neck */}
      <rect x="100" y="68" width="40" height="60" fill="url(#bottleBody)" />
      {/* Neck highlight */}
      <rect
        x="104"
        y="70"
        width="3"
        height="56"
        fill="#F5EDE0"
        opacity="0.18"
      />

      {/* Bordeaux shoulder + body · graceful curves instead of sharp Q */}
      <path
        d="M 100 126
           C 98 134, 92 140, 82 154
           C 66 178, 58 204, 58 234
           L 58 512
           Q 58 532, 78 532
           L 162 532
           Q 182 532, 182 512
           L 182 234
           C 182 204, 174 178, 158 154
           C 148 140, 142 134, 140 126
           Z"
        fill="url(#bottleBody)"
      />

      {/* Glass refractions: wide soft highlight + thin sharp one */}
      <path
        d="M 72 234 C 72 210, 76 190, 84 175 L 84 510 Q 70 508, 70 492 Z"
        fill="#F5EDE0"
        opacity="0.1"
      />
      <line
        x1="170"
        y1="260"
        x2="170"
        y2="490"
        stroke="#0F1729"
        strokeWidth="1.5"
        opacity="0.2"
      />

      {/* Label backdrop */}
      <rect
        x="52"
        y="282"
        width="136"
        height="200"
        rx="2"
        fill="url(#labelBg)"
      />
      {/* Top + bottom bands on label */}
      <rect x="52" y="282" width="136" height="3" fill="#6B1E2E" />
      <rect x="52" y="479" width="136" height="3" fill="#6B1E2E" />
      {/* Inner border */}
      <rect
        x="58"
        y="290"
        width="124"
        height="184"
        rx="1"
        fill="none"
        stroke="#6B1E2E"
        strokeWidth="0.5"
        opacity="0.45"
      />

      {/* Grape cluster + vine leaf · focal point of the label */}
      <g transform="translate(120, 318)">
        {/* Vine stem */}
        <path
          d="M 0 -14 Q -2 -22, -10 -24"
          stroke="#3D6B47"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
        {/* Vine leaf */}
        <path
          d="M -10 -24
             Q -16 -28, -20 -22
             Q -22 -16, -16 -14
             Q -12 -12, -10 -16
             Z"
          fill="#3D6B47"
        />
        {/* Grape cluster · 6 berries */}
        <circle cx="0" cy="-8" r="3.6" fill="#6B1E2E" />
        <circle cx="-4.5" cy="-2" r="3.6" fill="#6B1E2E" />
        <circle cx="4.5" cy="-2" r="3.6" fill="#6B1E2E" />
        <circle cx="-2.2" cy="5" r="3.6" fill="#6B1E2E" />
        <circle cx="2.2" cy="5" r="3.6" fill="#6B1E2E" />
        <circle cx="0" cy="12" r="3.6" fill="#6B1E2E" />
        {/* Highlight on top berry */}
        <ellipse
          cx="-1.2"
          cy="-9.5"
          rx="1.2"
          ry="0.8"
          fill="#F5EDE0"
          opacity="0.5"
        />
      </g>

      {/* Brand wordmark */}
      <text
        x="120"
        y="368"
        textAnchor="middle"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="22"
        fontWeight="700"
        letterSpacing="2.5"
        fill="#0F1729"
      >
        VINNDEX
      </text>

      {/* Divider line */}
      <line
        x1="76"
        y1="383"
        x2="164"
        y2="383"
        stroke="#6B1E2E"
        strokeWidth="0.5"
        opacity="0.55"
      />

      {/* Origin */}
      <text
        x="120"
        y="402"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="7.5"
        letterSpacing="3.5"
        fontWeight="600"
        fill="#0F1729"
        opacity="0.78"
      >
        MENDOZA · ARGENTINA
      </text>

      {/* Tagline */}
      <text
        x="120"
        y="427"
        textAnchor="middle"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="10"
        fontStyle="italic"
        fill="#3D0F1C"
        opacity="0.78"
      >
        El comparador de vinos
      </text>

      {/* Vintage stamp */}
      <text
        x="120"
        y="462"
        textAnchor="middle"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="13"
        fontWeight="600"
        letterSpacing="4"
        fill="#6B1E2E"
      >
        EST · 2026
      </text>
    </svg>
  );
}

export default async function Home() {
  const stats = snapshotStats();
  const brands = topBrands(12);
  const deals = topDeals(6);
  const varietals = varietalPages().slice(0, 8);
  const allRegions = regionPages();
  const regions = allRegions.slice(0, 6);
  const findRegion = (name: string) =>
    allRegions.find(
      (r) => r.name.toLowerCase() === name.toLowerCase(),
    ) ?? null;
  const regionUco = findRegion("Valle de Uco");
  const regionLujan = findRegion("Luján de Cuyo");
  // Cafayate no aparece como región en el snapshot · usamos Salta (que la
  // contiene). Cafayate como ciudad icónica queda en el subtítulo del tile.
  const regionSalta = findRegion("Salta");
  const regionPatagonia = findRegion("Patagonia");
  const dropsReport = await readPriceDrops();
  const topDrops = dropsReport?.drops.slice(0, 4) ?? [];

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Vinndex",
    url: "https://vinndex.com.ar",
    logo: "https://vinndex.com.ar/opengraph-image",
    description:
      "Comparador de precios de vinos online en Argentina. Buscás un vino y te mostramos todas las vinotecas que lo venden online, ordenadas por precio.",
    slogan: "Compará precios de vinos online en Argentina",
    areaServed: { "@type": "Country", name: "Argentina" },
    knowsAbout: [
      "Vino argentino",
      "Comparador de precios",
      "Vinotecas online",
      "Malbec",
      "Cabernet Sauvignon",
      "Chardonnay",
      "Bonarda",
      "Mendoza",
      "Valle de Uco",
      "Luján de Cuyo",
    ],
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Vinndex",
    url: "https://vinndex.com.ar",
    inLanguage: "es-AR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate:
          "https://vinndex.com.ar/buscar?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      {/* NAV */}
      <nav className="absolute top-0 left-0 right-0 z-30 px-6 py-5 lg:px-12">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            aria-label="Vinndex · inicio"
            className="flex items-center gap-2 text-snow cursor-wine"
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
                fill="#F5EDE0"
                stroke="#F5EDE0"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="24" cy="8" r="3" fill="#E8B547" />
            </svg>
            <span className="display text-2xl font-semibold tracking-tight">
              Vinndex
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-2">
            <a href="#como-funciona" className="chip">
              Cómo funciona
            </a>
            <a href="#regiones" className="chip">
              Regiones
            </a>
            <a href="#bodegas" className="chip">
              Bodegas
            </a>
          </div>
          <a
            href="/preguntas"
            className="cursor-wine hidden sm:flex items-center gap-2 text-snow text-sm bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur rounded-full px-3 py-1.5 font-medium transition-colors"
            title="Por qué decimos CABA"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 1 0 10 10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Precios en CABA</span>
          </a>
          <FavoritesNavLink className="text-snow shrink-0" />
          <ThemeToggle className="text-snow shrink-0" />
        </div>
      </nav>

      {/* HERO */}
      <main id="contenido">
      <section className="relative nagai-sky min-h-[100dvh] flex items-center overflow-hidden grain">
        {/* Sun — on mobile sits as a corner ornament (no collision with the
            headline); on desktop expands behind the bottle illustration. */}
        <div className="absolute top-[5%] -right-10 lg:top-[18%] lg:right-[15%] float pointer-events-none">
          <div
            className="w-24 h-24 lg:w-48 lg:h-48 rounded-full opacity-80 lg:opacity-100"
            style={{
              background:
                "radial-gradient(circle at 40% 40%, #F5EDE0 0%, #E8B547 45%, #D97449 100%)",
              boxShadow: "0 0 120px 30px rgba(232, 181, 71, 0.45)",
            }}
          />
        </div>

        {/* Mountain silhouettes at bottom */}
        <svg
          className="absolute bottom-0 left-0 w-full pointer-events-none"
          viewBox="0 0 1440 520"
          preserveAspectRatio="none"
          style={{ height: "65vh" }}
          aria-hidden="true"
        >
          <path
            d="M0 400 L120 280 L220 340 L340 220 L460 300 L580 190 L700 260 L820 170 L940 240 L1060 180 L1180 260 L1320 210 L1440 280 L1440 520 L0 520 Z"
            fill="#7C8FD9"
            opacity="0.55"
          />
          <path
            d="M0 460 L140 360 L260 400 L380 320 L520 380 L660 310 L800 370 L940 300 L1080 370 L1220 320 L1360 380 L1440 350 L1440 520 L0 520 Z"
            fill="#1E3FBF"
            opacity="0.75"
          />
          <path
            d="M0 500 L200 440 L420 470 L640 430 L880 470 L1100 440 L1320 475 L1440 450 L1440 520 L0 520 Z"
            fill="#0F1E4D"
          />
          {/* Vineyard rows (oblique strokes) */}
          <g stroke="#6B1E2E" strokeWidth="1.5" opacity="0.55">
            <line x1="100" y1="505" x2="180" y2="485" />
            <line x1="220" y1="503" x2="320" y2="482" />
            <line x1="360" y1="500" x2="460" y2="480" />
            <line x1="500" y1="498" x2="600" y2="478" />
            <line x1="640" y1="496" x2="740" y2="476" />
            <line x1="780" y1="494" x2="880" y2="475" />
            <line x1="920" y1="492" x2="1020" y2="474" />
            <line x1="1060" y1="490" x2="1160" y2="473" />
            <line x1="1200" y1="488" x2="1300" y2="472" />
          </g>
          {/* Wheat/agaves */}
          <g fill="#0F1E4D">
            <ellipse cx="80" cy="470" rx="6" ry="28" />
            <ellipse cx="105" cy="465" rx="5" ry="22" />
            <ellipse cx="1200" cy="460" rx="7" ry="30" />
            <ellipse cx="1225" cy="455" rx="5" ry="24" />
            <ellipse cx="1250" cy="463" rx="6" ry="26" />
          </g>
          {/* Small cypress/agave clusters mid-field */}
          <g fill="#6B1E2E" opacity="0.85">
            <path d="M 330 475 L 326 455 L 334 455 Z" />
            <path d="M 336 478 L 332 462 L 340 462 Z" />
            <path d="M 920 470 L 916 450 L 924 450 Z" />
            <path d="M 928 473 L 924 456 L 932 456 Z" />
          </g>
          {/* Moons/small stars on sky portion (above mountain ridge) */}
          <g fill="#F5EDE0" opacity="0.7">
            <circle cx="180" cy="80" r="2" />
            <circle cx="340" cy="50" r="1.5" />
            <circle cx="1120" cy="90" r="2" />
          </g>
        </svg>

        <div className="relative z-20 max-w-7xl w-full mx-auto px-6 lg:px-12 pt-28 lg:pt-16 pb-20">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-14 items-center">
            {/* COPY + SEARCH */}
            <div className="text-center lg:text-left hero-text">
              <p className="text-snow/90 text-sm md:text-base tracking-[0.25em] uppercase mb-5 font-medium">
                La biblia para comprar vino online en Argentina
              </p>

              <h1 className="display text-snow text-5xl md:text-7xl lg:text-[5.5rem] xl:text-8xl font-semibold leading-[0.95] tracking-tight mb-6">
                Un vino.
                <br />
                <span className="italic font-normal">Todos</span> los precios.
              </h1>

              <p className="text-snow/85 text-lg md:text-xl max-w-2xl mx-auto lg:mx-0 mb-9 leading-relaxed">
                Buscás el vino que querés. Te decimos{" "}
                <span className="underline decoration-mustard decoration-2 underline-offset-4">
                  todas las vinotecas online
                </span>{" "}
                que lo tienen, ordenadas por precio total con envío a tu casa.
              </p>

              <form action="/buscar" className="max-w-2xl mx-auto lg:mx-0">
                <div className="relative flex items-center bg-snow rounded-full shadow-2xl p-2 pl-6 ring-1 ring-ink/5">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="text-graphite shrink-0"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <SearchInput
                    placeholder="Malbec, Catena Zapata, Luigi Bosca..."
                    className="flex-1 min-w-0 bg-transparent border-0 outline-none px-4 py-3 text-ink placeholder:text-graphite/70 text-base md:text-lg"
                    withAutocomplete
                  />
                  <button
                    type="submit"
                    className="cursor-wine shrink-0 bg-cobalt hover:bg-ink text-snow font-semibold px-5 md:px-8 py-3 rounded-full transition-colors text-sm md:text-base"
                  >
                    Buscar
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-2 text-snow/80 text-sm">
                  <span className="opacity-70">Popular hoy:</span>
                  <Link href="/varietal/malbec" className="chip text-xs !py-1.5">
                    Malbec
                  </Link>
                  <Link
                    href="/varietal/cabernet-sauvignon"
                    className="chip text-xs !py-1.5"
                  >
                    Cabernet Sauvignon
                  </Link>
                  <Link
                    href="/region/valle-de-uco"
                    className="chip text-xs !py-1.5"
                  >
                    Valle de Uco
                  </Link>
                  <Link
                    href="/buscar?tipo=Espumante"
                    className="chip text-xs !py-1.5"
                  >
                    Espumantes
                  </Link>
                </div>
              </form>
            </div>

            {/* BOTTLE */}
            <div className="hidden lg:flex justify-center items-end">
              <HeroBottle />
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="bg-snow border-y border-ink/10 relative grain">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div>
            <div className="display text-5xl md:text-6xl font-semibold text-cobalt leading-none">
              {formatCount(stats.productCount)}
            </div>
            <div className="text-graphite text-sm mt-2">
              vinos en el catálogo
            </div>
          </div>
          <div>
            <div className="display text-5xl md:text-6xl font-semibold text-malbec leading-none">
              {stats.storeCount}
            </div>
            <div className="text-graphite text-sm mt-2">
              vinotecas sincronizando
            </div>
          </div>
          <div>
            <div className="display text-5xl md:text-6xl font-semibold text-mustard leading-none">
              $0
            </div>
            <div className="text-graphite text-sm mt-2">gratis para vos</div>
          </div>
        </div>
      </section>

      {/* FAVORITOS QUE BAJARON (client-side; hidden si no hay favs o no hay drops cross) */}
      <HomeFavoriteDrops />

      {/* VISTOS RECIENTEMENTE (client-side, hidden for zero-state) */}
      <RecentlyViewedSection />

      {/* PRICE DROPS · only show when there's signal */}
      {topDrops.length > 0 && (
        <section id="bajaron" className="py-20 lg:py-28 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
              <div className="max-w-2xl">
                <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-3">
                  Bajaron de precio
                </p>
                <h2 className="display text-3xl md:text-4xl lg:text-5xl font-semibold text-ink leading-[1.05]">
                  Vinos en oferta
                  <br />
                  <span className="italic font-normal">vs la semana pasada.</span>
                </h2>
                <p className="text-graphite mt-4 text-base leading-relaxed">
                  Drops ≥15% sobre la mediana de los últimos 7 días.
                  Comparado entre vinotecas online. El precio bajó realmente,
                  no es un cambio de SKU.
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {topDrops.map((d) => (
                <Link
                  key={d.slug}
                  href={`/vino/${d.slug}`}
                  className="postcard p-5 flex flex-col"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="display text-2xl font-bold text-terracota tabular-nums">
                      −{Math.round(d.dropPct * 100)}%
                    </span>
                    <div className="relative w-14 h-20 rounded overflow-hidden bg-snow border border-ink/10 shrink-0">
                      {d.imageUrl ? (
                        <Image
                          src={d.imageUrl}
                          alt={d.canonicalName}
                          fill
                          sizes="56px"
                          className="object-contain"
                        />
                      ) : (
                        <BottleFallback
                          name={d.canonicalName}
                          brand={d.brand}
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-graphite truncate">
                    {displayBrand(d.brand)}
                  </p>
                  <p className="display text-base font-semibold text-ink leading-tight line-clamp-2 min-h-[2.4em]">
                    {displayWineName(d.canonicalName)}
                  </p>
                  <div className="mt-3 pt-3 border-t border-ink/5">
                    <p className="display text-lg font-semibold text-cobalt tabular-nums">
                      {formatArs(d.currentPrice)}
                    </p>
                    <p className="text-xs text-graphite line-through tabular-nums">
                      {formatArs(d.medianPrice7d)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TOP OFERTAS */}
      {deals.length > 0 && (
        <section id="ofertas" className="py-24 lg:py-32 px-6 bg-snow/50">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
              <div className="max-w-2xl">
                <p className="text-malbec text-sm tracking-[0.2em] uppercase font-semibold mb-4">
                  Top ofertas del snapshot
                </p>
                <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold text-ink leading-[1.05]">
                  El mismo vino,
                  <br />
                  <span className="italic font-normal">precios muy distintos.</span>
                </h2>
                <p className="text-graphite mt-5 text-lg leading-relaxed">
                  Vinos que aparecen en 2+ vinotecas con diferencias de precio que
                  importan. Elegí la más barata, o la que te llega más rápido.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/buscar?multi=1"
                  className="chip !bg-cobalt !text-snow !border-cobalt hover:!bg-malbec hover:!border-malbec"
                >
                  Ver todos los comparables →
                </Link>
                <Link
                  href="/ranking"
                  className="chip !bg-snow !text-ink !border-ink/15 hover:!bg-mustard"
                >
                  Rankings curados
                </Link>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {deals.map((g) => {
                const savingsPct =
                  g.minPrice != null && g.maxPrice != null && g.maxPrice > 0
                    ? Math.round(
                        ((g.maxPrice - g.minPrice) / g.maxPrice) * 100,
                      )
                    : 0;
                return (
                  <a
                    key={g.groupSlug}
                    href={`/vino/${g.groupSlug}`}
                    className="postcard p-6 flex gap-5 items-start"
                  >
                    <div className="relative w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-snow border border-ink/10">
                      {g.imageUrl ? (
                        <Image
                          src={g.imageUrl}
                          alt={g.canonicalName}
                          fill
                          sizes="96px"
                          className="object-contain"
                        />
                      ) : (
                        <BottleFallback name={g.canonicalName} brand={g.brand} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="inline-flex items-center gap-1.5 bg-malbec text-snow text-xs font-bold px-2.5 py-1 rounded-full mb-3 uppercase tracking-wide">
                        Ahorrá {savingsPct}%
                      </div>
                      <h3 className="display text-lg font-semibold text-ink leading-tight line-clamp-2 mb-1">
                        {displayWineName(g.canonicalName)}
                      </h3>
                      <p className="text-xs text-graphite mb-3 truncate">
                        {g.brand ? `${displayBrand(g.brand)} · ` : ""}
                        {g.storeCount} vinoteca{g.storeCount === 1 ? "" : "s"}
                        {g.vintage ? ` · ${g.vintage}` : ""}
                      </p>
                      <div className="flex items-baseline gap-2">
                        <div className="display text-2xl font-semibold text-cobalt">
                          {formatArs(g.minPrice)}
                        </div>
                        <div className="text-xs text-graphite line-through">
                          {formatArs(g.maxPrice)}
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* CÓMO FUNCIONA — 3 momentos narrativos, sin postcards repetidas.
          Cada paso tiene su propia ilustración inline (lupa con uvas →
          botellas con tickets → copa + arrow al checkout). El connector
          punteado en desktop refuerza la idea de flujo. */}
      <section id="como-funciona" className="relative py-24 lg:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-4">
              Cómo funciona
            </p>
            <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold text-ink leading-[1.05]">
              Simple como pedir
              <br />
              una copa.
            </h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-12 md:gap-8 lg:gap-14">
            {/* Connector — wavy dotted line tying the three steps together on
                desktop. Anchored above the illustrations so it visually links
                the focal points, not the headings. */}
            <svg
              aria-hidden="true"
              className="hidden md:block absolute top-[58px] left-[16%] w-[68%] h-6 pointer-events-none"
              viewBox="0 0 800 24"
              preserveAspectRatio="none"
            >
              <path
                d="M0 12 Q 200 -4 400 12 T 800 12"
                stroke="#6B1E2E"
                strokeWidth="1.4"
                fill="none"
                strokeDasharray="2 5"
                opacity="0.45"
              />
            </svg>

            {/* Step 01 — search. Strokes use currentColor so the ilustración
                inviertea correctamente en dark mode (text-ink ↔ ink cream). */}
            <div className="relative">
              <div className="mb-7 flex justify-center md:justify-start">
                <svg
                  width="170"
                  height="118"
                  viewBox="0 0 170 118"
                  fill="none"
                  aria-hidden="true"
                  className="text-ink"
                >
                  <rect x="6" y="46" width="118" height="34" rx="17" fill="#F5EDE0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="26" y1="63" x2="100" y2="63" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 4" opacity="0.45" />
                  <circle cx="124" cy="63" r="22" fill="#FAF4EA" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="140" y1="79" x2="156" y2="98" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <g transform="translate(124, 63)">
                    <path d="M -7 -10 Q -12 -13 -14 -9 Q -13 -5 -9 -6 Z" fill="#3D6B47" />
                    <line x1="-4" y1="-7" x2="0" y2="-3" stroke="#3D6B47" strokeWidth="1" strokeLinecap="round" />
                    <circle cx="-4" cy="-1" r="3" fill="#6B1E2E" />
                    <circle cx="3" cy="-1" r="3" fill="#6B1E2E" />
                    <circle cx="-2" cy="4" r="3" fill="#6B1E2E" />
                    <circle cx="4" cy="5" r="3" fill="#6B1E2E" />
                    <circle cx="1" cy="9" r="3" fill="#6B1E2E" />
                  </g>
                </svg>
              </div>
              <p className="display italic text-sm text-cobalt mb-2">paso 01</p>
              <h3 className="display text-2xl font-semibold mb-3 text-ink">
                Buscá el vino
              </h3>
              <p className="text-graphite leading-relaxed max-w-xs">
                Por nombre, bodega, varietal o región. El autocomplete sugiere
                a medida que escribís.
              </p>
            </div>

            {/* Step 02 — compare */}
            <div className="relative">
              <div className="mb-7 flex justify-center md:justify-start">
                <svg
                  width="170"
                  height="118"
                  viewBox="0 0 170 118"
                  fill="none"
                  aria-hidden="true"
                  className="text-ink"
                >
                  {[
                    { x: 18, price: "$ 12k", winner: true },
                    { x: 68, price: "$ 14k", winner: false },
                    { x: 118, price: "$ 17k", winner: false },
                  ].map((b, i) => (
                    <g key={i}>
                      {/* price tag — winner siempre cae sobre mustard, los
                          otros sobre cream. Ambos llevan texto ink fijo
                          (cream tag con texto cream en dark no se leería). */}
                      <rect
                        x={b.x - 4}
                        y={4}
                        width={32}
                        height={20}
                        rx={3}
                        fill={b.winner ? "#E8B547" : "#FAF4EA"}
                        stroke="#0F1729"
                        strokeWidth="1"
                      />
                      <text
                        x={b.x + 12}
                        y={18}
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle"
                        fill="#0F1729"
                        fontFamily="Fraunces, Georgia, serif"
                      >
                        {b.price}
                      </text>
                      {/* string from tag to bottle */}
                      <line
                        x1={b.x + 12}
                        y1={24}
                        x2={b.x + 12}
                        y2={32}
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                      {/* bottle */}
                      <rect x={b.x + 7} y={32} width={10} height={14} fill="#6B1E2E" />
                      <rect x={b.x + 2} y={46} width={20} height={56} rx={3} fill="#6B1E2E" />
                      <rect x={b.x + 3} y={66} width={18} height={18} fill="#F5EDE0" />
                    </g>
                  ))}
                  {/* arrow + label under winner — cobalt funciona en ambos modos */}
                  <path
                    d="M 12 110 L 36 110"
                    stroke="#1E3FBF"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 30 105 L 36 110 L 30 115"
                    stroke="#1E3FBF"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="display italic text-sm text-malbec mb-2">paso 02</p>
              <h3 className="display text-2xl font-semibold mb-3 text-ink">
                Comparamos todo
              </h3>
              <p className="text-graphite leading-relaxed max-w-xs">
                Te mostramos todas las vinotecas que lo venden online con precio
                actualizado y costo de envío a tu zona.
              </p>
            </div>

            {/* Step 03 — buy */}
            <div className="relative">
              <div className="mb-7 flex justify-center md:justify-start">
                <svg
                  width="170"
                  height="118"
                  viewBox="0 0 170 118"
                  fill="none"
                  aria-hidden="true"
                  className="text-ink"
                >
                  {/* wine glass */}
                  <path
                    d="M 56 22 L 104 22 L 100 58 Q 100 78 80 80 Q 60 78 60 58 Z"
                    fill="#6B1E2E"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  {/* wine surface highlight */}
                  <ellipse cx="80" cy="26" rx="22" ry="3" fill="#3A0E1A" opacity="0.5" />
                  {/* stem + base */}
                  <line x1="80" y1="80" x2="80" y2="104" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <line x1="66" y1="104" x2="94" y2="104" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  {/* check badge */}
                  <circle cx="120" cy="34" r="15" fill="#1B7A4F" />
                  <path
                    d="M 113 34 L 118 39 L 127 30"
                    stroke="#F5EDE0"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {/* exit arrow — leaves to the vinoteca */}
                  <path
                    d="M 18 56 L 38 56 L 38 47 L 54 60 L 38 73 L 38 64 L 18 64 Z"
                    fill="#E8B547"
                    stroke="#0F1729"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="display italic text-sm text-terracota mb-2">paso 03</p>
              <h3 className="display text-2xl font-semibold mb-3 text-ink">
                Comprás al mejor precio
              </h3>
              <p className="text-graphite leading-relaxed max-w-xs">
                Click y vas directo al sitio de la vinoteca a completar la
                compra. Nosotros no te vendemos nada.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* REGIONES */}
      <section
        id="regiones"
        className="bg-ink text-snow py-24 lg:py-32 px-6 relative overflow-hidden grain"
      >
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex items-end justify-between mb-12 flex-wrap gap-6">
            <div>
              <p className="text-mustard text-sm tracking-[0.2em] uppercase font-semibold mb-4">
                Explorá por región
              </p>
              <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] max-w-2xl">
                Del Uco a Cafayate,
                <br />
                pasando por Río Negro.
              </h2>
            </div>
            <Link
              href="/buscar"
              className="chip !bg-[rgba(245,237,224,0.12)] !border-[rgba(245,237,224,0.3)] hover:!bg-[rgba(245,237,224,0.22)]"
            >
              Ver todas las regiones →
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href={regionUco ? `/region/${regionUco.slug}` : "/buscar?region=Valle+de+Uco"}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #1E3FBF 0%, #4D79E8 50%, #D97449 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 70 L40 40 L70 55 L110 30 L140 50 L180 35 L200 55 L200 100 L0 100 Z"
                  fill="#0F1E4D"
                  opacity="0.7"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-snow/70 tracking-widest uppercase">
                  Mendoza
                </span>
                <div>
                  <div className="display text-2xl font-semibold">
                    Valle de Uco
                  </div>
                  <div className="text-snow/70 text-sm mt-1">
                    {regionUco
                      ? `${regionUco.groupCount.toLocaleString("es-AR")} vinos`
                      : "Explorar región"}
                  </div>
                </div>
              </div>
            </Link>

            <Link
              href={regionLujan ? `/region/${regionLujan.slug}` : "/buscar?region=Luj%C3%A1n+de+Cuyo"}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #4D79E8 0%, #E8859E 55%, #E8B547 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 75 L50 50 L90 65 L130 45 L170 60 L200 50 L200 100 L0 100 Z"
                  fill="#0F1E4D"
                  opacity="0.7"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-snow/70 tracking-widest uppercase">
                  Mendoza
                </span>
                <div>
                  <div className="display text-2xl font-semibold">
                    Luján de Cuyo
                  </div>
                  <div className="text-snow/70 text-sm mt-1">
                    {regionLujan
                      ? `${regionLujan.groupCount.toLocaleString("es-AR")} vinos`
                      : "Explorar región"}
                  </div>
                </div>
              </div>
            </Link>

            <Link
              href={regionSalta ? `/region/${regionSalta.slug}` : "/buscar?region=Salta"}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #D97449 0%, #E8B547 50%, #F5EDE0 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 60 L30 30 L70 50 L110 25 L150 45 L180 30 L200 50 L200 100 L0 100 Z"
                  fill="#6B1E2E"
                  opacity="0.75"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-ink/70 tracking-widest uppercase">
                  Norte
                </span>
                <div>
                  <div className="display text-2xl font-semibold text-ink">
                    Salta y Cafayate
                  </div>
                  <div className="text-ink/70 text-sm mt-1">
                    {regionSalta
                      ? `${regionSalta.groupCount.toLocaleString("es-AR")} vinos`
                      : "Explorar región"}
                  </div>
                </div>
              </div>
            </Link>

            <Link
              href={regionPatagonia ? `/region/${regionPatagonia.slug}` : "/buscar?region=Patagonia"}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #0F1E4D 0%, #1E3FBF 55%, #7C8FD9 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 58 L40 32 L80 44 L130 22 L170 38 L200 42 L200 100 L0 100 Z"
                  fill="#0F1E4D"
                  opacity="0.85"
                />
                <path
                  d="M40 32 L52 46 L28 46 Z M130 22 L143 38 L117 38 Z M170 38 L180 48 L160 48 Z"
                  fill="#F5EDE0"
                  opacity="0.9"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-snow/70 tracking-widest uppercase">
                  Río Negro
                </span>
                <div>
                  <div className="display text-2xl font-semibold">
                    Patagonia
                  </div>
                  <div className="text-snow/70 text-sm mt-1">
                    {regionPatagonia
                      ? `${regionPatagonia.groupCount.toLocaleString("es-AR")} vinos`
                      : "Explorar región"}
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* BODEGAS */}
      <section id="bodegas" className="py-24 lg:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-12">
            <p className="text-cobalt text-sm tracking-[0.2em] uppercase font-semibold mb-4">
              Bodegas más buscadas
            </p>
            <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold text-ink leading-[1.05]">
              Las que siempre rinden.
            </h2>
          </div>

          {brands.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {brands.map((b) => {
                // Paleta de etiquetas — cada bodega cae siempre en el mismo
                // color por hash del nombre (estable entre snapshots). Las
                // combinaciones pasan WCAG AA con el texto fg correspondiente.
                const palette = [
                  { bg: "#6B1E2E", fg: "#F5EDE0" }, // malbec / snow
                  { bg: "#1E3FBF", fg: "#F5EDE0" }, // cobalt / snow
                  { bg: "#E8B547", fg: "#0F1729" }, // mustard / ink
                  { bg: "#D97449", fg: "#F5EDE0" }, // terracota / snow
                  { bg: "#F5EDE0", fg: "#6B1E2E" }, // snow / malbec
                  { bg: "#D63A7A", fg: "#F5EDE0" }, // magenta / snow
                  { bg: "#7C8FD9", fg: "#0F1729" }, // andes / ink
                  { bg: "#E8859E", fg: "#0F1729" }, // rosado / ink
                  { bg: "#E8D47C", fg: "#0F1729" }, // chardonnay / ink
                ];
                let h = 0;
                for (let c = 0; c < b.name.length; c++) {
                  h = (h * 31 + b.name.charCodeAt(c)) >>> 0;
                }
                const { bg, fg } = palette[h % palette.length];
                // Monograma: iniciales de las palabras significativas
                // (saltamos artículos / conectores). "el Enemigo" → "E",
                // "DV Catena" → "DC", "Catena Zapata" → "CZ".
                const stop = new Set([
                  "de",
                  "del",
                  "la",
                  "el",
                  "las",
                  "los",
                  "y",
                  "&",
                ]);
                const tokens = b.name
                  .split(/\s+/)
                  .filter((w) => w && !stop.has(w.toLowerCase()));
                const monogram =
                  tokens.length === 0
                    ? (b.name[0] ?? "?").toUpperCase()
                    : tokens.length === 1
                      ? tokens[0].slice(0, 2).toUpperCase()
                      : (tokens[0][0] + tokens[1][0]).toUpperCase();
                return (
                  <a
                    key={b.name}
                    href={`/bodega/${brandSlug(b.name)}`}
                    className="cursor-wine group relative aspect-[5/6] rounded-2xl overflow-hidden border border-ink/10 p-4 flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-18px_rgba(15,23,41,0.45)]"
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    <span
                      aria-hidden="true"
                      className="display absolute inset-x-0 top-1/2 -translate-y-[58%] text-center font-semibold tracking-tight leading-none opacity-90"
                      style={{ fontSize: "5rem" }}
                    >
                      {monogram}
                    </span>
                    <div className="mt-auto relative z-10">
                      <p className="display text-sm font-semibold leading-tight line-clamp-2">
                        {b.name}
                      </p>
                      <p className="text-[10px] opacity-75 mt-0.5 tabular-nums">
                        {b.count} vino{b.count === 1 ? "" : "s"} ·{" "}
                        {b.storeCount} vinoteca{b.storeCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="text-graphite">
              Todavía no sincronizamos marcas suficientes.
            </p>
          )}
        </div>
      </section>

      {/* DESCUBRÍ · varietals + regiones */}
      <section className="py-16 lg:py-24 px-6 bg-snow/50 border-y border-ink/10">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-10">
            <p className="text-cobalt text-sm tracking-[0.2em] uppercase font-semibold mb-3">
              Descubrí
            </p>
            <h2 className="display text-3xl md:text-4xl lg:text-5xl font-semibold text-ink leading-[1.05]">
              Elegí por dónde arrancar.
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-10">
            {varietals.length > 0 && (
              <div>
                <h3 className="display text-xl font-semibold text-ink mb-5">
                  Por varietal
                </h3>
                <div className="flex flex-wrap gap-2">
                  {varietals.map((v) => (
                    <a
                      key={v.slug}
                      href={`/varietal/${v.slug}`}
                      className="inline-flex items-center gap-2 bg-white border border-ink/10 hover:border-cobalt rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors"
                    >
                      {v.name}
                      <span className="text-xs text-graphite">
                        {v.groupCount}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {regions.length > 0 && (
              <div>
                <h3 className="display text-xl font-semibold text-ink mb-5">
                  Por región
                </h3>
                <div className="flex flex-wrap gap-2">
                  {regions.map((r) => (
                    <a
                      key={r.slug}
                      href={`/region/${r.slug}`}
                      className="inline-flex items-center gap-2 bg-white border border-ink/10 hover:border-malbec rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors"
                    >
                      {r.name}
                      <span className="text-xs text-graphite">
                        {r.groupCount}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-6 pb-24">
        <div
          className="max-w-5xl mx-auto relative rounded-3xl overflow-hidden grain"
          style={{
            background:
              "linear-gradient(135deg, #6B1E2E 0%, #D63A7A 55%, #D97449 100%)",
          }}
        >
          <div className="relative z-10 p-10 md:p-16 text-snow">
            <div className="max-w-2xl">
              <h2 className="display text-4xl md:text-5xl font-semibold leading-[1.05] mb-5">
                ¿Un vino específico en mente?
              </h2>
              <p className="text-snow/90 text-lg mb-8">
                Escribilo y en segundos tenés todos los lugares donde
                conseguirlo, del más barato al más caro.
              </p>
              <form
                action="/buscar"
                className="flex flex-col sm:flex-row gap-3 max-w-xl"
              >
                <SearchInput
                  placeholder="Ej: Luigi Bosca Reserva Malbec"
                  className="flex-1 bg-snow/15 backdrop-blur border border-snow/25 rounded-full px-6 py-3.5 text-snow placeholder:text-snow/60 outline-none focus:border-snow/60"
                />
                <button className="cursor-wine bg-snow text-malbec font-semibold px-8 py-3.5 rounded-full hover:bg-mustard transition-colors">
                  Buscar
                </button>
              </form>
            </div>
          </div>
          <svg
            className="absolute right-0 bottom-0 opacity-25"
            width="260"
            height="260"
            viewBox="0 0 200 200"
          >
            <circle cx="60" cy="60" r="10" fill="#0F1729" />
            <circle cx="80" cy="70" r="10" fill="#0F1729" />
            <circle cx="100" cy="60" r="10" fill="#0F1729" />
            <circle cx="70" cy="90" r="10" fill="#0F1729" />
            <circle cx="90" cy="95" r="10" fill="#0F1729" />
            <circle cx="110" cy="85" r="10" fill="#0F1729" />
            <circle cx="80" cy="115" r="10" fill="#0F1729" />
            <circle cx="100" cy="120" r="10" fill="#0F1729" />
            <path
              d="M90 30 Q 110 50 95 70"
              stroke="#0F1729"
              strokeWidth="3"
              fill="none"
            />
          </svg>
        </div>
      </section>

      {/* FOOTER */}
      </main>
      <footer className="bg-ink text-snow/80 px-6 py-16 relative grain">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
                    fill="#F5EDE0"
                    stroke="#F5EDE0"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="24" cy="8" r="3" fill="#E8B547" />
                </svg>
                <span className="display text-xl font-semibold text-snow">
                  Vinndex
                </span>
              </div>
              <p className="max-w-md text-sm leading-relaxed">
                Comparador independiente de precios de vinos online en
                Argentina. No vendemos vino, te ayudamos a comprarlo al mejor
                precio.
              </p>
              <p className="text-xs text-snow/50 mt-4">
                Precios relevados 1 vez por día. Confirmá en la vinoteca antes
                de comprar.
              </p>
            </div>
            <div>
              <h3 className="display text-snow font-semibold mb-4">Explorar</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/buscar?varietal=malbec"
                    className="hover:text-snow"
                  >
                    Malbec
                  </Link>
                </li>
                <li>
                  <Link
                    href="/buscar?varietal=cabernet"
                    className="hover:text-snow"
                  >
                    Cabernet Sauvignon
                  </Link>
                </li>
                <li>
                  <Link
                    href="/buscar?varietal=chardonnay"
                    className="hover:text-snow"
                  >
                    Chardonnay
                  </Link>
                </li>
                <li>
                  <Link
                    href="/buscar?varietal=espumante"
                    className="hover:text-snow"
                  >
                    Espumantes
                  </Link>
                </li>
                <li>
                  <Link
                    href="/buscar?region=valle-de-uco"
                    className="hover:text-snow"
                  >
                    Valle de Uco
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="display text-snow font-semibold mb-4">Vinndex</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/sobre" className="hover:text-snow">
                    Sobre el proyecto
                  </Link>
                </li>
                <li>
                  <Link href="/como-funciona" className="hover:text-snow">
                    Cómo funciona
                  </Link>
                </li>
                <li>
                  <Link href="/sumate" className="hover:text-snow">
                    ¿Sos vinoteca? Sumate
                  </Link>
                </li>
                <li>
                  <Link href="/opt-out" className="hover:text-snow">
                    Pedir opt-out
                  </Link>
                </li>
                <li>
                  <Link href="/contacto" className="hover:text-snow">
                    Contacto
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-snow/10 pt-6 text-xs text-snow/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
            <p>© 2026 Vinndex · Hecho en Argentina</p>
            <p>
              Beber con moderación · Prohibida la venta de bebidas alcohólicas a
              menores de 18 años
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
