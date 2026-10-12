"use client";

/**
 * WineCompass — discovery 2D para el catálogo.
 *
 * Eje X: cosecha (joven izquierda, guarda derecha).
 * Eje Y: precio mínimo en escala log (asequible abajo, premium arriba).
 *
 * Cómo se usa (rediseño 2026-10, "apretás en un lado y te vas a cualquier
 * lado"):
 *
 *   · Tocar/clickear el plano NO navega. Selecciona el vino más cercano al
 *     dedo (snap con radio generoso, medido en px de pantalla, no en
 *     unidades del viewBox) y lo muestra en una tarjeta con sus vecinos.
 *     La navegación vive en la tarjeta ("Ver precios"), que es un link
 *     de verdad. Antes cada punto de 3 px navegaba al tocarlo: en un
 *     celular de 375 px los 600 puntos miden ~1–3 px, se pisan entre sí y
 *     el que recibía el toque era cualquiera.
 *   · Los vecinos de la tarjeta resuelven los puntos superpuestos: tocás
 *     el racimo y elegís de la lista.
 *   · La cosecha es un entero, así que todos los vinos de un año caían en
 *     la misma columna, uno arriba del otro. Un jitter determinístico por
 *     slug (±0,35 años) los separa sin mentir sobre el año.
 *   · Debajo del plano va la lista de los vinos de la zona elegida: es el
 *     camino confiable (y accesible por teclado) para llegar a una ficha.
 *     El plano orienta; la lista lleva.
 *
 * Mouse: el hover previsualiza en la tarjeta; el click la fija.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type CompassDataset,
  colorForWine,
} from "@/lib/compassPalette";
import { formatArs } from "@/lib/format";

type Props = {
  dataset: CompassDataset;
};

/** Plano en px reales: el viewBox sigue al ancho del contenedor para que
 * texto y puntos tengan el mismo tamaño en un celular que en desktop (con
 * un viewBox fijo de 1000 px, en 343 px de ancho todo se encogía a un
 * tercio: etiquetas de 6 px y puntos de 1 px). */
type Dims = { w: number; h: number; padL: number; padR: number; padT: number; padB: number };

function dimsFor(width: number): Dims {
  const w = Math.max(280, Math.round(width));
  // Más alto que ancho-proporcional en mobile: 600 vinos necesitan aire.
  const h = Math.round(Math.max(380, Math.min(620, w * (w < 640 ? 1.05 : 0.6))));
  return { w, h, padL: 46, padR: 12, padT: 16, padB: 30 };
}

// Eje de cosecha por EDAD con raíz cuadrada: casi todo el catálogo es
// 2019–2025, y una escala lineal 2010→2024 apilaba el 80% de los puntos
// en el tercio izquierdo y dejaba la mitad derecha vacía. Con √edad los
// años recientes se abren y la guarda sigue entrando.
const VINTAGE_YOUNG = 2025;
const VINTAGE_OLD = 2010;

// Price range: log scale ancla en $2k (cualquier asequible) y $400k (alto).
const PRICE_MIN = 2000;
const PRICE_MAX = 400000;
const PRICE_MIN_LOG = Math.log(PRICE_MIN);
const PRICE_MAX_LOG = Math.log(PRICE_MAX);

/** Radio de "snap" en px de pantalla. Dedo ≈ 44 px; mouse más fino. */
const SNAP_PX_TOUCH = 30;
const SNAP_PX_MOUSE = 20;

const LIST_PAGE = 24;

function vintageToX(d: Dims, v: number): number {
  const age = Math.max(0, Math.min(VINTAGE_YOUNG - VINTAGE_OLD, VINTAGE_YOUNG + 0.4 - v));
  const t = Math.sqrt(age / (VINTAGE_YOUNG - VINTAGE_OLD + 0.4));
  // Joven (t=0) → izquierda, guarda (t=1) → derecha
  return d.padL + 6 + t * (d.w - d.padL - d.padR - 12);
}

