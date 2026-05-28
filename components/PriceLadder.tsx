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
 *   detallada de abajo sigue mostrando todo.
 * - Click en un nodo abre la vinoteca en pestaña nueva (mismo contrato
 *   que la fila de la tabla).
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

  // Altura proporcional a la cantidad de nodos para evitar superposición
  // de labels. Cada nodo ocupa ~22px de "altura legible"; piso 480, techo 720.
  const ladderHeight = Math.max(
    480,
    Math.min(720, 320 + offers.length * 22),
  );
  // Inner area excluye los 12px de "margen" arriba y abajo donde no
  // queremos que los nodos pisen el borde del frame.
  const PAD = 12;
  const innerHeight = ladderHeight - PAD * 2;
  const pctToBottomPx = (pct: number) => (pct / 100) * innerHeight + PAD;

  // Si dos nodos caen muy cerca en Y, los stagger ligeramente en X. La idea
  // es que los labels no se pisen. Calculamos una "fila" virtual por bucket.
  const sorted = [...offers].sort((a, b) => b.priceArs - a.priceArs);
  const lanesByOffer = new Map<string, number>();
  const buckets: number[][] = []; // each bucket: array of pcts already taken
  const PROXIMITY = 4; // % de cercanía donde consideramos colisión

  for (const o of sorted) {
    const p = pctOf(o.priceArs);
    let placed = false;
    for (let lane = 0; lane < buckets.length; lane++) {
      const collides = buckets[lane].some((q) => Math.abs(q - p) < PROXIMITY);
      if (!collides) {
        buckets[lane].push(p);
        lanesByOffer.set(o.externalUrl, lane);
        placed = true;
        break;
      }
    }
    if (!placed) {
      buckets.push([p]);
      lanesByOffer.set(o.externalUrl, buckets.length - 1);
    }
  }
  const maxLane = Math.max(0, buckets.length - 1);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-snow/40 dark:bg-[color-mix(in_oklab,var(--vx-surface)_70%,transparent)]">
      {/* Eyebrow + summary */}
      <div className="px-6 lg:px-10 pt-8 pb-2 flex items-end justify-between gap-4 flex-wrap">
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
              <span className="text-graphite/60 mx-1.5">·</span>
              {formatArs(maxP)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-graphite font-semibold">
              Te ahorrás
            </div>
            <div className="display text-3xl md:text-4xl font-semibold text-mustard tabular-nums">
              {savingsPct}%
            </div>
          </div>
        </div>
      </div>

      {/* Ladder */}
      <div className="px-2 sm:px-6 lg:px-10 pb-10">
        <div
          className="relative"
          style={{ height: ladderHeight }}
          aria-label={
            wineName
              ? `Escalera de precios de ${displayWineName(wineName)} en ${offers.length} vinotecas`
              : `Escalera de precios en ${offers.length} vinotecas`
          }
        >
          {/* Vertical axis line */}
          <div className="absolute left-[88px] sm:left-[96px] top-3 bottom-3 w-px bg-ink/15" />

          {/* Axis tick labels */}
          {ticks.map((t, i) => (
            <div
              key={`tick-${i}`}
              className="absolute left-0 w-[80px] sm:w-[88px] pr-3 text-right text-[11px] text-graphite tabular-nums font-medium"
              style={{
                bottom: `${pctToBottomPx(t.pct)}px`,
                transform: "translateY(50%)",
              }}
            >
              {formatArs(t.price)}
            </div>
          ))}

          {/* Tick dots along axis (subtle visual rhythm) */}
          {ticks.map((t, i) => (
            <span
              key={`dot-${i}`}
              className="absolute h-1 w-1 rounded-full bg-ink/25"
              style={{
                left: "calc(88px - 2px)",
                bottom: `${pctToBottomPx(t.pct)}px`,
                transform: "translateY(50%)",
              }}
            />
          ))}

          {/* Nodes */}
          {offers.map((offer) => {
            const pct = pctOf(offer.priceArs);
            const lane = lanesByOffer.get(offer.externalUrl) ?? 0;
            // Offset horizontal por lane para evitar colisiones de labels.
            // Cada lane = 8px de offset hacia la derecha sobre el inicio del label.
            const laneOffset = lane * 8;
            return (
              <a
                key={offer.externalUrl}
                href={offer.externalUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="absolute left-[88px] sm:left-[96px] flex items-center gap-2.5 sm:gap-3 cursor-wine group hover:z-10"
                style={{
                  bottom: `${pctToBottomPx(pct)}px`,
                  transform: "translateY(50%)",
                  paddingLeft: laneOffset,
                }}
                title={`${offer.storeName} · ${formatArs(offer.priceArs)}${offer.isBest ? " · mejor precio" : ` · +${offer.diffPct}% vs el mínimo`}`}
              >
                {/* Tick line from axis to node */}
                <span
                  className={
                    offer.isBest
                      ? "h-[2px] w-7 sm:w-10 bg-mustard transition-colors"
                      : "h-px w-7 sm:w-10 bg-ink/25 group-hover:bg-ink/55 transition-colors"
                  }
                />

                {/* Node circle — best gets the halo + larger size */}
                <span
                  aria-hidden="true"
                  className={
                    offer.isBest
                      ? "shrink-0 inline-block h-3.5 w-3.5 rounded-full bg-mustard shadow-[0_0_0_5px_rgba(232,181,71,0.25)] ring-1 ring-mustard/70"
                      : "shrink-0 inline-block h-2.5 w-2.5 rounded-full bg-malbec/80 group-hover:bg-malbec group-hover:scale-110 transition-transform"
                  }
                />

                {/* Tiny store logo chip */}
                <span
                  aria-hidden="true"
                  className="hidden sm:inline-flex shrink-0 items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold tracking-wide"
                  style={{
                    backgroundColor: offer.storeColor,
                    color: "#F5EDE0",
                    textShadow: "0 1px 2px rgba(15,23,41,0.55)",
                  }}
                >
                  {offer.storeInitials}
                </span>

                {/* Store name + delta */}
                <span className="flex items-baseline gap-2 min-w-0">
                  <span
                    className={
                      offer.isBest
                        ? "display text-sm sm:text-base font-semibold text-ink truncate max-w-[140px] sm:max-w-[200px]"
                        : "display text-sm text-ink/85 group-hover:text-ink truncate max-w-[140px] sm:max-w-[200px] transition-colors"
                    }
                  >
                    {offer.storeName}
                  </span>
                  {offer.isBest ? (
                    <span className="text-[10px] bg-mustard/30 text-malbec px-2 py-0.5 rounded-full font-bold uppercase tracking-[0.12em] whitespace-nowrap">
                      ★ Mejor
                    </span>
                  ) : offer.diffPct != null && offer.diffPct > 0 ? (
                    <span className="text-[11px] text-graphite tabular-nums whitespace-nowrap">
                      +{offer.diffPct}%
                    </span>
                  ) : null}
                </span>
              </a>
            );
          })}

          {/* Decorative price arc behind the ladder — the "atmosphere" that
              keeps the chart from feeling like a generic axis. Faint mustard
              glow at the bottom (where the deal lives), faint malbec at top. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, rgba(107,30,46,0.04) 0%, transparent 30%, transparent 70%, rgba(232,181,71,0.08) 100%)",
            }}
          />
        </div>

        {/* Footnote */}
        <p className="text-[11px] text-graphite/80 mt-4 max-w-3xl leading-relaxed">
          {maxLane > 0
            ? "Cuando dos vinotecas tienen precios muy parecidos, las separamos un poquito en horizontal para que se lean. "
            : ""}
          Las cosechas de colección y las que no tienen stock no entran a la
          escalera (sí están en la lista de abajo).
        </p>
      </div>
    </div>
  );
}
