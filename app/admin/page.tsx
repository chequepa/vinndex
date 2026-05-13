import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { snapshotStats } from "@/lib/snapshot";
import { readPageviewStats } from "@/lib/pageviews";
import { readDuplicatesReport } from "@/lib/duplicatesReport";
import { readPriceDrops } from "@/lib/priceDrops";

export const metadata: Metadata = {
  title: "Admin — Vinndex",
  description: "Panel interno de Vinndex.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Card = {
  href: string;
  title: string;
  description: string;
  metric?: { value: string; label: string };
};

export default async function AdminIndex() {
  const stats = snapshotStats();
  const [views, dupes, drops] = await Promise.all([
    readPageviewStats(),
    readDuplicatesReport(),
    readPriceDrops(),
  ]);

  const cards: Card[] = [
    {
      href: "/admin/fuentes",
      title: "Auditoría de fuentes",
      description:
        "Estado de las vinotecas relevadas: plataforma, último scrape, # de productos, errores.",
      metric: {
        value: stats.storeCount.toString(),
        label: "vinotecas relevadas",
      },
    },
    {
      href: "/admin/analytics",
      title: "Analytics",
      description:
        "Pageviews server-side. Top páginas, bydía, referrers. Sin cookies, sin tracking persistente.",
      metric: {
        value: views.total.toLocaleString("es-AR"),
        label: "pageviews registrados",
      },
    },
    {
      href: "/admin/duplicates",
      title: "Duplicados sospechosos",
      description:
        "Output del find-duplicates.mjs corrido en el daily-scrape. Sirve para iterar sobre NAME_PREFIX_TO_BRAND y aliases.",
      metric: {
        value: dupes
          ? dupes.heuristicA.total.toLocaleString("es-AR")
          : "—",
        label: dupes ? "clusters heurística A" : "sin reporte",
      },
    },
    {
      href: "/admin/price-drops",
      title: "Price drops",
      description:
        "Bajas ≥15% vs mediana 7d. Detectadas en el daily-scrape, filtros anti-noise aplicados.",
      metric: {
        value: drops ? drops.drops.length.toLocaleString("es-AR") : "—",
        label: drops ? "drops hoy" : "sin reporte",
      },
    },
  ];

  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-4">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Admin</span>
          </div>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-4">
            Panel interno
          </h1>
          <p className="text-graphite text-base leading-relaxed max-w-2xl">
            Páginas internas del equipo — auditoría de fuentes y pageviews
            agregados. Protegido con HTTP Basic Auth vía{" "}
            <code className="bg-white px-1.5 py-0.5 rounded text-xs">
              ADMIN_PASSWORD
            </code>{" "}
            (ver <code>proxy.ts</code>).
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14"
      >
        <ul className="grid sm:grid-cols-2 gap-4">
          {cards.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="block bg-white rounded-2xl border border-ink/10 hover:border-cobalt hover:shadow-md p-6 transition-all h-full"
              >
                <h2 className="display text-xl md:text-2xl font-semibold text-ink mb-2">
                  {c.title}
                </h2>
                <p className="text-sm text-graphite leading-relaxed mb-4">
                  {c.description}
                </p>
                {c.metric && (
                  <div className="border-t border-ink/5 pt-3 flex items-baseline gap-2">
                    <span className="display text-2xl font-semibold text-cobalt tabular-nums">
                      {c.metric.value}
                    </span>
                    <span className="text-xs text-graphite uppercase tracking-wider">
                      {c.metric.label}
                    </span>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>

        {/* Quick stats footer */}
        <section className="mt-12 pt-8 border-t border-ink/10">
          <h2 className="display text-lg font-semibold text-ink mb-4">
            Snapshot actual
          </h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Stat label="Grupos" value={stats.groupCount.toLocaleString("es-AR")} />
            <Stat
              label="Multi-tienda"
              value={stats.multiStoreGroupCount.toLocaleString("es-AR")}
            />
            <Stat
              label="Ofertas"
              value={stats.productCount.toLocaleString("es-AR")}
            />
            <Stat label="Tiendas" value={stats.storeCount.toString()} />
          </dl>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-graphite mb-0.5">
        {label}
      </dt>
      <dd className="display text-xl font-semibold text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}