function priceToY(d: Dims, p: number): number {
  const logP = Math.log(Math.max(p, 1));
  const t = (logP - PRICE_MIN_LOG) / (PRICE_MAX_LOG - PRICE_MIN_LOG);
  const clamped = Math.max(0, Math.min(1, t));
  // Premium (t=1) → top, asequible (t=0) → bottom
  return d.padT + (1 - clamped) * (d.h - d.padT - d.padB);
}

// Tamaño del dot: proporcional a √storeCount (cobertura).
function radiusFor(storeCount: number): number {
  return 2.5 + Math.min(Math.sqrt(storeCount) * 0.6, 4);
}

/** Hash estable del slug → [-0.35, 0.35] años. Determinístico para que el
 * punto no salte entre renders ni entre SSR y cliente. */
function jitterFor(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.7;
}

// Centro del plano: divide las cuatro zonas.
// 2020 y anteriores cuentan como "con años" (5+ de botella).
const MID_VINTAGE = 2020.5;
const MID_PRICE = Math.round(Math.sqrt(PRICE_MIN * PRICE_MAX)); // ~$28k

type ZoneKey = "cotidianos" | "cult" | "iconicos" | "guarda";
const ZONES: {
  key: ZoneKey;
  label: string;
  hint: string;
  young: boolean;
  premium: boolean;
}[] = [
  { key: "cotidianos", label: "Cotidianos", hint: "jóvenes y accesibles", young: true, premium: false },
  { key: "cult", label: "Cult", hint: "jóvenes y premium", young: true, premium: true },
  { key: "guarda", label: "Guarda accesible", hint: "con años y buen precio", young: false, premium: false },
  { key: "iconicos", label: "Icónicos", hint: "con años y premium", young: false, premium: true },
];

function zoneOf(vintage: number, price: number): ZoneKey {
  const young = vintage > MID_VINTAGE;
  const premium = price >= MID_PRICE;
  return ZONES.find((z) => z.young === young && z.premium === premium)!.key;
}

type Positioned = CompassDataset["wines"][number] & {
  x: number;
  y: number;
  color: string;
  radius: number;
  zone: ZoneKey;
};

