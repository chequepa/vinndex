import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import {
  topBrands,
  snapshotStats,
  brandSlug,
  varietalPages,
  regionPages,
} from "@/lib/snapshot";
import Link from "next/link";

export default function NotFound() {
  const brands = topBrands(8);
  const stats = snapshotStats();
  const varietals = varietalPages()
    .filter((v) => v.groupCount >= 30)
    .slice(0, 8);
  const regions = regionPages()
    .filter((r) => r.groupCount >= 20)
    .slice(0, 6);
  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <SiteHeader />

      <main id="contenido" className="flex-1 max-w-4xl mx-auto px-6 py-16 lg:py-20">
        <div className="text-center mb-14">
          <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-4">
            404 · Este vino no está en el catálogo
          </p>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-5">
            No lo encontramos.
            <br />
            <span className="italic font-normal">Por ahora.</span>
          </h1>
          <p className="text-graphite text-lg max-w-xl mx-auto leading-relaxed">
            Tenemos {stats.productCount.toLocaleString("es-AR")} ofertas de{" "}
            {stats.storeCount} vinotecas argentinas. Buscá el nombre arriba,
            explorá por bodega, varietal o región, o probá con alguno de los
            más buscados.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-8">
            <Link
              href="/buscar?multi=1"
              className="cursor-wine bg-cobalt hover:bg-ink text-snow font-semibold px-6 py-3 rounded-full transition-colors"
            >
              Ver vinos comparables
            </Link>
            <Link
              href="/"
              className="cursor-wine border border-ink/20 hover:border-cobalt text-ink font-semibold px-6 py-3 rounded-full transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        </div>

        <section className="mb-10">
          <h2 className="display text-xl font-semibold text-ink mb-4">
            Bodegas con más vinos en el catálogo
          </h2>
          <div className="flex flex-wrap gap-2">
            {brands.map((b) => (
              <a
                key={b.name}
                href={`/bodega/${brandSlug(b.name)}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 hover:border-cobalt hover:text-cobalt transition-colors text-sm font-medium"
              >
                {b.name}
                <span className="text-xs text-graphite">({b.count})</span>
              </a>
            ))}
          </div>
        </section>

        {varietals.length > 0 && (
          <section className="mb-10">
            <h2 className="display text-xl font-semibold text-ink mb-4">
              Por varietal
            </h2>
            <div className="flex flex-wrap gap-2">
              {varietals.map((v) => (
                <a
                  key={v.slug}
                  href={`/varietal/${v.slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 hover:border-malbec hover:text-malbec transition-colors text-sm font-medium capitalize"
                >
                  {v.name}
                  <span className="text-xs text-graphite">
                    ({v.groupCount})
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {regions.length > 0 && (
          <section>
            <h2 className="display text-xl font-semibold text-ink mb-4">
              Por región
            </h2>
            <div className="flex flex-wrap gap-2">
              {regions.map((r) => (
                <a
                  key={r.slug}
                  href={`/region/${r.slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 hover:border-gold hover:text-gold transition-colors text-sm font-medium capitalize"
                >
                  {r.name}
                  <span className="text-xs text-graphite">
                    ({r.groupCount})
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
