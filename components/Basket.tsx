"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Compra combinada · los vinos (y cuántas botellas de cada uno) que la
 * persona quiere comprar JUNTOS, para que /compra le diga dónde le conviene
 * comprar todo. No es un carrito: no se compra acá, la página manda a cada
 * vinoteca. Distinta de Comparar (alternativas entre las que elegir) y de
 * Favoritos (lo que te gusta a largo plazo).
 *
 * localStorage: vx:compra → [{ slug, qty }]
 */

export type BasketEntry = { slug: string; qty: number };

const KEY = "vx:compra";
const MAX = 12;
export const DEFAULT_QTY = 6;

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

function read(): BasketEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is BasketEntry =>
          e && typeof e.slug === "string" && typeof e.qty === "number",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function writeBasket(entries: BasketEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* sin storage: la compra vive sólo en la URL */
  }
  cached = null;
  cachedRaw = null;
  notify();
}

let cached: BasketEntry[] | null = null;
let cachedRaw: string | null = null;
function getSnapshot(): BasketEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw && cached) return cached;
  cachedRaw = raw;
  cached = read();
  return cached;
}
const EMPTY: BasketEntry[] = [];
function getServerSnapshot(): BasketEntry[] {
  return EMPTY;
}

export function useBasket(): BasketEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `slug*6,slug2*12` — el parámetro `v` de /compra. */
export function basketParam(entries: BasketEntry[]): string {
  return entries.map((e) => `${e.slug}*${e.qty}`).join(",");
}

export function basketHref(entries: BasketEntry[]): string {
  return entries.length ? `/compra?v=${encodeURIComponent(basketParam(entries))}` : "/compra";
}

export function toggleBasket(slug: string) {
  const current = read();
  if (current.some((e) => e.slug === slug)) {
    writeBasket(current.filter((e) => e.slug !== slug));
  } else {
    writeBasket([...current, { slug, qty: DEFAULT_QTY }].slice(-MAX));
  }
}

/**
 * Botón de la ficha. Lenguaje de la persona ("voy a comprar varios"), no
 * del sistema: la v1 decía "compra combinada" y nadie entendía qué era.
 */
export function BasketButton({ slug, className = "" }: { slug: string; className?: string }) {
  const list = useBasket();
  const active = list.some((e) => e.slug === slug);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <button
        type="button"
        onClick={() => toggleBasket(slug)}
        aria-pressed={active}
        className={`cursor-wine inline-flex items-center gap-2 min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors text-current ${
          active ? "border-current/60 bg-current/15" : "border-current/40 hover:bg-current/10"
        }`}
      >
        <BoxIcon />
        {active ? "✓ En mi compra" : "Sumar a mi compra de varios vinos"}
      </button>
      {active && (
        <Link href="/compra" className="text-sm font-semibold underline text-current hover:no-underline">
          {list.length >= 2
            ? `Ver dónde comprar los ${list.length} juntos →`
            : "Sumá otro vino y te decimos dónde comprar todo junto"}
        </Link>
      )}
    </div>
  );
}

/**
 * Versión chica para las tarjetas de resultados (/buscar): armar la compra
 * buscando, sin entrar a cada ficha.
 */
export function BasketChip({ slug }: { slug: string }) {
  const list = useBasket();
  const active = list.some((e) => e.slug === slug);
  return (
    <button
      type="button"
      onClick={() => toggleBasket(slug)}
      aria-pressed={active}
      className={`cursor-wine inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full border text-xs font-semibold transition-colors ${
        active
          ? "border-malbec bg-malbec text-snow"
          : "border-ink/15 text-ink hover:border-malbec hover:text-malbec"
      }`}
    >
      <BoxIcon />
      {active ? "En mi compra" : "Sumar a mi compra"}
    </button>
  );
}

/** Ícono del header (al lado de Favoritos), con el contador. */
export function BasketNavLink({ className = "" }: { className?: string }) {
  const count = useBasket().length;
  return (
    <Link
      href="/compra"
      aria-label={`Mi compra de varios vinos (${count})`}
      title="Mi compra: dónde comprar varios vinos juntos"
      className={`cursor-wine relative inline-flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-full border border-current/15 hover:bg-current/10 transition text-current ${className}`}
    >
      <BoxIcon />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 bg-malbec text-snow text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center leading-none"
          aria-hidden="true"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** Acceso flotante desde el primer vino (abajo a la izquierda: Comparar va a la derecha). */
export function BasketFloatingButton() {
  const list = useBasket();
  const pathname = usePathname();
  if (list.length < 1 || pathname?.startsWith("/compra")) return null;
  return (
    <Link
      href="/compra"
      className="cursor-wine fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-5 lg:bottom-5 z-40 inline-flex items-center gap-2 bg-malbec text-snow font-semibold px-5 py-3 rounded-full shadow-2xl hover:bg-cobalt transition-colors text-sm"
    >
      <BoxIcon />
      {list.length >= 2 ? `¿Dónde compro los ${list.length}?` : "Mi compra (1)"}
    </Link>
  );
}

export function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}
