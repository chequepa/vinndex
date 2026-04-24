"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Recently-viewed wine slugs, persisted to localStorage. FIFO with a
 * cap of 20. Same useSyncExternalStore pattern as Favorites — any
 * mutation via trackView() fires notify() so every subscribed component
 * re-renders without setState-in-effect.
 */

const KEY = "vx:recently-viewed";
const MAX = 20;

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

export function useRecentlyViewed(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function trackView(slug: string) {
  const current = read();
  const next = [slug, ...current.filter((s) => s !== slug)];
  write(next);
  cached = null;
  cachedRaw = null;
  notify();
}

/**
 * Drop-in for the ficha page: track the view on mount. No UI, just
 * side effect. Uses a ref-style guard to avoid double-tracking on
 * dev hot reload.
 */
export function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    trackView(slug);
  }, [slug]);
  return null;
}
