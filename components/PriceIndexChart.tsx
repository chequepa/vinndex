import type { IndexPoint } from "@/lib/priceIndex";
import { formatDateShort, formatPct } from "@/lib/priceIndex";

export type ChartSeries = {
  key: string;
  label: string;
  points: IndexPoint[];
  /** Color CSS (var(--vx-chart-…)). */
  color: string;
  /** Línea de referencia: más fina, sin marcador final. */
  reference?: boolean;
};

type Props = {
  /** Todas las series comparten fechas (mismos puntos semanales). */
  series: ChartSeries[];
  /** Etiqueta accesible del gráfico. */
  ariaLabel: string;
  /** Muestra el valor del último punto pegado a la línea (una sola serie). */
  endLabel?: boolean;
  /** Muestra ↑↓= del eslabón en el tooltip (sólo total). */
  showMoves?: boolean;
  className?: string;
};

/**
 * Gráfico de línea del Índice Vinndex, renderizado en el servidor sin
 * librerías ni JS en el cliente.
 *
 * Cómo está armado, y por qué no es un SVG "normal": un SVG con viewBox
 * fijo escala también el texto, y en 390px los ejes quedaban en ~7px. Acá
 * el SVG dibuja SÓLO la geometría (líneas, grilla, área) en coordenadas
 * porcentuales con `preserveAspectRatio="none"` y `vector-effect:
 * non-scaling-stroke` (el trazo mide 2px reales a cualquier ancho), y
 * todo lo que es texto o marcador (ejes, etiqueta final, tooltip, puntos)
 * es HTML posicionado en porcentaje sobre el mismo plano. Resultado: el
 * gráfico es fluido, el texto mide lo que dice Tailwind y no hay overflow.
 *
 * Hover sin JS: cada punto tiene una franja invisible (`group`) y el
 * tooltip aparece con `group-hover` / `focus-within` (tabIndex=0, así
 * también anda con teclado). La tabla de la página es la versión
 * accesible de los mismos números.
 */
