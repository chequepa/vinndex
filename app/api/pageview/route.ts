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
