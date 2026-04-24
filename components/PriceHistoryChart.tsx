import { formatArs } from "@/lib/snapshot";
import type { PriceEntry } from "@/lib/priceHistory";
import { priceDelta } from "@/lib/priceHistory";

type Props = {
  series: PriceEntry[];
  className?: string;
};

/**
 * Sparkline SVG for price over time. Renders nothing if we don't have
 * at least 2 data points — the feature lights up gradually as the
 * daily CI backfills history.
 *
 * Pure SVG, no chart library. Width is fluid via viewBox.
 */
export function PriceHistoryChart({ series, className = "" }: Props) {
  if (series.length < 2) return null;

  const W = 600;
  const H = 100;
  const P = 8; // padding for stroke

  const prices = series.map((e) => e.min);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = Math.max(1, maxP - minP);

  // Map each point to SVG coords.
  const points = series.map((e, i) => {
    const x =
      series.length === 1
        ? W / 2
        : P + (i * (W - P * 2)) / (series.length - 1);
    const y = H - P - ((e.min - minP) / range) * (H - P * 2);
    return { x, y, ...e };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Area fill under the line
  const areaD =
    pathD +
    ` L${points[points.length - 1].x.toFixed(1)},${H - P} L${P},${H - P} Z`;

  const latest = points[points.length - 1];
  const first = points[0];

  const d7 = priceDelta(series, 7);
  const d30 = priceDelta(series, 30);

  const firstDate = new Date(first.date).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="display text-2xl font-semibold text-ink">
            Evolución del precio mínimo
          </p>
          <p className="text-xs text-graphite mt-1">
            Tracking diario de la vinoteca más barata con stock.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {d7 && (
            <DeltaBadge label="7 días" pct={d7.pct} />
          )}
          {d30 && series.length >= 14 && (
            <DeltaBadge label="30 días" pct={d30.pct} />
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-24 text-cobalt"
        role="img"
        aria-label="Gráfico de evolución del precio"
      >
        <defs>
          <linearGradient id="priceArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#priceArea)" />
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Last dot */}
        <circle
          cx={latest.x}
          cy={latest.y}
          r={3.5}
          fill="currentColor"
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      <div className="flex items-baseline justify-between text-xs text-graphite mt-3">
        <span>
          {firstDate} · {formatArs(first.min)}
        </span>
        <span className="font-semibold text-ink">
          Hoy: {formatArs(latest.min)}
        </span>
        <span className="text-right">
          min {formatArs(minP)} · max {formatArs(maxP)}
        </span>
      </div>
    </div>
  );
}

function DeltaBadge({ label, pct }: { label: string; pct: number }) {
  const abs = Math.abs(pct);
  const direction = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const tone =
    direction === "down"
      ? "bg-green2/15 text-green2 border-green2/30"
      : direction === "up"
        ? "bg-red2/10 text-red2 border-red2/30"
        : "bg-ink/5 text-graphite border-ink/15";
  const arrow =
    direction === "down" ? "↓" : direction === "up" ? "↑" : "=";
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${tone}`}
      title={`${label}: ${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
    >
      <span aria-hidden="true">{arrow}</span>
      <span>
        {direction === "flat" ? "Estable" : `${abs.toFixed(1)}%`}
      </span>
      <span className="text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </span>
    </div>
  );
}
