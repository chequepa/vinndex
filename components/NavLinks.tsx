"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
  /** Otras rutas que cuentan como "esta sección" (/ranking/x → Rankings). */
  match?: string[];
};

function isActive(pathname: string, item: NavItem): boolean {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Links de sección del header con estado activo (`aria-current="page"`).
 * Es el único pedazo del header que necesita saber la ruta, por eso vive
 * aparte como client component y el resto del header sigue en el server.
 *
 * - `variant="bar"` (lg+): links de texto con el subrayado mustard que
 *   crece desde el centro (`.nav-link` en globals.css).
 * - `variant="strip"` (mobile): tira horizontal scrolleable de pills.
 *   Antes, debajo de lg no había navegación en el header: Ofertas,
 *   Rankings o Vinotecas sólo se alcanzaban desde el footer.
 */
export function NavLinks({
  items,
  variant,
}: {
  items: NavItem[];
  variant: "bar" | "strip";
}) {
  const pathname = usePathname() ?? "";

  if (variant === "bar") {
    return (
      <>
        {items.map((n) => {
          const active = isActive(pathname, n);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`nav-link cursor-wine px-3 py-2 rounded-full transition-colors hover:text-cobalt ${
                active ? "text-cobalt" : ""
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <ul className="nav-strip flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-2.5">
      {items.map((n) => {
        const active = isActive(pathname, n);
        return (
          <li key={n.href} className="shrink-0">
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              // .filter-chip ya trae el par dark y el padding de 44px de
              // touch target en mobile (audit 22/05).
              className={`filter-chip press cursor-wine whitespace-nowrap ${
                active ? "active" : ""
              }`}
            >
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
