import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BottleFallback } from "@/components/BottleFallback";
import { displayWineName } from "@/lib/displayWineName";
import {
  findGroup,
  formatArs,
  displayBrand,
  storeName,
} from "@/lib/snapshot";
import { readVsPairs, findVsPair } from "@/lib/vsPairs";
import type { ProductGroup } from "@/lib/matching";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const file = await readVsPairs();
  if (!file) return [];
  return file.pairs.map((p) => ({ slug: p.slug }));
}

function bothExist(slugA: string, slugB: string) {
  return findGroup(slugA) && findGroup(slugB);
}

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { slug } = await params;
  const pair = await findVsPair(slug);
  if (!pair) return { title: "Comparación no encontrada · Vinndex" };
  const a = findGroup(pair.slugA);
  const b = findGroup(pair.slugB);
  if (!a || !b) return { title: "Comparación no encontrada · Vinndex" };

  const an = displayWineName(a.canonicalName);
  const bn = displayWineName(b.canonicalName);
  const title = `${an} vs ${bn} · comparar precios | Vinndex`;
  const description =
    `Comparamos ${an} y ${bn}: precio mínimo, cantidad de vinotecas, ` +
    `varietal, región. Encontrá el mejor precio para ambos en vinotecas ` +
    `online de Argentina.`;

  return {
    title,
    description,
    keywords: [
      `${a.canonicalName} vs ${b.canonicalName}`,
      a.canonicalName,
      b.canonicalName,
      a.brand ?? undefined,
      b.brand ?? undefined,
      pair.varietal,
      "comparar vinos",
      "vino argentino",
    ].filter(Boolean) as string[],
    alternates: { canonical: `https://vinndex.com.ar/vs/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://vinndex.com.ar/vs/${slug}`,
      siteName: "Vinndex",
      type: "website",
      locale: "es_AR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function VsPage({ params }: Params) {
  const { slug } = await params;

  // Parse fallback: si el slug viene tal cual escrito por el usuario
  // pero NO está en la lista pre-generada, intentamos parsearlo
  // dinámicamente · sirve para los pares que no entraron al top 400.
  const pair = await findVsPair(slug);
  let slugA: string;
  let slugB: string;
  if (pair) {
    slugA = pair.slugA;
    slugB = pair.slugB;
  } else {
    // Parse manual del slug "a-vs-b". Ojo: hay que buscar la última
    // ocurrencia de "-vs-" porque el slug puede contener "vs" como
    // parte de un nombre.
    const idx = slug.lastIndexOf("-vs-");
    if (idx < 0) notFound();
    slugA = slug.slice(0, idx);
    slugB = slug.slice(idx + 4);
    // Canonicalizar orden alfabético · si el usuario llega a
    // /vs/b-vs-a, redirigimos a /vs/a-vs-b para no duplicar.
    if (slugA > slugB) {
      redirect(`/vs/${slugB}-vs-${slugA}`);
    }
    if (!bothExist(slugA, slugB)) notFound();
  }

  const a = findGroup(slugA);
  const b = findGroup(slugB);
  if (!a || !b) notFound();

  // JSON-LD ItemList para que Google entienda que esta página
  // describe DOS productos a la vez.
  const itemListJsonLd = {
    "@context": "https://schema.org/",
    "@type": "ItemList",
    name: `${a.canonicalName} vs ${b.canonicalName}`,
    numberOfItems: 2,
    itemListElement: [a, b].map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://vinndex.com.ar/vino/${g.groupSlug}`,
      name: g.canonicalName,
    })),
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-4">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/comparar" className="hover:text-ink">
              Comparar
            </Link>
            <span>/</span>
            <span>vs</span>
          </div>
          <h1 className="display text-3xl md:text-5xl font-semibold text-ink leading-[1.1] mb-4">
            {displayWineName(a.canonicalName)}{" "}
            <span className="italic font-normal text-graphite">vs</span>{" "}
            {displayWineName(b.canonicalName)}
          </h1>
          <p className="text-graphite text-base leading-relaxed max-w-3xl">
            Precio comparado en vinotecas online de Argentina. Ambos son del
            varietal{" "}
            <span className="text-ink font-medium capitalize">
              {(pair?.varietal ?? a.varietals?.[0] ?? "").toLowerCase()}
            </span>
            . Tocá el que te interese para ver la lista completa de tiendas y
            sumar más a la comparación.
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14"
      >
        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
          <Card wine={a} bestPriceOf={a} other={b} />
          <Card wine={b} bestPriceOf={a.minPrice && b.minPrice && b.minPrice < a.minPrice ? b : a} other={a} />
        </div>

        {/* Compare table · desglose punto por punto */}
        <section className="mt-12">
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Comparación detallada
          </h2>
          <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <Row label="Precio mínimo" a={formatArs(a.minPrice)} b={formatArs(b.minPrice)} highlight={priceWinner(a, b)} />
            <Row label="Vinotecas" a={`${a.storeCount}`} b={`${b.storeCount}`} highlight={storeCountWinner(a, b)} />
            <Row label="Varietal" a={(a.varietals ?? []).join(", ") || "—"} b={(b.varietals ?? []).join(", ") || "—"} />
            <Row label="Región" a={a.region ?? "—"} b={b.region ?? "—"} />
            <Row label="Tipo" a={a.type ?? "—"} b={b.type ?? "—"} />
            <Row label="Bodega" a={displayBrand(a.brand) || "—"} b={displayBrand(b.brand) || "—"} />
          </div>
        </section>

        {/* CTA al /comparar para armar set propio */}
        <section className="mt-10 bg-snow rounded-2xl p-6 text-center">
          <p className="text-sm text-graphite mb-3">
            ¿Querés sumar más vinos a esta comparación?
          </p>
          <Link
            href={`/comparar?slugs=${a.groupSlug},${b.groupSlug}`}
            className="cursor-wine inline-flex items-center gap-2 bg-cobalt text-snow font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-ink transition-colors"
          >
            Comparar hasta 4 vinos →
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function priceWinner(a: ProductGroup, b: ProductGroup): "a" | "b" | null {
  if (a.minPrice == null || b.minPrice == null) return null;
  if (a.minPrice === b.minPrice) return null;
  return a.minPrice < b.minPrice ? "a" : "b";
}

