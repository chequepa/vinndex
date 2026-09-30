import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ShareButtons } from "@/components/ShareButtons";
import { PriceIndexChart, formatIndex } from "@/components/PriceIndexChart";
import {
  priceIndex,
  changeOver,
  changeSinceStart,
  formatPct,
  verbFor,
  windowLabel,
  formatDateLong,
  formatDateShort,
  monthName,
  VARIETAL_SEGMENT_KEYS,
  BAND_SEGMENT_KEYS,
  TOP_SEGMENT_KEY,
  type IndexPoint,
} from "@/lib/priceIndex";

const idx = priceIndex;
const total = idx.points;
const first = total[0];
const last = total[total.length - 1];
const prev = total[total.length - 2];
const d90 = idx.headline.d90 ?? idx.headline.sinceStart;
const d30 = idx.headline.d30;
const since = idx.headline.sinceStart;
const WINDOW_90 = windowLabel(d90, 90);
const VERB = verbFor(d90.pct);
const MES_BASE = monthName(first.date);
const PCT_ABS = `${Math.abs(d90.pct).toLocaleString("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})}%`;

const HEADLINE =
  VERB === "no se movió"
    ? `El precio del vino en Argentina no se movió en ${WINDOW_90}`
    : `El precio del vino en Argentina ${VERB} ${PCT_ABS} en ${WINDOW_90}`;
const TITLE = `Índice Vinndex: ${HEADLINE.charAt(0).toLowerCase()}${HEADLINE.slice(1)}`;
const DESCRIPTION = `Índice semanal con datos propios de ${idx.coverage.stores} vinotecas online: cuánto cambió el precio publicado del mismo vino desde ${MES_BASE}. 30 días: ${formatPct(d30?.pct)}. Metodología abierta y JSON para citar.`;
const URL = "https://vinndex.com.ar/indice";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "precio del vino en argentina",
    "inflación vino",
    "índice de precios vino",
    "cuánto subió el vino",
    "precio vino argentina 2026",
    "índice vinndex",
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    siteName: "Vinndex",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/indice/opengraph-image"],
  },
};

type Row = { key: string; label: string; points: IndexPoint[]; strong?: boolean };

function seg(key: string): Row | null {
  const s = idx.segments[key];
  if (!s || s.points.length < 2) return null;
  return { key, label: s.label, points: s.points };
}

