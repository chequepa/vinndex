"use client";

import { useSyncExternalStore } from "react";

/**
 * Favorites — client-only feature, list of wine slugs persisted in
 * localStorage under "vx:favorites". The favoritos/ page reads this list
 * and fetches the group data via /api/groups/batch.
 *
 * Same useSyncExternalStore pattern as ThemeToggle: any change via
 * toggleFavorite() fires `notify()`, and all subscribed components
 * re-render without setState-in-effect.
 */

const KEY = "vx:favorites";
const MAX = 200;

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

const EMPTY: string[] = [];
function getServerSnapshot(): string[] {
  return EMPTY;
}

/** Cached read so useSyncExternalStore returns the same array reference
 * between renders as long as localStorage hasn't changed. Otherwise React
 * complains about "getSnapshot should be cached". */
let cached: string[] | null = null;
let cachedRaw: string | null = null;
function getSnapshot(): string[] {
  const raw = localStorage.getItem(KEY);
  if (raw === cachedRaw && cached) return cached;
  cachedRaw = raw;
  cached = read();
  return cached;
}

export function useFavorites(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function toggleFavorite(slug: string) {
  const current = read();
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [slug, ...current];
  write(next);
  cached = null;
  cachedRaw = null;
  notify();
}

export function FavoriteButton({
  slug,
  className = "",
  size = 20,
}: {
  slug: string;
  className?: string;
  size?: number;
}) {
  const favs = useFavorites();
  const active = favs.includes(slug);
  return (
    <button
      type="button"
      onClick={() => toggleFavorite(slug)}
      aria-label={active ? "Quitar de favoritos" : "Guardar en favoritos"}
      aria-pressed={active}
      title={active ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={`cursor-wine inline-flex items-center justify-center rounded-full transition text-current ${className}`}
    >
      <StarIcon filled={active} size={size} />
    </button>
  );
}

export function FavoritesNavLink({ className = "" }: { className?: string }) {
  const favs = useFavorites();
  const count = favs.length;
  return (
    <a
      href="/favoritos"
      aria-label={`Mis vinos (${count})`}
      title={`Mis vinos (${count})`}
      className={`cursor-wine relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-current/15 hover:bg-current/10 transition text-current ${className}`}
    >
      <StarIcon filled={count > 0} size={16} />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 bg-cobalt text-snow text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center leading-none"
          aria-hidden="true"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </a>
  );
}

function StarIcon({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
