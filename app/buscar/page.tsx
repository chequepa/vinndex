import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Resultados para "Malbec" — Vinndex',
};

type Wine = {
  name: string;
  subtitle: string;
  price: string;
  stores: number;
  bottleColor: string;
  labelColor: string;
  labelText: string;
  labelSize: number;
  extra?: React.ReactNode;
};

const wines: Wine[] = [
  {
    name: "Catena Zapata Malbec 2021",
    subtitle: "Bodega Catena Zapata · Luján de Cuyo · 750ml",
    price: "$18.450",
    stores: 14,
    bottleColor: "#6B1E2E",
    labelColor: "#F5EDE0",
    labelText: "CATENA",
    labelSize: 5,
    extra: (
      <>
        <span className="text-xs text-graphite">•</span>
        <span className="text-xs text-terracota font-medium">
          Envío gratis desde Winery
        </span>
      </>
    ),
  },
  {
    name: "Luigi Bosca Reserva Malbec 2020",
    subtitle: "Luigi Bosca · Luján de Cuyo · 750ml",
    price: "$12.890",
    stores: 23,
    bottleColor: "#3A1020",
    labelColor: "#E8D47C",
    labelText: "LUIGI B.",
    labelSize: 4,
    extra: (
      <>
        <span className="text-xs text-graphite">•</span>
        <span
          className="tag"
          style={{ background: "#E8B54725", color: "#8B6A1A" }}
        >
          ★ Más popular
        </span>
      </>
    ),
  },
  {
    name: "Zuccardi Q Malbec 2021",
    subtitle: "Familia Zuccardi · Valle de Uco · 750ml",
    price: "$15.200",
    stores: 19,
    bottleColor: "#6B1E2E",
    labelColor: "#F5EDE0",
    labelText: "ZUCCARDI",
    labelSize: 5,
  },
  {
    name: "Rutini Trumpeter Reserve Malbec 2022",
    subtitle: "Rutini Wines · Tupungato · 750ml",
    price: "$9.450",
    stores: 17,
    bottleColor: "#3A1020",
    labelColor: "#E8B547",
    labelText: "RUTINI",
    labelSize: 5,
    extra: (
      <>
        <span className="text-xs text-graphite">•</span>
        <span className="text-xs text-terracota font-medium">
          −8% esta semana
        </span>
      </>
    ),
  },
  {
    name: "Alamos Selección Malbec 2022",
    subtitle: "Bodega Catena Zapata · Mendoza · 750ml",
    price: "$5.890",
    stores: 28,
    bottleColor: "#6B1E2E",
    labelColor: "#F5EDE0",
    labelText: "ALAMOS",
    labelSize: 4,
  },
  {
    name: "Trapiche Oak Cask Malbec 2021",
    subtitle: "Trapiche · Maipú · 750ml",
    price: "$7.350",
    stores: 21,
    bottleColor: "#3A1020",
    labelColor: "#E8859E",
    labelText: "TRAPICHE",
    labelSize: 5,
  },
  {
    name: "Achaval Ferrer Finca Altamira Malbec 2019",
    subtitle: "Achaval Ferrer · Valle de Uco · 750ml",
    price: "$87.500",
    stores: 7,
    bottleColor: "#6B1E2E",
    labelColor: "#F5EDE0",
    labelText: "ACHAVAL",
    labelSize: 4,
    extra: (
      <>
        <span className="text-xs text-graphite">•</span>
        <span
          className="tag"
          style={{ background: "#6B1E2E20", color: "#6B1E2E" }}
        >
          Premium
        </span>
      </>
    ),
  },
  {
    name: "El Esteco Altimus Malbec 2020",
    subtitle: "El Esteco · Cafayate · 750ml",
    price: "$24.900",
    stores: 11,
    bottleColor: "#3A1020",
    labelColor: "#E8D47C",
    labelText: "EL ESTECO",
    labelSize: 4,
  },
  {
    name: "Salentein Reserve Malbec 2021",
    subtitle: "Bodegas Salentein · Valle de Uco · 750ml",
    price: "$11.890",
    stores: 16,
    bottleColor: "#6B1E2E",
    labelColor: "#F5EDE0",
    labelText: "SALENTEIN",
    labelSize: 4,
  },
  {
    name: "Colomé Estate Malbec 2021",
    subtitle: "Bodega Colomé · Calchaquí (Salta) · 750ml",
    price: "$13.450",
    stores: 13,
    bottleColor: "#3A1020",
    labelColor: "#D97449",
    labelText: "COLOMÉ",
    labelSize: 5,
  },
  {
    name: "Norton Reserva Malbec 2022",
    subtitle: "Bodega Norton · Luján de Cuyo · 750ml",
    price: "$8.990",
    stores: 20,
    bottleColor: "#6B1E2E",
    labelColor: "#E8B547",
    labelText: "NORTON",
    labelSize: 4,
  },
  {
    name: "Pulenta Estate Gran Malbec 2020",
    subtitle: "Pulenta Estate · Alto Agrelo · 750ml",
    price: "$34.200",
    stores: 9,
    bottleColor: "#3A1020",
    labelColor: "#F5EDE0",
    labelText: "PULENTA",
    labelSize: 4,
  },
];

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

