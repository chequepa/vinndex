"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Cliente liviano que dispara un POST a /api/pageview cada vez que
 * cambia la ruta. Reemplaza al beacon de Cloudflare que cargaba un
 * script de terceros con cookies.
 *
 * Sin librerías, sin cookies, sin sesiones · solo el path + referrer
 * + timestamp por pageview. La data va a stdout del server vía
 * console.log y queda en logs de Railway.
 *
 * Honora `localStorage.optOut === "1"` (opcional, si más adelante
 * agregamos un toggle desde /opt-out).
 */
export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    // Key estable de la "ruta efectiva": path + (algunos) searchParams.
    // Limitamos a un set chico · `q`, `varietal`, `region`, `tipo`,
    // `sort` · para no inflar el log con queries únicas de paginación
    // y similares.
    const sp = new URLSearchParams();
    for (const k of ["q", "varietal", "region", "tipo", "sort", "multi"]) {
      const v = searchParams.get(k);
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;

    // Dedupe en client: el mismo path + qs en el mismo mount no
    // dispara dos POSTs (algo común con React strict mode + double
    // effect en dev).
    if (lastSentRef.current === path) return;
    lastSentRef.current = path;

    // Opt-out manual.
    try {
      if (
        typeof window !== "undefined" &&
        window.localStorage?.getItem("optOut") === "1"
      ) {
        return;
      }
    } catch {
      /* localStorage bloqueado · seguimos */
    }

    const ref = typeof document !== "undefined" ? document.referrer : "";
    const body = JSON.stringify({
      path,
      ref: ref && !ref.includes(window.location.host) ? ref : undefined,
      ts: Date.now(),
    });

    // sendBeacon es ideal para esto · no bloquea navegación, garantiza
    // delivery aún si el usuario salta de página inmediatamente. Fallback
    // a fetch keepalive en navegadores viejos / cuando sendBeacon falla.
    let sent = false;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(
          "/api/pageview",
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        sent = false;
      }
    }
    if (!sent) {
      fetch("/api/pageview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* silent · analytics nunca rompe UX */
      });
    }
  }, [pathname, searchParams]);

  return null;
}
