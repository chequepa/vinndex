import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Guarda los endpoints internos de scrape (`/api/scrape/*`).
 *
 * Antes estaban abiertos al público — cualquiera podía dispararlos y forzar a
 * nuestra IP a martillar tiendas terceras (riesgo de blacklist + abuso de
 * bandwidth + DoS upstream).
 *
 * Política:
 *   1. `SCRAPE_TOKEN` tiene que estar seteado en env. Si falta, devolvemos
 *      503 — preferimos romper en producción visible que abrir sin querer.
 *   2. El cliente provee el token vía `Authorization: Bearer <token>` o
 *      `?token=<token>` (este último por comodidad para curl manual, ojo
 *      que el query queda en logs).
 *   3. Comparación con `timingSafeEqual` para evitar timing attacks aunque
 *      el riesgo real con un token de 32+ chars es bajo.
 *
 * Si el guard pasa devuelve `null`; si falla devuelve un `NextResponse`
 * listo para retornar desde el route handler.
 */
export function requireScrapeAuth(req: Request): NextResponse | null {
  const expected = process.env.SCRAPE_TOKEN;
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      {
        error:
          "SCRAPE_TOKEN no configurado en el servidor (o demasiado corto). Endpoint deshabilitado por seguridad.",
      },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;
  const provided =
    bearer ?? new URL(req.url).searchParams.get("token")?.trim() ?? "";

  if (!provided || provided.length !== expected.length) {
    // Longitud distinta → ni siquiera entramos a timingSafeEqual (tira).
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
