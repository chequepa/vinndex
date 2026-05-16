import type { Metadata } from "next";
import Image from "next/image";
import { SearchInput } from "@/components/SearchInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FavoritesNavLink } from "@/components/Favorites";
import { BottleFallback } from "@/components/BottleFallback";
import { SearchPersist, LastSearchChip } from "@/components/SearchPersist";
import { MobileFiltersDrawer } from "@/components/MobileFiltersDrawer";
import Link from "next/link";
import {
  searchGroups,
  formatArs,
  storeName,
  snapshot,
  facetCounts,
  displayBrand,
  displayWineName,
  type SortKey,
} from "@/lib/snapshot";

const SORT_OPTIONS_WITH_QUERY: { key: SortKey; label: string }[] = [
  { key: "relevance", label: "Relevancia" },
  { key: "price-asc", label: "Precio · menor a mayor" },
  { key: "price-desc", label: "Precio · mayor a menor" },
  { key: "stores-desc", label: "Más vinotecas primero" },
  { key: "score-desc", label: "Mejor puntaje de crítico" },
  { key: "name-asc", label: "Nombre A-Z" },
];

const SORT_OPTIONS_NO_QUERY: { key: SortKey; label: string }[] = [
  { key: "price-asc", label: "Precio · menor a mayor" },
  { key: "price-desc", label: "Precio · mayor a menor" },
  { key: "stores-desc", label: "Más vinotecas primero" },
  { key: "score-desc", label: "Mejor puntaje de crítico" },
  { key: "name-asc", label: "Nombre A-Z" },
];

function isValidSort(s: string | undefined): s is SortKey {
  return (
    s === "relevance" ||
    s === "price-asc" ||
    s === "price-desc" ||
    s === "stores-desc" ||
    s === "score-desc" ||
    s === "name-asc"
  );
}

// Presets de rango — fáciles de pickear de un click sin abrir keyboard.
// Cada uno mapea a (min, max) en pesos. `max=null` significa "sin tope".
const PRICE_RANGES: {
  id: string;
  label: string;
  min: number | null;
  max: number | null;
}[] = [
  { id: "lt-5k", label: "Hasta $5.000", min: null, max: 5_000 },
  { id: "5k-10k", label: "$5.000 — $10.000", min: 5_000, max: 10_000 },
  { id: "10k-20k", label: "$10.000 — $20.000", min: 10_000, max: 20_000 },
  { id: "20k-40k", label: "$20.000 — $40.000", min: 20_000, max: 40_000 },
  { id: "gt-40k", label: "Más de $40.000", min: 40_000, max: null },
];

function findRangeById(id: string | null | undefined) {
  if (!id) return null;
  return PRICE_RANGES.find((r) => r.id === id) ?? null;
}

export const metadata: Metadata = {
  title: "Buscar — Vinndex",
  alternates: { canonical: "https://vinndex.com.ar/buscar" },
  robots: { index: true, follow: true },
};