export function WineCompass({ dataset }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // SSR / primer render con un ancho de desktop; el ResizeObserver lo
  // corrige apenas monta.
  const [dims, setDims] = useState<Dims>(() => dimsFor(800));
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const next = dimsFor(el.clientWidth);
      setDims((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lastPointerType = useRef<string>("mouse");
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [zone, setZone] = useState<ZoneKey | null>(null);
  const [activeVarietals, setActiveVarietals] = useState<Set<string>>(
    new Set(),
  );
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const [listLimit, setListLimit] = useState(LIST_PAGE);

  const positionedWines: Positioned[] = useMemo(
    () =>
      dataset.wines.map((w) => ({
        ...w,
        x: vintageToX(dims, w.vintage + jitterFor(w.slug)),
        y: priceToY(dims, w.minPrice),
        color: colorForWine(w),
        radius: radiusFor(w.storeCount),
        zone: zoneOf(w.vintage, w.minPrice),
      })),
    [dataset.wines, dims],
  );

  // Filtros de varietal/región: definen qué puntos se dibujan.
  const filtered = useMemo(
    () =>
      positionedWines.filter((w) => {
        if (activeVarietals.size > 0) {
          if (!w.varietals.some((v) => activeVarietals.has(v))) return false;
        }
        if (activeRegions.size > 0) {
          if (!w.region || !activeRegions.has(w.region)) return false;
        }
        return true;
      }),
    [positionedWines, activeVarietals, activeRegions],
  );

  const zoneCounts = useMemo(() => {
    const c: Record<ZoneKey, number> = { cotidianos: 0, cult: 0, iconicos: 0, guarda: 0 };
    for (const w of filtered) c[w.zone]++;
    return c;
  }, [filtered]);

  // La zona no esconde puntos (el plano sigue dando contexto): los atenúa
  // y recorta la lista.
  const listed = useMemo(
    () =>
      filtered
        .filter((w) => !zone || w.zone === zone)
        .sort((a, b) => b.storeCount - a.storeCount || a.minPrice - b.minPrice),
    [filtered, zone],
  );

  const bySlug = useMemo(
    () => new Map(filtered.map((w) => [w.slug, w])),
    [filtered],
  );

  /** px de pantalla → unidades del viewBox (el SVG escala con el ancho). */
  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * dims.w,
      y: ((clientY - rect.top) / rect.height) * dims.h,
      scale: dims.w / rect.width,
    };
  }, [dims]);

  const nearest = useCallback(
    (x: number, y: number, maxDist: number): Positioned | null => {
      let best: Positioned | null = null;
      let bestD = maxDist * maxDist;
      for (const w of filtered) {
        if (zone && w.zone !== zone) continue;
        const dx = w.x - x;
        const dy = w.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      return best;
    },
    [filtered, zone],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType !== "mouse") return;
      const p = toViewBox(e.clientX, e.clientY);
      if (!p) return;
      const w = nearest(p.x, p.y, SNAP_PX_MOUSE * p.scale);
      setHoverSlug(w?.slug ?? null);
    },
    [toViewBox, nearest],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const p = toViewBox(e.clientX, e.clientY);
      if (!p) return;
      const px =
        lastPointerType.current === "mouse" ? SNAP_PX_MOUSE : SNAP_PX_TOUCH;
      const w = nearest(p.x, p.y, px * p.scale);
      setSelectedSlug(w?.slug ?? null);
    },
    [toViewBox, nearest],
  );

  const activeSlug = hoverSlug ?? selectedSlug;
  const active = activeSlug ? bySlug.get(activeSlug) ?? null : null;

  // Vecinos del vino activo (distancia en el plano). Son los que el dedo
  // pudo haber querido tocar.
  const neighbors = useMemo(() => {
    if (!active) return [];
    return filtered
      .filter((w) => w.slug !== active.slug && (!zone || w.zone === zone))
      .map((w) => ({ w, d: (w.x - active.x) ** 2 + (w.y - active.y) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .filter(({ d }) => d < 40 * 40)
      .map(({ w }) => w);
  }, [active, filtered, zone]);

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    name: string,
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setListLimit(LIST_PAGE);
  };

  const hasFilters = activeVarietals.size > 0 || activeRegions.size > 0 || zone;
  const neighborSlugs = new Set(neighbors.map((w) => w.slug));

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-graphite font-semibold mb-2">
            Zona del plano
          </p>
          <div className="flex flex-wrap gap-2">
            <ChipButton active={zone === null} onClick={() => { setZone(null); setListLimit(LIST_PAGE); }}>
              Todo el plano
              <ChipCount active={zone === null}>{filtered.length}</ChipCount>
            </ChipButton>
            {ZONES.map((z) => (
              <ChipButton
                key={z.key}
                active={zone === z.key}
                onClick={() => {
                  setZone(zone === z.key ? null : z.key);
                  setSelectedSlug(null);
                  setListLimit(LIST_PAGE);
                }}
                title={z.hint}
              >
                {z.label}
                <ChipCount active={zone === z.key}>{zoneCounts[z.key]}</ChipCount>
              </ChipButton>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-graphite font-semibold mb-2">
            Varietal
          </p>
          <div className="flex flex-wrap gap-2">
            {dataset.topVarietals.map((v) => (
              <ChipButton
                key={v.name}
                active={activeVarietals.has(v.name)}
                onClick={() => toggle(setActiveVarietals, v.name)}
              >
                {v.name}
                <ChipCount active={activeVarietals.has(v.name)}>{v.count}</ChipCount>
              </ChipButton>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-graphite font-semibold mb-2">
            Región
          </p>
          <div className="flex flex-wrap gap-2">
            {dataset.topRegions.map((r) => (
              <ChipButton
                key={r.name}
                active={activeRegions.has(r.name)}
                onClick={() => toggle(setActiveRegions, r.name)}
              >
                {r.name}
                <ChipCount active={activeRegions.has(r.name)}>{r.count}</ChipCount>
              </ChipButton>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-graphite -mb-2">
        ← más jóvenes · más años de guarda → &nbsp;·&nbsp; más caros arriba
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        {/* Plano */}
        <div ref={wrapRef} className="relative rounded-3xl border border-ink/10 overflow-hidden bg-snow/30">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            className="w-full h-auto block select-none cursor-crosshair"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              lastPointerType.current = e.pointerType;
            }}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverSlug(null)}
            onClick={handleClick}
            role="img"
            aria-label={`Plano de ${filtered.length} vinos por cosecha y precio. La lista de abajo tiene los mismos vinos.`}
          >
            <defs>
              <radialGradient id="cmp-bg-icons" cx="0.85" cy="0.15" r="0.7">
                <stop offset="0%" stopColor="#6B1E2E" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#6B1E2E" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="cmp-bg-daily" cx="0.15" cy="0.85" r="0.7">
                <stop offset="0%" stopColor="#1E3FBF" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#1E3FBF" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width={dims.w} height={dims.h} fill="url(#cmp-bg-icons)" />
            <rect x="0" y="0" width={dims.w} height={dims.h} fill="url(#cmp-bg-daily)" />

            {/* Divisores de zona */}
            <line
              x1={vintageToX(dims, MID_VINTAGE)}
              y1={dims.padT}
              x2={vintageToX(dims, MID_VINTAGE)}
              y2={dims.h - dims.padB}
              stroke="#0F1729"
              strokeWidth="1"
              strokeDasharray="3 6"
              opacity="0.18"
            />
            <line
              x1={dims.padL}
              y1={priceToY(dims, MID_PRICE)}
              x2={dims.w - dims.padR}
              y2={priceToY(dims, MID_PRICE)}
              stroke="#0F1729"
              strokeWidth="1"
              strokeDasharray="3 6"
              opacity="0.18"
            />

            {/* Nombres de zona: dentro del SVG para que escalen con el plano
                y no tapen puntos con cajas HTML. */}
            {ZONES.map((z) => {
              const left = z.young;
              const top = z.premium;
              const dim = zone !== null && zone !== z.key;
              return (
                <text
                  key={`zl-${z.key}`}
                  x={left ? dims.padL + 8 : dims.w - dims.padR - 8}
                  y={top ? dims.padT + 18 : dims.h - dims.padB - 10}
                  textAnchor={left ? "start" : "end"}
                  fontSize={dims.w < 500 ? 13 : 17}
                  fontStyle="italic"
                  fontFamily="Fraunces, Georgia, serif"
                  fill={z.premium ? "#6B1E2E" : "#1E3FBF"}
                  opacity={dim ? 0.12 : 0.4}
                  pointerEvents="none"
                >
                  {z.label.toLowerCase()}
                </text>
              );
            })}

            {/* Ejes */}
            <line x1={dims.padL} y1={dims.h - dims.padB} x2={dims.w - dims.padR} y2={dims.h - dims.padB} stroke="#0F1729" strokeWidth="1" opacity="0.35" />
            <line x1={dims.padL} y1={dims.padT} x2={dims.padL} y2={dims.h - dims.padB} stroke="#0F1729" strokeWidth="1" opacity="0.35" />

            {[5000, 15000, 50000, 150000].map((p) => {
              const y = priceToY(dims, p);
              return (
                <g key={`py-${p}`} pointerEvents="none">
                  <line x1={dims.padL - 5} y1={y} x2={dims.padL} y2={y} stroke="#0F1729" strokeWidth="1" opacity="0.4" />
                  <text x={dims.padL - 7} y={y + 4} textAnchor="end" fontSize="11" fill="#4A5468" fontFamily="Inter, sans-serif" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {p >= 1000 ? `$${p / 1000}k` : formatArs(p)}
                  </text>
                </g>
              );
            })}

            {[2025, 2023, 2020, 2016, 2012].map((v) => {
              const x = vintageToX(dims, v);
              return (
                <g key={`vx-${v}`} pointerEvents="none">
                  <line x1={x} y1={dims.h - dims.padB} x2={x} y2={dims.h - dims.padB + 5} stroke="#0F1729" strokeWidth="1" opacity="0.4" />
                  <text x={x} y={dims.h - dims.padB + 17} textAnchor="middle" fontSize="11" fill="#4A5468" fontFamily="Inter, sans-serif" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {v}
                  </text>
                </g>
              );
            })}

            {/* Puntos. pointerEvents none: el SVG entero recibe el toque y
                decide por cercanía, no el punto que quedó arriba. */}
            <g pointerEvents="none">
              {filtered.map((w) => {
                const dim = zone !== null && w.zone !== zone;
                const isNeighbor = neighborSlugs.has(w.slug);
                return (
                  <circle
                    key={w.slug}
                    cx={w.x}
                    cy={w.y}
                    r={w.radius}
                    fill={w.color}
                    fillOpacity={dim ? 0.12 : isNeighbor ? 1 : 0.75}
                    stroke={isNeighbor ? "#0F1729" : "#ffffff"}
                    strokeOpacity={dim ? 0 : isNeighbor ? 0.6 : 0.7}
                    strokeWidth={isNeighbor ? 1.5 : 1}
                  />
                );
              })}
            </g>

            {/* Activo arriba de todo, con anillo */}
            {active && (
              <g pointerEvents="none">
                <circle cx={active.x} cy={active.y} r={active.radius + 7} fill="none" stroke="#0F1729" strokeWidth="2" opacity="0.7" />
                <circle cx={active.x} cy={active.y} r={active.radius + 2} fill={active.color} stroke="#ffffff" strokeWidth="2" />
              </g>
            )}
          </svg>
          {/* Mobile: la tarjeta completa queda debajo del plano, fuera de
              pantalla. Este resumen mínimo confirma qué elegiste sin
              obligarte a scrollear (y arriba, donde hay menos puntos). */}
          {selectedSlug && active && active.slug === selectedSlug && (
            <div className="lg:hidden absolute top-2 left-2 right-2 flex items-center gap-2 rounded-2xl bg-white/95 border border-ink/10 shadow-lg pl-3 pr-1.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink truncate">
                  {active.displayName}
                </span>
                <span className="block text-[11px] text-graphite tabular-nums">
                  {active.vintage} · desde {formatArs(active.minPrice)}
                </span>
              </span>
              <Link
                href={`/vino/${active.slug}`}
                className="shrink-0 inline-flex items-center min-h-11 px-4 rounded-full bg-cobalt text-snow text-sm font-semibold"
              >
                Ver →
              </Link>
            </div>
          )}
        </div>

        {/* Tarjeta del vino elegido */}
        <aside
          aria-live="polite"
          className="rounded-3xl border border-ink/10 bg-white p-5 min-h-[180px]"
        >
          {active ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-malbec font-semibold mb-2">
                {hoverSlug && hoverSlug !== selectedSlug ? "Bajo el cursor" : "Elegiste"}
              </p>
              <p className="text-xs uppercase tracking-wide text-graphite truncate">
                {active.brandDisplay || "Sin bodega identificada"} · {active.vintage}
              </p>
              <p className="display text-xl font-semibold text-ink leading-tight mt-0.5">
                {active.displayName}
              </p>
              <p className="mt-2 text-sm text-graphite">
                desde{" "}
                <span className="display text-2xl font-semibold text-cobalt tabular-nums">
                  {formatArs(active.minPrice)}
                </span>{" "}
                en {active.storeCount} vinoteca{active.storeCount === 1 ? "" : "s"}
              </p>
              <Link
                href={`/vino/${active.slug}`}
                className="cursor-wine mt-4 inline-flex items-center justify-center gap-2 min-h-11 w-full bg-cobalt text-snow font-semibold px-5 py-2.5 rounded-full text-sm hover:opacity-90 transition-opacity"
              >
                Ver precios en {active.storeCount} vinoteca{active.storeCount === 1 ? "" : "s"} →
              </Link>
              {neighbors.length > 0 && (
                <div className="mt-5 pt-4 border-t border-ink/10">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-graphite font-semibold mb-2">
                    Muy cerca en el plano
                  </p>
                  <ul className="space-y-1">
                    {neighbors.map((w) => (
                      <li key={w.slug}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSlug(w.slug);
                            setHoverSlug(null);
                          }}
                          className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-2 min-h-11 hover:bg-snow"
                        >
                          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-ink truncate">{w.displayName}</span>
                            <span className="block text-[11px] text-graphite tabular-nums">
                              {w.vintage} · {formatArs(w.minPrice)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-graphite leading-relaxed">
              <p className="display text-lg font-semibold text-ink mb-2">
                Tocá cualquier punto
              </p>
              <p>
                El plano elige el vino más cercano a tu dedo y te lo muestra
                acá, con los que tiene al lado. Desde la tarjeta vas a la
                ficha. Si preferís una lista, está justo abajo.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Lista: el camino confiable a la ficha */}
      <section aria-labelledby="compass-list">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 id="compass-list" className="display text-xl font-semibold text-ink">
            {zone ? ZONES.find((z) => z.key === zone)!.label : "Todos los vinos del plano"}
            <span className="text-graphite text-sm font-normal ml-2">
              {listed.length} vino{listed.length === 1 ? "" : "s"}
            </span>
          </h2>
          {hasFilters && (
            <button
              type="button"
              className="text-sm text-cobalt hover:underline"
              onClick={() => {
                setActiveVarietals(new Set());
                setActiveRegions(new Set());
                setZone(null);
                setListLimit(LIST_PAGE);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
        {listed.length === 0 ? (
          <p className="text-graphite text-sm">
            Ningún vino del plano cumple esos filtros.
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {listed.slice(0, listLimit).map((w) => (
              <li key={w.slug}>
                <Link
                  href={`/vino/${w.slug}`}
                  onMouseEnter={() => setHoverSlug(w.slug)}
                  onMouseLeave={() => setHoverSlug(null)}
                  onFocus={() => setHoverSlug(w.slug)}
                  onBlur={() => setHoverSlug(null)}
                  className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 hover:border-cobalt transition-colors"
                >
                  <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block display text-[15px] font-semibold text-ink leading-tight truncate">
                      {w.displayName}
                    </span>
                    <span className="block text-xs text-graphite truncate">
                      {w.brandDisplay ? `${w.brandDisplay} · ` : ""}
                      {w.vintage}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-semibold text-cobalt tabular-nums">
                      {formatArs(w.minPrice)}
                    </span>
                    <span className="block text-[11px] text-graphite tabular-nums">
                      {w.storeCount} vinoteca{w.storeCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {listed.length > listLimit && (
          <button
            type="button"
            onClick={() => setListLimit((n) => n + LIST_PAGE * 2)}
            className="mt-4 inline-flex items-center min-h-11 px-5 rounded-full border border-ink/15 text-sm font-medium text-ink hover:border-cobalt hover:text-cobalt"
          >
            Ver {Math.min(LIST_PAGE * 2, listed.length - listLimit)} más
          </button>
        )}
      </section>
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        active
          ? "cursor-wine inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-full bg-ink text-snow text-sm font-medium border border-ink"
          : "cursor-wine inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-full bg-white text-ink text-sm font-medium border border-ink/15 hover:border-malbec hover:text-malbec"
      }
    >
      {children}
    </button>
  );
}

function ChipCount({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className={active ? "text-snow/70 text-xs tabular-nums" : "text-graphite text-xs tabular-nums"}>
      {children}
    </span>
  );
}