function storeCountWinner(a: ProductGroup, b: ProductGroup): "a" | "b" | null {
  if (a.storeCount === b.storeCount) return null;
  return a.storeCount > b.storeCount ? "a" : "b";
}

function Row({
  label,
  a,
  b,
  highlight,
}: {
  label: string;
  a: string;
  b: string;
  highlight?: "a" | "b" | null;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_1fr] gap-3 px-4 py-3 border-b border-ink/5 last:border-0 text-sm">
      <span className="text-xs uppercase tracking-wider text-graphite self-center">
        {label}
      </span>
      <span
        className={`text-ink ${highlight === "a" ? "font-bold text-malbec" : ""}`}
      >
        {a}
      </span>
      <span
        className={`text-ink ${highlight === "b" ? "font-bold text-malbec" : ""}`}
      >
        {b}
      </span>
    </div>
  );
}

function Card({
  wine,
  bestPriceOf: _bestPriceOf,
  other,
}: {
  wine: ProductGroup;
  bestPriceOf: ProductGroup;
  other: ProductGroup;
}) {
  const isCheaper =
    wine.minPrice != null &&
    other.minPrice != null &&
    wine.minPrice < other.minPrice;
  const savings =
    isCheaper &&
    other.minPrice &&
    wine.minPrice &&
    other.minPrice > 0
      ? Math.round(((other.minPrice - wine.minPrice) / other.minPrice) * 100)
      : 0;
  const bestOffer = wine.offers?.find((o) => o.inStock);

  return (
    <article
      className={`relative rounded-3xl border p-5 lg:p-6 flex flex-col bg-white ${
        isCheaper ? "border-mustard ring-2 ring-mustard/40" : "border-ink/10"
      }`}
    >
      {isCheaper && (
        <span className="absolute -top-3 left-4 bg-mustard text-ink text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow">
          Más barato {savings ? `· -${savings}%` : ""}
        </span>
      )}

      <div className="relative w-28 h-40 mx-auto mb-4 rounded-lg overflow-hidden bg-snow border border-ink/10">
        {wine.imageUrl ? (
          <Image
            src={wine.imageUrl}
            alt={wine.canonicalName}
            fill
            sizes="112px"
            className="object-contain"
          />
        ) : (
          <BottleFallback name={wine.canonicalName} brand={wine.brand} />
        )}
      </div>

      <p className="text-xs uppercase tracking-wide text-graphite truncate">
        {displayBrand(wine.brand)}
      </p>
      <h2 className="display text-lg md:text-xl font-semibold text-ink leading-tight line-clamp-2 min-h-[2.6rem] mb-2">
        {displayWineName(wine.canonicalName)}
      </h2>

      <dl className="mt-2 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between">
          <dt className="text-xs uppercase tracking-wide text-graphite">
            Desde
          </dt>
          <dd
            className={`display text-2xl font-semibold ${isCheaper ? "text-malbec" : "text-cobalt"}`}
          >
            {wine.minPrice != null ? formatArs(wine.minPrice) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-xs uppercase tracking-wide text-graphite">
            Vinotecas
          </dt>
          <dd className="font-semibold text-ink">{wine.storeCount}</dd>
        </div>
        {bestOffer && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs uppercase tracking-wide text-graphite shrink-0">
              Mejor en
            </dt>
            <dd className="text-right text-ink truncate">
              {storeName(bestOffer.storeSlug)}
            </dd>
          </div>
        )}
      </dl>

      <Link
        href={`/vino/${wine.groupSlug}`}
        className="mt-4 cursor-wine text-center bg-cobalt hover:bg-ink text-snow font-semibold py-2 rounded-full text-sm transition-colors"
      >
        Ver ficha completa →
      </Link>
    </article>
  );
}
