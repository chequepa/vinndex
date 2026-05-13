import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BottleFallback } from "@/components/BottleFallback";
import { displayWineName } from "@/lib/displayWineName";
import { formatArs, displayBrand, storeName } from "@/lib/snapshot";
import { readPriceDrops } from "@/lib/priceDrops";

export const metadata: Metadata = {
  title: "Price drops — Admin · Vinndex",
  description:
    "Detector de bajas de precio significativas vs mediana de los últimos 7 días.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function PriceDropsPage() {
  const report = await readPriceDrops();

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
            <Link href="/admin" className="hover:text-ink">
              Admin
            </Link>
            <span>/</span>
            <span>Price drops</span>
          </div>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-4">
            Bajaron de precio
          </h1>
          <p className="text-graphite text-base leading-relaxed max-w-3xl">
            Detector de drops ≥{" "}
            <strong>
              {report ? Math.round(report.threshold * 100) : 15}%
            </strong>{" "}
            vs la mediana del precio de los últimos 7 días. Filtros anti-noise:
            multi-tienda (≥2), ≥7 días de histórico, precio actual ≥ $1.500, no
            destilados/aperitivos, drop ≤70% (sino es typo del scraper).
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14"
      >
        {!report || report.drops.length === 0 ? (
          <section className="bg-snow rounded-2xl p-8 text-center">
            <p className="display text-2xl font-semibold text-ink mb-2">
              Sin drops detectados
            </p>
            <p className="text-graphite text-sm max-w-md mx-auto">
              {report
                ? "Ningún vino bajó significativamente vs su mediana 7d hoy."
                : "El archivo data/price-drops.json no existe. Se genera en el daily-scrape (paso \"Detect price drops\")."}
            </p>
          </section>
        ) : (
          <>
            <p className="text-xs text-graphite mb-6">
              {report.drops.length} drops · generado{" "}
              {formatRelative(report.generatedAt)}
            </p>
            <ol className="space-y-3">
              {report.drops.map((d, i) => (
                <li key={d.slug}>
                  <Link
                    href={`/vino/${d.slug}`}
                    className="grid grid-cols-[40px_64px_1fr_auto] gap-4 items-center bg-white rounded-2xl border border-ink/10 hover:border-cobalt hover:shadow-md p-4 transition-all"
                  >
                    <span className="display text-2xl font-semibold text-cobalt/40 text-center tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="relative w-14 h-20 bg-snow rounded overflow-hidden">
                      {d.imageUrl ? (
                        <Image
                          src={d.imageUrl}
                          alt={d.canonicalName}
                          fill
                          sizes="56px"
                          className="object-contain"
                        />
                      ) : (
                        <BottleFallback
                          name={d.canonicalName}
                          brand={d.brand}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-graphite truncate">
                        {displayBrand(d.brand)}
                      </p>
                      <p className="display text-base md:text-lg font-semibold text-ink leading-tight">
                        {displayWineName(d.canonicalName)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-graphite flex-wrap">
                        <span>
                          mediana 7d:{" "}
                          <span className="line-through">
                            {formatArs(d.medianPrice7d)}
                          </span>
                        </span>
                        <span>·</span>
                        <span>
                          {d.storeCount} vinotecas · mejor en{" "}
                          {storeName(d.storeSlug)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="display text-xl md:text-2xl font-semibold text-malbec">
                        {formatArs(d.currentPrice)}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-wide text-terracota mt-0.5">
                        −{formatPct(d.dropPct)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
