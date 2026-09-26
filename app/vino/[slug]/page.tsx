import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { notFound, permanentRedirect } from "next/navigation";
import { FavoriteButton } from "@/components/Favorites";
import { WineImage } from "@/components/WineImage";
import { ShareButtons } from "@/components/ShareButtons";
import { ViewTracker } from "@/components/RecentlyViewed";
import { CompareButton } from "@/components/Compare";
import { StickyCTA } from "@/components/StickyCTA";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { PriceLadder } from "@/components/PriceLadder";
import { getScoresForSlug, formatScore } from "@/lib/scores";
import { getPriceHistory } from "@/lib/priceHistory";
import { displayWineName } from "@/lib/displayWineName";
import { extractVintage, type ProductOffer } from "@/lib/matching";
import Link from "next/link";
import {
  findGroup,
  resolveMergedSlug,
  formatArs,
  storeName,
  groups as allGroups,
  displayBrand,
  relatedGroups,
  isCaseOffer,
  isNonComparableOffer,
  offerVariantLabel,
  bottleStats,
  bodegaUrl,
  varietalUrl,
  regionUrl,
  snapshot,
} from "@/lib/snapshot";
import { isJunkSlug, isJunkWineGroup } from "@/lib/junkSlugs";
import { ReportIssue } from "@/components/ReportIssue";
import { MatchQuestion } from "@/components/MatchQuestion";
import { questionForSlug } from "@/lib/matchQuestions";
import { wineFullName } from "@/lib/wineNames";
import { brandSiblings, priceNeighbors } from "@/lib/internalLinks";
import { WineLinkList } from "@/components/WineLinkList";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const g = findGroup(slug);
  if (!g) return { title: "Vino no encontrado · Vinndex" };

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

  // Nombre con bodega y sin ruido de góndola ("Vino tinto … 750 ml"):
  // ver lib/wineNames.ts. Es el mismo que usan el <h1> y el JSON-LD.
  const titleName = wineFullName(g);
  const titleVintage = g.vintage ? ` ${g.vintage}` : "";

  // El PRECIO va en el <title>, no sólo en la description.
  //
  // Vinndex es un comparador de precios y sus títulos no mostraban
  // ninguno: "El Enemigo Malbec · compará 41 vinotecas · ahorrá hasta
  // 54%". Search Console dice que la consulta más frecuente después de
  // los nombres de vino es literalmente `precio` (219 impresiones), y
  // varias son de la forma "<vino> precio". Con CTR 1,2% sobre 107K
  // impresiones en posición media 10,3, el número en el SERP es la
  // palanca más barata que tenemos.
  //
  // El "ahorrá hasta X%" sale del título porque compite por los ~60
  // caracteres que Google muestra y es la afirmación más frágil de las
  // dos (depende del máximo, que se infla con formatos raros). Sigue en
  // la description, donde hay lugar.
  //
  // "precio" va escrito: es la palabra que acompaña al nombre del vino en
  // las consultas ("<vino> precio") y Google la resalta en el SERP.
  let titleTail: string;
  if (allOutOfStock) {
    titleTail = `sin stock en ${totalStores} vinoteca${totalStores === 1 ? "" : "s"}`;
  } else if (bs.minPrice != null && g.storeCount >= 2) {
    titleTail = `precio desde ${fmt.format(bs.minPrice)} en ${g.storeCount} vinotecas`;
  } else if (bs.minPrice != null) {
    titleTail = `precio desde ${fmt.format(bs.minPrice)}`;
  } else if (g.storeCount >= 2) {
    titleTail = `compará precios en ${g.storeCount} vinotecas`;
  } else {
    titleTail = "precio al día";
  }
  const baseTitle = `${titleName}${titleVintage} · ${titleTail}`;
  // Google corta en ~60 caracteres: si el nombre es largo, la marca del
  // sitio es lo primero que sobra (el dato es el precio, no "Vinndex").
  const title = baseTitle.length > 62 ? baseTitle : `${baseTitle} | Vinndex`;

  let description: string;
  if (allOutOfStock) {
    description = `${titleName}${titleVintage}: relevado en ${totalStores} vinoteca${
      totalStores === 1 ? "" : "s"
    } online de Argentina, actualmente sin stock en todas. Te mostramos dónde suele aparecer cuando vuelve.`;
  } else {
    description = `Dónde comprar ${titleName}${titleVintage}: ${g.storeCount} vinoteca${
      g.storeCount === 1 ? "" : "s"
    } online de Argentina.`;
    if (bs.minPrice != null) {
      const bestStore = g.offers?.find(
        (o) => o.inStock && !isNonComparableOffer(o),
      );
      description += ` Desde ${fmt.format(bs.minPrice)}`;
      if (bestStore) {
        description += ` en ${storeName(bestStore.storeSlug)}`;
      }
      if (savingsPct) {
        description += ` · ahorrá hasta ${savingsPct}%`;
      }
      // La frescura es el otro gancho de una búsqueda de precio: el
      // scrape corre todas las mañanas, así que la afirmación es real.
      description += ". Precios actualizados a diario.";
    }
  }

  return {
    title,
    description,
    // Sin `images`: la imagen OG la pone ./opengraph-image.tsx (1200×630
    // con nombre, precio y vinotecas). Antes se pisaba con la foto de la
    // botella hotlinkeada del CDN de la tienda — tamaño arbitrario, a
    // veces con protección anti-hotlink, y sin el precio.
    openGraph: {
      title,
      description,
      url: `https://vinndex.com.ar/vino/${g.groupSlug}`,
      siteName: "Vinndex",
      type: "website",
      locale: "es_AR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: `https://vinndex.com.ar/vino/${g.groupSlug}`,
    },
    // noindex: slugs basura de facetas Y fichas no-vino (espirituosas,
    // bundles, venta por copa) — consistente con su exclusión del sitemap
    // (aviso GSC 2026-07-03). follow: true en no-vino para no cortar el
    // flujo de links internos hacia fichas legítimas.
    robots: isJunkSlug(g.groupSlug)
      ? { index: false, follow: false }
      : isJunkWineGroup(g)
        ? { index: false, follow: true }
        : allOutOfStock
          ? { index: true, follow: true, nocache: true }
          : { index: true, follow: true },
  };
}

function ExternalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      aria-hidden="true"
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

// Color determinístico por slug · cada tienda tiene su badge color.
// Todos los tonos están oscurecidos lo suficiente para pasar contraste
// WCAG AA (≥4.5) con el texto cream `#f5ede0`. Antes había mustard
// (#E8B547), verde (#2FB344), terracota (#D97449), azul claro
// (#7C8FD9) que daban ratios ≤4.5 · Lighthouse a11y los flaggeaba.
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

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Fila de la tabla de precios. Toda la fila es el link a la vinoteca
 * (target de toque grande en mobile, mismo contrato `nofollow` que antes).
 *
 * Mobile: una sola fila compacta · logo + vinoteca + nombre de la oferta a
 * la izquierda, precio y diferencia a la derecha. Antes cada oferta era una
 * tarjeta de ~220px con "Precio:" / "Diferencia:" / botón a lo ancho, y el
 * SKU largo sin cortar empujaba el botón fuera de la tarjeta.
 * Desktop (md+): la grilla de 4 columnas de siempre, con la píldora
 * "Visitar" como affordance visual.
 */
function OfferRow({
  offer,
  brand,
  bestOffer,
  variant = "bottle",
  highlightBest = true,
}: {
  offer: ProductOffer;
  brand: string | null;
  bestOffer?: ProductOffer;
  variant?: "bottle" | "format";
  /** Con una sola oferta con stock, "mejor precio" no compara nada. */
  highlightBest?: boolean;
}) {
  const sname = storeName(offer.storeSlug);
  const outOfStock = !offer.inStock;
  const isBest =
    highlightBest &&
    variant === "bottle" &&
    offer === bestOffer &&
    offer.inStock;
  const diffPct =
    variant === "bottle" &&
    bestOffer &&
    offer.priceArs != null &&
    bestOffer.priceArs != null &&
    bestOffer.priceArs > 0 &&
    offer.priceArs > bestOffer.priceArs
      ? Math.round(
          ((offer.priceArs - bestOffer.priceArs) / bestOffer.priceArs) * 100,
        )
      : null;
  const vintage = extractVintage(offer.name);
  const formatLabel = variant === "format" ? offerVariantLabel(offer) : null;
  // En cajas, el precio por botella es lo único que permite comparar
  // contra la tabla de arriba.
  const perBottle =
    variant === "format" &&
    offer.priceArs != null &&
    (offer.pack ?? 0) > 1 &&
    !offer.priceSuspect
      ? Math.round(offer.priceArs / (offer.pack as number))
      : null;

  const badge =
    "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide whitespace-nowrap";
  const priceText =
    variant === "format"
      ? "text-ink"
      : outOfStock
        ? "text-graphite"
        : "text-cobalt";

  const ariaLabel = [
    `${sname}: ${formatArs(offer.priceArs)}`,
    formatLabel ?? null,
    isBest ? "mejor precio" : null,
    diffPct != null ? `${diffPct}% más caro que el mejor precio` : null,
    outOfStock ? "sin stock" : null,
    "abre la vinoteca en otra pestaña",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <a
      href={offer.externalUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={ariaLabel}
      title={offer.name}
      className={`price-row group cursor-wine grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_1fr_1.1fr_150px] gap-x-3 md:gap-4 items-center px-4 md:px-5 py-3 md:py-4 border-b border-ink/5 last:border-b-0 ${
        isBest ? "best" : ""
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`store-logo ${outOfStock ? "grayscale opacity-60" : ""}`}
          style={{ background: colorForStore(offer.storeSlug) }}
          aria-hidden="true"
        >
          {storeInitials(sname)}
        </div>
        <div className="min-w-0">
          <div
            className={`font-semibold leading-snug truncate ${
              outOfStock ? "text-graphite" : "text-ink"
            }`}
          >
            {sname}
          </div>
          {(isBest || outOfStock || offer.isCollector || vintage || formatLabel) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {isBest && (
                <span className={`${badge} bg-mustard/35 text-ink`}>
                  ★ Mejor precio
                </span>
              )}
              {formatLabel && (
                <span
                  className={`${badge} bg-cobalt/10 text-cobalt`}
                  title={
                    offer.priceSuspect
                      ? "El precio no parece corresponder al formato: confirmalo en la vinoteca."
                      : undefined
                  }
                >
                  {formatLabel}
                </span>
              )}
              {outOfStock && (
                <span className={`${badge} bg-ink/10 text-graphite`}>
                  Sin stock
                </span>
              )}
              {offer.isCollector && (
                <span
                  className={`${badge} bg-malbec/15 text-malbec`}
                  title="Cosecha vieja · precio de colección, no comparable con el precio actual"
                >
                  Colección
                </span>
              )}
              {vintage && (
                <span className={`${badge} bg-cobalt/10 text-cobalt`}>
                  Cosecha {vintage}
                </span>
              )}
            </div>
          )}
          <div className="text-xs text-graphite truncate mt-0.5">
            {prettyOfferName(offer.name, brand)}
          </div>
        </div>
      </div>

      <div className="text-right md:text-center">
        <div
          className={`display text-xl md:text-2xl font-semibold tabular-nums leading-tight whitespace-nowrap ${priceText}`}
        >
          {formatArs(offer.priceArs)}
        </div>
        {perBottle != null && (
          <div className="text-[11px] text-graphite tabular-nums whitespace-nowrap">
            {formatArs(perBottle)} c/botella
          </div>
        )}
        {variant === "bottle" && (
          <div className="md:hidden flex items-center justify-end gap-1 text-xs text-graphite tabular-nums whitespace-nowrap mt-0.5">
            {isBest ? "el más barato" : diffPct != null ? `+${diffPct}%` : null}
            <ExternalIcon size={11} />
          </div>
        )}
      </div>

      {variant === "bottle" ? (
        <div className="hidden md:block text-center text-sm tabular-nums">
          {isBest ? (
            <span className="text-graphite">—</span>
          ) : diffPct != null ? (
            <span className="text-ink">+{diffPct}%</span>
          ) : (
            <span className="text-graphite">—</span>
          )}
        </div>
      ) : (
        <div className="hidden md:block" />
      )}

      <span
        aria-hidden="true"
        className={`hidden md:inline-flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
          isBest
            ? "bg-cobalt text-snow group-hover:bg-ink"
            : outOfStock
              ? "border border-ink/15 text-graphite group-hover:border-ink/30"
              : "border border-ink/20 text-ink group-hover:border-cobalt group-hover:text-cobalt"
        }`}
      >
        {outOfStock ? "Ver tienda" : "Visitar"} <ExternalIcon />
      </span>
    </a>
  );
}

export default async function Vino({ params }: Params) {
  const { slug } = await params;
  const group = findGroup(slug);
  if (!group) {
    // Slug absorbido por un merge posterior → redirigí 308 al grupo
    // superviviente para no perder el ranking SEO de la URL vieja.
    const dest = resolveMergedSlug(slug);
    if (dest) permanentRedirect(`/vino/${dest}`);
    // Los slugs son siempre minúsculas; un link externo con mayúsculas
    // (/vino/Enemigo-Malbec) no tiene por qué ser 404.
    const lower = slug.toLowerCase();
    if (lower !== slug) {
      if (findGroup(lower)) permanentRedirect(`/vino/${lower}`);
      const lowerDest = resolveMergedSlug(lower);
      if (lowerDest) permanentRedirect(`/vino/${lowerDest}`);
    }
    notFound();
  }

  // Variantes (375ml, magnum, caja x6, estuche, copa) y botellas de 750
  // viven en el mismo group — son el mismo VINO pero no el mismo SKU:
  // comparar botella vs caja x6 infla el "ahorro" hasta 95% y una 375
  // parece "más barata" que todas. La tabla y el hero solo usan botellas
  // comparables; las variantes van en su propia sección abajo. Con el
  // snapshot v2 la decisión viene estructurada (offer.comparable); para
  // snapshots viejos cae a la heurística por nombre.
  const allOffers = group.offers;
  const bottleOffersAll = allOffers.filter((o) => !isNonComparableOffer(o));
  const caseOffersAll = allOffers.filter((o) => isNonComparableOffer(o));
  // Si por alguna razón TODAS son cases, caemos para atrás a la lista
  // completa para no romper la ficha.
  const offers = bottleOffersAll.length > 0 ? bottleOffersAll : allOffers;
  // build-groups.mjs ya ordena in-stock primero, así que offers[0] es el
  // mejor precio con stock real. Si todas están sin stock (raro pero
  // posible con catálogos abandonados), fallback al primero de la lista.
  const inStockOffers = offers.filter((o) => o.inStock);
  const allOutOfStock = inStockOffers.length === 0;
  const bestOffer = allOutOfStock ? offers[0] : inStockOffers[0];
  // La tabla principal muestra sólo lo comprable hoy; las vinotecas sin
  // stock van a un desplegable abajo (antes eran 1/3 de la tabla, en gris
  // al 50% de opacidad, ilegibles). Si TODAS están sin stock no hay nada
  // que esconder: se listan todas.
  const mainOffers = allOutOfStock ? offers : inStockOffers;
  const hiddenOutOfStock = allOutOfStock
    ? []
    : offers.filter((o) => !o.inStock);
  // Resumen de "otros formatos" para el summary del desplegable.
  const formatKinds = [
    ...new Set(
      caseOffersAll
        .map((o) => offerVariantLabel(o))
        .filter((l): l is string => !!l && l !== "Precio a verificar"),
    ),
  ].slice(0, 4);
  if (formatKinds.length === 0) formatKinds.push("Cajas y otros envases");

  // Ladder dataset: solo botellas con stock real y precio válido. Las
  // cosechas de colección quedan fuera del ladder (distorsionan la escala)
  // pero siguen apareciendo en la tabla detallada de abajo.
  const ladderOffers = inStockOffers
    .filter((o) => !o.isCollector && o.priceArs != null && o.priceArs > 0)
    .sort((a, b) => (a.priceArs ?? 0) - (b.priceArs ?? 0))
    .map((o) => {
      const sname = storeName(o.storeSlug);
      const priceArs = o.priceArs!;
      const bestPrice = bestOffer.priceArs ?? priceArs;
      const diffPct =
        bestPrice > 0 && priceArs > bestPrice
          ? Math.round(((priceArs - bestPrice) / bestPrice) * 100)
          : null;
      return {
        externalUrl: o.externalUrl,
        storeSlug: o.storeSlug,
        storeName: sname,
        storeInitials: storeInitials(sname),
        storeColor: colorForStore(o.storeSlug),
        priceArs,
        isBest: o === bestOffer,
        diffPct,
      };
    });

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

  // ── JSON-LD ──────────────────────────────────────────────────────
  //
  // Product + AggregateOffer (fragmento de producto: rango de precios y
  // cantidad de ofertas). Reglas, auditoría SEO del 26/09:
  //
  // · Sólo ofertas con precio. Antes 5.359 fichas publicaban un
  //   AggregateOffer sin `lowPrice` y 6.171 tenían algún Offer sin
  //   `price` — Search Console los marca como ítems NO VÁLIDOS ("Missing
  //   field price"). Si no hay un solo precio, no hay Product.
  // · Las ofertas listadas son la base de precio de la ficha (botella de
  //   750 con stock, sin colección): `lowPrice`/`highPrice`/`offerCount`
  //   salen de esa misma lista y coinciden con el hero. Si nada tiene
  //   stock, se listan las de catálogo con `OutOfStock`.
  // · Sin `aggregateRating` armado con puntajes de críticos: Google pide
  //   no agregar reseñas de otros sitios. Las reseñas individuales (que
  //   se ven en la ficha, con su autor) siguen.
  // · Sin `hasMerchantReturnPolicy`: es un campo de fichas de comercio
  //   (merchant listings) y Vinndex no vende; sólo sumaba bytes x oferta.
  // · Sin FAQPage: desde 2023 Google sólo muestra FAQ de sitios de
  //   gobierno/salud, y las preguntas no estaban visibles en la página
  //   (el contenido marcado tiene que verse). Eran ~1 KB por ficha x 2
  //   (HTML + payload RSC) sin ningún beneficio.
  const fullName = wineFullName(group);
  const fullNameVintage = `${fullName}${group.vintage ? ` ${group.vintage}` : ""}`;

  // Precios válidos hasta el próximo daily-scrape (+24h del snapshot).
  const priceValidUntil = new Date(
    new Date(snapshot.generatedAt).getTime() + 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  // Misma cadena de fallback que la base de precio del grupo
  // (lib/snapshot.ts → priceBasis): botella comparable con stock →
  // cualquier formato con stock sin colección (fichas que sólo existen en
  // magnum o 375) → cualquiera con stock → catálogo sin stock.
  const priced = offers.filter(
    (o) => o.priceArs != null && o.priceArs >= 1000 && !o.priceSuspect,
  );
  const ldTiers = [
    priced.filter((o) => o.inStock && !o.isCollector && !isNonComparableOffer(o)),
    priced.filter((o) => o.inStock && !o.isCollector),
    priced.filter((o) => o.inStock),
    priced.filter((o) => !o.isCollector && !isNonComparableOffer(o)),
    priced,
  ];
  const ldOffers = ldTiers.find((t) => t.length > 0) ?? [];
  const ldPrices = ldOffers.map((o) => o.priceArs as number);
  // EAN: sólo si todas las ofertas que lo publican coinciden en uno.
  const eans = new Set(
    ldOffers
      .map((o) => o.externalSku?.trim() ?? "")
      .filter((sku) => /^\d{12,14}$/.test(sku)),
  );
  const gtin = eans.size === 1 ? [...eans][0] : null;
  // Category armada desde type + varietal principal (ej: "Vino tinto > Malbec").
  const categoryParts: string[] = [];
  categoryParts.push(group.type ? `Vino ${group.type.toLowerCase()}` : "Vino");
  if (group.varietals && group.varietals.length > 0) {
    categoryParts.push(group.varietals[0]);
  }
  const productJsonLd =
    ldOffers.length > 0
      ? {
          "@context": "https://schema.org/",
          "@type": "Product",
          name: fullNameVintage,
          image: group.imageUrl ?? undefined,
          description: `${fullNameVintage}: precio en ${ldOffers.length} oferta${
            ldOffers.length === 1 ? "" : "s"
          } de vinotecas online de Argentina, relevadas a diario.`,
          category: categoryParts.join(" > "),
          ...(gtin ? { [gtin.length === 13 ? "gtin13" : "gtin"]: gtin } : {}),
          brand: group.brand
            ? { "@type": "Brand", name: displayBrand(group.brand) }
            : undefined,
          review:
            scores.length > 0
              ? scores.map((s) => ({
                  "@type": "Review",
                  author: { "@type": "Person", name: s.critic },
                  reviewRating: {
                    "@type": "Rating",
                    ratingValue: Math.round((s.score / s.maxScore) * 100),
                    bestRating: 100,
                    worstRating: 0,
                  },
                  reviewBody: s.note ?? undefined,
                  datePublished: String(s.year),
                }))
              : undefined,
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "ARS",
            lowPrice: Math.min(...ldPrices),
            highPrice: Math.max(...ldPrices),
            offerCount: ldOffers.length,
            offers: ldOffers.map((o) => ({
              "@type": "Offer",
              price: o.priceArs,
              priceCurrency: "ARS",
              priceValidUntil,
              itemCondition: "https://schema.org/NewCondition",
              availability: o.inStock
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
              url: o.externalUrl,
              seller: { "@type": "Organization", name: storeName(o.storeSlug) },
            })),
          },
        }
      : null;

  const wineLabel = displayWineName(group.canonicalName);
  // Par candidato a "¿es el mismo vino?" para esta ficha, si lo hay.
  const matchQuestion = questionForSlug(group.groupSlug);

  // BreadcrumbList: Inicio › Bodega › Vino. La bodega sólo entra si su
  // página existe — antes la URL se armaba a mano (brand.toLowerCase()
  // con guiones) y en 3.603 fichas apuntaba a un /bodega/* que da 404.
  const bodegaHref = bodegaUrl(group.brand);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Inicio", item: "https://vinndex.com.ar" },
      ...(bodegaHref && group.brand
        ? [
            {
              name: displayBrand(group.brand),
              item: `https://vinndex.com.ar${bodegaHref}`,
            },
          ]
        : []),
      {
        name: fullNameVintage,
        item: `https://vinndex.com.ar/vino/${group.groupSlug}`,
      },
    ].map((it, i) => ({ "@type": "ListItem", position: i + 1, ...it })),
  };

  // Enlazado interno (lib/internalLinks.ts): hermanas de bodega y vecinas
  // de precio. Sin repetir las de "Te pueden gustar".
  const shownSlugs = new Set(related.map((r) => r.groupSlug));
  const siblings = brandSiblings(group, 6).filter(
    (g) => !shownSlugs.has(g.groupSlug),
  );
  for (const g of siblings) shownSlugs.add(g.groupSlug);
  const neighbors = priceNeighbors(group, 6, shownSlugs);
  const priceLabel = group.varietals?.[0] ?? (group.type ? `vinos ${group.type.toLowerCase()}s` : "vinos");

  return (
    <div className="bg-white min-h-[100dvh]">
      {productJsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteHeader placeholder="Buscá otro vino o bodega" />

      {/* <main> envuelve también al hero: el skip-link salta a #contenido y
          antes caía debajo del h1, en la escalera. */}
      <main id="contenido">
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

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-8 sm:py-12 lg:py-16">
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

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 sm:gap-10 items-start">
            <div className="flex justify-center lg:justify-start">
              <div className="relative">
                <div className="absolute inset-0 bg-snow/15 blur-2xl rounded-full" />
                <div className="relative w-28 h-40 sm:w-56 sm:h-80 rounded-xl overflow-hidden bg-snow/10 border border-snow/20">
                  <WineImage
                    src={group.imageUrl}
                    name={group.canonicalName}
                    brand={group.brand}
                    fill
                    preload
                    sizes="(max-width: 1024px) 224px, 224px"
                    className="object-contain"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2 text-sm flex-wrap">
                <CompareButton
                  slug={group.groupSlug}
                  className="px-4 py-2 text-sm text-snow"
                />
                {group.brand && (() => {
                  // Si la bodega tiene página propia (≥3 vinos), el chip
                  // es un link a /bodega/{slug}. Sino queda como span sin
                  // link (no le pegamos un 404 a Google). Esto suma ~21k
                  // links internos /vino → /bodega para la cobertura SEO.
                  const href = bodegaUrl(group.brand);
                  const label = displayBrand(group.brand);
                  return href ? (
                    <a
                      href={href}
                      className="px-2.5 py-1 rounded-full bg-snow/15 backdrop-blur border border-snow/25 text-xs font-semibold uppercase tracking-wide hover:bg-snow/30 transition-colors"
                    >
                      {label}
                    </a>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-snow/15 backdrop-blur border border-snow/25 text-xs font-semibold uppercase tracking-wide">
                      {label}
                    </span>
                  );
                })()}
                {(group.varietals ?? []).slice(0, 2).map((v) => {
                  // Preferimos /varietal/{slug} (página SEO indexable) sobre
                  // /buscar?varietal=… (canonical a sí misma, no rankea).
                  // Fallback a /buscar si el varietal no tiene página.
                  const href =
                    varietalUrl(v) ??
                    `/buscar?varietal=${encodeURIComponent(v)}`;
                  return (
                    <a
                      key={v}
                      href={href}
                      className="px-2.5 py-1 rounded-full bg-mustard/30 border border-mustard/50 text-xs font-semibold uppercase tracking-wide hover:bg-mustard/50 transition-colors"
                    >
                      {v}
                    </a>
                  );
                })}
                {group.region && (() => {
                  // Idem para región: preferir /region/{slug} sobre /buscar.
                  const href =
                    regionUrl(group.region) ??
                    `/buscar?region=${encodeURIComponent(group.region)}`;
                  return (
                    <a
                      href={href}
                      className="px-2.5 py-1 rounded-full bg-snow/15 border border-snow/25 text-xs font-semibold uppercase tracking-wide hover:bg-snow/30 transition-colors"
                    >
                      {group.region}
                    </a>
                  );
                })()}
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
                  {fullName}
                </h1>
                <FavoriteButton
                  slug={group.groupSlug}
                  className="text-mustard w-11 h-11 md:w-12 md:h-12 border border-snow/25 bg-snow/10 backdrop-blur hover:bg-snow/20 shrink-0 mt-1"
                  size={22}
                />
              </div>

              <p className="text-snow/80 text-lg mb-6">
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
              </p>

              {vintagesSorted.length > 1 && (
                <div className="mb-8 flex items-center gap-x-3 gap-y-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-snow/55 font-semibold">
                    {vintagesSorted.length} cosechas
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {vintagesSorted.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-snow/12 border border-snow/20 text-xs tabular-nums font-medium text-snow"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

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
                        Revisá en unos días. Listamos abajo las tiendas que lo tienen en catálogo.
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
                  // Hex fijos y no bg-snow/text-malbec: en dark esas
                  // utilities se invierten (surface oscuro + rosa) y el CTA
                  // principal quedaba como un botón apagado sobre el hero.
                  className="cursor-wine bg-[#f5ede0] text-[#6b1e2e] font-semibold px-6 sm:px-8 py-3.5 rounded-full hover:bg-mustard transition-colors inline-flex items-center gap-2"
                >
                  {inStockOffers.length >= 2
                    ? `Ir al mejor precio en ${storeName(bestOffer.storeSlug)}`
                    : `Ir a ${storeName(bestOffer.storeSlug)}`}{" "}
                  <ExternalIcon />
                </a>
              )}

              <div className="mt-6 flex items-center gap-3 text-snow/85">
                <span className="text-xs uppercase tracking-wider">
                  Compartir
                </span>
                <ShareButtons
                  url={`https://vinndex.com.ar/vino/${group.groupSlug}`}
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
          // Mismo número que el hero (sólo botellas de 750 comparables):
          // group.minPrice cuenta también 375 ml / cajas y podía mostrar
          // un "mejor precio" distinto al de arriba.
          allOutOfStock
            ? "Sin stock"
            : heroMinPrice != null
              ? formatArs(heroMinPrice)
              : "Ver precios"
        }
        storeName={bestOffer ? storeName(bestOffer.storeSlug) : ""}
        externalUrl={bestOffer?.externalUrl ?? "#precios"}
        allOutOfStock={allOutOfStock}
      />

      {/* TABLA DE PRECIOS */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        {/* La tabla va PRIMERO: es el trabajo de la página ("¿dónde lo
            compro más barato?"). Antes la escalera de precios iba arriba y
            en mobile empujaba la tabla ~2.000px hacia abajo. */}
        <section id="precios" className="scroll-mt-24">
          <div className="mb-5">
            <h2 className="display text-2xl sm:text-3xl font-semibold text-ink">
              Comparación de precios
            </h2>
            <p className="text-graphite text-sm mt-1">
              Botella de 750&nbsp;ml, de menor a mayor precio ·{" "}
              {allOutOfStock
                ? `${offers.length} sin stock`
                : `${inStockOffers.length} con stock`}
            </p>
          </div>

          <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_1fr_1.1fr_150px] gap-4 px-5 py-3 bg-snow border-b border-ink/10 text-xs font-semibold text-graphite uppercase tracking-wider">
              <div>Vinoteca</div>
              <div className="text-center">Precio</div>
              <div className="text-center">Vs. mejor precio</div>
              <div />
            </div>
            {mainOffers.map((offer) => (
              <OfferRow
                key={offer.externalUrl}
                offer={offer}
                brand={group.brand}
                bestOffer={bestOffer}
                highlightBest={inStockOffers.length >= 2}
              />
            ))}
          </div>

          {hiddenOutOfStock.length > 0 && (
            <details className="group/oos mt-3 bg-white border border-ink/10 rounded-2xl overflow-hidden">
              <summary className="cursor-wine list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 min-h-11 text-sm font-semibold text-ink hover:bg-snow/60">
                <span>
                  {hiddenOutOfStock.length}{" "}
                  {hiddenOutOfStock.length === 1
                    ? "vinoteca lo tiene"
                    : "vinotecas lo tienen"}{" "}
                  en catálogo pero sin stock hoy
                </span>
                <Chevron className="shrink-0 text-graphite transition-transform group-open/oos:rotate-180" />
              </summary>
              <div className="border-t border-ink/10">
                {hiddenOutOfStock.map((offer) => (
                  <OfferRow
                    key={offer.externalUrl}
                    offer={offer}
                    brand={group.brand}
                    bestOffer={bestOffer}
                  />
                ))}
              </div>
            </details>
          )}

          {caseOffersAll.length > 0 && (
            <details className="group/fmt mt-3 bg-white border border-ink/10 rounded-2xl overflow-hidden">
              <summary className="cursor-wine list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 min-h-11 hover:bg-snow/60">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">
                    Otros formatos · {caseOffersAll.length}{" "}
                    {caseOffersAll.length === 1 ? "oferta" : "ofertas"}
                  </span>
                  <span className="block text-xs text-graphite mt-0.5">
                    {formatKinds.join(", ")}. No entran en la comparación
                    por botella de arriba.
                  </span>
                </span>
                <Chevron className="shrink-0 text-graphite transition-transform group-open/fmt:rotate-180" />
              </summary>
              <div className="border-t border-ink/10">
                {caseOffersAll
                  .slice()
                  .sort((a, b) => {
                    if (!!a.inStock !== !!b.inStock) return a.inStock ? -1 : 1;
                    return (a.priceArs ?? Infinity) - (b.priceArs ?? Infinity);
                  })
                  .map((offer) => (
                    <OfferRow
                      key={offer.externalUrl}
                      offer={offer}
                      brand={group.brand}
                      variant="format"
                    />
                  ))}
              </div>
            </details>
          )}

          <p className="text-xs text-graphite mt-4">
            Matching determinístico por nombre + añada + formato. No vendemos
            vino. Al tocar &ldquo;visitar&rdquo; vas directo al sitio de la
            vinoteca. La comparación de arriba usa solo botellas individuales
            de 750&nbsp;ml.
          </p>

          {/* Sin GITHUB_TOKEN los endpoints devuelven 503 y no hay dónde
              guardar. Se decide ACÁ, en el server, para no pintar
              controles que al tocarlos desaparecen sin decir nada. */}
          {Boolean(process.env.GITHUB_TOKEN) && (
            <>
              <ReportIssue slug={group.groupSlug} wineName={wineLabel} />
              {matchQuestion && (
                <MatchQuestion
                  pairId={matchQuestion.id}
                  a={matchQuestion.a}
                  b={matchQuestion.b}
                />
              )}
            </>
          )}

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

        {/* Price Ladder — la dispersión contada como postal. Va DESPUÉS
            de la tabla: es contexto, no la decisión. Sólo con 2+ vinotecas
            con stock (sino no hay dispersión que contar). */}
        {ladderOffers.length >= 2 && (
          <section id="ladder" className="mt-12 scroll-mt-24">
            <PriceLadder
              offers={ladderOffers}
              formatArs={formatArs}
              wineName={group.canonicalName}
            />
          </section>
        )}

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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {related.map((r) => (
                <a
                  key={r.groupSlug}
                  href={`/vino/${r.groupSlug}`}
                  className="bg-white rounded-2xl p-3 sm:p-5 border border-ink/10 hover:border-ink/25 transition-colors flex flex-col"
                >
                  <div className="relative w-full aspect-[3/4] bg-snow rounded-lg overflow-hidden mb-3 border border-ink/10">
                    <WineImage
                      src={r.imageUrl}
                      name={r.canonicalName}
                      brand={r.brand}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                      className="object-contain"
                    />
                  </div>
                  {r.brand && (
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-graphite truncate">
                      {displayBrand(r.brand)}
                    </div>
                  )}
                  <div className="display text-sm sm:text-base font-semibold text-ink leading-snug line-clamp-2 min-h-[2.5em]">
                    {displayWineName(r.canonicalName)}
                  </div>
                  <div className="text-xs text-graphite mt-0.5">
                    {r.storeCount} vinoteca{r.storeCount === 1 ? "" : "s"}
                    {r.vintage ? ` · ${r.vintage}` : ""}
                  </div>
                  <div className="display text-lg sm:text-xl font-semibold text-cobalt tabular-nums mt-auto pt-2">
                    {formatArs(r.minPrice)}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {group.brand && (
          <WineLinkList
            title={`Más vinos de ${displayBrand(group.brand)}`}
            wines={siblings}
            more={
              bodegaHref
                ? {
                    href: bodegaHref,
                    label: `Ver todos los vinos de ${displayBrand(group.brand)} →`,
                  }
                : undefined
            }
          />
        )}
        <WineLinkList
          title={`Otros ${priceLabel} de precio parecido`}
          wines={neighbors}
        />
      </div>
      </main>

      <SiteFooter />
      {/* Colchón bajo el footer para que el StickyCTA (fixed, sólo <lg)
          no tape la última línea del footer al llegar al final. */}
      <div aria-hidden="true" className="h-24 bg-ink lg:hidden" />
    </div>
  );
}