export default function IndicePage() {
  const varietalRows = VARIETAL_SEGMENT_KEYS.map(seg).filter((r): r is Row => r !== null);
  const bandRows = BAND_SEGMENT_KEYS.map(seg).filter((r): r is Row => r !== null);
  const topRow = seg(TOP_SEGMENT_KEY);
  const lowSamplePoints = total.filter((p) => p.lowSample);
  const lastLinkDays = prev
    ? Math.round(
        (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${prev.date}T00:00:00Z`)) / 86400000,
      )
    : null;

  const datasetJsonLd = {
    "@context": "https://schema.org/",
    "@type": "Dataset",
    name: "Índice Vinndex de precios del vino en Argentina",
    description:
      "Serie semanal encadenada (base 100) del precio online del vino en Argentina, construida con la mediana del precio de cada vino entre las vinotecas que lo venden. Incluye segmentos por varietal, banda de precio y top 100.",
    url: URL,
    sameAs: idx.api,
    keywords: [
      "precio del vino",
      "inflación",
      "Argentina",
      "vino argentino",
      "índice de precios",
      "Malbec",
      "e-commerce",
    ],
    creator: {
      "@type": "Organization",
      name: "Vinndex",
      url: "https://vinndex.com.ar",
    },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    dateModified: idx.generatedAt,
    temporalCoverage: `${first.date}/${last.date}`,
    spatialCoverage: {
      "@type": "Place",
      name: "Argentina",
      address: { "@type": "PostalAddress", addressCountry: "AR" },
    },
    variableMeasured: [
      "Índice de precios del vino (base 100)",
      "Variación semanal",
      "Vinos comparados por eslabón",
      "Índice por varietal, banda de precio y top 100",
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: idx.api,
        name: "JSON completo del índice (API pública, sin auth)",
      },
    ],
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: "https://vinndex.com.ar" },
      { "@type": "ListItem", position: 2, name: "Índice de precios", item: URL },
    ],
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteHeader />

      {/* Hero */}
      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 pt-10 pb-12 lg:pt-16 lg:pb-16">
          <p className="text-terracota text-xs sm:text-sm tracking-[0.2em] uppercase font-semibold mb-5">
            Índice Vinndex de precios del vino · actualizado {formatDateLong(last.date)}
          </p>
          <h1 className="display text-ink font-semibold leading-none">
            <span className="block text-3xl sm:text-4xl lg:text-5xl mb-2">
              El vino {VERB}
            </span>
            {VERB !== "no se movió" && (
              <span className="block text-[clamp(4.5rem,18vw,11rem)] leading-[0.9] tracking-[-0.02em] -ml-1">
                {formatPct(d90.pct)}
              </span>
            )}
            <span className="block text-2xl sm:text-3xl lg:text-4xl mt-3">
              en los últimos {WINDOW_90}
            </span>
          </h1>
          <p className="mt-6 text-graphite text-base sm:text-lg tabular-nums">
            30 días: <span className="text-ink font-semibold">{formatPct(d30?.pct)}</span>
            {" · "}
            desde {MES_BASE}: <span className="text-ink font-semibold">{formatPct(since.pct)}</span>
          </p>
          <p className="mt-2 text-sm text-graphite max-w-2xl leading-relaxed">
            Precios publicados online por {idx.coverage.stores} vinotecas argentinas,
            comparando el mismo vino semana a semana. {last.fichas.toLocaleString("es-AR")}{" "}
            vinos con al menos {idx.coverage.minStoresPerWine} vinotecas en el último punto.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3 text-ink">
              <span className="text-xs uppercase tracking-wider text-graphite">Compartir</span>
              <ShareButtons
                url={URL}
                title={`${HEADLINE} · Índice Vinndex`}
                description={`datos propios de ${idx.coverage.stores} vinotecas online, 30 días: ${formatPct(d30?.pct)}`}
              />
            </div>
            <a
              href="#datos"
              className="cursor-wine text-sm font-semibold text-cobalt hover:text-ink underline-offset-4 hover:underline"
            >
              Usá estos datos
            </a>
          </div>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14 space-y-14 lg:space-y-16"
      >
        {/* Gráfico total */}
        <section aria-labelledby="serie">
          <p className="text-cobalt text-xs tracking-[0.2em] uppercase font-semibold mb-3">
            Serie semanal
          </p>
          <h2 id="serie" className="display text-2xl sm:text-3xl font-semibold text-ink mb-2">
            Índice general · base 100 = {formatDateShort(first.date)}
          </h2>
          <p className="text-sm text-graphite mb-6 max-w-3xl">
            Un punto por semana (el último snapshot de cada semana) más el snapshot vigente.
            Hoy: <span className="text-ink font-semibold tabular-nums">{formatIndex(last.index)}</span>
            {last.change != null && (
              <>
                {" "}
                ({formatPct(last.change)} contra el {formatDateShort(prev.date)}
                {lastLinkDays != null && lastLinkDays < 7 ? `, ${lastLinkDays} días` : ""})
              </>
            )}
            .
          </p>
          <PriceIndexChart
            series={[
              { key: "total", label: "Todos los vinos", points: total, color: "var(--vx-chart-line)" },
            ]}
            ariaLabel={`Índice general del precio del vino, de ${formatIndex(first.index)} el ${formatDateShort(first.date)} a ${formatIndex(last.index)} el ${formatDateShort(last.date)}`}
            endLabel
            showMoves
          />
          {last.up != null && (
            <p className="mt-4 text-sm text-graphite tabular-nums">
              Último eslabón ({formatDateShort(prev.date)} a {formatDateShort(last.date)}):{" "}
              de {last.links?.toLocaleString("es-AR")} vinos comparados, subieron{" "}
              <span className="text-ink font-semibold">{last.up.toLocaleString("es-AR")}</span>,
              bajaron{" "}
              <span className="text-ink font-semibold">{last.down?.toLocaleString("es-AR")}</span>{" "}
              y no se movieron{" "}
              <span className="text-ink font-semibold">{last.flat?.toLocaleString("es-AR")}</span>.
            </p>
          )}
        </section>

        {/* Gráfico por banda */}
        {bandRows.length === 3 && (
          <section aria-labelledby="bandas">
            <p className="text-cobalt text-xs tracking-[0.2em] uppercase font-semibold mb-3">
              Por banda de precio
            </p>
            <h2 id="bandas" className="display text-2xl sm:text-3xl font-semibold text-ink mb-2">
              Baratos, medios y caros, cada uno con su serie
            </h2>
            <p className="text-sm text-graphite mb-6 max-w-3xl tabular-nums">
              La banda de cada vino se fija con su primer precio en la serie, así un vino no cambia
              de banda porque subió. Desde {MES_BASE}:{" "}
              {bandRows.map((r, i) => {
                const c = changeSinceStart(r.points);
                return (
                  <span key={r.key}>
                    {i > 0 && " · "}
                    {r.label.toLowerCase()}{" "}
                    <span className="text-ink font-semibold">{formatPct(c?.pct)}</span>
                  </span>
                );
              })}
              .
            </p>
            <PriceIndexChart
              series={[
                ...bandRows.map((r, i) => ({
                  key: r.key,
                  label: r.label,
                  points: r.points,
                  color: `var(--vx-chart-band-${i + 1})`,
                })),
                {
                  key: "total",
                  label: "Todos los vinos",
                  points: total,
                  color: "var(--vx-chart-ref)",
                  reference: true,
                },
              ]}
              ariaLabel="Índice del precio del vino por banda de precio, con el índice general como referencia"
            />
          </section>
        )}

        {/* Tabla por segmento */}
        <section aria-labelledby="segmentos">
          <p className="text-cobalt text-xs tracking-[0.2em] uppercase font-semibold mb-3">
            Por segmento
          </p>
          <h2 id="segmentos" className="display text-2xl sm:text-3xl font-semibold text-ink mb-2">
            Qué subió más y qué menos
          </h2>
          <p className="text-sm text-graphite mb-6 max-w-3xl">
            Cada segmento tiene su propio índice encadenado sobre su subconjunto de vinos.
            &ldquo;Vinos&rdquo; es la cantidad que entró en el último eslabón.
          </p>
          <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
            <table className="w-full min-w-[22rem] text-sm border-collapse">
              <thead>
                <tr className="text-[11px] sm:text-xs uppercase tracking-[0.12em] text-graphite border-b border-ink/10">
                  <th scope="col" className="text-left font-semibold py-2 pr-2">
                    Segmento
                  </th>
                  <th scope="col" className="text-right font-semibold py-2 px-1.5 sm:px-3">
                    30 días
                  </th>
                  <th scope="col" className="text-right font-semibold py-2 px-1.5 sm:px-3">
                    {WINDOW_90}
                  </th>
                  <th scope="col" className="text-right font-semibold py-2 px-1.5 sm:px-3">
                    Desde {MES_BASE}
                  </th>
                  <th scope="col" className="text-right font-semibold py-2 pl-1.5 sm:pl-3">
                    Vinos
                  </th>
                </tr>
              </thead>
              <tbody>
                <SegmentRow row={{ key: "total", label: "Todos los vinos", points: total, strong: true }} />
                <GroupHeader label="Por varietal" />
                {varietalRows.map((r) => (
                  <SegmentRow key={r.key} row={r} />
                ))}
                <GroupHeader label="Por banda de precio" />
                {bandRows.map((r) => (
                  <SegmentRow key={r.key} row={r} />
                ))}
                {topRow && (
                  <>
                    <GroupHeader label="Canasta fija" />
                    <SegmentRow row={topRow} />
                  </>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-graphite">
            Varietales: vinos con ese único varietal declarado. Blend / corte: dos o más varietales
            o &ldquo;blend&rdquo; / &ldquo;corte&rdquo; en el nombre, tintos. Top 100: los 100 vinos
            con más vinotecas hoy, canasta fija.
          </p>
        </section>

        {/* Cómo se calcula */}
        <section aria-labelledby="metodo" className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div>
            <p className="text-terracota text-xs tracking-[0.2em] uppercase font-semibold mb-3">
              Cómo se calcula
            </p>
            <h2 id="metodo" className="display text-2xl sm:text-3xl font-semibold text-ink mb-4">
              Sin promedios de vinos distintos: el mismo vino, semana a semana
            </h2>
            <ol className="space-y-3 text-sm sm:text-base text-ink leading-relaxed list-none">
              {idx.method.pasos.map((paso, i) => (
                <li key={i} className="flex gap-3">
                  <span className="display text-gold font-semibold tabular-nums shrink-0 w-6">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{paso}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 text-xs text-graphite space-y-2 leading-relaxed">
              <p>
                La serie arranca el {formatDateLong(first.date)}, la primera semana completa con
                identidades de vino estables (el 3 de julio cambiamos cómo agrupamos ofertas en
                vinos).
                {Math.abs(d90.days - 90) > 7 && (
                  <>
                    {" "}
                    Por eso &ldquo;90 días&rdquo; son hoy {d90.days}: lo decimos con el número
                    real hasta que la serie los tenga.
                  </>
                )}
              </p>
              <p>
                Cuando el pipeline fusiona o parte fichas (pasó el 13 y el 26 de septiembre), esas
                fichas no entran en el eslabón de esa semana: el índice sólo compara vinos presentes
                en las dos semanas, así que no salta por cambios de identidad.
              </p>
              {lastLinkDays != null && lastLinkDays < 7 && (
                <p>
                  El último punto es el snapshot más reciente, no el cierre de una semana: el eslabón
                  final cubre {lastLinkDays} días y se reemplaza cada día hasta el domingo.
                </p>
              )}
              {lowSamplePoints.length > 0 && (
                <p>
                  Puntos marcados con muestra baja (menos de 200 vinos comunes o un salto mayor a
                  ±15% en la semana):{" "}
                  {lowSamplePoints.map((p) => formatDateShort(p.date)).join(", ")}.
                </p>
              )}
              <p>
                Detalle técnico y código:{" "}
                <a
                  href="https://github.com/chequepa/vinndex/blob/main/scripts/build-price-index.mjs"
                  className="cursor-wine text-cobalt hover:underline underline-offset-4"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  scripts/build-price-index.mjs
                </a>{" "}
                ·{" "}
                <Link href="/como-funciona" className="cursor-wine text-cobalt hover:underline underline-offset-4">
                  cómo relevamos precios
                </Link>
                .
              </p>
            </div>
          </div>

          {/* Usá estos datos */}
          <aside id="datos" className="postcard p-6 self-start">
            <p className="text-terracota text-xs tracking-[0.2em] uppercase font-semibold mb-3">
              Usá estos datos
            </p>
            <h3 className="display text-xl font-semibold text-ink mb-3">
              Para prensa, redes y planillas
            </h3>
            <p className="text-sm text-graphite leading-relaxed">
              Uso libre citando la fuente. Cita sugerida:
            </p>
            <blockquote className="mt-2 text-sm text-ink bg-white border border-ink/10 rounded-xl px-3 py-2 leading-relaxed">
              Fuente: Índice Vinndex, vinndex.com.ar/indice
            </blockquote>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <a
                  href="/api/v1/indice"
                  className="cursor-wine font-semibold text-cobalt hover:text-ink underline-offset-4 hover:underline"
                >
                  JSON completo de la serie
                </a>
                <span className="text-graphite"> · /api/v1/indice, sin clave</span>
              </li>
              <li>
                <Link
                  href="/developers"
                  className="cursor-wine font-semibold text-cobalt hover:text-ink underline-offset-4 hover:underline"
                >
                  Resto de la API pública
                </Link>
              </li>
              <li>
                <Link
                  href="/contacto"
                  className="cursor-wine font-semibold text-cobalt hover:text-ink underline-offset-4 hover:underline"
                >
                  Pedinos un corte a medida
                </Link>
                <span className="text-graphite"> · por bodega, región o vinoteca</span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-graphite leading-relaxed">
              Se actualiza todos los días con el relevamiento de las {idx.coverage.stores} vinotecas;
              el punto de la semana en curso se recalcula con cada snapshot.
            </p>
          </aside>
        </section>

        {/* Serie completa */}
        <section aria-labelledby="serie-completa">
          <details className="group">
            <summary className="cursor-wine list-none flex items-center justify-between gap-4 rounded-2xl border border-ink/10 px-5 py-4 hover:border-cobalt transition-colors">
              <span>
                <span id="serie-completa" className="display text-lg font-semibold text-ink block">
                  Ver la serie completa
                </span>
                <span className="text-sm text-graphite">
                  {total.length} puntos, del {formatDateShort(first.date)} al{" "}
                  {formatDateShort(last.date)} · la tabla es la versión accesible del gráfico
                </span>
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 w-8 h-8 rounded-full border border-ink/15 flex items-center justify-center text-graphite transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0 mt-4">
              <table className="w-full min-w-[24rem] text-sm border-collapse">
                <thead>
                  <tr className="text-[11px] sm:text-xs uppercase tracking-[0.12em] text-graphite border-b border-ink/10">
                    <th scope="col" className="text-left font-semibold py-2 pr-2">Fecha</th>
                    <th scope="col" className="text-right font-semibold py-2 px-2">Índice</th>
                    <th scope="col" className="text-right font-semibold py-2 px-2">Semana</th>
                    <th scope="col" className="text-right font-semibold py-2 px-2">Comparados</th>
                    <th scope="col" className="text-right font-semibold py-2 px-2 hidden sm:table-cell">Subieron</th>
                    <th scope="col" className="text-right font-semibold py-2 px-2 hidden sm:table-cell">Bajaron</th>
                    <th scope="col" className="text-right font-semibold py-2 pl-2 hidden sm:table-cell">Sin cambio</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {total.map((p) => (
                    <tr key={p.date} className="border-b border-ink/5">
                      <td className="py-2 pr-2 text-ink whitespace-nowrap">
                        {formatDateLong(p.date)}
                        {p.lowSample && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-terracota">
                            muestra baja
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-ink font-semibold">{formatIndex(p.index)}</td>
                      <td className="py-2 px-2 text-right text-graphite">
                        {p.change == null ? "base" : formatPct(p.change, 2)}
                      </td>
                      <td className="py-2 px-2 text-right text-graphite">
                        {p.links == null ? "—" : p.links.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 px-2 text-right text-graphite hidden sm:table-cell">
                        {p.up == null ? "—" : p.up.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 px-2 text-right text-graphite hidden sm:table-cell">
                        {p.down == null ? "—" : p.down.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 pl-2 text-right text-graphite hidden sm:table-cell">
                        {p.flat == null ? "—" : p.flat.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <tr>
      <th
        scope="colgroup"
        colSpan={5}
        className="text-left text-[11px] uppercase tracking-[0.2em] text-graphite font-semibold pt-5 pb-1.5"
      >
        {label}
      </th>
    </tr>
  );
}

function SegmentRow({ row }: { row: Row }) {
  const c30 = changeOver(row.points, 30);
  const c90 = changeOver(row.points, 90);
  const cAll = changeSinceStart(row.points);
  const lastPoint = row.points[row.points.length - 1];
  const cls = row.strong ? "text-ink font-semibold" : "text-ink";
  return (
    <tr className="border-b border-ink/5">
      <th scope="row" className={`text-left font-medium py-2.5 pr-2 ${cls}`}>
        {row.label}
      </th>
      <td className={`text-right tabular-nums py-2.5 px-1.5 sm:px-3 ${cls}`}>{formatPct(c30?.pct)}</td>
      <td className={`text-right tabular-nums py-2.5 px-1.5 sm:px-3 ${cls}`}>{formatPct(c90?.pct)}</td>
      <td className={`text-right tabular-nums py-2.5 px-1.5 sm:px-3 ${cls}`}>{formatPct(cAll?.pct)}</td>
      <td className="text-right tabular-nums py-2.5 pl-1.5 sm:pl-3 text-graphite">
        {lastPoint.links == null ? "—" : lastPoint.links.toLocaleString("es-AR")}
        {lastPoint.lowSample && (
          <span className="ml-1 text-terracota" title="Muestra baja">
            *
          </span>
        )}
      </td>
    </tr>
  );
}
