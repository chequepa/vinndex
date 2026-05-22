"use client";

import { useSyncExternalStore } from "react";

/**
 * Compare list — up to 4 wine slugs the user wants to see side by side.
 * Separate from Favorites (which is long-term) — this is ephemeral
 * "stuff I'm deciding between right now".
 *
 * localStorage key: vx:compare
 */

const KEY = "vx:compare";
const MAX = 4;

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
function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}
function write(slugs: string[]) {
  localStorage.setItem(KEY, JSON.stringify(slugs.slice(0, MAX)));
}

let cached: string[] | null = null;
let cachedRaw: string | null = null;
function getSnapshot(): string[] {
  const raw = localStorage.getItem(KEY);
  if (raw === cachedRaw && cached) return cached;
  cachedRaw = raw;
  cached = read();
  return cached;
}

const EMPTY: string[] = [];
function getServerSnapshot(): string[] {
  return EMPTY;
}

export function useCompareList(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function toggleCompare(slug: string) {
  const current = read();
  let next: string[];
  if (current.includes(slug)) {
    next = current.filter((s) => s !== slug);
  } else if (current.length >= MAX) {
    // Bump the oldest out to make room — feels less punishing than a
    // "list is full" error on tap.
    next = [...current.slice(0, MAX - 1), slug];
  } else {
    next = [...current, slug];
  }
  write(next);
  cached = null;
  cachedRaw = null;
  notify();
}

export function clearCompare() {
  localStorage.setItem(KEY, "[]");
  cached = null;
  cachedRaw = null;
  notify();
}

/**
 * Button on ficha / card to add-or-remove a wine from the compare
 * list. Inherits text color; the caller controls tint.
 */
export function CompareButton({
  slug,
  className = "",
  label = true,
}: {
  slug: string;
  className?: string;
  label?: boolean;
}) {
  const list = useCompareList();
  const active = list.includes(slug);
  return (
    <button
      type="button"
      onClick={() => toggleCompare(slug)}
      aria-pressed={active}
      aria-label={active ? "Quitar de comparar" : "Agregar a comparar"}
      title={active ? "En tu lista de comparar" : "Comparar este vino"}
      className={`cursor-wine inline-flex items-center gap-2 rounded-full border transition text-current ${
        active
          ? "border-current/60 bg-current/10"
          : "border-current/20 hover:bg-current/10"
      } ${className}`}
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
        <path d="M3 6h13M3 12h13M3 18h13" />
        <path d="M19 3v18" />
        <path d="M19 3l3 3M19 3l-3 3" />
      </svg>
      {label && (
        <span className="text-xs font-semibold">
          {active ? "En comparar" : "Comparar"}
        </span>
      )}
    </button>
  );
}

/**
 * Floating "Comparar (N)" button that appears bottom-right once the
 * list has 2+ slugs. Links to /comparar?slugs=... preserving order.
 */
export function CompareFloatingButton() {
  const list = useCompareList();
  if (list.length < 2) return null;
  const href = `/comparar?slugs=${encodeURIComponent(list.join(","))}`;
  return (
    <a
      href={href}
      // Mobile: bottom-28 (7rem = 112px) — deja ~30-40px de aire sobre
      // el StickyCTA que ocupa ~70px (mx-3 mb-3 + content) desde bottom-0.
      // Antes era bottom-20 que casi se solapaba con el StickyCTA cuando
      // ambos estaban visibles. Audit mobile 22/05.
      className="cursor-wine fixed bottom-28 right-5 lg:bottom-5 z-40 inline-flex items-center gap-2 bg-ink text-snow font-semibold px-5 py-3 rounded-full shadow-2xl hover:bg-cobalt transition-colors text-sm"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h13M3 12h13M3 18h13" />
        <path d="M19 3v18" />
      </svg>
      Comparar ({list.length})
    </a>
  );
}
