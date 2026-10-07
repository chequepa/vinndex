import Link from "next/link";
import type { FacetPage } from "@/lib/snapshot";

type RankingLink = { slug: string; title: string };

type Props = {
  varietals: FacetPage[];
  regions: FacetPage[];
  rankings: RankingLink[];
};

/** Presets de /buscar (PRICE_RANGES en app/buscar/page.tsx). */
const BUDGETS = [
  { id: "lt-5k", label: "Hasta", amount: "$5k", h: 44 },
  { id: "5k-10k", label: "$5k a", amount: "$10k", h: 62 },
  { id: "10k-20k", label: "$10k a", amount: "$20k", h: 80 },
  { id: "20k-40k", label: "$20k a", amount: "$40k", h: 98 },
];

/** Cada tipo con el color de su vino en la copa: identidad por item. */
const TYPES = [
  { slug: "tinto", label: "Tinto", fill: "#6B1E2E" },
  { slug: "blanco", label: "Blanco", fill: "#E8D47C" },
  { slug: "rosado", label: "Rosado", fill: "#E8859E" },
  { slug: "espumante", label: "Espumante", fill: "#E8B547", bubbles: true },
];

/** Texto fijo oscuro para los tiles con fondo claro de color (mustard):
 * `text-ink` se invierte a cream en dark y ahí no se leería. */
const INK = "#0f1729";

/**
 * "Elegí por dónde arrancar" como bento: antes eran tres nubes de chips
 * iguales (varietal / región / ranking). Ahora cada entrada tiene su
 * propia forma según cómo piensa el que compra:
 *
 * - Varietal: índice de revista (nombre ····· cantidad), el tile grande.
 * - Presupuesto: una escalera de precios (el job #1 de PRODUCT.md: "un
 *   malbec rico bajo $10k"), cada escalón es un rango de /buscar.
 * - Color: cuatro copas con el color de su vino.
 * - Rankings y regiones: los links curados de siempre.
 *
 * Todos los links llevan a páginas indexables o a /buscar con
 * `multi=1` (sólo vinos que se pueden comparar en 2+ vinotecas).
 */
