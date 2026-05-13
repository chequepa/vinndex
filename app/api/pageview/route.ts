import { NextResponse } from "next/server";

/**
 * Server-side pageview tracker — reemplaza al beacon de Cloudflare Web
 * Analytics que cargaba un script de terceros (third-party-cookies = 0
 * en Lighthouse → best-practices 77 en /buscar).
 *
 * Recibe POST con `{ path, ref?, ts? }` desde el cliente, loggea
 * a stdout y vuelve 204. Sin cookies, sin sesiones, sin tracking
 * persistente — solo el conteo de pageviews por URL.
 *
 * En Railway los logs se leen desde el dashboard; si más adelante se
 * quiere persistir, este es el único punto donde escribir a Postgres /
 * Redis / KV.
 *
 * IP y user-agent NO se guardan — la analítica de Vinndex es deliberadamente
 * mínima.
 */

export const dynamic = "force-dynamic";
export const runtime = "edge";

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

  // Log estructurado — Railway / Vercel / Cloudflare Pages capturan
  // stdout y lo exponen en su UI. Si más adelante se enchufa con
  // una base de datos, este es el punto único de escritura.
  console.log(
    JSON.stringify({
      kind: "pageview",
      ts,
      path,
      ref: ref ?? null,
    }),
  );

  return new NextResponse(null, { status: 204 });
}
