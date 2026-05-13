import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BodegasFilter } from "@/components/BodegasFilter";
import { brandPages } from "@/lib/snapshot";

type SortKey = "stores" | "groups" | "name";

function isValidSort(s: string | undefined): s is SortKey {
  return s === "stores" || s === "groups" || s === "name";
}

type Params = {
  searchParams: Promise<{ sort?: string }>;
};

export const metadata: Metadata = {
  title: "Todas las bodegas argentinas — Vinndex",
  description:
    "Catálogo de bodegas argentinas relevadas en vinotecas online. Filtrá por nombre, ordená por cobertura, # de productos o alfabético. Más de 1.200 bodegas con precios comparados.",
  keywords: [
    "bodegas argentinas",
    "bodegas vino argentina",
    "catálogo bodegas",
    "lista bodegas argentina",
  ],
  alternates: { canonical: "https://vinndex.com.ar/bodegas" },
};

export const dynamic = "force-dynamic";

export default async function BodegasIndex({ searchParams }: Params) {
  const params = await searchParams;
  const sort: SortKey = isValidSort(params.sort) ? params.sort : "stores";

  const pages = brandPages();
  const sorted = [...pages].sort((a, b) => {
    switch (sort) {
      case "groups":
        return b.groupCount - a.groupCount || b.storeCount - a.storeCount;
      case "name":
        return a.name.localeCompare(b.name, "es-AR");
      case "stores":
      default:
        return b.storeCount - a.storeCount || b.groupCount - a.groupCount;
    }
  });

  // Pre-cómputo: precio promedio por bodega.
  // (No lo guardamos en BrandPage para no inflar el JSON exportado.)
  const avgPriceBySlug = new Map<string, number | null>();
  // Recorremos topGroups que ya están en la BrandPage — alcanza para
  // una estimación, no recorremos todos los grupos otra vez.
  for (const p of pages) {
    const prices = p.topGroups
      .map((g) => g.minPrice)
      .filter((x): x is number => typeof x === "number" && x > 0);
    if (prices.length === 0) {
      avgPriceBySlug.set(p.slug, null);
    } else {
      const sum = prices.reduce((s, n) => s + n, 0);
      avgPriceBySlug.set(p.slug, Math.round(sum / prices.length));
    }
  }

  function sortLink(k: SortKey) {
    const sp = new URLSearchParams();
    if (k !== "stores") sp.set("sort", k);
    const qs = sp.toString();
    return qs ? `/bodegas?${qs}` : "/bodegas";
  }

  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-4">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Bodegas</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-4">
            Bodegas argentinas
          </h1>
          <p className="text-graphite text-base md:text-lg leading-relaxed max-w-3xl">
            Catálogo completo de las bodegas relevadas en vinotecas online de
            Argentina — {sorted.length.toLocaleString("es-AR")} bodegas con al
            menos 3 vinos en el snapshot. Filtrá por nombre, ordená por
            cobertura o tocá una para ver su catálogo y precios comparados.
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-6xl mx-auto px-4 lg:px-8 py-10 lg:py-14"
      >
        <BodegasFilter totalCount={sorted.length} />

        {/* Sort controls */}
        <div className="flex items-center gap-2 text-xs flex-wrap mb-4">
          <span className="text-graphite uppercase tracking-wider">Orden:</span>
          {(
            [
              { key: "stores", label: "Más cobertura" },
              { key: "groups", label: "Más vinos" },
              { key: "name", label: "A-Z" },
            ] as const
          ).map((o) => (
            <Link
              key={o.key}
              href={sortLink(o.key)}
              className={`px-3 py-1 rounded-full ${
                sort === o.key
                  ? "bg-ink text-snow font-semibold"
                  : "bg-snow border border-ink/10 hover:border-cobalt"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto -mx-4 lg:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-graphite border-b border-ink/10">
                <th className="py-2 px-4 font-semibold">Bodega</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                  Vinos
                </th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                  Vinotecas
                </th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                  Precio prom.
                </th>
                <th className="py-2 px-4 font-semibold hidden md:table-cell">
                  Regiones
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const avg = avgPriceBySlug.get(p.slug);
                return (
                  <tr
                    key={p.slug}
                    data-search={p.name.toLowerCase()}
                    className="border-b border-ink/5 hover:bg-snow/50 transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <Link
                        href={`/bodega/${p.slug}`}
                        className="text-ink hover:text-cobalt font-medium"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-ink">
                      {p.groupCount.toLocaleString("es-AR")}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-ink">
                      {p.storeCount.toLocaleString("es-AR")}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-ink">
                      {avg !== null && avg !== undefined
                        ? `$${avg.toLocaleString("es-AR")}`
                        : "—"}
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell text-graphite truncate max-w-xs">
                      {p.regions.slice(0, 2).join(", ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
