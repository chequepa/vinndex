import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SearchInput } from "@/components/SearchInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FavoriteButton, FavoritesNavLink } from "@/components/Favorites";
import { BottleFallback } from "@/components/BottleFallback";
import { ShareButtons } from "@/components/ShareButtons";
import { ViewTracker } from "@/components/RecentlyViewed";
import { CompareButton } from "@/components/Compare";
import { StickyCTA } from "@/components/StickyCTA";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { getScoresForSlug, formatScore } from "@/lib/scores";
import { getPriceHistory } from "@/lib/priceHistory";
import { displayWineName } from "@/lib/displayWineName";
import { extractVintage } from "@/lib/matching";
import Link from "next/link";
import {
  findGroup,
  formatArs,
  storeName,
  groups as allGroups,
  displayBrand,
  relatedGroups,
  isCaseOffer,
  bottleStats,
} from "@/lib/snapshot";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const g = findGroup(slug);
  if (!g) return { title: "Vino no encontrado — Vinndex" };

  const fmt = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
  const allOutOfStock = !g.offers?.some((o) => o.inStock);
  const totalStores = g.totalStoreCount ?? g.storeCount;
  // Use bottle-only stats (excluding cases/packs) so the metadata title
  // doesn't advertise inflated savings like "ahorrá hasta 95%" when the
  // 95% comes from comparing 1 bottle vs a 6-pack.
  const bs = bottleStats(g);
  const savingsPct =
    bs.minPrice && bs.maxPrice && bs.maxPrice > bs.minPrice
      ? Math.round(((bs.maxPrice - bs.minPrice) / bs.maxPrice) * 100)
      : null;

  // Title: include brand only if not already part of the canonical name.
  // Both brand and canonicalName get pretty-cased — many scrapers return
  // CAPS LOCK / lowercase strings that look shouty in <title> and OG tags.
  const prettyName = displayWineName(g.canonicalName);
  const prettyBrand = displayBrand(g.brand);
  const canonicalLower = g.canonicalName.toLowerCase();
  const brandNotInName =
    g.brand && !canonicalLower.includes(g.brand.toLowerCase());
  const titleName = brandNotInName
    ? `${prettyBrand} ${prettyName}`
    : prettyName;
  const titleVintage = g.vintage ? ` ${g.vintage}` : "";

  let titleTail: string;
  if (allOutOfStock) {
    titleTail = `sin stock en ${totalStores} vinoteca${totalStores === 1 ? "" : "s"}`;
  } else if (g.storeCount >= 2) {
    titleTail = savingsPct
      ? `compará ${g.storeCount} vinotecas · ahorrá hasta ${savingsPct}%`
      : `compará en ${g.storeCount} vinotecas`;
  } else {
    titleTail = "precio al día";
  }
  const title = `${titleName}${titleVintage} — ${titleTail} | Vinndex`;

  let description: string;
  if (allOutOfStock) {
    description = `${titleName}${titleVintage}: relevado en ${totalStores} vinoteca${
      totalStores === 1 ? "" : "s"
    } online de Argentina, actualmente sin stock en todas. Te mostramos dónde suele aparecer cuando vuelve.`;
  } else {
    description = `${titleName}${titleVintage} en ${g.storeCount} vinoteca${
      g.storeCount === 1 ? "" : "s"
    } online de Argentina.`;
    if (bs.minPrice != null) {
      const bestStore = g.offers?.find(
        (o) => o.inStock && !isCaseOffer(o.name),
      );
      description += ` Desde ${fmt.format(bs.minPrice)}`;
      if (bestStore) {
        description += ` en ${storeName(bestStore.storeSlug)}`;
      }
      if (savingsPct) {
        description += ` — ahorrá hasta ${savingsPct}%`;
      }
      description += ".";
    }
  }

  return {
    title,
    description,
    keywords: [
      g.canonicalName,
      g.brand ?? undefined,
      ...(g.varietals ?? []),
      g.region ?? undefined,
      "comparar precios",
      "vino argentino",
      "vinoteca online",
    ].filter(Boolean) as string[],
    openGraph: {
      title,
      description,
      url: `https://vinndex.com.ar/vino/${g.groupSlug}`,
      siteName: "Vinndex",
      type: "website",
      locale: "es_AR",
      images: g.imageUrl ? [{ url: g.imageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: g.imageUrl ? [g.imageUrl] : undefined,
    },
    alternates: {
      canonical: `https://vinndex.com.ar/vino/${g.groupSlug}`,
    },
    robots: allOutOfStock
      ? { index: true, follow: true, nocache: true }
      : { index: true, follow: true },
  };
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3 L11 3 L11 11 M11 3 L3 11" strokeLinecap="round" />
    </svg>
  );
}

function storeInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Color determinístico por slug — cada tienda tiene su badge color.
// Todos los tonos están oscurecidos lo suficiente para pasar contraste
// WCAG AA (≥4.5) con el texto cream `#f5ede0`. Antes había mustard
// (#E8B547), verde (#2FB344), terracota (#D97449), azul claro
// (#7C8FD9) que daban ratios ≤4.5 — Lighthouse a11y los flaggeaba.
const STORE_COLORS = [
  "#6B1E2E", // malbec oscuro
  "#1E3FBF", // cobalt
  "#A4441C", // terracota oscuro (era #D97449)
  "#9C7517", // mustard oscuro (era #E8B547)
  "#2B4FA8", // azul medio (era #4D79E8)
  "#A02356", // rosa oscuro (era #D63A7A)
  "#4D5FA3", // azul claro oscurecido (era #7C8FD9)
  "#1C6929", // verde oscuro (era #2FB344)
  "#5C3D87", // violeta oscuro (era #7F54B3)
];
function colorForStore(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return STORE_COLORS[h % STORE_COLORS.length];
}

// Vintage extraction se reusa de lib/matching.ts (mismo regex). Si la
// canonicalización cambia, queremos que la ficha cambie con ella.

/** Strip vintage + volume + redundant brand mentions from an offer name for cleaner display. */
function prettyOfferName(name: string, brand: string | null): string {
  let s = name
    .replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ")
    .replace(/\s*\d+\s*(ml|cc)\b/gi, " ")
    .replace(/\b(Vino|Tinto|Blanco)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (brand) {
    const rb = new RegExp(`\\b${brand}\\b`, "gi");
    const stripped = s.replace(rb, " ").replace(/\s+/g, " ").trim();
    // Only return stripped if it still has useful content
    if (stripped.length > 5) s = stripped;
  }
  return s;
}

export default async function Vino({ params }: Params) {
  const { slug } = await params;
  const group = findGroup(slug);
  if (!group) notFound();

  // Cases (estuche, caja, pack x6) y botellas viven en el mismo group
  // por la pipeline de matching pero no son el mismo SKU — comparar precio
  // botella vs caja x6 infla el "ahorro" hasta 95%. Acá los separamos:
  // la tabla y el hero solo usan botellas; las cajas se muestran después
  // en una sección aparte (si las hay).
  const allOffers = group.offers;
  const bottleOffersAll = allOffers.filter((o) => !isCaseOffer(o.name));
  const caseOffersAll = allOffers.filter((o) => isCaseOffer(o.name));
  // Si por alguna razón TODAS son cases, caemos para atrás a la lista
  // completa para no romper la ficha.
  const offers = bottleOffersAll.length > 0 ? bottleOffersAll : allOffers;
  // build-groups.mjs ya ordena in-stock primero, así que offers[0] es el
  // mejor precio con stock real. Si todas están sin stock (raro pero
  // posible con catálogos abandonados), fallback al primero de la lista.
  const inStockOffers = offers.filter((o) => o.inStock);
  const allOutOfStock = inStockOffers.length === 0;
  const bestOffer = allOutOfStock ? offers[0] : inStockOffers[0];

  // Bottle-only stats: el snapshot tiene minPrice/maxPrice contando cases
  // también. Acá los recomputamos para el hero y la metadata.
  const bottleStatsLocal = bottleStats(group);
  const heroMinPrice = bottleStatsLocal.minPrice;
  const heroMaxPrice = bottleStatsLocal.maxPrice;

  // Compute distinct vintages across offers in this group
  const vintageSet = new Set<number>();
  for (const o of offers) {
    const v = extractVintage(o.name);
    if (v) vintageSet.add(v);
  }
  const vintagesSorted = [...vintageSet].sort((a, b) => b - a);

  // Related: varietal + price + region similarity via helper. Falls back
  // to same-bodega cross-sell if varietal-based search comes up short.
  const sameBrand = allGroups.filter(
    (g) =>
      g.groupSlug !== group.groupSlug &&
      g.brand &&
      group.brand &&
      g.brand.toLowerCase() === group.brand.toLowerCase(),
  );
  let related = relatedGroups(group, 4);
  if (related.length < 4) {
    // Fill the tail with same-bodega wines (only ones not already
    // surfaced via the helper) so the section is never short.
    const relatedSlugs = new Set(related.map((r) => r.groupSlug));
    related = [
      ...related,
      ...sameBrand
        .filter((g) => !relatedSlugs.has(g.groupSlug) && g.imageUrl)
        .slice(0, 4 - related.length),
    ];
  }
  const scores = getScoresForSlug(group.groupSlug);
  const priceSeries = getPriceHistory(group.groupSlug);

  // JSON-LD Product schema for rich search snippets
  const productJsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: group.canonicalName,
    image: group.imageUrl ?? undefined,
    description: group.offers[0]?.name ?? group.canonicalName,
    brand: group.brand
      ? { "@type": "Brand", name: group.brand }
      : undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "ARS",
      lowPrice: group.minPrice ?? undefined,
      highPrice: group.maxPrice ?? undefined,
      offerCount: group.offerCount,
      offers: offers.map((o) => ({
        "@type": "Offer",
        price: o.priceArs ?? undefined,
        priceCurrency: "ARS",
        availability: o.inStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        url: o.externalUrl,
        seller: { "@type": "Organization", name: storeName(o.storeSlug) },
      })),
    },
  };

  // Breadcrumb JSON-LD → Google muestra breadcrumbs en SERPs
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
      ...(group.brand
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: group.brand,
              item: `https://vinndex.com.ar/bodega/${encodeURIComponent(
                group.brand.toLowerCase().replace(/\s+/g, "-"),
              )}`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: group.canonicalName,
              item: `https://vinndex.com.ar/vino/${group.groupSlug}`,
            },
          ]
        : [
            {
              "@type": "ListItem",
              position: 2,
              name: group.canonicalName,
              item: `https://vinndex.com.ar/vino/${group.groupSlug}`,
            },
          ]),
    ],
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-4">
          <Link
            href="/"
            aria-label="Vinndex — inicio"
            className="flex items-center gap-2 shrink-0 cursor-wine"
          >
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
          </Link>

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
                placeholder="Buscar otro vino..."
                className="w-full bg-transparent border-0 outline-none px-3 py-2 text-ink"
                withAutocomplete
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

      {/* HERO */}
      <section className="relative ficha-hero text-snow overflow-hidden grain">
        <svg
          className="absolute bottom-0 left-0 w-full opacity-40"
          viewBox="0 0 1440 240"
          preserveAspectRatio="none"
          style={{ height: "130px" }}
        >
          <path
            d="M0 160 L140 80 L260 120 L380 60 L520 110 L680 50 L840 100 L1000 60 L1140 110 L1280 70 L1440 120 L1440 240 L0 240 Z"
            fill="#0F1E4D"
          />
          <path
            d="M380 60 L400 85 L362 85 Z M680 50 L700 78 L660 78 Z M1000 60 L1022 88 L978 88 Z"
            fill="#F5EDE0"
            opacity="0.45"
          />
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-snow/70 uppercase tracking-wider mb-5">
            <Link href="/" className="hover:text-snow">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/buscar" className="hover:text-snow">
              Catálogo
            </Link>
            <span>/</span>
            <span className="truncate">{group.canonicalName}</span>
          </div>

          <div className="grid lg:grid-cols-[280px_1fr] gap-10 items-start">
            <div className="flex justify-center lg:justify-start">
              <div className="relative">
                <div className="absolute inset-0 bg-snow/15 blur-2xl rounded-full" />
                <div className="relative w-56 h-80 rounded-xl overflow-hidden bg-snow/10 border border-snow/20">
                  {group.imageUrl ? (
                    <Image
                      src={group.imageUrl}
                      alt={group.canonicalName}
                      fill
                      priority
                      sizes="(max-width: 1024px) 224px, 224px"
                      className="object-contain"
                    />
                  ) : (
                    <BottleFallback
                      name={group.canonicalName}
                      brand={group.brand}
                    />
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2 text-sm flex-wrap">
                <CompareButton
                  slug={group.groupSlug}
                  className="px-3 py-1 text-snow"
                />
                {group.brand && (
                  <span className="px-2.5 py-1 rounded-full bg-snow/15 backdrop-blur border border-snow/25 text-xs font-semibold uppercase tracking-wide">
                    {displayBrand(group.brand)}
                  </span>
                )}
                {(group.varietals ?? []).slice(0, 2).map((v) => (
                  <a
                    key={v}
                    href={`/buscar?varietal=${encodeURIComponent(v)}`}
                    className="px-2.5 py-1 rounded-full bg-mustard/30 border border-mustard/50 text-xs font-semibold uppercase tracking-wide hover:bg-mustard/50 transition-colors"
                  >
                    {v}
                  </a>
                ))}
                {group.region && (
                  <a
                    href={`/buscar?region=${encodeURIComponent(group.region)}`}
                    className="px-2.5 py-1 rounded-full bg-snow/15 border border-snow/25 text-xs font-semibold uppercase tracking-wide hover:bg-snow/30 transition-colors"
                  >
                    {group.region}
                  </a>
                )}
                {group.vintage && (
                  <>
                    <span className="text-snow/70">·</span>
                    <span className="text-snow/80">Cosecha {group.vintage}</span>
                  </>
                )}
                {group.format && (
                  <>
                    <span className="text-snow/70">·</span>
                    <span className="text-snow/80">{group.format}</span>
                  </>
                )}
              </div>

              {scores.length > 0 && (
                <div className="mb-5 flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase tracking-wider text-snow/60 mr-1">
                    Puntajes
                  </span>
                  {scores.map((s, i) => (
                    <span
                      key={`${s.critic}-${s.year}-${i}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-mustard/20 border border-mustard/40 text-xs font-semibold"
                      title={s.note ?? undefined}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="text-mustard"
                        aria-hidden="true"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      <span className="text-mustard">{formatScore(s)}</span>
                      <span className="text-snow/85">{s.critic}</span>
                      {s.year && (
                        <span className="text-snow/60 font-normal">
                          · {s.year}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-start gap-4 mb-3">
                <h1 className="display text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] flex-1">
                  {displayWineName(group.canonicalName)}
                </h1>
                <FavoriteButton
                  slug={group.groupSlug}
                  className="text-mustard w-11 h-11 md:w-12 md:h-12 border border-snow/25 bg-snow/10 backdrop-blur hover:bg-snow/20 shrink-0 mt-1"
                  size={22}
                />
              </div>

              <p className="text-snow/80 text-lg mb-8">
                {allOutOfStock ? (
                  <>
                    Relevado en{" "}
                    <span className="font-semibold text-mustard">
                      {group.totalStoreCount} vinoteca
                      {group.totalStoreCount === 1 ? "" : "s"}
                    </span>
                    , actualmente sin stock en todas.
                  </>
                ) : (
                  <>
                    Disponible en{" "}
                    <span className="font-semibold text-mustard">
                      {group.storeCount} vinoteca
                      {group.storeCount === 1 ? "" : "s"}
                    </span>{" "}
                    online.
                  </>
                )}
                {vintagesSorted.length > 1 && (
                  <>
                    {" "}
                    Cosechas relevadas:{" "}
                    <span className="font-semibold text-snow">
                      {vintagesSorted.join(", ")}
                    </span>
                    .
                  </>
                )}
              </p>

              {allOutOfStock ? (
                <div className="mb-10">
                  <div className="inline-flex items-center gap-4 bg-snow/10 backdrop-blur border border-snow/20 rounded-2xl px-6 py-5 max-w-xl">
                    <svg
                      width="36"
                      height="36"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-mustard shrink-0"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <div>
                      <div className="display text-xl md:text-2xl font-semibold leading-tight">
                        Actualmente sin stock
                      </div>
                      <div className="text-sm text-snow/70 mt-1">
                        Revisá en unos días — listamos abajo las tiendas que lo tienen en catálogo.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-10">
                  <div className="inline-flex items-baseline gap-6 bg-snow/10 backdrop-blur border border-snow/20 rounded-2xl px-6 py-5">
                  <div>
                    <div className="text-xs text-snow/70 uppercase tracking-wider mb-1">
                      Desde
                    </div>
                    <div className="display text-4xl md:text-5xl font-semibold leading-none">
                      {formatArs(heroMinPrice)}
                    </div>
                    <div className="text-xs text-snow/70 mt-1.5">
                      en {storeName(bestOffer.storeSlug)}
                    </div>
                  </div>
                  {heroMaxPrice != null &&
                    heroMinPrice != null &&
                    heroMaxPrice > heroMinPrice && (
                      <>
                        <div className="h-14 w-px bg-snow/25" />
                        <div>
                          <div className="text-xs text-snow/70 uppercase tracking-wider mb-1">
                            Ahorro máximo
                          </div>
                          <div className="display text-4xl md:text-5xl font-semibold leading-none text-mustard">
                            {Math.round(
                              ((heroMaxPrice - heroMinPrice) /
                                heroMaxPrice) *
                                100,
                            )}
                            %
                          </div>
                          <div className="text-xs text-snow/70 mt-1.5">
                            vs {formatArs(heroMaxPrice)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {allOutOfStock ? (
                <a
                  href="#precios"
                  className="cursor-wine bg-snow/15 text-snow border border-snow/30 font-semibold px-8 py-3.5 rounded-full hover:bg-snow/25 transition-colors inline-flex items-center gap-2"
                >
                  Ver tiendas que lo tienen
                </a>
              ) : (
                <a
                  href={bestOffer.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="cursor-wine bg-snow text-malbec font-semibold px-8 py-3.5 rounded-full hover:bg-mustard transition-colors inline-flex items-center gap-2"
                >
                  Ir al mejor precio en {storeName(bestOffer.storeSlug)}{" "}
                  <ExternalIcon />
                </a>
              )}

              <div className="mt-6 flex items-center gap-3 text-snow/85">
                <span className="text-xs uppercase tracking-wider">
                  Compartir
                </span>
                <ShareButtons
                  url={`/vino/${group.groupSlug}`}
                  title={`${group.canonicalName}${group.vintage ? ` ${group.vintage}` : ""} en Vinndex`}
                  description={
                    group.minPrice != null
                      ? `desde ${formatArs(group.minPrice)} en ${group.storeCount} vinoteca${group.storeCount === 1 ? "" : "s"}`
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <ViewTracker slug={group.groupSlug} />

      <StickyCTA
        priceLabel={
          allOutOfStock
            ? "Sin stock"
            : group.minPrice != null
              ? formatArs(group.minPrice)
              : "Ver precios"
        }
        storeName={bestOffer ? storeName(bestOffer.storeSlug) : ""}
        externalUrl={bestOffer?.externalUrl ?? "#precios"}
        allOutOfStock={allOutOfStock}
      />

      {/* TABLA DE PRECIOS */}
      <main id="contenido" className="max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        <section id="precios" className="scroll-mt-8">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="display text-3xl font-semibold text-ink">
                Comparación de precios
              </h2>
              <p className="text-graphite text-sm mt-1">
                Ordenado de menor a mayor ·{" "}
                {inStockOffers.length} con stock
                {offers.length > inStockOffers.length
                  ? ` · ${offers.length - inStockOffers.length} sin stock`
                  : ""}
              </p>
            </div>
          </div>

          <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1.1fr_auto] gap-4 px-5 py-3 bg-snow border-b border-ink/10 text-xs font-semibold text-graphite uppercase tracking-wider">
              <div>Vinoteca</div>
              <div className="text-center">Precio</div>
              <div className="text-center">Diferencia vs min</div>
              <div />
            </div>

            {offers.map((offer, i) => {
              const isBest = offer === bestOffer && offer.inStock;
              const outOfStock = !offer.inStock;
              const rowClasses = isBest
                ? "price-row best grid md:grid-cols-[2.2fr_1fr_1.1fr_150px] gap-4 items-center px-5 py-4 border-b border-ink/5"
                : outOfStock
                  ? "price-row grid md:grid-cols-[2.2fr_1fr_1.1fr_150px] gap-4 items-center px-5 py-4 border-b border-ink/5 opacity-50 grayscale"
                  : "price-row grid md:grid-cols-[2.2fr_1fr_1.1fr_150px] gap-4 items-center px-5 py-4 border-b border-ink/5";
              const ctaClasses = isBest
                ? "cursor-wine bg-cobalt hover:bg-ink text-snow font-semibold px-5 py-2.5 rounded-full text-sm inline-flex items-center justify-center gap-2 transition-colors w-full"
                : outOfStock
                  ? "cursor-wine border border-ink/15 text-graphite font-medium px-5 py-2.5 rounded-full text-sm inline-flex items-center justify-center gap-2 transition-colors w-full hover:border-ink/30"
                  : "cursor-wine border border-ink/20 hover:border-cobalt hover:text-cobalt text-ink font-semibold px-5 py-2.5 rounded-full text-sm inline-flex items-center justify-center gap-2 transition-colors w-full";
              const diffPct =
                offer.priceArs != null &&
                bestOffer.priceArs != null &&
                bestOffer.priceArs > 0 &&
                offer.priceArs > bestOffer.priceArs
                  ? Math.round(
                      ((offer.priceArs - bestOffer.priceArs) /
                        bestOffer.priceArs) *
                        100,
                    )
                  : null;
              const sname = storeName(offer.storeSlug);

              return (
                <div key={offer.externalUrl} className={rowClasses}>
                  <div className="flex items-center gap-3">
                    <div
                      className="store-logo"
                      style={{ background: colorForStore(offer.storeSlug) }}
                    >
                      {storeInitials(sname)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-ink flex items-center gap-2 flex-wrap">
                        <span className="truncate">{sname}</span>
                        {isBest && (
                          <span className="text-[10px] bg-mustard/25 text-mustard px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                            ★ Mejor precio
                          </span>
                        )}
                        {outOfStock && (
                          <span className="text-[10px] bg-ink/10 text-graphite px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                            Sin stock
                          </span>
                        )}
                        {offer.isCollector && (
                          <span
                            className="text-[10px] bg-malbec/15 text-malbec px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                            title="Cosecha vieja — precio de colección, no comparable con el precio actual"
                          >
                            Colección
                          </span>
                        )}
                        {(() => {
                          const v = extractVintage(offer.name);
                          return v ? (
                            <span className="text-[10px] bg-cobalt/15 text-cobalt px-2 py-0.5 rounded-full font-semibold">
                              Cosecha {v}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div
                        className="text-xs text-graphite truncate"
                        title={offer.name}
                      >
                        {prettyOfferName(offer.name, group.brand)}
                        {offer.externalSku ? ` · SKU ${offer.externalSku}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="md:text-center">
                    <span className="md:hidden text-xs text-graphite">
                      Precio:{" "}
                    </span>
                    <span className="display text-2xl font-semibold text-cobalt">
                      {formatArs(offer.priceArs)}
                    </span>
                  </div>
                  <div className="md:text-center">
                    <span className="md:hidden text-xs text-graphite">
                      Diferencia:{" "}
                    </span>
                    {isBest ? (
                      <span className="text-terracota font-semibold text-sm">
                        —
                      </span>
                    ) : diffPct != null ? (
                      <span className="text-ink text-sm">+{diffPct}%</span>
                    ) : (
                      <span className="text-graphite text-sm">—</span>
                    )}
                  </div>
                  <a
                    href={offer.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={ctaClasses}
                  >
                    {outOfStock ? "Ver tienda" : "Visitar"} <ExternalIcon />
                  </a>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-graphite mt-4">
            Matching determinístico por nombre + añada + formato. No vendemos
            vino — al tocar &ldquo;visitar&rdquo; vas directo al sitio de la
            vinoteca.
            {caseOffersAll.length > 0 && (
              <>
                {" "}
                Comparamos solo botellas individuales — los estuches y cajas
                ({caseOffersAll.length}) los podés encontrar en la tienda
                directamente.
              </>
            )}
          </p>

          {offers.some((o) => o.isCollector) && (
            <p className="text-xs text-graphite mt-3 max-w-2xl">
              Las ofertas marcadas como{" "}
              <span className="text-[10px] bg-malbec/15 text-malbec px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                Colección
              </span>{" "}
              son cosechas viejas a precio de bodega; quedan al final de la
              tabla y no entran en el cálculo del &ldquo;ahorro hasta X%&rdquo;
              del hero.
            </p>
          )}
        </section>

        {priceSeries.length >= 2 && (
          <section className="mt-14 pt-10 border-t border-ink/10">
            <PriceHistoryChart series={priceSeries} />
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="display text-2xl font-semibold text-ink mb-2">
              Te pueden gustar
            </h2>
            <p className="text-graphite text-sm mb-6">
              {group.varietals?.[0]
                ? `Similares en varietal${group.region ? `, región` : ""} y precio.`
                : "Selección basada en precio y región."}
            </p>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {related.map((r) => (
                <a
                  key={r.groupSlug}
                  href={`/vino/${r.groupSlug}`}
                  className="bg-white rounded-2xl p-5 border border-ink/10 hover:shadow-lg transition-shadow flex flex-col"
                >
                  <div className="relative w-full aspect-[3/4] bg-snow rounded-lg overflow-hidden mb-3 border border-ink/10">
                    {r.imageUrl ? (
                      <Image
                        src={r.imageUrl}
                        alt={r.canonicalName}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                        className="object-contain"
                      />
                    ) : (
                      <BottleFallback name={r.canonicalName} brand={r.brand} />
                    )}
                  </div>
                  <div className="display text-base font-semibold line-clamp-2 min-h-[2.5em]">
                    {displayWineName(r.canonicalName)}
                  </div>
                  <div className="text-xs text-graphite mt-0.5">
                    {r.storeCount} vinoteca{r.storeCount === 1 ? "" : "s"}
                    {r.vintage ? ` · ${r.vintage}` : ""}
                  </div>
                  <div className="display text-xl font-semibold text-cobalt mt-3">
                    {formatArs(r.minPrice)}
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
            <Link href="/" className="hover:text-snow">
              Inicio
            </Link>
          </p>
          <p>Precios relevados una vez por día · Beber con moderación</p>
        </div>
      </footer>
    </div>
  );
}
