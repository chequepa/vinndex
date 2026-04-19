import type { Metadata } from "next";
import {
  searchGroups,
  formatArs,
  storeName,
  snapshot,
  facetCounts,
} from "@/lib/snapshot";

export const metadata: Metadata = {
  title: "Buscar — Vinndex",
};

type Params = {
  searchParams: Promise<{
    q?: string;
    multi?: string;
    varietal?: string;
    tipo?: string;
    region?: string;
  }>;
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

function buildQS(params: URLSearchParams): string {
  const s = params.toString();
  return s ? `?${s}` : "";
}

export default async function Buscar({ searchParams }: Params) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const multiOnly = params.multi === "1";
  const varietal = params.varietal ?? null;
  const type = params.tipo ?? null;
  const region = params.region ?? null;

  const results = searchGroups(query, 48, {
    multiStoreOnly: multiOnly,
    varietal,
    type,
    region,
  });
  const totalGroups = snapshot.groupCount ?? 0;
  const totalMulti = snapshot.multiStoreGroupCount ?? 0;
  const facets = facetCounts();

  const hasAnyFilter = query || multiOnly || varietal || type || region;

  const headerTitle = query ? (
    <>
      Resultados para <span className="italic">&ldquo;{query}&rdquo;</span>
    </>
  ) : varietal ? (
    <>
      <span className="italic">{varietal}</span>
    </>
  ) : type ? (
    <>
      Vinos <span className="italic">{type.toLowerCase()}</span>
    </>
  ) : region ? (
    <>
      Vinos de <span className="italic">{region}</span>
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

  // Build "with" / "without" URLs for a given filter
  function filterHref(key: string, value: string | null): string {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (multiOnly && key !== "multi") sp.set("multi", "1");
    if (varietal && key !== "varietal") sp.set("varietal", varietal);
    if (type && key !== "tipo") sp.set("tipo", type);
    if (region && key !== "region") sp.set("region", region);
    if (value !== null) sp.set(key, value);
    return `/buscar${buildQS(sp)}`;
  }

  function toggleMulti(): string {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (!multiOnly) sp.set("multi", "1");
    if (varietal) sp.set("varietal", varietal);
    if (type) sp.set("tipo", type);
    if (region) sp.set("region", region);
    return `/buscar${buildQS(sp)}`;
  }

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
            comparables en 2+ tiendas ·{" "}
            <span className="font-semibold text-ink">
              {totalGroups.toLocaleString("es-AR")}
            </span>{" "}
            en total
          </p>

          {/* ACTIVE FILTERS */}
          <div className="mt-6 flex flex-wrap gap-2">
            {query && (
              <a href={filterHref("q", null)} className="filter-chip active">
                {query} ×
              </a>
            )}
            {varietal && (
              <a
                href={filterHref("varietal", null)}
                className="filter-chip active"
              >
                {varietal} ×
              </a>
            )}
            {type && (
              <a href={filterHref("tipo", null)} className="filter-chip active">
                {type} ×
              </a>
            )}
            {region && (
              <a
                href={filterHref("region", null)}
                className="filter-chip active"
              >
                {region} ×
              </a>
            )}
            <a
              href={toggleMulti()}
              className={`filter-chip ${multiOnly ? "active" : ""}`}
            >
              Sólo comparables (2+ tiendas)
            </a>
            {hasAnyFilter && (
              <a href="/buscar" className="filter-chip">
                Limpiar filtros ×
              </a>
            )}
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 grid lg:grid-cols-[260px_1fr] gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-8">
            {/* VARIETAL */}
            <div>
              <h3 className="display text-lg font-semibold mb-4">Varietal</h3>
              <div className="space-y-1.5 text-sm">
                {facets.varietals.slice(0, 12).map((f) => {
                  const active =
                    varietal?.toLowerCase() === f.name.toLowerCase();
                  return (
                    <a
                      key={f.name}
                      href={filterHref(
                        "varietal",
                        active ? null : f.name,
                      )}
                      className={`flex items-center gap-2 cursor-wine py-1 px-2 rounded -mx-2 ${
                        active
                          ? "bg-ink text-snow font-semibold"
                          : "hover:bg-snow"
                      }`}
                    >
                      <span className="truncate">{f.name}</span>
                      <span
                        className={`ml-auto text-xs ${
                          active ? "text-snow/70" : "text-graphite"
                        }`}
                      >
                        {f.count}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* TIPO */}
            <div>
              <h3 className="display text-lg font-semibold mb-4">Tipo</h3>
              <div className="space-y-1.5 text-sm">
                {facets.types.map((f) => {
                  const active = type?.toLowerCase() === f.name.toLowerCase();
                  return (
                    <a
                      key={f.name}
                      href={filterHref("tipo", active ? null : f.name)}
                      className={`flex items-center gap-2 cursor-wine py-1 px-2 rounded -mx-2 ${
                        active
                          ? "bg-ink text-snow font-semibold"
                          : "hover:bg-snow"
                      }`}
                    >
                      <span>{f.name}</span>
                      <span
                        className={`ml-auto text-xs ${
                          active ? "text-snow/70" : "text-graphite"
                        }`}
                      >
                        {f.count}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* REGIÓN */}
            {facets.regions.length > 0 && (
              <div>
                <h3 className="display text-lg font-semibold mb-4">Región</h3>
                <div className="space-y-1.5 text-sm">
                  {facets.regions.slice(0, 10).map((f) => {
                    const active =
                      region?.toLowerCase() === f.name.toLowerCase();
                    return (
                      <a
                        key={f.name}
                        href={filterHref("region", active ? null : f.name)}
                        className={`flex items-center gap-2 cursor-wine py-1 px-2 rounded -mx-2 ${
                          active
                            ? "bg-ink text-snow font-semibold"
                            : "hover:bg-snow"
                        }`}
                      >
                        <span>{f.name}</span>
                        <span
                          className={`ml-auto text-xs ${
                            active ? "text-snow/70" : "text-graphite"
                          }`}
                        >
                          {f.count}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VINOTECAS */}
            <div>
              <h3 className="display text-lg font-semibold mb-4">
                Vinotecas sincronizando
              </h3>
              <div className="space-y-1 text-sm text-graphite max-h-64 overflow-y-auto">
                {snapshot.stores.map((s) => (
                  <div
                    key={s.storeSlug}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{s.storeName}</span>
                    <span className="text-xs">{s.productCount}</span>
                  </div>
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
                más ofertas primero, después precio
              </span>
            </p>
          </div>

          {results.length === 0 ? (
            <div className="py-20 text-center">
              <p className="display text-2xl font-semibold text-ink mb-2">
                Sin resultados{query ? ` para "${query}"` : ""}
              </p>
              <p className="text-graphite">
                Probá con{" "}
                <a
                  href="/buscar?q=malbec"
                  className="text-cobalt hover:underline"
                >
                  Malbec
                </a>
                ,{" "}
                <a
                  href="/buscar?varietal=Chardonnay"
                  className="text-cobalt hover:underline"
                >
                  Chardonnay
                </a>
                , o{" "}
                <a
                  href="/buscar?tipo=Espumante"
                  className="text-cobalt hover:underline"
                >
                  Espumantes
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
                              {g.region ? ` · ${g.region}` : ""}
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
                          {g.type && (
                            <span
                              className="tag"
                              style={{
                                background: "#1E3FBF15",
                                color: "#1E3FBF",
                              }}
                            >
                              {g.type}
                            </span>
                          )}
                          {(g.varietals ?? []).slice(0, 2).map((v) => (
                            <span key={v} className="tag tag-malbec">
                              {v}
                            </span>
                          ))}
                          {savings > 0 && (
                            <>
                              <span className="text-xs text-graphite">•</span>
                              <span className="text-xs text-terracota font-semibold">
                                ahorrá hasta {savings}%
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
