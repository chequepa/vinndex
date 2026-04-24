import { topBrands, snapshotStats, brandSlug } from "@/lib/snapshot";
import { SearchInput } from "@/components/SearchInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FavoritesNavLink } from "@/components/Favorites";

export default function NotFound() {
  const brands = topBrands(8);
  const stats = snapshotStats();
  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 shrink-0 cursor-wine"
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
            <span className="display text-xl font-semibold text-ink">
              Vinndex
            </span>
          </a>
          <form action="/buscar" className="flex-1 max-w-xl ml-auto">
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
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <SearchInput
                placeholder="Buscar otro vino..."
                className="w-full bg-transparent border-0 outline-none px-3 py-2 text-ink"
                autoFocus
              />
              <button className="cursor-wine bg-cobalt text-snow font-semibold px-5 py-2 rounded-full text-sm">
                Buscar
              </button>
            </div>
          </form>
          <FavoritesNavLink className="text-ink shrink-0" />
          <ThemeToggle className="text-ink shrink-0" />
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-4">
          404 · Este vino no está en el catálogo
        </p>
        <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-5">
          No lo encontramos —
          <br />
          <span className="italic font-normal">por ahora.</span>
        </h1>
        <p className="text-graphite text-lg mb-10 max-w-xl mx-auto leading-relaxed">
          Tenemos {stats.productCount.toLocaleString("es-AR")} ofertas de{" "}
          {stats.storeCount} vinotecas argentinas. Buscá el nombre arriba o
          arrancá por una bodega.
        </p>

        <div className="flex flex-wrap gap-2 justify-center mb-12">
          {brands.map((b) => (
            <a
              key={b.name}
              href={`/bodega/${brandSlug(b.name)}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 hover:border-cobalt hover:text-cobalt transition-colors text-sm font-medium"
            >
              {b.name}
              <span className="text-xs text-graphite">({b.count})</span>
            </a>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href="/buscar?multi=1"
            className="cursor-wine bg-cobalt hover:bg-ink text-snow font-semibold px-6 py-3 rounded-full transition-colors"
          >
            Ver vinos comparables
          </a>
          <a
            href="/"
            className="cursor-wine border border-ink/20 hover:border-cobalt text-ink font-semibold px-6 py-3 rounded-full transition-colors"
          >
            Volver al inicio
          </a>
        </div>
      </main>

      <footer className="bg-ink text-snow/70 px-6 py-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>© 2026 Vinndex</p>
          <p>Precios relevados una vez por día · Beber con moderación</p>
        </div>
      </footer>
    </div>
  );
}