export function PriceIndexChart({
  series,
  ariaLabel,
  endLabel = false,
  showMoves = false,
  className = "",
}: Props) {
  const base = series[0]?.points ?? [];
  if (base.length < 2) return null;

  // ── Escala X: tiempo lineal entre el primer y el último punto ──────
  const t0 = Date.parse(`${base[0].date}T00:00:00Z`);
  const t1 = Date.parse(`${base[base.length - 1].date}T00:00:00Z`);
  const xOf = (date: string) =>
    ((Date.parse(`${date}T00:00:00Z`) - t0) / Math.max(1, t1 - t0)) * 100;
  const xs = base.map((p) => xOf(p.date));

  // ── Escala Y: dominio "lindo" alrededor de los valores ─────────────
  const values = series.flatMap((s) => s.points.map((p) => p.index));
  const rawMin = Math.min(...values, 100);
  const rawMax = Math.max(...values, 100);
  const step = niceStep(rawMax - rawMin);
  const lo = Math.floor((rawMin - step * 0.35) / step) * step;
  const hi = Math.ceil((rawMax + step * 0.35) / step) * step;
  const yOf = (v: number) => ((hi - v) / Math.max(1e-9, hi - lo)) * 100;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(round2(v));

  // ── Ticks X: primer punto, cada 1° de mes, último punto ────────────
  const xTicks = monthTicks(base[0].date, base[base.length - 1].date).map(
    (d) => ({ date: d.date, label: d.label, x: xOf(d.date) }),
  );

  const paths = series.map((s) => {
    const d = s.points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xOf(p.date).toFixed(3)},${yOf(p.index).toFixed(3)}`,
      )
      .join(" ");
    return { ...s, d };
  });
  const single = series.length === 1 ? paths[0] : null;
  const areaD = single
    ? `${single.d} L100,100 L0,100 Z`
    : null;

  // Franjas de hover: cada punto se lleva hasta la mitad de la distancia
  // con sus vecinos.
  const slots = xs.map((x, i) => {
    const left = i === 0 ? 0 : (xs[i - 1] + x) / 2;
    const right = i === xs.length - 1 ? 100 : (x + xs[i + 1]) / 2;
    return { left, width: right - left, x, i };
  });

  const last = base[base.length - 1];
  const lastSeries = single ?? null;

  return (
    <figure className={`w-full ${className}`}>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-graphite mb-3" aria-label="Series">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 rounded-full"
                style={{
                  height: s.reference ? 1.5 : 2.5,
                  background: s.color,
                }}
              />
              <span className="text-ink">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div
        role="img"
        aria-label={ariaLabel}
        className="grid grid-cols-[2.25rem_1fr] sm:grid-cols-[2.75rem_1fr] grid-rows-[1fr_1.5rem] gap-x-2"
      >
        {/* Eje Y */}
        <div className="relative h-56 sm:h-72">
          {ticks.map((v) => (
            <span
              key={v}
              className={`absolute right-0 -translate-y-1/2 text-[11px] sm:text-xs tabular-nums leading-none ${
                v === 100 ? "text-ink font-semibold" : "text-graphite"
              }`}
              style={{ top: `${yOf(v)}%` }}
            >
              {formatTick(v)}
            </span>
          ))}
        </div>

        {/* Plano */}
        <div className="relative h-56 sm:h-72">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full overflow-visible"
            aria-hidden="true"
          >
            {ticks.map((v) => (
              <line
                key={v}
                x1="0"
                x2="100"
                y1={yOf(v)}
                y2={yOf(v)}
                stroke={v === 100 ? "var(--vx-chart-base)" : "var(--vx-chart-grid)"}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {areaD && single && (
              <path d={areaD} fill={single.color} fillOpacity="0.08" stroke="none" />
            )}
            {paths.map((s) => (
              <path
                key={s.key}
                d={s.d}
                fill="none"
                stroke={s.color}
                strokeWidth={s.reference ? 1.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Marcador y etiqueta del último punto */}
          {paths
            .filter((s) => !s.reference)
            .map((s) => {
              const p = s.points[s.points.length - 1];
              return (
                <span
                  key={s.key}
                  aria-hidden="true"
                  className="absolute w-2.5 h-2.5 rounded-full border-2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${xOf(p.date)}%`,
                    top: `${yOf(p.index)}%`,
                    background: s.color,
                    borderColor: "var(--vx-surface)",
                  }}
                />
              );
            })}
          {endLabel && lastSeries && (
            <span
              aria-hidden="true"
              className="absolute display text-sm sm:text-base font-semibold text-ink tabular-nums leading-none -translate-x-full px-1.5 py-0.5 rounded pointer-events-none"
              style={{
                left: `calc(${xOf(last.date)}% - 8px)`,
                top: `calc(${yOf(last.index)}% - 22px)`,
                background: "color-mix(in oklab, var(--vx-surface) 85%, transparent)",
              }}
            >
              {formatIndex(last.index)}
            </span>
          )}

          {/* Franjas de hover / foco, una por punto */}
          {slots.map((slot) => {
            const p = base[slot.i];
            const inner = ((slot.x - slot.left) / Math.max(1e-9, slot.width)) * 100;
            const tipSide =
              slot.x < 30 ? "translate-x-0" : slot.x > 70 ? "-translate-x-full" : "-translate-x-1/2";
            return (
              <div
                key={p.date}
                tabIndex={0}
                className="group absolute inset-y-0 outline-none"
                style={{ left: `${slot.left}%`, width: `${slot.width}%` }}
                aria-label={`${formatDateShort(p.date)}: ${series
                  .map((s) => `${s.label} ${formatIndex(s.points[slot.i]?.index ?? 0)}`)
                  .join(", ")}`}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-px bg-ink/30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100 pointer-events-none"
                  style={{ left: `${inner}%` }}
                />
                {series.map((s) => {
                  const sp = s.points[slot.i];
                  if (!sp) return null;
                  return (
                    <span
                      key={s.key}
                      aria-hidden="true"
                      className="absolute w-2.5 h-2.5 rounded-full border-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100 -translate-y-1/2 pointer-events-none"
                      style={{
                        left: `calc(${inner}% - 5px)`,
                        top: `${yOf(sp.index)}%`,
                        background: s.color,
                        borderColor: "var(--vx-surface)",
                      }}
                    />
                  );
                })}
                <div
                  aria-hidden="true"
                  className={`absolute top-2 ${tipSide} z-10 min-w-[9rem] rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs shadow-[0_12px_28px_-16px_rgba(15,23,41,0.35)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100 pointer-events-none transition-opacity`}
                  style={{ left: `${inner}%` }}
                >
                  <p className="text-graphite mb-1">
                    {formatDateShort(p.date)}
                    {p.change != null && ` · vs. ${formatDateShort(base[slot.i - 1].date)}`}
                  </p>
                  {series.map((s) => {
                    const sp = s.points[slot.i];
                    if (!sp) return null;
                    return (
                      <p key={s.key} className="flex items-center gap-2 whitespace-nowrap">
                        <span
                          className="inline-block w-3 rounded-full shrink-0"
                          style={{ height: 2, background: s.color }}
                        />
                        <span className="font-semibold text-ink tabular-nums">
                          {formatIndex(sp.index)}
                        </span>
                        {sp.change != null && (
                          <span className="text-graphite tabular-nums">{formatPct(sp.change)}</span>
                        )}
                        {series.length > 1 && (
                          <span className="text-graphite truncate">{s.label}</span>
                        )}
                      </p>
                    );
                  })}
                  {showMoves && p.up != null && (
                    <p className="text-graphite mt-1 tabular-nums whitespace-nowrap">
                      ↑{p.up} ↓{p.down} ={p.flat} de {p.links} vinos
                    </p>
                  )}
                  {p.lowSample && (
                    <p className="text-terracota mt-1">Muestra baja</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Eje X */}
        <div />
        <div className="relative">
          {xTicks.map((t, i) => (
            <span
              key={t.date}
              className={`absolute top-1.5 text-[11px] sm:text-xs text-graphite leading-none whitespace-nowrap ${
                i === 0
                  ? ""
                  : i === xTicks.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2"
              }`}
              style={{ left: `${t.x}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

function niceStep(range: number): number {
  const target = Math.max(0.25, range / 4);
  const candidates = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];
  for (const c of candidates) if (c >= target) return c;
  return 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatTick(v: number): string {
  return v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function formatIndex(v: number): string {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Primer punto + cada 1° de mes intermedio + último punto. Si el último
 * punto cae a menos de 9 días de un 1° de mes, ese 1° se omite para que
 * las etiquetas no se pisen en mobile.
 */
function monthTicks(first: string, last: string): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [{ date: first, label: formatDateShort(first) }];
  const lastT = Date.parse(`${last}T00:00:00Z`);
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() < lastT) {
    const iso = d.toISOString().slice(0, 10);
    const tooCloseToStart = d.getTime() - Date.parse(`${first}T00:00:00Z`) < 9 * 86400000;
    const tooCloseToEnd = lastT - d.getTime() < 9 * 86400000;
    if (!tooCloseToStart && !tooCloseToEnd) {
      out.push({
        date: iso,
        label: d.toLocaleDateString("es-AR", { timeZone: "UTC", month: "short" }).replace(".", ""),
      });
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  out.push({ date: last, label: formatDateShort(last) });
  return out;
}
