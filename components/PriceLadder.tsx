/**
 * PriceLadder — visualización vertical editorial de la dispersión de
 * precios entre vinotecas para un mismo vino.
 *
 * Por qué existe: la tabla de comparación cuenta el dato, no la historia.
 * El ladder convierte la dispersión en una postal: el mejor precio abajo
 * con halo mustard, cada vinoteca como un nodo en su altura proporcional,
 * y el más caro arriba. De un vistazo se ve el rango de ahorro.
 *
 * Decisiones:
 * - Escala logarítmica (no linear): los outliers de precio "colección"
 *   o de error de scraping no aplastan visualmente al cluster del cuerpo
 *   de la distribución. Duplicar precio siempre se ve a la misma distancia.
 * - Solo offers en stock y no "colección" entran al ladder. La tabla
 *   detallada (que va ARRIBA en la ficha) sigue mostrando todo.
 * - Etiquetas sin superposición: los puntos quedan sobre el eje en su
 *   precio real y las etiquetas se reparten con una separación mínima,
 *   unidas a su punto por una línea guía. Mismo precio = mismo peldaño.
 * - Click en una etiqueta de una sola vinoteca abre la tienda en pestaña
 *   nueva (mismo contrato que la fila de la tabla).
 */
import { displayWineName } from "@/lib/displayWineName";

type LadderOffer = {
  externalUrl: string;
  storeSlug: string;
  storeName: string;
  storeInitials: string;
  storeColor: string;
  priceArs: number;
  isBest: boolean;
  diffPct: number | null;
};

type Props = {
  offers: LadderOffer[];
  formatArs: (n: number | null) => string;
  wineName?: string;
};

/**
 * Build 5 evenly-spaced axis ticks in log space. The endpoints round to
 * "neat" numbers so the axis reads like a magazine chart, not a JSON dump.
 */
function buildTicks(minP: number, maxP: number) {
  if (!isFinite(minP) || !isFinite(maxP) || minP <= 0 || maxP <= 0) return [];
  const minLog = Math.log(minP);
  const maxLog = Math.log(maxP);
  const count = 5;
  const ticks: { price: number; pct: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const logVal = minLog + t * (maxLog - minLog);
    const price = Math.exp(logVal);
    ticks.push({ price, pct: t * 100 });
  }
  return ticks;
}

type Rung = {
  key: string;
  price: number;
  offers: LadderOffer[];
  isBest: boolean;
  diffPct: number | null;
  /** Posición real del precio (px desde abajo). */
  idealY: number;
  /** Posición de la etiqueta después de esquivar colisiones. */
  labelY: number;
};

/** Separación vertical mínima entre etiquetas (una línea de text-sm). */
const ROW_GAP = 28;
const PAD = 14;
/** Columna del eje: a la izquierda los ticks, a la derecha las etiquetas. */
const AXIS_X = 84;
const LABEL_X = AXIS_X + 36;

