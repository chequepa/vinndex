import type { Metadata } from "next";
import {
  searchGroups,
  formatArs,
  storeName,
  snapshot,
} from "@/lib/snapshot";

export const metadata: Metadata = {
  title: "Buscar — Vinndex",
};

type Params = {
  searchParams: Promise<{ q?: string; multi?: string }>;
};

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path
        d="M2 3.5 L5 6.5 L8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

export default async function Buscar({ searchParams }: Params) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const multiOnly = params.multi === "1";
  const results = searchGroups(query, 48, { multiStoreOnly: multiOnly });
  const totalGroups = snapshot.groupCount ?? 0;
  const totalMulti = snapshot.multiStoreGroupCount ?? 0;

  const headerTitle = query ? (
    <>
      Resultados para <span className="italic">&ldquo;{query}&rdquo;</span>
    </>
  ) : multiOnly ? (
    <>
      Vinos comparables en <span className="italic">2+ vinotecas</span>
    </>
  ) : (
    <>
      Catálogo completo <span className="italic">Vinndex</span>
    </>
  );

  return (
    <div className="bg-white min-h-screen">
      {/* NAV */}
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
            <span className="display text-xl font-semibold text-ink hidden sm:block">
              Vinndex
            </span>
          </a>

          <form action="/buscar" className="flex-1 max-w-2xl">
            <div className="relative flex items-center bg-snow rounded-full border border-ink/10 focus-within:border-cobalt p-1 pl-4">
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
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Malbec, Luigi Bosca, Catena Zapata..."
                className="w-full bg-transparent border-0 outline-none px-3 py-2 text-ink"
              />
              <button className="cursor-wine bg-cobalt text-snow font-semibold px-5 py-2 rounded-full text-sm">
                Buscar
              </button>
            </div>
          </form>

          <div className="flex items-center gap-2 text-sm shrink-0">
            <span className="text-graphite hidden lg:inline">Enviando a</span>
            <select
              defaultValue="CABA"
              className="bg-snow border border-ink/10 rounded-full px-3 py-2 font-medium text-ink cursor-wine"
            >
              <option>CABA</option>
              <option>GBA</option>
              <option>Resto</option>
            </select>
          </div>
        </div>
      </header>

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-3">
            <a href="/" className="hover:text-ink">
              Inicio
            </a>
            <span>/</span>
            <span>Búsqueda</span>
          </div>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-tight">
            {headerTitle}
          </h1>
          <p className="text-graphite mt-2">
            <span className="font-semibold text-ink">{results.length}</span>{" "}
            vinos ·{" "}
            <span className="font-semibold text-ink">
              {totalMulti.toLocaleString("es-AR")}
            </span>{" "}
            vinos comparables en 2+ tiendas de un total de{" "}
            <span className="font-semibold text-ink">
              {totalGroups.toLocaleString("es-AR")}
            </span>
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {query && (
              <a href="/buscar" className="filter-chip active">
                {query} ×
              </a>
            )}
            <a
              href={
                multiOnly
                  ? query
                    ? `/buscar?q=${encodeURIComponent(query)}`
                    : "/buscar"
                  : query
                    ? `/buscar?q=${encodeURIComponent(query)}&multi=1`
                    : "/buscar?multi=1"
              }
              className={`filter-chip ${multiOnly ? "active" : ""}`}
            >
              Sólo comparables (2+ tiendas)
            </a>
            <button className="filter-chip">
              Varietal <ChevronIcon />
            </button>
            <button className="filter-chip">
              Bodega <ChevronIcon />
            </button>
            <button className="filter-chip">
              Precio <ChevronIcon />
            </button>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 grid lg:grid-cols-[260px_1fr] gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="mb-8">
              <h3 className="display text-lg font-semibold mb-4">
                Vinotecas sincronizando
              </h3>
              <div className="space-y-2 text-sm">
                {snapshot.stores.map((s) => (
                  <label
                    key={s.storeSlug}
                    className="flex items-center gap-2 cursor-wine"
                  >
                    <input type="checkbox" className="accent-cobalt" />
                    <span className="truncate">{s.storeName}</span>
                    <span className="text-graphite ml-auto">
                      ({s.productCount})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section>
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-ink/10">
            <p className="text-sm text-graphite">
              Ordenado por:{" "}
              <span className="font-semibold text-ink">
                vinos con más ofertas primero, después por precio
              </span>
            </p>
          </div>

          {results.length === 0 ? (
            <div className="py-20 text-center">
              <p className="display text-2xl font-semibold text-ink mb-2">
                Sin resultados para &ldquo;{query}&rdquo;
              </p>
              <p className="text-graphite">
                Probá con el nombre del vino, bodega, varietal o tirá un{" "}
                <a
                  href="/buscar?q=malbec"
                  className="text-cobalt hover:underline"
                >
                  Malbec
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="divide-y divide-ink/10">
              {results.map((g) => {
                const savings =
                  g.minPrice != null &&
                  g.maxPrice != null &&
                  g.minPrice > 0 &&
                  g.maxPrice > g.minPrice
                    ? Math.round(
                        ((g.maxPrice - g.minPrice) / g.maxPrice) * 100,
                      )
                    : 0;

                return (
                  <a
                    key={g.groupSlug}
                    href={`/vino/${g.groupSlug}`}
                    className="wine-row block py-5"
                  >
                    <div className="flex gap-5">
                      <div className="w-16 h-24 shrink-0 rounded-lg overflow-hidden bg-snow border border-ink/10">
                        {g.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={g.imageUrl}
                            alt={g.canonicalName}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-malbec/40 text-xs">
                            sin foto
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <div className="min-w-0">
                            <h3 className="display text-lg md:text-xl font-semibold text-ink leading-tight truncate">
                              {g.canonicalName}
                            </h3>
                            <p className="text-sm text-graphite mt-0.5 truncate">
                              {g.brand ? `${g.brand}` : "Sin bodega identificada"}
                              {g.vintage ? ` · ${g.vintage}` : ""}
                              {g.format ? ` · ${g.format}` : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs text-graphite">desde</div>
                            <div className="display text-2xl font-semibold text-cobalt">
                              {formatArs(g.minPrice)}
                            </div>
                            {g.maxPrice != null &&
                              g.minPrice != null &&
                              g.maxPrice > g.minPrice && (
                                <div className="text-xs text-graphite">
                                  hasta {formatArs(g.maxPrice)}
                                </div>
                              )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {g.storeCount >= 2 ? (
                            <span
                              className="tag"
                              style={{
                                background: "#1B7A4F20",
                                color: "#1B7A4F",
                              }}
                            >
                              {g.storeCount} vinotecas
                            </span>
                          ) : (
                            <span className="tag tag-malbec">
                              {storeName(g.offers[0].storeSlug)}
                            </span>
                          )}
                          {savings > 0 && (
                            <>
                              <span className="text-xs text-graphite">•</span>
                              <span className="text-xs text-terracota font-semibold">
                                ahorrá hasta {savings}%
                              </span>
                            </>
                          )}
                          {g.offers[0].inStock && (
                            <>
                              <span className="text-xs text-graphite">•</span>
                              <span className="text-xs text-graphite">
                                En stock
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          {results.length >= 48 && (
            <p className="text-xs text-graphite mt-8 text-center">
              Mostrando los primeros 48. La paginación real llega con Postgres
              + Meilisearch.
            </p>
          )}
        </section>
      </main>

      <footer className="bg-ink text-snow/70 px-6 py-10 mt-16">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>
            © 2026 Vinndex ·{" "}
            <a href="/" className="hover:text-snow">
              Inicio
            </a>
          </p>
          <p>Precios relevados una vez por día · Beber con moderación</p>
        </div>
      </footer>
    </div>
  );
}