export function HomeBento({ varietals, regions, rankings }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(200px,auto)]">
      {/* VARIETALES · tile grande */}
      <div className="bento-tile reveal bg-malbec text-snow p-7 md:p-9 sm:col-span-2 lg:row-span-2 flex flex-col">
        <svg
          aria-hidden="true"
          className="absolute -right-6 -top-4 w-40 h-40 opacity-15 pointer-events-none"
          viewBox="0 0 100 100"
        >
          <path
            d="M50 8 Q 46 2 38 4"
            stroke="#F5EDE0"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          {[
            [40, 22],
            [56, 22],
            [32, 36],
            [48, 36],
            [64, 36],
            [40, 50],
            [56, 50],
            [48, 64],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" fill="#F5EDE0" />
          ))}
        </svg>
        <p className="text-snow/70 text-xs tracking-[0.2em] uppercase font-semibold mb-3">
          Por varietal
        </p>
        <h3 className="display text-3xl md:text-4xl font-semibold leading-[1.05] mb-7">
          ¿Qué cepa <span className="italic font-normal">hoy</span>?
        </h3>
        <ul className="mt-auto space-y-1">
          {varietals.map((v) => (
            <li key={v.slug}>
              <Link
                href={`/varietal/${v.slug}`}
                className="toc-row cursor-wine py-1.5 rounded-sm"
              >
                <span className="display text-lg md:text-xl font-semibold">
                  {v.name}
                </span>
                <span className="toc-leader" aria-hidden="true" />
                <span className="text-sm text-snow/75 tabular-nums">
                  {v.groupCount.toLocaleString("es-AR")}
                  <span className="sr-only"> vinos</span>
                </span>
                <span className="toc-arrow text-mustard" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* PRESUPUESTO · escalera de precios */}
      <div
        className="bento-tile reveal p-7 flex flex-col lg:col-span-2"
        style={{ background: "#E8B547", color: INK }}
      >
        <p className="text-xs tracking-[0.2em] uppercase font-semibold mb-3 opacity-75">
          Por presupuesto
        </p>
        <h3 className="display text-2xl md:text-3xl font-semibold leading-[1.05] mb-6">
          ¿Cuánto querés <span className="italic font-normal">gastar</span>?
        </h3>
        <ul className="mt-auto grid grid-cols-4 gap-2 items-end">
          {BUDGETS.map((b) => (
            <li key={b.id}>
              <Link
                href={`/buscar?precio=${b.id}&multi=1`}
                className="budget-step press cursor-wine flex flex-col justify-end rounded-xl px-2.5 py-2 text-center"
                style={{
                  height: b.h + 24,
                  background: "#F5EDE0",
                  color: INK,
                  boxShadow: "inset 0 -3px 0 rgba(15,23,41,0.12)",
                }}
              >
                <span className="text-[11px] leading-tight opacity-75">
                  {b.label}
                </span>
                <span className="display text-lg md:text-xl font-semibold tabular-nums leading-tight">
                  {b.amount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* COLOR · cuatro copas */}
      <div className="bento-tile reveal bg-white p-7 flex flex-col lg:col-span-2">
        <p className="text-cobalt text-xs tracking-[0.2em] uppercase font-semibold mb-3">
          Por color
        </p>
        <h3 className="display text-2xl md:text-3xl font-semibold text-ink leading-[1.05] mb-6">
          Tinto, blanco, rosado
          <br />
          <span className="italic font-normal">o con burbujas.</span>
        </h3>
        <ul className="mt-auto grid grid-cols-4 gap-2">
          {TYPES.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/buscar?tipo=${t.slug}&multi=1`}
                className="type-swatch press cursor-wine flex flex-col items-center gap-2 rounded-xl py-2 hover:bg-ink/5 transition-colors"
              >
                <svg
                  width="44"
                  height="56"
                  viewBox="0 0 44 56"
                  aria-hidden="true"
                  className="text-ink"
                >
                  <clipPath id={`bowl-${t.slug}`}>
                    <path d="M8 4 L36 4 L34 22 Q 33 32 22 33 Q 11 32 10 22 Z" />
                  </clipPath>
                  <g clipPath={`url(#bowl-${t.slug})`}>
                    <rect
                      className="type-fill"
                      x="0"
                      y="10"
                      width="44"
                      height="26"
                      fill={t.fill}
                    />
                    {t.bubbles && (
                      <g fill="#F5EDE0" opacity="0.85">
                        <circle cx="17" cy="24" r="1.4" />
                        <circle cx="24" cy="19" r="1.1" />
                        <circle cx="27" cy="27" r="1.3" />
                      </g>
                    )}
                  </g>
                  <path
                    d="M8 4 L36 4 L34 22 Q 33 32 22 33 Q 11 32 10 22 Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <line
                    x1="22"
                    y1="33"
                    x2="22"
                    y2="50"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <line
                    x1="14"
                    y1="51"
                    x2="30"
                    y2="51"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-xs sm:text-sm font-semibold text-ink">
                  {t.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* RANKINGS */}
      {rankings.length > 0 && (
        <div className="bento-tile reveal bg-snow p-7 flex flex-col lg:col-span-3">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
            <div>
              <p className="text-terracota text-xs tracking-[0.2em] uppercase font-semibold mb-3">
                Rankings curados
              </p>
              <h3 className="display text-2xl md:text-3xl font-semibold text-ink leading-[1.05]">
                Las listas que más{" "}
                <span className="italic font-normal">se consultan.</span>
              </h3>
            </div>
            <Link
              href="/ranking"
              className="arrow-nudge cursor-wine text-sm font-semibold text-cobalt"
            >
              Ver todos los rankings <span data-arrow aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className="mt-auto flex flex-wrap gap-2">
            {rankings.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/ranking/${r.slug}`}
                  className="press cursor-wine inline-flex items-center gap-2 bg-white border border-ink/10 hover:border-cobalt hover:text-cobalt rounded-full px-4 py-2 text-sm font-medium text-ink"
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* REGIONES · mini postal nocturna */}
      {regions.length > 0 && (
        <div
          className="bento-tile reveal grain text-snow p-7 flex flex-col"
          style={{
            background: "linear-gradient(180deg, #0F1E4D 0%, #1E3FBF 100%)",
          }}
        >
          <svg
            aria-hidden="true"
            className="absolute bottom-0 left-0 w-full h-16 pointer-events-none"
            viewBox="0 0 200 60"
            preserveAspectRatio="none"
          >
            <path
              d="M0 40 L30 18 L60 32 L95 10 L130 30 L165 16 L200 30 L200 60 L0 60 Z"
              fill="#0F1E4D"
              opacity="0.9"
            />
          </svg>
          <p className="relative text-mustard text-xs tracking-[0.2em] uppercase font-semibold mb-4">
            Por región
          </p>
          <ul className="relative space-y-1.5 pb-10">
            {regions.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/region/${r.slug}`}
                  className="arrow-nudge cursor-wine flex items-baseline justify-between gap-3 text-sm font-medium hover:text-mustard transition-colors"
                >
                  <span>
                    {r.name} <span data-arrow aria-hidden="true">→</span>
                  </span>
                  <span className="text-xs text-snow/70 tabular-nums">
                    {r.groupCount.toLocaleString("es-AR")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
