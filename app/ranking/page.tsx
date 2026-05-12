import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { RANKINGS, applyRanking } from "@/lib/rankings";

export const metadata: Metadata = {
  title: "Rankings de vinos argentinos — Vinndex",
  description:
    "Listas curadas de vinos argentinos: top malbecs baratos, top espumantes, blends, Cabernet Sauvignon, Bonarda. Comparados en múltiples vinotecas online.",
  keywords: [
    "rankings vinos argentinos",
    "top malbecs",
    "vinos baratos argentina",
    "mejores espumantes",
    "comparador vinos",
  ],
  alternates: { canonical: "https://vinndex.com.ar/ranking" },
};

export default function RankingIndex() {
  // Pre-cuento items por ranking para mostrar el badge "N vinos".
  // Es caro? No — 8 rankings × ~13k groups con comparator simple.
  const cards = RANKINGS.map((r) => ({
    ...r,
    count: applyRanking(r).length,
  }));

  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Rankings</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Rankings de vinos
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            Listas curadas para descubrir el vino que estás buscando: top
            malbecs por precio, espumantes, blends, vinos bajo cierto valor.
            Todas se actualizan con el snapshot diario y reflejan el dato real
            de las vinotecas online.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <ul className="grid sm:grid-cols-2 gap-4">
          {cards.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/ranking/${r.slug}`}
                className="block bg-white rounded-2xl border border-ink/10 hover:border-cobalt hover:shadow-md p-6 transition-all h-full"
              >
                <p className="text-xs uppercase tracking-wider text-graphite font-semibold mb-2">
                  Ranking · {r.count} vinos
                </p>
                <h2 className="display text-2xl font-semibold text-ink mb-2 leading-tight">
                  {r.title}
                </h2>
                <p className="text-sm text-graphite leading-relaxed">
                  {r.subtitle}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter />
    </div>
  );
}