export default function Buscar() {
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
                defaultValue="Malbec"
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

      {/* HEADER */}
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
            Resultados para <span className="italic">&ldquo;Malbec&rdquo;</span>
          </h1>
          <p className="text-graphite mt-2">
            <span className="font-semibold text-ink">1.247 vinos</span>{" "}
            encontrados · precios con envío a{" "}
            <span className="font-semibold text-ink">CABA</span>
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="filter-chip active">Malbec ×</button>
            <button className="filter-chip">
              Varietal <ChevronIcon />
            </button>
            <button className="filter-chip">
              Bodega <ChevronIcon />
            </button>
            <button className="filter-chip">
              Región <ChevronIcon />
            </button>
            <button className="filter-chip">
              Precio <ChevronIcon />
            </button>
            <button className="filter-chip">
              Cosecha <ChevronIcon />
            </button>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 grid lg:grid-cols-[260px_1fr] gap-10">
        {/* SIDEBAR FILTROS */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="mb-8">
              <h3 className="display text-lg font-semibold mb-4">
                Rango de precio
              </h3>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Menos de
                  $10.000{" "}
                  <span className="text-graphite ml-auto">(142)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input
                    type="checkbox"
                    className="accent-cobalt"
                    defaultChecked
                  />{" "}
                  $10k - $25k{" "}
                  <span className="text-graphite ml-auto">(538)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> $25k -
                  $50k <span className="text-graphite ml-auto">(361)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> $50k -
                  $100k <span className="text-graphite ml-auto">(148)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Más de
                  $100k <span className="text-graphite ml-auto">(58)</span>
                </label>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="display text-lg font-semibold mb-4">Región</h3>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-wine">
                  <input
                    type="checkbox"
                    className="accent-cobalt"
                    defaultChecked
                  />{" "}
                  Valle de Uco{" "}
                  <span className="text-graphite ml-auto">(423)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Luján de
                  Cuyo <span className="text-graphite ml-auto">(389)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Maipú{" "}
                  <span className="text-graphite ml-auto">(201)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Tupungato{" "}
                  <span className="text-graphite ml-auto">(134)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Cafayate{" "}
                  <span className="text-graphite ml-auto">(67)</span>
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Patagonia{" "}
                  <span className="text-graphite ml-auto">(33)</span>
                </label>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="display text-lg font-semibold mb-4">Cosecha</h3>
              <div className="flex flex-wrap gap-2 text-sm">
                <button className="filter-chip text-xs !px-3 !py-1">
                  2023
                </button>
                <button className="filter-chip text-xs !px-3 !py-1 active">
                  2022
                </button>
                <button className="filter-chip text-xs !px-3 !py-1 active">
                  2021
                </button>
                <button className="filter-chip text-xs !px-3 !py-1">
                  2020
                </button>
                <button className="filter-chip text-xs !px-3 !py-1">
                  2019
                </button>
                <button className="filter-chip text-xs !px-3 !py-1">
                  Otras
                </button>
              </div>
            </div>

            <div>
              <h3 className="display text-lg font-semibold mb-4">
                Disponibilidad
              </h3>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-wine">
                  <input
                    type="checkbox"
                    className="accent-cobalt"
                    defaultChecked
                  />{" "}
                  En stock
                </label>
                <label className="flex items-center gap-2 cursor-wine">
                  <input type="checkbox" className="accent-cobalt" /> Envío
                  gratis disponible
                </label>
              </div>
            </div>
          </div>
        </aside>

        {/* RESULTADOS */}
        <section>
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-ink/10">
            <p className="text-sm text-graphite">
              Mostrando{" "}
              <span className="font-semibold text-ink">1-12</span> de{" "}
              <span className="font-semibold text-ink">1.247</span>
            </p>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-graphite">Ordenar por:</label>
              <select
                defaultValue="Precio total (con envío)"
                className="bg-white border border-ink/10 rounded-full px-3 py-1.5 font-medium cursor-wine"
              >
                <option>Precio total (con envío)</option>
                <option>Precio sin envío</option>
                <option>Más populares</option>
                <option>Cosecha más nueva</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-ink/10">
            {wines.map((w) => (
              <a
                key={w.name}
                href="/vino/ejemplo"
                className="wine-row block py-5"
              >
                <div className="flex gap-5">
                  <div className="wine-thumb shrink-0">
                    <svg viewBox="0 0 64 96" fill="none">
                      <rect
                        x="22"
                        y="12"
                        width="20"
                        height="72"
                        rx="2"
                        fill={w.bottleColor}
                      />
                      <rect
                        x="22"
                        y="8"
                        width="20"
                        height="8"
                        fill="#0F1729"
                      />
                      <rect
                        x="24"
                        y="36"
                        width="16"
                        height="28"
                        fill={w.labelColor}
                        opacity={w.labelColor === "#F5EDE0" ? 0.9 : 1}
                      />
                      <text
                        x="32"
                        y="52"
                        fontSize={w.labelSize}
                        textAnchor="middle"
                        fill={w.bottleColor}
                        fontWeight="bold"
                      >
                        {w.labelText}
                      </text>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <div>
                        <h3 className="display text-lg md:text-xl font-semibold text-ink leading-tight">
                          {w.name}
                        </h3>
                        <p className="text-sm text-graphite mt-0.5">
                          {w.subtitle}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-graphite">desde</div>
                        <div className="display text-2xl font-semibold text-cobalt">
                          {w.price}
                        </div>
                        <div className="text-xs text-graphite">+ envío</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span className="tag tag-malbec">Malbec</span>
                      <span className="text-xs text-graphite">•</span>
                      <span className="text-xs text-graphite">
                        <span className="font-semibold text-ink">
                          {w.stores} vinotecas
                        </span>{" "}
                        lo venden
                      </span>
                      {w.extra}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {/* PAGINACIÓN */}
          <div className="mt-12 flex items-center justify-center gap-2">
            <button
              className="filter-chip !px-4"
              disabled
              style={{ opacity: 0.4 }}
            >
              ‹ Anterior
            </button>
            <button className="filter-chip !w-10 !h-10 !p-0 !justify-center active">
              1
            </button>
            <button className="filter-chip !w-10 !h-10 !p-0 !justify-center">
              2
            </button>
            <button className="filter-chip !w-10 !h-10 !p-0 !justify-center">
              3
            </button>
            <span className="text-graphite px-2">...</span>
            <button className="filter-chip !w-10 !h-10 !p-0 !justify-center">
              104
            </button>
            <button className="filter-chip !px-4 cursor-wine">
              Siguiente ›
            </button>
          </div>
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
