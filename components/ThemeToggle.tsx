"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

/**
 * Theme is persisted in localStorage under "theme". Value is "light" or
 * "dark"; absent means "system" (follow prefers-color-scheme). The
 * pre-hydration script in layout.tsx reads the same key so there's no
 * flash of light theme before React hydrates.
 *
 * useSyncExternalStore is the React-blessed way to subscribe to external
 * state (localStorage here) · avoids the "setState in useEffect" lint
 * warning and handles SSR/hydration correctly via getServerSnapshot.
 */

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const storage = () => listeners.forEach((l) => l());
  window.addEventListener("storage", storage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", storage);
  };
}

function notify() {
  listeners.forEach((cb) => cb());
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

function getServerSnapshot(): Theme {
  return "system";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function apply(next: Theme) {
    const root = document.documentElement;
    if (next === "system") {
      localStorage.removeItem("theme");
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", sysDark);
    } else {
      localStorage.setItem("theme", next);
      root.classList.toggle("dark", next === "dark");
    }
    notify();
  }

  function cycle() {
    apply(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  }

  const label =
    theme === "light"
      ? "Tema: claro"
      : theme === "dark"
        ? "Tema: oscuro"
        : "Tema: sistema";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className={`cursor-wine inline-flex items-center justify-center w-9 h-9 rounded-full border border-current/15 hover:bg-current/10 transition text-current ${className}`}
    >
      {theme === "dark" ? (
        <MoonIcon />
      ) : theme === "light" ? (
        <SunIcon />
      ) : (
        <AutoIcon />
      )}
    </button>
  );
}

function SunIcon() {
  return (
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
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
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function AutoIcon() {
  return (
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
