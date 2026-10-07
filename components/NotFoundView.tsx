import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { SearchInput } from "./SearchInput";
import { EmptyBottle } from "./EmptyBottle";
import {
  topBrands,
  brandSlug,
  varietalPages,
  regionPages,
} from "@/lib/snapshot";

type Props = {
  eyebrow: string;
  title: string;
  /** Segunda línea del h1, en itálica (una sola idea de énfasis). */
  emphasis: string;
  lead: ReactNode;
};

/**
 * 404 de Vinndex, compartido por el 404 global (`app/not-found.tsx`,
 * cualquier URL que no existe) y el de ficha (`app/vino/[slug]`).
 *
 * Un 404 en un comparador casi siempre es alguien que vino de Google a
 * un vino que ya no está, así que lo primero es el buscador (con
 * autocomplete) y después salidas concretas: bodegas, varietales,
 * regiones. La ilustración es la postal nocturna de una botella vacía
 * con etiqueta "Reserva 404".
 */
export function NotFoundView({ eyebrow, title, emphasis, lead }: Props) {
  const brands = topBrands(8);
  const varietals = varietalPages()
    .filter((v) => v.groupCount >= 30)
    .slice(0, 8);
  const regions = regionPages()
    .filter((r) => r.groupCount >= 20)
    .slice(0, 6);

  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <SiteHeader />

      <main id="contenido" className="flex-1">
        {/* grid-cols-1 explícito: sin él la columna implícita en mobile
            mide el min-content del eyebrow y el bloque se sale de 390px. */}
        <section className="max-w-6xl mx-auto px-6 pt-10 pb-16 lg:pt-16 lg:pb-20 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-4">
              {eyebrow}
            </p>
            <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.02] mb-5">
              {title}
              <br />
              <span className="italic font-normal">{emphasis}</span>
            </h1>
            <div className="text-graphite text-lg max-w-xl leading-relaxed">
              {lead}
            </div>

            <form action="/buscar" role="search" className="mt-8 max-w-xl">
              <div className="relative flex items-center bg-snow rounded-full border border-ink/10 focus-within:border-cobalt p-1.5 pl-5">
                <svg
                  width="20"
                  height="20"
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
                  placeholder="Probá con el nombre del vino o la bodega"
                  aria-label="Buscar vinos"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none px-3 py-2.5 text-ink placeholder:text-graphite"
                  withAutocomplete
                />
                <button
                  type="submit"
                  className="press cursor-wine shrink-0 bg-cobalt hover:bg-ink text-snow font-semibold px-5 py-2.5 rounded-full text-sm"
                >
                  Buscar
                </button>
              </div>
            </form>

            <div className="flex flex-wrap gap-3 mt-6">
              <Link
                href="/buscar?multi=1"
                className="arrow-nudge press cursor-wine inline-flex items-center gap-2 min-h-11 bg-ink text-snow hover:bg-cobalt font-semibold px-5 py-2.5 rounded-full text-sm"
              >
                Ver vinos comparables <span data-arrow aria-hidden="true">→</span>
              </Link>
              <Link
                href="/"
                className="press cursor-wine inline-flex items-center min-h-11 border border-ink/20 hover:border-cobalt hover:text-cobalt text-ink font-semibold px-5 py-2.5 rounded-full text-sm"
              >
                Volver al inicio
              </Link>
            </div>
          </div>

          <div className="relative rounded-3xl overflow-hidden ficha-hero grain">
            <EmptyBottle className="relative block w-full h-auto" />
          </div>
        </section>

        <section className="bg-snow/50 border-t border-ink/10">
          <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-3 gap-10">
            <div>
              <h2 className="display text-xl font-semibold text-ink mb-4">
                Bodegas con más vinos
              </h2>
              <ul className="flex flex-wrap gap-2">
                {brands.map((b) => (
                  <li key={b.name}>
                    <Link
                      href={`/bodega/${brandSlug(b.name)}`}
                      className="press cursor-wine inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-ink/10 hover:border-cobalt hover:text-cobalt text-sm font-medium"
                    >
                      {b.name}
                      <span className="text-xs text-graphite tabular-nums">
                        {b.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {varietals.length > 0 && (
              <div>
                <h2 className="display text-xl font-semibold text-ink mb-4">
                  Por varietal
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {varietals.map((v) => (
                    <li key={v.slug}>
                      <Link
                        href={`/varietal/${v.slug}`}
                        className="press cursor-wine inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-ink/10 hover:border-malbec hover:text-malbec text-sm font-medium"
                      >
                        {v.name}
                        <span className="text-xs text-graphite tabular-nums">
                          {v.groupCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {regions.length > 0 && (
              <div>
                <h2 className="display text-xl font-semibold text-ink mb-4">
                  Por región
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {regions.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/region/${r.slug}`}
                        className="press cursor-wine inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-ink/10 hover:border-gold hover:text-gold text-sm font-medium"
                      >
                        {r.name}
                        <span className="text-xs text-graphite tabular-nums">
                          {r.groupCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <p className="max-w-6xl mx-auto px-6 pb-14 text-sm text-graphite">
            ¿Llegaste desde un link de Vinndex y no anduvo?{" "}
            <Link href="/contacto" className="text-cobalt font-semibold hover:underline">
              Avisanos
            </Link>{" "}
            y lo arreglamos.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
