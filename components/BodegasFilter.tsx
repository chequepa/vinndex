"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Client-side filter input para /bodegas. Filtra rows de la tabla
 * vía CSS · cada <tr> tiene data-search="<lowercase name>" y el
 * componente alterna `display: none` por JS minimal.
 *
 * Ventajas vs SSR-only:
 *   - Cero round-trips. El usuario tipea y la lista se actualiza
 *     instantáneo.
 *   - Sin paginación: las 1.200+ bodegas viven en el DOM y el filter
 *     las muestra/esconde. 250 KB de HTML es mucho pero aceptable.
 *
 * El input mismo es accesible (aria-label, role="searchbox").
 */
export function BodegasFilter({ totalCount }: { totalCount: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(totalCount);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    function update() {
      const q = (input?.value ?? "").toLowerCase().trim();
      const rows = document.querySelectorAll<HTMLTableRowElement>(
        "tr[data-search]",
      );
      let shown = 0;
      for (const row of rows) {
        const key = row.dataset.search ?? "";
        const match = !q || key.includes(q);
        row.style.display = match ? "" : "none";
        if (match) shown++;
      }
      setVisibleCount(shown);
    }

    input.addEventListener("input", update);
    return () => input.removeEventListener("input", update);
  }, []);

  return (
    <div className="mb-4">
      <label className="block">
        <span className="sr-only">Filtrar bodegas</span>
        <input
          ref={inputRef}
          type="search"
          placeholder="Filtrar por nombre… (ej: Catena, Zuccardi)"
          aria-label="Filtrar bodegas por nombre"
          autoComplete="off"
          className="w-full bg-snow border border-ink/15 focus:border-cobalt rounded-full px-5 py-2.5 text-sm outline-none transition-colors"
        />
      </label>
      <p className="text-xs text-graphite mt-2">
        Mostrando{" "}
        <span className="font-semibold text-ink tabular-nums">
          {visibleCount.toLocaleString("es-AR")}
        </span>{" "}
        de {totalCount.toLocaleString("es-AR")} bodegas
      </p>
    </div>
  );
}
