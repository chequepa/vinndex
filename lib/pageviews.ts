import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const NDJSON_PATH = resolve(process.cwd(), "data/pageviews.ndjson");

export type PageView = {
  kind: "pageview";
  ts: number;
  path: string;
  ref: string | null;
};

export type PageViewStats = {
  total: number;
  byPath: { path: string; count: number }[];
  byDay: { day: string; count: number }[];
  byReferrer: { ref: string; count: number }[];
  oldest: number | null;
  newest: number | null;
};

/**
 * Lee el NDJSON de pageviews y agrega stats agregadas. Falla
 * silenciosamente (devuelve stats vacíos) si el archivo no existe o
 * no es legible — caso normal en deploys recién iniciados o
 * filesystems read-only.
 *
 * Para entornos chicos como Vinndex (centenares-miles de pageviews
 * por día) el parseo on-the-fly es OK. Si crece, considerá un cron
 * que pre-compute las agregaciones y las guarde a un JSON separado.
 */
export async function readPageviewStats(): Promise<PageViewStats> {
  let raw: string;
  try {
    raw = await readFile(NDJSON_PATH, "utf8");
  } catch {
    return {
      total: 0,
      byPath: [],
      byDay: [],
      byReferrer: [],
      oldest: null,
      newest: null,
    };
  }

  const events: PageView[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as PageView;
      if (e.kind === "pageview" && typeof e.ts === "number" && e.path) {
        events.push(e);
      }
    } catch {
      // Línea malformada — la skipeamos.
    }
  }

  const byPathMap = new Map<string, number>();
  const byDayMap = new Map<string, number>();
  const byRefMap = new Map<string, number>();
  let oldest = Number.POSITIVE_INFINITY;
  let newest = 0;

  for (const e of events) {
    byPathMap.set(e.path, (byPathMap.get(e.path) ?? 0) + 1);
    const day = new Date(e.ts).toISOString().slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
    if (e.ref) {
      try {
        const host = new URL(e.ref).host;
        byRefMap.set(host, (byRefMap.get(host) ?? 0) + 1);
      } catch {
        byRefMap.set(e.ref, (byRefMap.get(e.ref) ?? 0) + 1);
      }
    }
    if (e.ts < oldest) oldest = e.ts;
    if (e.ts > newest) newest = e.ts;
  }

  const sortDesc = (
    a: { count: number },
    b: { count: number },
  ) => b.count - a.count;

  return {
    total: events.length,
    byPath: [...byPathMap.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort(sortDesc)
      .slice(0, 50),
    byDay: [...byDayMap.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byReferrer: [...byRefMap.entries()]
      .map(([ref, count]) => ({ ref, count }))
      .sort(sortDesc)
      .slice(0, 25),
    oldest: oldest === Number.POSITIVE_INFINITY ? null : oldest,
    newest: newest || null,
  };
}
