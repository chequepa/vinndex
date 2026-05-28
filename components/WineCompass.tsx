"use client";

/**
 * WineCompass — discovery 2D para el catálogo.
 *
 * Eje X: vintage (joven izquierda, guarda derecha).
 * Eje Y: precio mínimo en escala log (asequible abajo, premium arriba).
 *
 * Cada vino es un dot con color por varietal. Hover muestra el cluster
 * de los 3 vinos más cercanos a la coordenada del cursor (la "constelación"
 * que se forma mientras navegás). Click va a la ficha.
 *
 * Por qué es un compass y no una lista: los chips de Malbec/Cabernet/etc.
 * son buenos cuando sabés QUÉ querés. Para alguien que dice "algo joven y
 * no muy caro", el chip no ayuda. El plano sí.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type CompassWine,
  type CompassDataset,
  colorForWine,
} from "@/lib/compass";
import { formatArs } from "@/lib/snapshot";

type Props = {
  dataset: CompassDataset;
};

const W = 1000;
const H = 640;
const PAD_X = 84;
const PAD_Y = 60;
const INNER_W = W - 2 * PAD_X;
const INNER_H = H - 2 * PAD_Y;

// Vintage range del plano: pre-2010 cuenta como "muy guarda" a la derecha
// del todo (clamped). Post-2024 cuenta como "muy joven" a la izquierda.
const VINTAGE_YOUNG = 2024;
const VINTAGE_OLD = 2010;

// Price range: log scale ancla en $2k (cualquier asequible) y $400k (alto).
const PRICE_MIN_LOG = Math.log(2000);
const PRICE_MAX_LOG = Math.log(400000);

function vintageToX(v: number): number {
  const clamped = Math.max(VINTAGE_OLD, Math.min(VINTAGE_YOUNG, v));
  const t = (clamped - VINTAGE_OLD) / (VINTAGE_YOUNG - VINTAGE_OLD);
  // Young (t=1) → left, old (t=0) → right
  return PAD_X + (1 - t) * INNER_W;
}

function priceToY(p: number): number {
  const logP = Math.log(Math.max(p, 1));
  const t =
    (logP - PRICE_MIN_LOG) /
    (PRICE_MAX_LOG - PRICE_MIN_LOG);
  const clamped = Math.max(0, Math.min(1, t));
  // Premium (t=1) → top, asequible (t=0) → bottom
  return PAD_Y + (1 - clamped) * INNER_H;
}

// Tamaño del dot: proporcional a √storeCount (cobertura). 2 vinotecas = 3.5,
// 50 vinotecas ≈ 8. Es lo suficientemente sutil para no oscurecer la posición.
function radiusFor(storeCount: number): number {
  return 3.2 + Math.min(Math.sqrt(storeCount) * 0.8, 5.5);
}

// Distancia euclidiana en coords del SVG (no en world coords). Para
// "cuál vino está más cerca del cursor".
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function WineCompass({ dataset }: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [activeVarietals, setActiveVarietals] = useState<Set<string>>(
    new Set(),
  );
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());

  // Wines con su coordenada XY pre-calculada. Memoized para no recalcular
  // en cada move del mouse.
  const positionedWines = useMemo(
    () =>
      dataset.wines.map((w) => ({
        ...w,
        x: vintageToX(w.vintage),
        y: priceToY(w.minPrice),
        color: colorForWine(w),
        radius: radiusFor(w.storeCount),
      })),
    [dataset.wines],
  );

  const filtered = useMemo(
    () =>
      positionedWines.filter((w) => {
        if (activeVarietals.size > 0) {
          const m = w.varietals.some((v) => activeVarietals.has(v));
          if (!m) return false;
        }
        if (activeRegions.size > 0) {
          if (!w.region || !activeRegions.has(w.region)) return false;
        }
        return true;
      }),
    [positionedWines, activeVarietals, activeRegions],
  );

  // Los 3 vinos más cercanos al cursor — la "constelación".
  const constellation = useMemo(() => {
    if (!cursorPos) return [];
    const withDist = filtered.map((w) => ({
      ...w,
      d: distSq(w.x, w.y, cursorPos.x, cursorPos.y),
    }));
    withDist.sort((a, b) => a.d - b.d);
    // Solo los que están a menos de 80px del cursor — sino no es "cerca".
    return withDist.slice(0, 3).filter((w) => w.d < 80 * 80);
  }, [filtered, cursorPos]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // El SVG escala dentro de su viewBox. Convertimos px del cursor a
      // coords del viewBox.
      const x = ((e.clientX - rect.left) / rect.width) * W;
      const y = ((e.clientY - rect.top) / rect.height) * H;
      setCursorPos({ x, y });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setCursorPos(null);
  }, []);

  const toggleVarietal = (name: string) => {
    setActiveVarietals((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const toggleRegion = (name: string) => {
    setActiveRegions((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const constellationSlugs = new Set(constellation.map((w) => w.slug));

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-graphite font-semibold mb-2">
            Filtrá por varietal
          </p>
          <div className="flex flex-wrap gap-2">
            {dataset.topVarietals.map((v) => {
              const active = activeVarietals.has(v.name);
              return (
                <button
                  key={v.name}
                  onClick={() => toggleVarietal(v.name)}
                  className={
                    active
                      ? "cursor-wine inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink text-snow text-sm font-medium border border-ink"
                      : "cursor-wine inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-ink text-sm font-medium border border-ink/15 hover:border-malbec hover:text-malbec"
                  }
                >
                  {v.name}
                  <span
                    className={
                      active
                        ? "text-snow/70 text-xs tabular-nums"
                        : "text-graphite text-xs tabular-nums"
                    }
                  >
                    {v.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-graphite font-semibold mb-2">
            Filtrá por región
          </p>
          <div className="flex flex-wrap gap-2">
            {dataset.topRegions.map((r) => {
              const active = activeRegions.has(r.name);
              return (
                <button
                  key={r.name}
                  onClick={() => toggleRegion(r.name)}
                  className={
                    active
                      ? "cursor-wine inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink text-snow text-sm font-medium border border-ink"
                      : "cursor-wine inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-ink text-sm font-medium border border-ink/15 hover:border-cobalt hover:text-cobalt"
                  }
                >
                  {r.name}
                  <span
                    className={
                      active
                        ? "text-snow/70 text-xs tabular-nums"
                        : "text-graphite text-xs tabular-nums"
                    }
                  >
                    {r.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Compass */}
      <div className="relative rounded-3xl border border-ink/10 overflow-hidden bg-snow/30">
        {/* Quadrant labels (HTML overlay sobre el SVG, ignora pointer events).
            Alejadas del axis numérico (pad-x ~12) para no chocar con los ticks. */}
        <div className="absolute top-6 left-[88px] text-[10px] sm:text-xs text-ink/70 uppercase tracking-[0.18em] font-semibold pointer-events-none z-10">
          <span className="block">Joven & Premium</span>
          <span className="block text-malbec text-[11px] sm:text-sm font-normal italic normal-case tracking-normal mt-0.5">
            cult bottles
          </span>
        </div>
        <div className="absolute top-6 right-6 text-right text-[10px] sm:text-xs text-ink/70 uppercase tracking-[0.18em] font-semibold pointer-events-none z-10">
          <span className="block">Guarda & Premium</span>
          <span className="block text-malbec text-[11px] sm:text-sm font-normal italic normal-case tracking-normal mt-0.5">
            icónicos
          </span>
        </div>
        <div className="absolute bottom-10 left-[88px] text-[10px] sm:text-xs text-ink/70 uppercase tracking-[0.18em] font-semibold pointer-events-none z-10">
          <span className="block">Joven & Asequible</span>
          <span className="block text-cobalt text-[11px] sm:text-sm font-normal italic normal-case tracking-normal mt-0.5">
            cotidianos
          </span>
        </div>
        <div className="absolute bottom-10 right-6 text-right text-[10px] sm:text-xs text-ink/70 uppercase tracking-[0.18em] font-semibold pointer-events-none z-10">
          <span className="block">Guarda & Asequible</span>
          <span className="block text-cobalt text-[11px] sm:text-sm font-normal italic normal-case tracking-normal mt-0.5">
            joyitas
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block touch-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          role="img"
          aria-label={`Plano interactivo de ${filtered.length} vinos por vintage y precio`}
        >
          {/* Background — sutil polifonía vinosa. Top-right (icónicos)
              recibe un tinte malbec; bottom-left (cotidianos) recibe un
              tinte cream cobalt. Es atmósfera, no decoración. */}
          <defs>
            <radialGradient id="cmp-bg-icons" cx="0.85" cy="0.15" r="0.7">
              <stop offset="0%" stopColor="#6B1E2E" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#6B1E2E" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="cmp-bg-daily" cx="0.15" cy="0.85" r="0.7">
              <stop offset="0%" stopColor="#1E3FBF" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#1E3FBF" stopOpacity="0" />
            </radialGradient>
            <filter id="cmp-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="url(#cmp-bg-icons)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#cmp-bg-daily)" />

          {/* Quadrant divisor lines — discreet */}
          <line
            x1={PAD_X + INNER_W / 2}
            y1={PAD_Y}
            x2={PAD_X + INNER_W / 2}
            y2={PAD_Y + INNER_H}
            stroke="#0F1729"
            strokeWidth="0.5"
            strokeDasharray="2 5"
            opacity="0.15"
          />
          <line
            x1={PAD_X}
            y1={PAD_Y + INNER_H / 2}
            x2={PAD_X + INNER_W}
            y2={PAD_Y + INNER_H / 2}
            stroke="#0F1729"
            strokeWidth="0.5"
            strokeDasharray="2 5"
            opacity="0.15"
          />

          {/* Axes — solo un border bottom + left para no encerrar el plano */}
          <line
            x1={PAD_X}
            y1={PAD_Y + INNER_H}
            x2={PAD_X + INNER_W}
            y2={PAD_Y + INNER_H}
            stroke="#0F1729"
            strokeWidth="0.8"
            opacity="0.35"
          />
          <line
            x1={PAD_X}
            y1={PAD_Y}
            x2={PAD_X}
            y2={PAD_Y + INNER_H}
            stroke="#0F1729"
            strokeWidth="0.8"
            opacity="0.35"
          />

          {/* Y-axis price ticks */}
          {[5000, 15000, 50000, 150000].map((p) => {
            const y = priceToY(p);
            return (
              <g key={`py-${p}`}>
                <line
                  x1={PAD_X - 4}
                  y1={y}
                  x2={PAD_X}
                  y2={y}
                  stroke="#0F1729"
                  strokeWidth="0.8"
                  opacity="0.4"
                />
                <text
                  x={PAD_X - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="#4A5468"
                  fontFamily="Inter, sans-serif"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatArs(p)}
                </text>
              </g>
            );
          })}

          {/* X-axis vintage ticks */}
          {[2024, 2020, 2016, 2012].map((v) => {
            const x = vintageToX(v);
            return (
              <g key={`vx-${v}`}>
                <line
                  x1={x}
                  y1={PAD_Y + INNER_H}
                  x2={x}
                  y2={PAD_Y + INNER_H + 4}
                  stroke="#0F1729"
                  strokeWidth="0.8"
                  opacity="0.4"
                />
                <text
                  x={x}
                  y={PAD_Y + INNER_H + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#4A5468"
                  fontFamily="Inter, sans-serif"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {v}
                </text>
              </g>
            );
          })}

          {/* Las quadrant labels (HTML overlay arriba) ya nombran los ejes
              cualitativamente — agregar "← joven" / "premium →" del lado
              de los ticks crea redundancia y choque visual. */}

          {/* Connector lines from cursor to nearest wines — la "constelación" */}
          {cursorPos &&
            constellation.map((w) => (
              <line
                key={`c-line-${w.slug}`}
                x1={cursorPos.x}
                y1={cursorPos.y}
                x2={w.x}
                y2={w.y}
                stroke="#6B1E2E"
                strokeWidth="0.6"
                opacity="0.4"
                strokeDasharray="2 3"
              />
            ))}

          {/* Wine dots */}
          {filtered.map((w) => {
            const isConstellation = constellationSlugs.has(w.slug);
            return (
              <g
                key={w.slug}
                role="button"
                tabIndex={0}
                aria-label={`${w.displayName} — ${formatArs(w.minPrice)} desde, cosecha ${w.vintage}, ${w.storeCount} vinotecas`}
                onClick={() => router.push(`/vino/${w.slug}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/vino/${w.slug}`);
                  }
                }}
                style={{ cursor: "pointer" }}
                className="cursor-wine"
                filter={isConstellation ? "url(#cmp-glow)" : undefined}
              >
                <circle
                  cx={w.x}
                  cy={w.y}
                  r={isConstellation ? w.radius + 2 : w.radius}
                  fill={w.color}
                  fillOpacity={isConstellation ? 1 : 0.85}
                  stroke={isConstellation ? "#0F1729" : "transparent"}
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* Cursor pin */}
          {cursorPos && (
            <circle
              cx={cursorPos.x}
              cy={cursorPos.y}
              r="3"
              fill="#0F1729"
              opacity="0.55"
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Constellation callout — float over the svg */}
        {constellation.length > 0 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-[280px] max-w-[40%] bg-white border border-ink/10 rounded-2xl shadow-2xl p-4 pointer-events-none z-20">
            <p className="text-[10px] uppercase tracking-[0.18em] text-malbec font-semibold mb-3">
              Cerca de tu cursor
            </p>
            <ul className="space-y-2.5">
              {constellation.map((w) => (
                <li key={w.slug} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="inline-block w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: w.color }}
                  />
                  <div className="min-w-0">
                    <p className="display text-sm font-semibold text-ink leading-tight truncate">
                      {w.displayName}
                    </p>
                    <p className="text-[11px] text-graphite truncate">
                      {w.brandDisplay} · {w.vintage}
                    </p>
                    <p className="text-[11px] text-cobalt font-semibold tabular-nums mt-0.5">
                      {formatArs(w.minPrice)}{" "}
                      <span className="text-graphite/70 font-normal">
                        en {w.storeCount} vinoteca{w.storeCount === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-graphite/70 mt-3 italic">
              Click sobre el punto para ver la ficha.
            </p>
          </div>
        )}
      </div>

      {/* Footer count */}
      <p className="text-xs text-graphite">
        Mostrando <span className="font-semibold">{filtered.length}</span> de{" "}
        {dataset.wines.length} vinos en el plano · top por cobertura.{" "}
        {(activeVarietals.size > 0 || activeRegions.size > 0) && (
          <button
            type="button"
            className="text-cobalt hover:underline ml-1"
            onClick={() => {
              setActiveVarietals(new Set());
              setActiveRegions(new Set());
            }}
          >
            Limpiar filtros
          </button>
        )}
      </p>
    </div>
  );
}
