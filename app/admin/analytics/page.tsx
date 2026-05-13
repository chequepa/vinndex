import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { readPageviewStats } from "@/lib/pageviews";

export const metadata: Metadata = {
  title: "Analytics — Admin · Vinndex",
  description: "Dashboard interno de pageviews server-side.",
  robots: { index: false, follow: false },
};

// Force-dynamic — los datos cambian con cada request.
export const dynamic = "force-dynamic";

function formatNumber(n: number): string {
  return n.toLocaleString("es-AR");
}

function relativeDate(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function AnalyticsPage() {
  const stats = await readPageviewStats();
  const maxDay = stats.byDay.reduce((m, d) => Math.max(m, d.count), 0);

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
            <span>/</span>
            <span>Analytics</span>
          </div>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-4">
            Pageviews
          </h1>
          <p className="text-graphite text-base leading-relaxed max-w-3xl">
            Dashboard server-side de pageviews — lee directo de{" "}
            <code className="text-xs bg-white px-1.5 py-0.5 rounded">
              data/pageviews.ndjson
            </code>
            . Sin cookies, sin sesiones, sin tracking persistente. Se reinicia
            con cada deploy del container.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14 space-y-12">
        {/* Stat cards */}
        <section className="grid sm:grid-cols-3 gap-4">
          <Card label="Pageviews totales" value={formatNumber(stats.total)} />
          <Card
            label="Desde"
            value={relativeDate(stats.oldest)}
            mono
          />
          <Card
            label="Último"
            value={relativeDate(stats.newest)}
            mono
          />
        </section>

        {/* Empty state */}
        {stats.total === 0 && (
          <section className="bg-snow rounded-2xl p-8 text-center">
            <p className="display text-2xl font-semibold text-ink mb-2">
              Sin datos todavía
            </p>
            <p className="text-graphite text-sm max-w-md mx-auto">
              El archivo{" "}
              <code className="bg-white px-1.5 py-0.5 rounded text-xs">
                data/pageviews.ndjson
              </code>{" "}
              está vacío o no existe. Probablemente sea un deploy
              recién iniciado, o el filesystem sea read-only. En ese caso
              los logs de pageviews quedan sólo en{" "}
              <code className="bg-white px-1.5 py-0.5 rounded text-xs">
                stdout
              </code>{" "}
              (Railway logs).
            </p>
          </section>
        )}

        {/* By day (bar chart simple) */}
        {stats.byDay.length > 0 && (
          <section>
            <h2 className="display text-2xl font-semibold text-ink mb-4">
              Por día
            </h2>
            <ul className="space-y-1.5">
              {stats.byDay.slice(-30).map((d) => {
                const pct = maxDay > 0 ? Math.round((d.count / maxDay) * 100) : 0;
                return (
                  <li
                    key={d.day}
                    className="grid grid-cols-[100px_1fr_60px] gap-3 items-center text-sm"
                  >
                    <span className="text-graphite font-mono">{d.day}</span>
                    <div className="h-3 bg-snow rounded overflow-hidden">
                      <div
                        className="h-full bg-cobalt"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-right tabular-nums font-semibold text-ink">
                      {formatNumber(d.count)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* By path */}
        {stats.byPath.length > 0 && (
          <section>
            <h2 className="display text-2xl font-semibold text-ink mb-4">
              Top páginas
            </h2>
            <ol className="space-y-1.5">
              {stats.byPath.slice(0, 30).map((p, i) => (
                <li
                  key={p.path}
                  className="grid grid-cols-[32px_1fr_80px] gap-3 items-center text-sm border-b border-ink/5 pb-1.5"
                >
                  <span className="text-graphite tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <code className="text-xs truncate" title={p.path}>
                    {p.path}
                  </code>
                  <span className="text-right tabular-nums font-semibold text-ink">
                    {formatNumber(p.count)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Referrers */}
        {stats.byReferrer.length > 0 && (
          <section>
            <h2 className="display text-2xl font-semibold text-ink mb-4">
              Top referrers
            </h2>
            <ol className="space-y-1.5">
              {stats.byReferrer.slice(0, 15).map((r) => (
                <li
                  key={r.ref}
                  className="grid grid-cols-[1fr_80px] gap-3 items-center text-sm border-b border-ink/5 pb-1.5"
                >
                  <code className="text-xs truncate" title={r.ref}>
                    {r.ref}
                  </code>
                  <span className="text-right tabular-nums font-semibold text-ink">
                    {formatNumber(r.count)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="text-xs text-graphite border-t border-ink/10 pt-6">
          Esta página es <code>noindex,nofollow</code> y solo es accesible para
          el equipo. No tiene auth — está en una ruta privada que sólo conoce
          quien la creó. Si querés auth real, sumá HTTP basic auth en{" "}
          <code>middleware.ts</code>.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

function Card({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-snow rounded-2xl p-5 border border-ink/10">
      <p className="text-xs uppercase tracking-wider text-graphite mb-1.5">
        {label}
      </p>
      <p
        className={`text-ink font-semibold ${
          mono ? "font-mono text-sm" : "display text-3xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
