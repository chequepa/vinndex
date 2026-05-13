import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BottleFallback } from "@/components/BottleFallback";
import { CompareRemoveButton } from "./CompareRemoveButton";
import Link from "next/link";
import {
  findGroup,
  formatArs,
  storeName,
  displayBrand,
} from "@/lib/snapshot";
import { displayWineName } from "@/lib/displayWineName";
import type { ProductGroup } from "@/lib/matching";

export const metadata: Metadata = {
  title: "Comparar vinos — Vinndex",
  description:
    "Hasta 4 vinos lado a lado: precio mínimo, cantidad de vinotecas, varietales, región.",
  robots: { index: false, follow: true },
};

type Params = {
  searchParams: Promise<{ slugs?: string }>;
};

function pickBestPriceSlug(groups: ProductGroup[]): string | null {
  let best: { slug: string; price: number } | null = null;
  for (const g of groups) {
    if (g.minPrice == null || g.minPrice <= 0) continue;
    if (!best || g.minPrice < best.price) {
      best = { slug: g.groupSlug, price: g.minPrice };
    }
  }
  return best?.slug ?? null;
}

export default async function Comparar({ searchParams }: Params) {
  const params = await searchParams;
  const rawSlugs = (params.slugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const groups = rawSlugs
    .map((s) => findGroup(s))
    .filter((g): g is ProductGroup => !!g);

  const bestPriceSlug = pickBestPriceSlug(groups);

  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-10">
        <header className="mb-8">
          <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-2">
            Comparar
          </p>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05]">
            {groups.length === 0
              ? "Elegí vinos para comparar"
              : groups.length === 1
                ? "Agregá uno más para comparar"
                : `Comparando ${groups.length} vinos`}
          </h1>
          <p className="text-graphite mt-3 max-w-xl">
            Tocá la estrella de comparar en cualquier ficha. Hasta 4 vinos a la
            vez. La lista queda en tu dispositivo.
          </p>
        </header>

        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {groups.map((g) => (
              <CompareCard
                key={g.groupSlug}
                group={g}
                isBest={g.groupSlug === bestPriceSlug && groups.length >= 2}
                allSlugs={groups.map((x) => x.groupSlug)}
              />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function CompareCard({
  group: g,
  isBest,
  allSlugs,
}: {
  group: ProductGroup;
  isBest: boolean;
  allSlugs: string[];
}) {
  const inStockOffer = g.offers?.find((o) => o.inStock);
  return (
    <article
      className={`relative rounded-3xl border p-5 flex flex-col bg-white ${
        isBest ? "border-mustard ring-2 ring-mustard/40" : "border-ink/10"
      }`}
    >
      {isBest && (
        <span className="absolute -top-3 left-4 bg-mustard text-ink text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow">
          Mejor precio
        </span>
      )}

      <CompareRemoveButton slug={g.groupSlug} allSlugs={allSlugs} />

      <div className="wine-thumb mx-auto mb-4 !w-24 !h-36">
        {g.imageUrl ? (
          <Image
            src={g.imageUrl}
            alt={g.canonicalName}
            width={96}
            height={144}
            className="w-full h-full object-contain"
            unoptimized
          />
        ) : (
          <BottleFallback name={g.canonicalName} brand={g.brand} />
        )}
      </div>

      {g.brand && (
        <p className="text-[10px] uppercase tracking-wide text-graphite truncate">
          {displayBrand(g.brand)}
        </p>
      )}
      <h2 className="display text-base md:text-lg font-semibold text-ink leading-tight line-clamp-2 min-h-[2.6rem]">
        {displayWineName(g.canonicalName)}
        {g.vintage && (
          <span className="font-normal text-graphite"> · {g.vintage}</span>
        )}
      </h2>

      <dl className="mt-4 pt-4 border-t border-ink/5 space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between">
          <dt className="text-xs text-graphite uppercase tracking-wide">
            Desde
          </dt>
          <dd
            className={`display text-lg font-semibold ${isBest ? "text-malbec" : "text-ink"}`}
          >
            {g.minPrice != null ? formatArs(g.minPrice) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-xs text-graphite uppercase tracking-wide">
            Vinotecas
          </dt>
          <dd className="font-semibold text-ink">{g.storeCount}</dd>
        </div>
        {g.varietals && g.varietals.length > 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-graphite uppercase tracking-wide shrink-0">
              Varietal
            </dt>
            <dd className="text-right capitalize text-ink truncate">
              {g.varietals.slice(0, 2).join(", ")}
            </dd>
          </div>
        )}
        {g.region && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-graphite uppercase tracking-wide shrink-0">
              Región
            </dt>
            <dd className="text-right capitalize text-ink truncate">
              {g.region}
            </dd>
          </div>
        )}
        {g.type && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-graphite uppercase tracking-wide shrink-0">
              Tipo
            </dt>
            <dd className="text-right capitalize text-ink truncate">
              {g.type}
            </dd>
          </div>
        )}
        {inStockOffer && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-graphite uppercase tracking-wide shrink-0">
              Mejor en
            </dt>
            <dd className="text-right text-ink truncate">
              {storeName(inStockOffer.storeSlug)}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex flex-col gap-2">
        <a
          href={`/vino/${g.groupSlug}`}
          className="cursor-wine text-center bg-cobalt hover:bg-ink text-snow font-semibold py-2 rounded-full text-sm transition-colors"
        >
          Ver ficha
        </a>
        {inStockOffer && (
          <a
            href={inStockOffer.externalUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="cursor-wine text-center border border-ink/15 text-ink hover:border-ink font-medium py-2 rounded-full text-sm transition-colors"
          >
            Ir a tienda
          </a>
        )}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-ink/10 bg-snow/50 p-10 text-center">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mx-auto mb-4 text-graphite"
        aria-hidden="true"
      >
        <path d="M3 6h13M3 12h13M3 18h13" />
        <path d="M19 3v18" />
      </svg>
      <h2 className="display text-2xl font-semibold text-ink mb-2">
        Tu lista de comparar está vacía
      </h2>
      <p className="text-graphite max-w-md mx-auto mb-6">
        En cualquier ficha de vino vas a ver un botón &ldquo;Comparar&rdquo;.
        Tocalo en 2 a 4 etiquetas y después volvé acá para verlas lado a
        lado.
      </p>
      <Link
        href="/buscar?multi=1"
        className="cursor-wine inline-flex bg-cobalt hover:bg-ink text-snow font-semibold px-6 py-3 rounded-full transition-colors"
      >
        Explorar catálogo
      </Link>
    </div>
  );
}
