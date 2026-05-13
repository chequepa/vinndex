import { NextResponse } from "next/server";

/**
 * Headers compartidos para todos los endpoints `/api/v1/*` —
 * la API pública de Vinndex.
 *
 * Decisiones:
 *   - CORS abierto (Access-Control-Allow-Origin: *) — la API es
 *     read-only, no transmite ningún dato sensible del usuario.
 *   - Cache 5min en el cliente + 15min en el edge (Vercel/CF).
 *     Los datos cambian 1x/día con el daily-scrape, pero queremos
 *     que clientes que pollean cada minuto no nos peguen 60x/h.
 *   - `vary: accept` y `accept-encoding` para que el CDN cachee
 *     bien las variantes comprimidas.
 */
export const API_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
  vary: "accept, accept-encoding",
};

export function apiJson<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: API_HEADERS,
  });
}

export function apiError(
  code: string,
  message: string,
  status = 400,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: API_HEADERS },
  );
}

export function preflightOK(): NextResponse {
  return new NextResponse(null, { status: 204, headers: API_HEADERS });
}
