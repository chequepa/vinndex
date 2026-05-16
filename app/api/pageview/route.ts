import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Server-side pageview tracker — reemplaza al beacon de Cloudflare Web
 * Analytics que cargaba un script de terceros (third-party-cookies = 0
 * en Lighthouse → best-practices 77 en /buscar).
 *
 * Recibe POST con `{ path, ref?, ts? }` desde el cliente, loggea
 * a stdout, y best-effort escribe a `data/pageviews.ndjson` para que
 * el dashboard `/admin/analytics` pueda agregarlo. Sin cookies, sin
 * sesiones — solo el conteo de pageviews por URL.
 *
 * Persistencia:
 *   - stdout (siempre) — Railway / CF / Vercel lo expone en sus logs
 *   - data/pageviews.ndjson (best-effort) — sirve al dashboard. En
 *     Railway persiste durante el container life. En filesystem
 *     read-only (CF Pages, algunos edge runtimes) falla silenciosamente
 *     y el dashboard muestra solo lo que hay.
 *
 * IP y user-agent NO se guardan — la analítica de Vinndex es deliberadamente
 * mínima.
 */

export const dynamic = "force-dynamic";
// Cambiado de "edge" a "nodejs" para tener acceso a fs y poder
// persistir a archivo. Edge tendría mejor latencia pero el dashboard
// pierde valor sin persistencia.
export const runtime = "nodejs";

type Body = {
  path?: unknown;
  ref?: unknown;
  ts?: unknown;
};

function s(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.slice(0, max).trim();
  return t || undefined;
}

// Path del NDJSON. Lo definimos acá y NO en una constante exportada
// para que el dashboard tampoco lo importe — el endpoint es el único
// dueño del archivo.
const NDJSON_PATH = resolve(process.cwd(), "data/pageviews.ndjson");

// Rate limit in-memory por IP. Suficiente mientras corramos en una sola
// instancia en Railway; si scaleamos, hay que mover a Redis.
// 60 req/min cubre la navegación humana razonable (un usuario abriendo
// 60 tabs en un minuto ya es sospechoso) sin romper UX legítima.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ipBuckets = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ipBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipBuckets.set(ip, recent);
  // Stochastic GC: 1% de las inserciones limpia IPs viejas. Evita que el
  // Map crezca sin límite con IPs que ya no envían eventos.
  if (Math.random() < 0.01) {
    for (const [k, v] of ipBuckets) {
      if (v.length === 0 || v[v.length - 1]! < cutoff) ipBuckets.delete(k);
    }
  }
  return false;
}

async function persist(entry: Record<string, unknown>): Promise<void> {
  try {
    await mkdir(resolve(process.cwd(), "data"), { recursive: true });
    await appendFile(NDJSON_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // FS read-only o permisos — solo nos quedamos con stdout. No
    // fallar el request por algo de housekeeping.
  }
}

export async function POST(req: Request) {
  if (isRateLimited(getClientIp(req))) {
    return new NextResponse(null, { status: 429 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const path = s(body.path, 500);
  if (!path || !path.startsWith("/")) {
    // Path obligatorio — protege contra payloads basura/abuse.
    return new NextResponse(null, { status: 400 });
  }
  const ref = s(body.ref, 500);
  const ts = typeof body.ts === "number" ? body.ts : Date.now();

  const entry = {
    kind: "pageview" as const,
    ts,
    path,
    ref: ref ?? null,
  };

  // Log estructurado — Railway / Vercel / Cloudflare Pages capturan
  // stdout y lo exponen en su UI.
  console.log(JSON.stringify(entry));

  // Persistencia best-effort, NO awaited para no bloquear el response.
  void persist(entry);

  return new NextResponse(null, { status: 204 });
}
