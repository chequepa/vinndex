"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /**
   * id de un elemento de la página (el hero de la home). Mientras ese
   * elemento esté en pantalla el header queda escondido arriba; cuando
   * sale, el header baja. Sin esto el header es sticky normal.
   */
  revealAfter?: string;
};

/** Debajo de este ancho el header se esconde al bajar (headroom). En
 * desktop sobra alto y /buscar tiene un sidebar `sticky top-24` que
 * cuenta con el header siempre visible. */
const HEADROOM_QUERY = "(max-width: 1023px)";
/** No esconder hasta pasar este scroll: arriba de todo el header siempre
 * está, y así un scroll corto no lo hace parpadear. */
const HIDE_AFTER = 160;
/** Píxeles de scroll en una misma dirección antes de cambiar de estado
 * (evita el temblor con el rebote de iOS y los trackpads). */
const DELTA = 8;

/**
 * Cáscara del header: maneja el estado de scroll (sombra, headroom en
 * mobile, reveal en la home) y nada más. El contenido (logo, buscador,
 * nav) sigue siendo server-rendered y llega como children.
 *
 * El estado se escribe como data-attributes directo en el DOM dentro de
 * un requestAnimationFrame, sin setState: scrollear no re-renderiza
 * React, y la transición es un `transform` en CSS (globals.css,
 * `.site-header`), que corre en el compositor.
 */
export function HeaderShell({ children, className = "", revealAfter }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mq = window.matchMedia(HEADROOM_QUERY);
    let lastY = window.scrollY;
    let headroomHidden = false;
    // En modo reveal arrancamos escondidos: el hero ocupa la pantalla.
    let heroVisible = Boolean(revealAfter);
    let focusInside = false;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      if (!mq.matches || y < HIDE_AFTER) {
        headroomHidden = false;
        lastY = y;
      } else if (Math.abs(dy) >= DELTA) {
        headroomHidden = dy > 0;
        lastY = y;
      }
      const hidden = !focusInside && (heroVisible || headroomHidden);
      el.dataset.hidden = String(hidden);
      el.dataset.scrolled = String(y > 8);
      // En modo reveal, escondido = fuera del tab order (no tiene sentido
      // tabular a un buscador que está arriba de la pantalla). En headroom
      // no: si alguien tabula adentro, focusin lo vuelve a mostrar.
      if (revealAfter) el.inert = heroVisible;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onFocusIn = () => {
      focusInside = true;
      schedule();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) {
        focusInside = false;
        schedule();
      }
    };

    let io: IntersectionObserver | null = null;
    const hero = revealAfter ? document.getElementById(revealAfter) : null;
    if (hero) {
      // rootMargin: el header baja un poco antes de que el hero termine
      // de salir, para que nunca quede un tramo sin buscador a mano.
      io = new IntersectionObserver(
        ([entry]) => {
          heroVisible = entry.isIntersecting;
          schedule();
        },
        { rootMargin: "-80px 0px 0px 0px" },
      );
      io.observe(hero);
    } else {
      heroVisible = false;
    }

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    mq.addEventListener("change", schedule);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      io?.disconnect();
      window.removeEventListener("scroll", schedule);
      mq.removeEventListener("change", schedule);
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [revealAfter]);

  return (
    <header
      ref={ref}
      data-hidden={revealAfter ? "true" : "false"}
      data-scrolled="false"
      // Antes de hidratar, en modo reveal el header ya está escondido:
      // que tampoco sea tabulable.
      inert={revealAfter ? true : undefined}
      className={`site-header ${
        revealAfter ? "fixed inset-x-0" : "sticky"
      } top-0 z-30 ${className}`}
    >
      {children}
    </header>
  );
}
