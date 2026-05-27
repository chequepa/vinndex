import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { readDuplicatesReport } from "@/lib/duplicatesReport";

export const metadata: Metadata = {
  title: "Duplicados sospechosos · Admin · Vinndex",
  description:
    "Auditoría de grupos sospechosos de ser duplicados según las heurísticas del matcher.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function DuplicatesPage() {
  const report = await readDuplicatesReport();

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
            <span>Duplicados</span>
          </div>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-4">
            Duplicados sospechosos
          </h1>
          <p className="text-graphite text-base leading-relaxed max-w-3xl">
            Output del script{" "}
            <code className="text-xs bg-white px-1.5 py-0.5 rounded">
              find-duplicates.mjs
            </code>{" "}
            corrido en el último daily-scrape. Cada cluster representa un set
            de grupos que <em>probablemente</em> son el mismo vino mal
            atribuido · no se mergean automáticamente porque hay riesgo de
            falso positivo. Sirve para iterar sobre{" "}
            <code className="text-xs bg-white px-1.5 py-0.5 rounded">
              NAME_PREFIX_TO_BRAND
            </code>{" "}
            y{" "}
            <code className="text-xs bg-white px-1.5 py-0.5 rounded">
              BRAND_ALIASES
            </code>{" "}
            en{" "}
            <code className="text-xs bg-white px-1.5 py-0.5 rounded">
              scripts/build-groups.mjs
            </code>
            .
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14 space-y-10"
      >
        {!report ? (
          <section className="bg-snow rounded-2xl p-8 text-center">
            <p className="display text-2xl font-semibold text-ink mb-2">
              Sin reporte todavía
            </p>
            <p className="text-graphite text-sm max-w-md mx-auto">
              El archivo{" "}
              <code className="bg-white px-1.5 py-0.5 rounded text-xs">
                data/duplicates-report.json
              </code>{" "}
              no existe. Se genera en el daily-scrape (step{" "}
              <em>&ldquo;Find duplicates report&rdquo;</em>) después de Stage
              5. Si la integración está pendiente, podés correrlo a mano:
            </p>
            <pre className="bg-white text-xs p-3 rounded inline-block mt-4 text-left">
              node scripts/find-duplicates.mjs --out=data/duplicates-report.json
            </pre>
          </section>
        ) : (
          <>
            {/* Header stats */}
            <section className="grid sm:grid-cols-4 gap-4">
              <StatCard
                label="Grupos analizados"
                value={report.groupCount.toLocaleString("es-AR")}
              />
              <StatCard
                label="Heurística A"
                value={report.heuristicA.total.toLocaleString("es-AR")}
                hint="clusters"
              />
              <StatCard
                label="Heurística B"
                value={report.heuristicB.total.toLocaleString("es-AR")}
                hint="pares"
              />
              <StatCard
                label="Generado"
                value={formatRelative(report.generatedAt)}
                mono
              />
            </section>

            {/* Heuristic A */}
            <section>
              <h2 className="display text-2xl font-semibold text-ink mb-2">
                Heurística A · Tokens distintivos compartidos
              </h2>
              <p className="text-sm text-graphite mb-6 max-w-2xl">
                {report.heuristicA.description}
              </p>
              {report.heuristicA.items.length === 0 ? (
                <p className="text-graphite text-sm italic">
                  Ningún cluster sospechoso.
                </p>
              ) : (
                <ul className="space-y-4">
                  {report.heuristicA.items.slice(0, 30).map((c) => (
                    <li
                      key={c.key}
                      className="bg-white rounded-xl border border-ink/10 p-4"
                    >
                      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                        <code className="text-xs bg-snow px-2 py-1 rounded font-mono">
                          [{c.key}]
                        </code>
                        <span className="text-xs text-graphite">
                          total stores si se mergea:{" "}
                          <span className="font-semibold text-ink">
                            {c.totalStoresIfMerged}
                          </span>
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {c.members.map((m) => (
                          <li
                            key={m.slug}
                            className="grid grid-cols-[40px_140px_1fr] gap-3 text-xs items-center py-1"
                          >
                            <span className="text-graphite tabular-nums">
                              sc={m.storeCount}
                            </span>
                            <span className="text-ink font-medium truncate">
                              {m.brand ?? "∅"}
                            </span>
                            <Link
                              href={`/vino/${m.slug}`}
                              className="text-cobalt hover:underline truncate"
                              title={m.canonicalName}
                            >
                              {m.canonicalName}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Heuristic B */}
            <section>
              <h2 className="display text-2xl font-semibold text-ink mb-2">
                Heurística B · Jaccard ≥ 0.75
              </h2>
              <p className="text-sm text-graphite mb-6 max-w-2xl">
                {report.heuristicB.description}
              </p>
              {report.heuristicB.items.length === 0 ? (
                <p className="text-graphite text-sm italic">
                  Ningún par sospechoso.
                </p>
              ) : (
                <ul className="space-y-3">
                  {report.heuristicB.items.slice(0, 30).map((p, i) => (
                    <li
                      key={`${p.a.slug}-${p.b.slug}-${i}`}
                      className="bg-white rounded-xl border border-ink/10 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <span className="text-graphite">
                          jaccard:{" "}
                          <span className="font-semibold text-ink">
                            {p.jaccard.toFixed(2)}
                          </span>
                        </span>
                        <span className="text-graphite">
                          total stores:{" "}
                          <span className="font-semibold text-ink">
                            {p.totalStoresIfMerged}
                          </span>
                        </span>
                      </div>
                      <div className="grid grid-cols-[40px_140px_1fr] gap-3 items-center py-0.5">
                        <span className="text-graphite tabular-nums">
                          sc={p.a.storeCount}
                        </span>
                        <span className="text-ink font-medium truncate">
                          {p.a.brand ?? "∅"}
                        </span>
                        <Link
                          href={`/vino/${p.a.slug}`}
                          className="text-cobalt hover:underline truncate"
                          title={p.a.canonicalName}
                        >
                          {p.a.canonicalName}
                        </Link>
                      </div>
                      <div className="grid grid-cols-[40px_140px_1fr] gap-3 items-center py-0.5">
                        <span className="text-graphite tabular-nums">
                          sc={p.b.storeCount}
                        </span>
                        <span className="text-ink font-medium truncate">
                          {p.b.brand ?? "∅"}
                        </span>
                        <Link
                          href={`/vino/${p.b.slug}`}
                          className="text-cobalt hover:underline truncate"
                          title={p.b.canonicalName}
                        >
                          {p.b.canonicalName}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-snow rounded-2xl p-4 border border-ink/10">
      <p className="text-xs uppercase tracking-wider text-graphite mb-1.5">
        {label}
      </p>
      <p
        className={`text-ink font-semibold ${
          mono ? "font-mono text-sm" : "display text-2xl"
        }`}
      >
        {value}
        {hint && (
          <span className="text-xs text-graphite font-normal ml-1.5">
            {hint}
          </span>
        )}
      </p>
    </div>
  );
}
