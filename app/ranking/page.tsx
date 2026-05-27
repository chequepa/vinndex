import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { RANKINGS, applyRanking, type Ranking } from "@/lib/rankings";

export const metadata: Metadata = {
  title: "Rankings de vinos argentinos · Vinndex",
  description:
    "Top malbecs por precio, top bodegas, top regiones y selecciones por momento (asado, regalo, pescado). Vinos argentinos comparados en 100+ vinotecas online.",
  keywords: [
    "rankings vinos argentinos",
    "top malbecs",
    "vinos baratos argentina",
    "mejores espumantes",
    "comparador vinos",
    "vinos para asado",
    "vinos para regalar",
    "top catena",
    "top zuccardi",
    "vinos valle de uco",
  ],
  alternates: { canonical: "https://vinndex.com.ar/ranking" },
};

// Agrupamos los rankings por categoría visual · el orden + grupo es
// puramente cosmético, derivado del slug. Cualquier ranking nuevo
// que se agregue a RANKINGS cae en su bucket por convención de slug.
type Group = { title: string; description: string; predicate: (r: Ranking) => boolean };

const GROUPS: Group[] = [
  {
    title: "Por presupuesto y descubrimiento",
    description:
      "Ordenados por precio, ideales para arrancar a explorar o filtrar por bolsillo.",
    predicate: (r) =>
      r.slug.startsWith("vinos-bajo-") || r.slug.startsWith("top-malbecs-"),
  },
  {
    title: "Por momento u ocasión",
    description: "Selecciones por uso · asado, regalo, mariscos, orgánicos.",
    predicate: (r) =>
      r.slug.startsWith("vinos-para-") ||
      r.slug === "vinos-blancos-para-pescado" ||
      r.slug === "vinos-organicos",
  },
  {
    title: "Por varietal y estilo",
    description:
      "Las uvas más buscadas y los estilos clásicos del catálogo argentino.",
    predicate: (r) =>
      r.slug.startsWith("top-bonardas") ||
      r.slug.startsWith("top-cabernet-") ||
      r.slug === "top-espumantes" ||
      r.slug === "top-blends",
  },
  {
    title: "Por bodega",
    description:
      "Catálogo completo de las bodegas más buscadas, con sus sub-líneas agrupadas bajo el productor real.",
    predicate: (r) =>
      r.slug === "top-catena-zapata" ||
      r.slug === "top-salentein" ||
      r.slug === "top-rutini" ||
      r.slug === "top-zuccardi" ||
      r.slug === "top-trapiche",
  },
  {
    title: "Por región",
    description:
      "Las zonas vinícolas más reconocidas de Argentina · terroir y geografía.",
    predicate: (r) =>
      r.slug === "top-valle-de-uco" ||
      r.slug === "top-lujan-de-cuyo" ||
      r.slug === "top-salta" ||
      r.slug === "top-patagonia",
  },
];

export default function RankingIndex() {
  // Pre-cuento items por ranking para mostrar el badge "N vinos".
  // ~20 rankings × ~13k groups con comparator simple · sub-100ms.
  const cards = RANKINGS.map((r) => ({
    ...r,
    count: applyRanking(r).length,
  }));

  // Distribución en grupos visuales. Si un ranking no matchea ningún
  // grupo cae al bucket "Otros" para que no se pierda silenciosamente.
  const grouped = GROUPS.map((g) => ({
    ...g,
    items: cards.filter((c) => g.predicate(c)),
  }));
  const claimed = new Set(grouped.flatMap((g) => g.items.map((i) => i.slug)));
  const others = cards.filter((c) => !claimed.has(c.slug));
  if (others.length > 0) {
    grouped.push({
      title: "Otros",
      description: "Rankings que no entraron en las categorías de arriba.",
      predicate: () => true,
      items: others,
    });
  }

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
            Listas curadas para descubrir el vino que estás buscando, por
            precio, ocasión, varietal, bodega o región. Todas se actualizan
            con el snapshot diario y reflejan el dato real de las vinotecas
            online.
          </p>
          <p className="text-xs text-graphite mt-4">
            {RANKINGS.length} rankings disponibles · sin patrocinios · el orden
            refleja el dato real bajo el criterio de cada lista.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-12 lg:py-16 space-y-14">
        {grouped.map((group) => (
          <section key={group.title}>
            <h2 className="display text-2xl md:text-3xl font-semibold text-ink mb-2">
              {group.title}
            </h2>
            <p className="text-sm text-graphite mb-6 max-w-2xl">
              {group.description}
            </p>
            <ul className="grid sm:grid-cols-2 gap-4">
              {group.items.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/ranking/${r.slug}`}
                    className="block bg-white rounded-2xl border border-ink/10 hover:border-cobalt hover:shadow-md p-6 transition-all h-full"
                  >
                    <p className="text-xs uppercase tracking-wider text-graphite font-semibold mb-2">
                      Ranking · {r.count} vinos
                    </p>
                    <h3 className="display text-xl font-semibold text-ink mb-2 leading-tight">
                      {r.title}
                    </h3>
                    <p className="text-sm text-graphite leading-relaxed">
                      {r.subtitle}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <SiteFooter />
    </div>
  );
}
