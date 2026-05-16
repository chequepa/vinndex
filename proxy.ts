import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (lo que en Next ≤15 se llamaba `middleware`) — protege las
 * rutas /admin/* con HTTP Basic Auth.
 *
 * El password vive en `ADMIN_PASSWORD` (env var). Si la var no está
 * seteada, el proxy se hace transparente y las páginas quedan
 * abiertas — comportamiento útil en dev local (no querés que te pida
 * password cada vez que abrís el dashboard).
 *
 * Usuario fijo: `admin`. Si más adelante se quiere multi-user, el
 * único cambio es leer un map de `ADMIN_USERS` en lugar de la var
 * unica.
 *
 * Nota: HTTP Basic transmite las credenciales en cada request en
 * base64 (no encriptación). Es OK sobre HTTPS pero NO sobre HTTP.
 * Railway sirve siempre por HTTPS, así que estamos cubiertos.
 */
export function proxy(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;

  // Sin password configurado → modo "abierto" (dev). En prod, si
  // querés bloquear sí o sí, seteá ADMIN_PASSWORD en Railway.
  if (!expected) return NextResponse.next();

  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const [user, pass] = decoded.split(":");
    if (user === "admin" && pass === expected) {
      return NextResponse.next();
    }
  }

  // El App Router prefetchea cualquier <Link href="/admin/..."> que
  // aparezca en una página pública. Ese prefetch es un request de
  // fondo (RSC) que igual cae acá y, si le mandamos WWW-Authenticate,
  // el browser abre el popup de credenciales sobre el sitio público
  // aunque el usuario nunca pidió entrar al admin.
  //
  // Sólo mandamos el challenge en navegaciones top-level reales
  // (Sec-Fetch-Dest: document, o requests sin el header como curl/
  // scripts/API). Para prefetch/RSC/fetch devolvemos 401 pelado: el
  // request falla en silencio, sin popup, y el admin sigue protegido
  // (nunca servimos su contenido sin credenciales).
  //
  // Nota: Next stripea los headers RSC/Next-Router-Prefetch dentro del
  // proxy, así que Sec-Fetch-Dest es la única señal confiable.
  const dest = request.headers.get("sec-fetch-dest");
  const isBackgroundRequest = dest !== null && dest !== "document";

  return new NextResponse("Authentication required", {
    status: 401,
    headers: isBackgroundRequest
      ? {}
      : {
          "WWW-Authenticate": 'Basic realm="Vinndex admin", charset="UTF-8"',
        },
  });
}

export const config = {
  // Sólo bajo /admin/*. Resto del sitio (incluyendo /api/*) NO se
  // toca por este proxy — /api/scrape/* tiene su propio guard con
  // SCRAPE_TOKEN.
  matcher: "/admin/:path*",
};
