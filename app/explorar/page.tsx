import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WineCompass } from "@/components/WineCompass";
import { buildCompassDataset } from "@/lib/compass";

export const metadata: Metadata = {
  title: "Explorar vinos · Vinndex",
  description:
    "Mapa interactivo de vinos argentinos por cosecha y precio. Joven o de guarda, asequible o premium, todo en un plano. Movés el cursor y aparece la constelación de los vinos cerca tuyo.",
  alternates: { canonical: "https://vinndex.com.ar/explorar" },
  openGraph: {
    title: "Explorar vinos · Vinndex",
    description:
      "Mapa interactivo de vinos argentinos por cosecha y precio.",
    url: "https://vinndex.com.ar/explorar",
    siteName: "Vinndex",
    type: "website",
    locale: "es_AR",
  },
};

export default function ExplorarPage() {
  const dataset = buildCompassDataset(600);

  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Explorar</span>
          </div>
          <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-4">
            El plano del catálogo
          </p>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.02] mb-6">
            Vinos por{" "}
            <span className="italic font-normal">cosecha</span> y{" "}
            <span className="italic font-normal">precio.</span>
          </h1>
          <p className="text-graphite text-lg leading-relaxed max-w-2xl">
            Cada punto es un vino del catálogo. Los más jóvenes a la
            izquierda, los de guarda a la derecha. Los más caros arriba,
            los asequibles abajo. Movés el cursor por el plano y se arma
            una constelación con los tres vinos más cercanos.
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-6xl mx-auto px-4 lg:px-8 py-10 lg:py-14"
      >
        <WineCompass dataset={dataset} />

        <section className="mt-14 grid md:grid-cols-2 gap-8 max-w-4xl">
          <div>
            <h2 className="display text-xl font-semibold text-ink mb-3">
              Cómo leerlo
            </h2>
            <p className="text-graphite leading-relaxed text-sm">
              El eje horizontal es el año de cosecha. A la izquierda los
              más jóvenes (2024 hacia atrás), a la derecha los de guarda
              (hasta 2010). El eje vertical es el precio mínimo entre las
              vinotecas online (escala logarítmica para que los $4.000
              y los $200.000 convivan sin aplastar al medio).
            </p>
          </div>
          <div>
            <h2 className="display text-xl font-semibold text-ink mb-3">
              Por qué solo 600 vinos
            </h2>
            <p className="text-graphite leading-relaxed text-sm">
              El catálogo tiene varios miles de vinos comparables. El plano
              muestra los 600 con más cobertura (vinotecas que los venden).
              Para el resto, usá{" "}
              <Link
                href="/buscar"
                className="text-cobalt underline hover:no-underline"
              >
                el buscador
              </Link>{" "}
              o filtrá por varietal y región acá arriba.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
