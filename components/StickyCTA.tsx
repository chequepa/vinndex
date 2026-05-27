"use client";

import { useEffect, useState } from "react";

type Props = {
  priceLabel: string;
  storeName: string;
  externalUrl: string;
  allOutOfStock?: boolean;
};

/**
 * Mobile-only sticky CTA that slides up once the user scrolls past
 * the hero (~450px). Shows min price + best store + "Ir a tienda"
 * (or "Ver tiendas" if the wine is all out of stock).
 *
 * Hidden on lg+ · on desktop the hero CTA stays in view as part of
 * the top-of-page layout.
 */
export function StickyCTA({
  priceLabel,
  storeName,
  externalUrl,
  allOutOfStock,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 450);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      // `inert` saca el subtree del tab order y del accessibility tree
      // cuando no es visible. `aria-hidden` solo no alcanza · sin `inert`
      // los <a> internos siguen siendo focuseables con Tab y Lighthouse
      // marca aria-hidden-focus fail.
      aria-hidden={!visible}
      inert={!visible}
      // pb-[env(safe-area-inset-bottom)] empuja el bar arriba del home
      // indicator en iPhone X+. Sin esto el bar quedaba TAPADO por el
      // gesture-area en iOS, costaba tocarlo bien. Audit mobile cierre 22/05.
      className={`lg:hidden fixed left-0 right-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-3 mb-3 bg-ink text-snow rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 border border-snow/10">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-snow/60">
            {allOutOfStock ? "Sin stock ahora" : "Mejor precio"}
          </p>
          <p className="display text-lg font-semibold truncate">
            {priceLabel}
            {!allOutOfStock && (
              <span className="text-snow/70 text-xs font-normal ml-1">
                · {storeName}
              </span>
            )}
          </p>
        </div>
        {allOutOfStock ? (
          <a
            href="#precios"
            className="cursor-wine bg-snow text-ink font-semibold px-4 py-2 rounded-full text-sm shrink-0"
          >
            Ver tiendas
          </a>
        ) : (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="cursor-wine bg-mustard text-ink font-semibold px-4 py-2 rounded-full text-sm shrink-0"
          >
            Ir a tienda
          </a>
        )}
      </div>
    </div>
  );
}
