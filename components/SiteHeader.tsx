import Link from "next/link";
import { SearchInput } from "./SearchInput";
import { ThemeToggle } from "./ThemeToggle";
import { FavoritesNavLink } from "./Favorites";

/**
 * Site-wide sticky header. Logo on the left, searchbar on the right.
 * Same markup as the inline header used in /bodega, /varietal, /region
 * extracted to one place so static pages like /sobre can reuse it.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-4">
        <Link
          href="/"
          aria-label="Vinndex · inicio"
          className="flex items-center gap-2 shrink-0 cursor-wine text-ink"
        >
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
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
        <form action="/buscar" className="flex-1 max-w-2xl">
          <div className="relative flex items-center bg-snow rounded-full border border-ink/10 p-1 pl-4">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-graphite shrink-0"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <SearchInput
              placeholder="Malbec, Luigi Bosca, Catena Zapata..."
              className="w-full bg-transparent border-0 outline-none px-3 py-2 text-ink"
              withAutocomplete
            />
            <button className="cursor-wine bg-cobalt text-snow font-semibold px-5 py-2 rounded-full text-sm">
              Buscar
            </button>
          </div>
        </form>
        <FavoritesNavLink className="text-ink shrink-0" />
        {/* ThemeToggle oculto en <sm para no apretar el header en 375px
            (logo svg + form flex-1 + favoritos + toggle = 4 items en
            barra). Poca gente cambia tema en mobile. Audit 22/05. */}
        <ThemeToggle className="text-ink shrink-0 hidden sm:flex" />
      </div>
    </header>
  );
}
