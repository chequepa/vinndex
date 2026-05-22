"use client";

import { useEffect, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  activeCount?: number;
}

export function MobileFiltersDrawer({ children, activeCount = 0 }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-full border border-ink/15 bg-white hover:border-ink/30 transition cursor-wine font-semibold"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="7" y1="12" x2="20" y2="12" />
          <line x1="10" y1="18" x2="20" y2="18" />
          <circle cx="6" cy="12" r="1.5" fill="currentColor" />
        </svg>
        <span className="uppercase tracking-wide">Filtros</span>
        {activeCount > 0 && (
          <span className="bg-ink text-snow text-[10px] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1.5">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros de búsqueda"
        >
          <button
            type="button"
            aria-label="Cerrar filtros"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm cursor-default"
          />

          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col pb-[env(safe-area-inset-bottom)]">
            <div className="pt-3 pb-2 flex justify-center">
              <span
                className="w-10 h-1.5 bg-ink/15 rounded-full"
                aria-hidden="true"
              />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 border-b border-ink/10">
              <h2 className="display text-lg font-semibold text-ink">
                Filtros
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-graphite hover:text-ink p-2 -mr-2"
                aria-label="Cerrar"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-5 overflow-y-auto flex-1 space-y-8">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
