import priceIndexJson from "@/data/price-index.json";

/**
 * Índice Vinndex de precios del vino · lectura tipada de
 * `data/price-index.json` (lo genera scripts/build-price-index.mjs: la
 * metodología completa está documentada ahí) + helpers de copy que
 * comparten la página /indice, la OG image y la API.
 */

export type IndexPoint = {
  /** YYYY-MM-DD (hora Argentina) del snapshot que cerró la semana. */
  date: string;
  /** Semana ISO, "2026-W28". */
  week: string;
  /** Base 100 en el primer punto. */
  index: number;
  /** Variación % contra el punto anterior · null en el punto base. */
  change: number | null;
  /** Fichas presentes en ambos puntos del eslabón · null en la base. */
  links: number | null;
  /** Fichas del segmento con ≥3 vinotecas en ese punto. */
  fichas: number;
  /** Fichas comunes que subieron / bajaron / no se movieron en el eslabón. */
  up?: number;
  down?: number;
  flat?: number;
  /** Eslabón con pocas fichas comunes o variación absurda. */
  lowSample?: boolean;
};

export type IndexChange = {
  pct: number;
  from: string;
  to: string;
  days: number;
};

export type IndexSegment = {
  label: string;
  points: IndexPoint[];
  /** Sólo en "top-100": la canasta fija de slugs. */
  basket?: string[];
};

export type PriceIndex = {
  generatedAt: string;
  name: string;
  url: string;
  api: string;
  base: { date: string; index: number };
  latest: { date: string; index: number; fichas: number; links: number | null };
  coverage: {
    stores: number;
    minStoresPerWine: number;
    frequency: string;
    currency: string;
  };
  headline: {
    d30: IndexChange | null;
    d90: IndexChange | null;
    sinceStart: IndexChange;
  };
  method: { resumen: string; pasos: string[] };
  notes: string[];
  points: IndexPoint[];
  segments: Record<string, IndexSegment>;
};

export const priceIndex = priceIndexJson as unknown as PriceIndex;

/** Orden de presentación de los segmentos en la tabla y los gráficos. */
export const VARIETAL_SEGMENT_KEYS = [
  "malbec",
  "cabernet-sauvignon",
  "blend",
  "chardonnay",
  "torrontes",
  "espumantes",
] as const;

export const BAND_SEGMENT_KEYS = [
  "banda-hasta-10k",
  "banda-10k-25k",
  "banda-mas-25k",
] as const;

export const TOP_SEGMENT_KEY = "top-100";

/** Variación % entre el último punto y el más cercano a `days` días atrás. */
export function changeOver(
  points: IndexPoint[],
  days: number,
): IndexChange | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const target = addDays(last.date, -days);
  let ref = points[0];
  let best = Infinity;
  for (const p of points) {
    if (p === last) continue;
    const d = Math.abs(diffDays(target, p.date));
    if (d < best) {
      best = d;
      ref = p;
    }
  }
  return {
    pct: Math.round((last.index / ref.index - 1) * 10000) / 100,
    from: ref.date,
    to: last.date,
    days: diffDays(ref.date, last.date),
  };
}

/** Variación % entre el último punto y el primero (desde el inicio). */
export function changeSinceStart(points: IndexPoint[]): IndexChange | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return {
    pct: Math.round((last.index / first.index - 1) * 10000) / 100,
    from: first.date,
    to: last.date,
    days: diffDays(first.date, last.date),
  };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

/** "+3,2%" / "−1,4%" / "0,0%" · coma decimal, signo tipográfico. */
export function formatPct(pct: number | null | undefined, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const abs = Math.abs(pct).toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (Math.abs(pct) < 0.05) return `${abs}%`;
  return `${pct > 0 ? "+" : "−"}${abs}%`;
}

/** "subió" / "bajó" / "no se movió" según el signo. */
export function verbFor(pct: number | null | undefined): "subió" | "bajó" | "no se movió" {
  if (pct == null || Math.abs(pct) < 0.05) return "no se movió";
  return pct > 0 ? "subió" : "bajó";
}

/**
 * Ventana del headline. La serie arranca el 12/07, así que hasta
 * mediados de octubre "90 días" son en realidad menos: si la ventana
 * real se aleja más de una semana de los 90, decimos los días reales.
 */
export function windowLabel(change: IndexChange | null, nominal: number): string {
  if (!change) return `${nominal} días`;
  return Math.abs(change.days - nominal) <= 7
    ? `${nominal} días`
    : `${change.days} días`;
}

/** "30 de septiembre de 2026" */
export function formatDateLong(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "30 sep" */
export function formatDateShort(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`)
    .toLocaleDateString("es-AR", { timeZone: "UTC", day: "numeric", month: "short" })
    .replace(".", "");
}

/** "julio" (mes del punto base, para el copy "desde julio"). */
export function monthName(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
    month: "long",
  });
}

/** Frase corta para títulos y shares: "subió 8,3% en 90 días". */
export function headlineSentence(index: PriceIndex = priceIndex): string {
  const c = index.headline.d90 ?? index.headline.sinceStart;
  const verb = verbFor(c.pct);
  if (verb === "no se movió") return `no se movió en ${windowLabel(c, 90)}`;
  return `${verb} ${formatPct(c.pct)} en ${windowLabel(c, 90)}`;
}