export function PriceLadder({ offers, formatArs, wineName }: Props) {
  if (offers.length < 2) return null;

  const prices = offers.map((o) => o.priceArs);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const minLog = Math.log(minP);
  const maxLog = Math.log(maxP);
  const range = maxLog - minLog;

  const pctOf = (price: number) => {
    if (range < 0.01) return 50;
    return ((Math.log(price) - minLog) / range) * 100;
  };

  const ticks = buildTicks(minP, maxP);
  const savingsPct = Math.round(((maxP - minP) / maxP) * 100);

  // Vinotecas con el MISMO precio comparten peldaño ("Disco, Tinte Vinos
  // y 5 más"). Antes cada una era un nodo propio y con 40 tiendas los
  // nombres se encimaban hasta ser ilegibles.
  const byPrice = new Map<number, LadderOffer[]>();
  for (const o of offers) {
    const list = byPrice.get(o.priceArs) ?? [];
    list.push(o);
    byPrice.set(o.priceArs, list);
  }
  const sortedPrices = [...byPrice.keys()].sort((a, b) => a - b);

  // Alto: lo suficiente para que todas las etiquetas entren separadas por
  // ROW_GAP, con un poco de aire; piso 280 para que 2-3 peldaños no se
  // vean aplastados.
  const ladderHeight = Math.max(
    280,
    Math.round(sortedPrices.length * ROW_GAP * 1.25) + PAD * 2,
  );
  const inner = ladderHeight - PAD * 2;
  const yOf = (pct: number) => PAD + (pct / 100) * inner;

  const rungs: Rung[] = sortedPrices.map((price) => {
    const list = byPrice.get(price)!;
    const idealY = yOf(pctOf(price));
    return {
      key: String(price),
      price,
      offers: list,
      isBest: list.some((o) => o.isBest),
      diffPct: list[0].diffPct,
      idealY,
      labelY: idealY,
    };
  });

  // Esquivar colisiones: de abajo hacia arriba cada etiqueta queda al
  // menos ROW_GAP arriba de la anterior; si la última se pasa del techo,
  // de arriba hacia abajo se empujan para abajo. La línea guía une cada
  // etiqueta con la posición REAL de su precio sobre el eje.
  for (let i = 1; i < rungs.length; i++) {
    rungs[i].labelY = Math.max(rungs[i].labelY, rungs[i - 1].labelY + ROW_GAP);
  }
  const top = ladderHeight - PAD;
  if (rungs[rungs.length - 1].labelY > top) {
    rungs[rungs.length - 1].labelY = top;
    for (let i = rungs.length - 2; i >= 0; i--) {
      rungs[i].labelY = Math.min(
        rungs[i].labelY,
        rungs[i + 1].labelY - ROW_GAP,
      );
    }
  }
  const svgY = (y: number) => ladderHeight - y;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-snow/40 dark:bg-[color-mix(in_oklab,var(--vx-surface)_70%,transparent)]">
      {/* Eyebrow + summary */}
      <div className="px-5 sm:px-6 lg:px-10 pt-7 sm:pt-8 pb-2 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-3">
            Dispersión de precios
          </p>
          <h3 className="display text-2xl md:text-3xl font-semibold text-ink leading-tight">
            Del más barato al más caro,{" "}
            <span className="italic font-normal">una escalera.</span>
          </h3>
        </div>
        <div className="flex items-baseline gap-6 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-graphite font-semibold">
              Rango
            </div>
            <div className="display text-xl md:text-2xl font-semibold text-ink tabular-nums whitespace-nowrap">
              {formatArs(minP)}
              <span className="text-graphite mx-1.5">·</span>
              {formatArs(maxP)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-graphite font-semibold">
              Te ahorrás
            </div>
            <div className="display text-3xl md:text-4xl font-semibold text-gold tabular-nums">
              {savingsPct}%
            </div>
          </div>
        </div>
      </div>

      {/* Ladder */}
      <div className="px-2 sm:px-6 lg:px-10 pb-8 sm:pb-10">
        <div
          className="relative mt-4"
          style={{ height: ladderHeight }}
          aria-label={
            wineName
              ? `Escalera de precios de ${displayWineName(wineName)} en ${offers.length} vinotecas`
              : `Escalera de precios en ${offers.length} vinotecas`
          }
        >
          {/* Atmósfera: mustard abajo (donde vive el ahorro), malbec arriba. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background:
                "linear-gradient(180deg, rgba(107,30,46,0.04) 0%, transparent 30%, transparent 70%, rgba(232,181,71,0.10) 100%)",
            }}
          />

          {/* Eje, puntos de precio y líneas guía, todo en px. */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 overflow-visible text-ink"
            width="100%"
            height={ladderHeight}
          >
            <line
              x1={AXIS_X}
              x2={AXIS_X}
              y1={PAD}
              y2={ladderHeight - PAD}
              stroke="currentColor"
              strokeOpacity="0.15"
            />
            {ticks.map((t, i) => (
              <circle
                key={`tick-${i}`}
                cx={AXIS_X}
                cy={svgY(yOf(t.pct))}
                r="2"
                fill="currentColor"
                fillOpacity="0.25"
              />
            ))}
            {rungs.map((r) => (
              <path
                key={`lead-${r.key}`}
                d={`M ${AXIS_X} ${svgY(r.idealY)} L ${AXIS_X + 12} ${svgY(r.idealY)} L ${LABEL_X - 8} ${svgY(r.labelY)}`}
                fill="none"
                stroke={r.isBest ? "#E8B547" : "currentColor"}
                strokeOpacity={r.isBest ? 1 : 0.25}
                strokeWidth={r.isBest ? 2 : 1}
              />
            ))}
            {rungs.map((r) =>
              r.isBest ? (
                <g key={`dot-${r.key}`}>
                  <circle
                    cx={AXIS_X}
                    cy={svgY(r.idealY)}
                    r="10"
                    fill="#E8B547"
                    fillOpacity="0.25"
                  />
                  <circle cx={AXIS_X} cy={svgY(r.idealY)} r="6" fill="#E8B547" />
                </g>
              ) : (
                <circle
                  key={`dot-${r.key}`}
                  cx={AXIS_X}
                  cy={svgY(r.idealY)}
                  r={r.offers.length > 1 ? 5 : 4}
                  className="fill-malbec"
                  fillOpacity="0.85"
                />
              ),
            )}
          </svg>

          {/* Precios de referencia del eje */}
          {ticks.map((t, i) => (
            <div
              key={`tick-label-${i}`}
              aria-hidden="true"
              className="absolute left-0 pr-3 text-right text-[11px] text-graphite tabular-nums font-medium"
              style={{
                width: AXIS_X,
                bottom: yOf(t.pct),
                transform: "translateY(50%)",
              }}
            >
              {formatArs(t.price)}
            </div>
          ))}

          {/* Etiquetas */}
          {rungs.map((r) => {
            const single =
              new Set(r.offers.map((o) => o.storeSlug)).size === 1
                ? r.offers[0]
                : null;
            // Una misma vinoteca con dos SKUs al mismo precio cuenta una vez.
            const names = [...new Set(r.offers.map((o) => o.storeName))];
            const label = single
              ? single.storeName
              : names.length === 2
                ? `${names[0]} y ${names[1]}`
                : `${names[0]}, ${names[1]} y ${names.length - 2} más`;
            const title = `${names.join(", ")} · ${formatArs(r.price)}${
              r.isBest
                ? " · mejor precio"
                : r.diffPct
                  ? ` · +${r.diffPct}% vs el mínimo`
                  : ""
            }`;
            const content = (
              <>
                {single ? (
                  <span
                    aria-hidden="true"
                    className="hidden sm:inline-flex shrink-0 items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold tracking-wide"
                    style={{
                      backgroundColor: single.storeColor,
                      color: "#F5EDE0",
                      textShadow: "0 1px 2px rgba(15,23,41,0.55)",
                    }}
                  >
                    {single.storeInitials}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="hidden sm:inline-flex shrink-0 items-center justify-center h-6 min-w-6 px-1 rounded-md text-[10px] font-bold bg-ink/10 text-ink tabular-nums"
                  >
                    {names.length}
                  </span>
                )}
                <span
                  className={
                    r.isBest
                      ? "display text-sm sm:text-base font-semibold text-ink truncate min-w-0"
                      : "display text-sm text-ink/85 group-hover:text-ink truncate min-w-0 transition-colors"
                  }
                >
                  {label}
                </span>
                {r.isBest ? (
                  <span className="shrink-0 text-[10px] bg-mustard/35 text-ink px-2 py-0.5 rounded-full font-bold uppercase tracking-[0.12em] whitespace-nowrap">
                    ★ Mejor
                  </span>
                ) : r.diffPct != null && r.diffPct > 0 ? (
                  <span className="shrink-0 text-[11px] text-graphite tabular-nums whitespace-nowrap">
                    +{r.diffPct}%
                  </span>
                ) : null}
              </>
            );
            const style = {
              left: LABEL_X,
              bottom: r.labelY,
              transform: "translateY(50%)",
            } as const;
            const cls =
              "absolute right-0 flex items-center gap-2 sm:gap-2.5 min-w-0 h-6";
            return single ? (
              <a
                key={r.key}
                href={single.externalUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={`${cls} cursor-wine group`}
                style={style}
                title={title}
              >
                {content}
              </a>
            ) : (
              <div key={r.key} className={cls} style={style} title={title}>
                {content}
              </div>
            );
          })}
        </div>

        {/* Footnote */}
        <p className="text-[11px] text-graphite mt-4 max-w-3xl leading-relaxed">
          Cada punto del eje es un precio real. Cuando varias vinotecas cobran
          casi lo mismo, separamos las etiquetas y una línea las une con su
          precio. Las cosechas de colección y las que no tienen stock no
          entran a la escalera (sí están en la tabla de arriba).
        </p>
      </div>
    </div>
  );
}
