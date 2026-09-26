import Link from "next/link";
import { SearchInput } from "./SearchInput";
import { ThemeToggle } from "./ThemeToggle";
import { FavoritesNavLink } from "./Favorites";

type Props = {
  /** Valor inicial del buscador (en /buscar, la consulta actual). */
  defaultQuery?: string;
  placeholder?: string;
  /** Muestra el aviso "Precios en CABA" (sólo tiene sentido en /buscar). */
  showZoneNote?: boolean;
};

const NAV = [
  { href: "/explorar", label: "Explorar" },
  { href: "/ranking", label: "Rankings" },
  { href: "/bodegas", label: "Bodegas" },
];

/**
 * Header sticky de todo el sitio salvo la home (que tiene su nav sobre el
 * hero). Antes la ficha de vino, /buscar, bodega, varietal, región y el
 * 404 tenían cada uno su copia inline: en 390px el buscador quedaba en
 * ~70px ("Busca") y en el 404 el toggle de tema se salía de la pantalla.
 *
 * Mobile: sin ícono decorativo y con el submit como botón-lupa de 40px,
 * así el input se lleva todo el ancho que queda. Desktop (lg+): suma la
 * navegación a Explorar / Rankings / Bodegas, que antes sólo existía en
 * el footer.
 */
export function SiteHeader({
  defaultQuery,
  placeholder = "Buscá un vino o bodega",
  showZoneNote = false,
}: Props = {}) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-4">
        <Link
          href="/"
          aria-label="Vinndex · inicio"
          className="flex items-center gap-2 shrink-0 cursor-wine text-ink"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
              fill="#1E3FBF"
              stroke="#1E3FBF"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="8" r="3" fill="#E8B547" />
          </svg>
          <span className="display text-xl font-semibold hidden sm:block">
            Vinndex
          </span>
        </Link>
        <form action="/buscar" role="search" className="flex-1 min-w-0 max-w-2xl">
          <div className="relative flex items-center bg-snow rounded-full border border-ink/10 focus-within:border-cobalt p-1 pl-4">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-graphite shrink-0 hidden sm:block"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <SearchInput
              defaultValue={defaultQuery}
              placeholder={placeholder}
              aria-label="Buscar vinos"
              className="w-full min-w-0 bg-transparent border-0 outline-none sm:px-3 py-2 text-ink placeholder:text-graphite"
              withAutocomplete
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="cursor-wine shrink-0 inline-flex items-center justify-center bg-cobalt hover:bg-ink text-snow font-semibold w-10 h-10 sm:w-auto sm:h-auto sm:px-5 sm:py-2 rounded-full text-sm transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                className="sm:hidden"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </div>
        </form>
        <nav
          aria-label="Secciones"
          className="hidden lg:flex lg:ml-auto items-center gap-1 text-sm font-medium text-ink"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="cursor-wine px-3 py-2 rounded-full hover:bg-snow hover:text-cobalt transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {showZoneNote && (
          <Link
            href="/preguntas"
            className="cursor-wine hidden xl:flex items-center gap-2 text-sm shrink-0 bg-snow hover:bg-mustard/20 border border-ink/10 rounded-full px-3 py-2 font-medium text-ink transition-colors"
            title="Por qué decimos CABA"
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
              className="text-graphite"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 1 0 10 10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Precios en CABA</span>
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <FavoritesNavLink className="text-ink" />
          {/* En <sm el toggle vive en el footer: 4 items en 390px dejaban
              al buscador sin lugar. */}
          <span className="hidden sm:inline-flex">
            <ThemeToggle className="text-ink" />
          </span>
        </div>
      </div>
    </header>
  );
}