type Params = {
  searchParams: Promise<{
    q?: string;
    multi?: string;
    varietal?: string;
    tipo?: string;
    region?: string;
    sort?: string;
    instock?: string;
    precio?: string; // id de PRICE_RANGES
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
  const inStockOnly = params.instock === "1";
  const priceRange = findRangeById(params.precio);
  const varietal = params.varietal ?? null;
  const type = params.tipo ?? null;
  const region = params.region ?? null;
  // Default sort depends on whether there's a query: relevance when
  // the user typed something, price-asc otherwise. Explicit ?sort= wins.
  const sort: SortKey = isValidSort(params.sort)
    ? params.sort
    : query
      ? "relevance"
      : "price-asc";

  const results = searchGroups(query, 48, {
    multiStoreOnly: multiOnly,
    inStockOnly,
    priceMin: priceRange?.min ?? null,
    priceMax: priceRange?.max ?? null,
    varietal,
    type,
    region,
    sort,
  });
  const totalGroups = snapshot.groupCount ?? 0;
  const totalMulti = snapshot.multiStoreGroupCount ?? 0;
  const facets = facetCounts();

  const hasAnyFilter =
    query || multiOnly || inStockOnly || priceRange || varietal || type || region;

  const activeFilterCount = [
    multiOnly,
    inStockOnly,
    !!priceRange,
    !!varietal,
    !!type,
    !!region,
  ].filter(Boolean).length;

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

  // Helper para mantener el set actual de filtros + opcionalmente
  // sobreescribir/quitar uno. Si `value === null` quitamos esa key
  // del URL. Si `value === <string>` la seteamos. Si no se pasa el
  // `key` específico, el helper se comporta como "preservar todo".
  function buildHref(
    override?: Partial<Record<string, string | null>>,
  ): string {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (multiOnly) sp.set("multi", "1");
    if (inStockOnly) sp.set("instock", "1");
    if (priceRange) sp.set("precio", priceRange.id);
    if (varietal) sp.set("varietal", varietal);
    if (type) sp.set("tipo", type);
    if (region) sp.set("region", region);
    const defaultSort: SortKey = query ? "relevance" : "price-asc";
    if (sort !== defaultSort) sp.set("sort", sort);

    if (override) {
      for (const [k, v] of Object.entries(override)) {
        if (v === null || v === undefined) sp.delete(k);
        else sp.set(k, v);
      }
    }
    return `/buscar${buildQS(sp)}`;
  }

  // Compatibilidad con el resto del file que usaba filterHref/toggleMulti/sortHref.
  function filterHref(key: string, value: string | null): string {
    return buildHref({ [key]: value });
  }
  function toggleMulti(): string {
    return buildHref({ multi: multiOnly ? null : "1" });
  }
  function sortHref(newSort: SortKey): string {
    const defaultSort: SortKey = query ? "relevance" : "price-asc";
    return buildHref({ sort: newSort === defaultSort ? null : newSort });
  }
  function toggleInStock(): string {
    return buildHref({ instock: inStockOnly ? null : "1" });
  }
  function priceRangeHref(rangeId: string | null): string {
    return buildHref({ precio: rangeId });
  }
  function clearAllHref(): string {
    return "/buscar";
  }

  const sortOptions = query ? SORT_OPTIONS_WITH_QUERY : SORT_OPTIONS_NO_QUERY;

  const filtersInner = (
    <>
      {/* QUICK FILTERS — stock, multi-tienda, precio (estos 3 se
          tocan más seguido que varietal/tipo/región) */}
      <div>
        <h3 className="display text-lg font-semibold mb-3">Filtros rápidos</h3>
        <div className="flex flex-col gap-2 text-sm">
          <a
            href={toggleInStock()}
            className={`cursor-wine py-1.5 px-3 rounded-full inline-flex items-center gap-2 justify-between transition-colors ${
              inStockOnly
                ? "bg-ink text-snow font-semibold"
                : "bg-snow hover:bg-snow border border-ink/15"
            }`}
          >
            <span>Solo con stock</span>
            {inStockOnly && <span className="text-xs">✓</span>}
          </a>
          <a
            href={toggleMulti()}
            className={`cursor-wine py-1.5 px-3 rounded-full inline-flex items-center gap-2 justify-between transition-colors ${
              multiOnly
                ? "bg-ink text-snow font-semibold"
                : "bg-snow hover:bg-snow border border-ink/15"
            }`}
          >
            <span>Comparables (2+ tiendas)</span>
            {multiOnly && <span className="text-xs">✓</span>}
          </a>
        </div>
      </div>

      {/* RANGO DE PRECIO */}
      <div>
        <h3 className="display text-lg font-semibold mb-3">Precio</h3>
        <div className="space-y-1.5 text-sm">
          {PRICE_RANGES.map((r) => {
            const active = priceRange?.id === r.id;
            return (
              <a
                key={r.id}
                href={priceRangeHref(active ? null : r.id)}
                className={`flex items-center gap-2 cursor-wine py-1 px-2 rounded -mx-2 ${
                  active
                    ? "bg-ink text-snow font-semibold"
                    : "hover:bg-snow"
                }`}
              >
                <span>{r.label}</span>
              </a>
            );
          })}
        </div>
      </div>

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
                href={filterHref("varietal", active ? null : f.name)}
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
    </>
  );

  return (
    <div className="bg-white min-h-[100dvh]">
      {/* NAV */}
      <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-4">
          <Link
            href="/"
            aria-label="Vinndex — inicio"
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
          </Link>

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
              <SearchInput
                defaultValue={query}
                placeholder="Malbec, Luigi Bosca, Catena Zapata..."
                className="w-full bg-transparent border-0 outline-none px-3 py-2 text-ink"
                withAutocomplete
              />
              <button className="cursor-wine bg-cobalt text-snow font-semibold px-5 py-2 rounded-full text-sm">
                Buscar
              </button>
            </div>
          </form>

          <a
            href="/preguntas"
            className="cursor-wine hidden lg:flex items-center gap-2 text-sm shrink-0 bg-snow hover:bg-mustard/20 border border-ink/10 rounded-full px-3 py-2 font-medium text-ink transition-colors"
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
            >
              <path d="M12 2a10 10 0 1 0 10 10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Precios en CABA</span>
          </a>
          <FavoritesNavLink className="text-ink shrink-0" />
          <ThemeToggle className="text-ink shrink-0" />
        </div>
      </header>

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-3">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
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
            <a
              href={toggleInStock()}
              className={`filter-chip ${inStockOnly ? "active" : ""}`}
            >
              Sólo con stock
            </a>
            {priceRange && (
              <a
                href={priceRangeHref(null)}
                className="filter-chip active"
              >
                {priceRange.label} ×
              </a>
            )}
            {hasAnyFilter && (
              <Link href={clearAllHref()} className="filter-chip">
                Limpiar filtros ×
              </Link>
            )}
            {!hasAnyFilter && <LastSearchChip />}
          </div>
          <SearchPersist query={query} />
        </div>
      </section>

      <main id="contenido" className="max-w-7xl mx-auto px-4 lg:px-8 py-8 grid lg:grid-cols-[260px_1fr] gap-10">
        <aside className="hidden lg:block" aria-labelledby="filtros-titulo">
          <h2 id="filtros-titulo" className="sr-only">
            Filtros de búsqueda
          </h2>
          <div className="sticky top-24 space-y-8">{filtersInner}</div>
        </aside>

        <section>
          <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-ink/10 flex-wrap">
            <div className="flex items-center gap-3 shrink-0">
              <p className="text-sm text-graphite">
                <span className="font-semibold text-ink">{results.length}</span>{" "}
                resultados
              </p>
              <MobileFiltersDrawer activeCount={activeFilterCount}>
                {filtersInner}
              </MobileFiltersDrawer>
            </div>
            <div
              role="tablist"
              aria-label="Ordenar por"
              className="flex items-center gap-1.5 flex-wrap"
            >
              <span className="text-xs text-graphite mr-1 uppercase tracking-wide">
                Ordenar
              </span>
              {sortOptions.map((o) => (
                <a
                  key={o.key}
                  href={sortHref(o.key)}
                  role="tab"
                  aria-selected={sort === o.key}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    sort === o.key
                      ? "bg-ink text-snow border-ink font-semibold"
                      : "bg-white text-graphite border-ink/15 hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {o.label}
                </a>
              ))}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="py-16 md:py-20">
              <div className="max-w-xl mx-auto text-center">
                {/* Empty state icon */}
                <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-snow flex items-center justify-center border border-ink/10">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-graphite"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <h2 className="display text-2xl md:text-3xl font-semibold text-ink mb-3">
                  {query
                    ? `No encontramos "${query}"`
                    : "Sin resultados"}
                </h2>
                <p className="text-graphite mb-8 leading-relaxed">
                  Revisá la ortografía o probá con un término más general.
                  También podés explorar el catálogo por varietal, región o
                  bodega.
                </p>
              </div>

              <div className="max-w-3xl mx-auto">
                <h3 className="text-xs uppercase tracking-widest text-graphite font-semibold mb-3">
                  Varietales populares
                </h3>
                <div className="flex flex-wrap gap-2 mb-8">
                  {[
                    { label: "Malbec", href: "/varietal/malbec" },
                    {
                      label: "Cabernet Sauvignon",
                      href: "/varietal/cabernet-sauvignon",
                    },
                    { label: "Chardonnay", href: "/varietal/chardonnay" },
                    { label: "Bonarda", href: "/varietal/bonarda" },
                    { label: "Pinot Noir", href: "/varietal/pinot-noir" },
                    { label: "Torrontés", href: "/varietal/torrontes" },
                    {
                      label: "Sauvignon Blanc",
                      href: "/varietal/sauvignon-blanc",
                    },
                  ].map((v) => (
                    <a
                      key={v.label}
                      href={v.href}
                      className="inline-flex items-center bg-snow hover:bg-ink hover:text-snow text-ink border border-ink/10 rounded-full px-4 py-2 text-sm transition-colors"
                    >
                      {v.label}
                    </a>
                  ))}
                </div>

                <h3 className="text-xs uppercase tracking-widest text-graphite font-semibold mb-3">
                  Regiones
                </h3>
                <div className="flex flex-wrap gap-2 mb-8">
                  {[
                    { label: "Mendoza", href: "/region/mendoza" },
                    { label: "Valle de Uco", href: "/region/valle-de-uco" },
                    {
                      label: "Luján de Cuyo",
                      href: "/region/lujan-de-cuyo",
                    },
                    { label: "Salta", href: "/region/salta" },
                    { label: "Patagonia", href: "/region/patagonia" },
                  ].map((r) => (
                    <a
                      key={r.label}
                      href={r.href}
                      className="inline-flex items-center bg-snow hover:bg-cobalt hover:text-snow text-ink border border-ink/10 rounded-full px-4 py-2 text-sm transition-colors"
                    >
                      {r.label}
                    </a>
                  ))}
                </div>

                <div className="bg-snow/60 border border-ink/10 rounded-2xl p-6 text-sm text-graphite">
                  <p className="text-ink font-semibold mb-2">
                    ¿No está el vino que buscás?
                  </p>
                  <p className="mb-3">
                    Puede ser que ninguna de las vinotecas integradas lo tenga
                    hoy, o que una vinoteca que vende ese vino todavía no esté
                    en Vinndex.
                  </p>
                  <p>
                    <Link
                      href="/contacto"
                      className="text-cobalt hover:underline"
                    >
                      Avisanos
                    </Link>{" "}
                    qué vino es y dónde lo viste, y en el próximo ciclo lo
                    intentamos. También podés ver la lista completa de{" "}
                    <Link
                      href="/bodegas"
                      className="text-cobalt hover:underline"
                    >
                      bodegas y vinotecas integradas
                    </Link>
                    .
                  </p>
                </div>
              </div>
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
                      <div className="relative w-16 h-24 shrink-0 rounded-lg overflow-hidden bg-snow border border-ink/10">
                        {g.imageUrl ? (
                          <Image
                            src={g.imageUrl}
                            alt={g.canonicalName}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <BottleFallback name={g.canonicalName} brand={g.brand} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <div className="min-w-0">
                            <h3 className="display text-lg md:text-xl font-semibold text-ink leading-tight truncate">
                              {displayWineName(g.canonicalName)}
                            </h3>
                            <p className="text-sm text-graphite mt-0.5 truncate">
                              {g.brand ? displayBrand(g.brand) : "Sin bodega identificada"}
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
                              // Contraste WCAG AA exige ≥4.5 para texto
                              // chico. Antes el bg `#1B7A4F20` (verde
                              // sobre cream casi transparente) + texto
                              // `#1B7A4F` daba ratio 3.5 — subimos
                              // saturación del bg para llegar a 4.6.
                              style={{
                                background: "#14593620",
                                color: "#145936",
                              }}
                            >
                              {g.storeCount} vinotecas
                            </span>
                          ) : (
                            <span
                              className="tag"
                              style={{
                                background: "rgba(31, 38, 56, 0.14)",
                                color: "#1F2638",
                                fontWeight: 500,
                                textTransform: "none",
                                letterSpacing: 0,
                              }}
                            >
                              en {storeName(g.offers[0].storeSlug)}
                            </span>
                          )}
                          {g.type && (
                            <span
                              className="tag"
                              style={{
                                background: "#16319215",
                                color: "#163192",
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
              Mostrando los primeros 48 resultados. Refiná con filtros para ver
              más opciones.
            </p>
          )}
        </section>
      </main>

      <footer className="bg-ink text-snow/70 px-6 py-10 mt-16">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>
            © 2026 Vinndex ·{" "}
            <Link href="/" className="hover:text-snow">
              Inicio
            </Link>
          </p>
          <p>Precios relevados una vez por día · Beber con moderación</p>
        </div>
      </footer>
    </div>
  );
}
