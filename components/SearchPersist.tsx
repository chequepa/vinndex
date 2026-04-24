"use client";

import { useEffect, useSyncExternalStore } from "react";

const KEY = "vx:last-search";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): string | null {
  return read();
}

function getServerSnapshot(): string | null {
  return null;
}

function useLastSearch(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Drop in at the top of /buscar. If a real query is present this run,
 * persist it so the next empty visit can surface it as a chip.
 */
export function SearchPersist({ query }: { query: string }) {
  useEffect(() => {
    if (query && query.trim().length >= 2) {
      try {
        localStorage.setItem(KEY, query.trim());
        notify();
      } catch {
        /* storage disabled — whatever */
      }
    }
  }, [query]);
  return null;
}

/**
 * Shown on /buscar when no query is active and there's a previous
 * search worth surfacing. One click to return to the last search
 * the user ran — without re-typing.
 */
export function LastSearchChip() {
  const last = useLastSearch();
  if (!last) return null;
  return (
    <a
      href={`/buscar?q=${encodeURIComponent(last)}`}
      className="filter-chip"
      title="Volver a tu última búsqueda"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mr-0.5"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      Última búsqueda: {last}
    </a>
  );
}
