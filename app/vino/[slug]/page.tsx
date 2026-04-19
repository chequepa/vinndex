import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Catena Zapata Malbec 2021 — Compará en 14 vinotecas | Vinndex",
};

type Store = {
  logo: string;
  logoBg: string;
  logoColor?: string;
  name: string;
  domain: string;
  rating: string;
  delivery: string;
  price: string;
  shipping: string;
  shippingNote?: string;
  total: string;
  best?: boolean;
  bestBadge?: string;
};

const stores: Store[] = [
  {
    logo: "W",
    logoBg: "#6B1E2E",
    name: "Winery",
    domain: "winery.com.ar",
    rating: "4.6",
    delivery: "2-3 días",
    price: "$18.450",
    shipping: "GRATIS",
    shippingNote: "compra > $15k",
    total: "$18.450",
    best: true,
    bestBadge: "★ Mejor total",
  },
  {
    logo: "M",
    logoBg: "#1E3FBF",
    name: "Mosto Wines",
    domain: "mosto.com.ar",
    rating: "4.5",
    delivery: "3 días",
    price: "$18.990",
    shipping: "$3.200",
    total: "$22.190",
  },
  {
    logo: "SW",
    logoBg: "#D97449",
    name: "Sir Winston Churchill",
    domain: "sirwinston.com.ar",
    rating: "4.7",
    delivery: "2 días",
    price: "$18.790",
    shipping: "$3.500",
    total: "$22.290",
  },
  {
    logo: "BV",
    logoBg: "#E8B547",
    logoColor: "#6B1E2E",
    name: "Bonvivir",
    domain: "bonvivir.com",
    rating: "4.8",
    delivery: "2-3 días",
    price: "$19.200",
    shipping: "$3.500",
    total: "$22.700",
  },
  {
    logo: "LJ",
    logoBg: "#4D79E8",
    name: "Lo de Joaquín",
    domain: "lodejoaquin.com",
    rating: "4.4",
    delivery: "3-4 días",
    price: "$18.890",
    shipping: "$4.200",
    total: "$23.090",
  },
  {
    logo: "ML",
    logoBg: "#E8B547",
    logoColor: "#0F1729",
    name: "Mercado Libre",
    domain: "Seller: vinotecadelcentro",
    rating: "4.7",
    delivery: "",
    price: "$19.750",
    shipping: "GRATIS",
    total: "$19.750",
  },
  {
    logo: "TP",
    logoBg: "#6B1E2E",
    name: "Tonel Privado",
    domain: "tonelprivado.com",
    rating: "4.6",
    delivery: "3 días",
    price: "$19.490",
    shipping: "$3.800",
    total: "$23.290",
  },
  {
    logo: "CV",
    logoBg: "#D63A7A",
    name: "Club del Vino",
    domain: "clubdelvino.com.ar",
    rating: "4.3",
    delivery: "4 días",
    price: "$19.890",
    shipping: "$3.500",
    total: "$23.390",
  },
  {
    logo: "VN",
    logoBg: "#7C8FD9",
    name: "Vinísimo",
    domain: "vinissimo.com.ar",
    rating: "4.4",
    delivery: "3 días",
    price: "$20.100",
    shipping: "$3.500",
    total: "$23.600",
  },
  {
    logo: "JB",
    logoBg: "#3A1020",
    name: "Jumbo",
    domain: "jumbo.com.ar",
    rating: "4.1",
    delivery: "1-2 días",
    price: "$21.350",
    shipping: "$2.500",
    total: "$23.850",
  },
];

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3 L11 3 L11 11 M11 3 L3 11" strokeLinecap="round" />
    </svg>
  );
}

export default function Vino() {
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
              <input
                type="text"
                name="q"
                placeholder="Buscar otro vino..."
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

      {/* HERO */}
      <section className="relative ficha-hero text-snow overflow-hidden grain">
        <svg
          className="absolute bottom-0 left-0 w-full opacity-40"
          viewBox="0 0 1440 240"
          preserveAspectRatio="none"
          style={{ height: "130px" }}
        >
          <path
            d="M0 160 L140 80 L260 120 L380 60 L520 110 L680 50 L840 100 L1000 60 L1140 110 L1280 70 L1440 120 L1440 240 L0 240 Z"
            fill="#0F1E4D"
          />
          <path
            d="M380 60 L400 85 L362 85 Z M680 50 L700 78 L660 78 Z M1000 60 L1022 88 L978 88 Z"
            fill="#F5EDE0"
            opacity="0.45"
          />
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-snow/70 uppercase tracking-wider mb-5">
            <a href="/" className="hover:text-snow">
              Inicio
            </a>
            <span>/</span>
            <a
              href="/buscar?bodega=catena-zapata"
              className="hover:text-snow"
            >
              Catena Zapata
            </a>
            <span>/</span>
            <span>Malbec 2021</span>
          </div>

          <div className="grid lg:grid-cols-[280px_1fr] gap-10 items-start">
            <div className="flex justify-center lg:justify-start">
              <div className="relative">
                <div className="absolute inset-0 bg-snow/15 blur-2xl rounded-full" />
                <svg
                  width="220"
                  height="360"
                  viewBox="0 0 220 360"
                  className="relative"
                >
                  <rect
                    x="92"
                    y="10"
                    width="36"
                    height="60"
                    fill="#0F1729"
                    rx="4"
                  />
                  <rect
                    x="90"
                    y="10"
                    width="40"
                    height="24"
                    fill="#E8B547"
                    rx="2"
                  />
                  <path
                    d="M78 70 Q 72 90 70 110 L70 340 Q 70 350 80 350 L140 350 Q 150 350 150 340 L150 110 Q 148 90 142 70 Z"
                    fill="#6B1E2E"
                  />
                  <path
                    d="M84 90 Q 80 110 78 130 L78 320 Q 78 328 82 328 L88 328 Q 88 130 88 90 Z"
                    fill="#8B2E44"
                    opacity="0.5"
                  />
                  <rect
                    x="78"
                    y="160"
                    width="72"
                    height="130"
                    fill="#F5EDE0"
                  />
                  <rect
                    x="82"
                    y="165"
                    width="64"
                    height="3"
                    fill="#6B1E2E"
                  />
                  <rect
                    x="82"
                    y="285"
                    width="64"
                    height="3"
                    fill="#6B1E2E"
                  />
                  <text
                    x="110"
                    y="195"
                    textAnchor="middle"
                    fontFamily="Fraunces"
                    fontSize="11"
                    fontWeight="700"
                    fill="#6B1E2E"
                  >
                    CATENA
                  </text>
                  <text
                    x="110"
                    y="215"
                    textAnchor="middle"
                    fontFamily="Fraunces"
                    fontSize="9"
                    fill="#6B1E2E"
                  >
                    ZAPATA
                  </text>
                  <line
                    x1="90"
                    y1="225"
                    x2="130"
                    y2="225"
                    stroke="#6B1E2E"
                    strokeWidth="0.5"
                  />
                  <text
                    x="110"
                    y="243"
                    textAnchor="middle"
                    fontFamily="Fraunces"
                    fontSize="13"
                    fontStyle="italic"
                    fill="#6B1E2E"
                  >
                    Malbec
                  </text>
                  <text
                    x="110"
                    y="267"
                    textAnchor="middle"
                    fontFamily="Inter"
                    fontSize="9"
                    fontWeight="600"
                    fill="#6B1E2E"
                  >
                    2021
                  </text>
                  <text
                    x="110"
                    y="278"
                    textAnchor="middle"
                    fontFamily="Inter"
                    fontSize="6"
                    fill="#6B1E2E"
                  >
                    MENDOZA · ARGENTINA
                  </text>
                </svg>
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="px-2.5 py-1 rounded-full bg-snow/15 backdrop-blur border border-snow/25 text-xs font-semibold uppercase tracking-wide">
                  Malbec
                </span>
                <span className="text-snow/70">·</span>
                <span className="text-snow/80">Cosecha 2021</span>
                <span className="text-snow/70">·</span>
                <span className="text-snow/80">750ml</span>
              </div>

              <h1 className="display text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] mb-3">
                Catena Zapata
                <br />
                <span className="italic font-normal">Malbec</span> 2021
              </h1>

              <p className="text-snow/80 text-lg mb-8">
                <a
                  href="#"
                  className="underline decoration-mustard/60 hover:decoration-mustard"
                >
                  Bodega Catena Zapata
                </a>{" "}
                ·{" "}
                <a
                  href="#"
                  className="underline decoration-mustard/60 hover:decoration-mustard"
                >
                  Luján de Cuyo, Mendoza
                </a>
              </p>

              <div className="inline-flex items-baseline gap-6 bg-snow/10 backdrop-blur border border-snow/20 rounded-2xl px-6 py-5 mb-8">
                <div>
                  <div className="text-xs text-snow/70 uppercase tracking-wider mb-1">
                    Desde
                  </div>
                  <div className="display text-4xl md:text-5xl font-semibold leading-none">
                    $18.450
                  </div>
                  <div className="text-xs text-snow/70 mt-1.5">
                    precio sin envío
                  </div>
                </div>
                <div className="h-14 w-px bg-snow/25" />
                <div>
                  <div className="text-xs text-snow/70 uppercase tracking-wider mb-1">
                    Total a CABA
                  </div>
                  <div className="display text-4xl md:text-5xl font-semibold leading-none text-mustard">
                    $21.950
                  </div>
                  <div className="text-xs text-snow/70 mt-1.5">
                    con envío incluido
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 md:gap-8 text-sm">
                <div>
                  <div className="display text-2xl font-semibold">14</div>
                  <div className="text-snow/70 text-xs">vinotecas</div>
                </div>
                <div>
                  <div className="display text-2xl font-semibold">
                    $18.450 – $24.800
                  </div>
                  <div className="text-snow/70 text-xs">rango de precios</div>
                </div>
                <div>
                  <div className="display text-2xl font-semibold">2–7 días</div>
                  <div className="text-snow/70 text-xs">entrega estimada</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TABLA + SIDEBAR */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-14 grid lg:grid-cols-[1fr_320px] gap-10">
        <section>
          <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="display text-3xl font-semibold text-ink">
                Comparación de precios
              </h2>
              <p className="text-graphite text-sm mt-1">
                Precios ordenados por total con envío · Actualizado hace 6
                horas
              </p>
            </div>
            <div className="flex gap-2">
              <span className="text-graphite text-sm mr-1 self-center">
                Envío a:
              </span>
              <button className="shipping-tab active cursor-wine">CABA</button>
              <button className="shipping-tab cursor-wine">GBA</button>
              <button className="shipping-tab cursor-wine">Resto</button>
            </div>
          </div>

          <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1.1fr_auto] gap-4 px-5 py-3 bg-snow border-b border-ink/10 text-xs font-semibold text-graphite uppercase tracking-wider">
              <div>Vinoteca</div>
              <div className="text-right">Precio</div>
              <div className="text-right">Envío CABA</div>
              <div className="text-right">Total</div>
              <div />
            </div>

            {stores.map((s) => {
              const rowClasses = s.best
                ? "price-row best grid md:grid-cols-[2.2fr_1fr_1fr_1.1fr_150px] gap-4 items-center px-5 py-4 border-b border-ink/5"
                : "price-row grid md:grid-cols-[2.2fr_1fr_1fr_1.1fr_150px] gap-4 items-center px-5 py-4 border-b border-ink/5";
              const ctaClasses = s.best
                ? "cursor-wine bg-cobalt hover:bg-ink text-snow font-semibold px-5 py-2.5 rounded-full text-sm inline-flex items-center justify-center gap-2 transition-colors w-full"
                : "cursor-wine border border-ink/20 hover:border-cobalt hover:text-cobalt text-ink font-semibold px-5 py-2.5 rounded-full text-sm inline-flex items-center justify-center gap-2 transition-colors w-full";
              return (
                <div key={s.name} className={rowClasses}>
                  <div className="flex items-center gap-3">
                    <div
                      className="store-logo"
                      style={{
                        background: s.logoBg,
                        ...(s.logoColor ? { color: s.logoColor } : {}),
                      }}
                    >
                      {s.logo}
                    </div>
                    <div>
                      <div className="font-semibold text-ink flex items-center gap-2">
                        {s.name}
                        {s.bestBadge && (
                          <span className="text-[10px] bg-mustard/25 text-mustard px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                            {s.bestBadge}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-graphite">
                        {s.domain}
                        {s.rating && ` · ★ ${s.rating}`}
                        {s.delivery && ` · ${s.delivery}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="md:hidden text-xs text-graphite">
                      Precio:{" "}
                    </span>
                    <span className="font-semibold text-ink">{s.price}</span>
                  </div>
                  <div className="text-right">
                    <span className="md:hidden text-xs text-graphite">
                      Envío:{" "}
                    </span>
                    {s.shipping === "GRATIS" ? (
                      <span className="text-terracota font-medium text-sm">
                        GRATIS
                      </span>
                    ) : (
                      <span className="text-ink">{s.shipping}</span>
                    )}
                    {s.shippingNote && (
                      <div className="text-xs text-graphite hidden md:block">
                        {s.shippingNote}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="md:hidden text-xs text-graphite">
                      Total:{" "}
                    </span>
                    <span className="display text-2xl font-semibold text-cobalt">
                      {s.total}
                    </span>
                  </div>
                  <a href="#" className={ctaClasses}>
                    Visitar <ExternalIcon />
                  </a>
                </div>
              );
            })}

            <div className="px-5 py-4 text-center">
              <button className="cursor-wine text-cobalt font-semibold text-sm hover:text-ink transition-colors">
                Ver las otras 4 vinotecas ↓
              </button>
            </div>
          </div>

          <p className="text-xs text-graphite mt-4">
            Precios actualizados hace 6 horas.{" "}
            <a href="#" className="underline hover:text-ink">
              Reportar precio incorrecto
            </a>
            . No vendemos vino — te enviamos al sitio de la vinoteca a
            completar la compra.
          </p>
        </section>

        <aside>
          <div className="sticky top-24 space-y-6">
            <div className="bg-snow rounded-2xl p-6 border border-ink/10">
              <h3 className="display text-xl font-semibold mb-4">
                Ficha del vino
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <dt className="text-graphite">Varietal</dt>
                  <dd className="font-medium text-ink">100% Malbec</dd>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <dt className="text-graphite">Bodega</dt>
                  <dd className="font-medium text-ink">Catena Zapata</dd>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <dt className="text-graphite">Región</dt>
                  <dd className="font-medium text-ink">Luján de Cuyo</dd>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <dt className="text-graphite">Cosecha</dt>
                  <dd className="font-medium text-ink">2021</dd>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <dt className="text-graphite">Alcohol</dt>
                  <dd className="font-medium text-ink">13.5%</dd>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <dt className="text-graphite">Volumen</dt>
                  <dd className="font-medium text-ink">750 ml</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-graphite">Guarda</dt>
                  <dd className="font-medium text-ink">5-10 años</dd>
                </div>
              </dl>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-ink/10">
              <h3 className="display text-xl font-semibold mb-1">
                Precio en el tiempo
              </h3>
              <p className="text-xs text-graphite mb-4">
                Últimos 90 días · mejor precio
              </p>
              <svg viewBox="0 0 240 100" className="w-full h-24">
                <defs>
                  <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1E3FBF" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#1E3FBF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 60 L30 55 L60 58 L90 50 L120 48 L150 42 L180 38 L210 32 L240 34 L240 100 L0 100 Z"
                  fill="url(#g)"
                />
                <path
                  d="M0 60 L30 55 L60 58 L90 50 L120 48 L150 42 L180 38 L210 32 L240 34"
                  stroke="#1E3FBF"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
                <circle cx="240" cy="34" r="4" fill="#1E3FBF" />
                <circle cx="240" cy="34" r="8" fill="#1E3FBF" opacity="0.25" />
              </svg>
              <div className="flex justify-between items-end mt-3">
                <div>
                  <div className="text-xs text-graphite">Mínimo 90 días</div>
                  <div className="font-semibold text-ink">$17.800</div>
                </div>
                <div>
                  <div className="text-xs text-graphite">Actual</div>
                  <div className="font-semibold text-cobalt">$18.450</div>
                </div>
                <div>
                  <div className="text-xs text-graphite">Máximo</div>
                  <div className="font-semibold text-ink">$21.200</div>
                </div>
              </div>
            </div>

            <div className="bg-malbec text-snow rounded-2xl p-6 relative overflow-hidden grain">
              <h3 className="display text-lg font-semibold mb-3">
                Sobre este vino
              </h3>
              <p className="text-sm leading-relaxed text-snow/90">
                El Catena Malbec es una de las referencias más icónicas del
                varietal argentino. Ensambla uvas de los viñedos altos de
                Mendoza (Adrianna, Nicasia, Domingo y Angélica) a más de 1.000
                m.s.n.m.
              </p>
            </div>
          </div>
        </aside>
      </main>

      <section className="bg-snow py-16 border-t border-ink/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <h2 className="display text-3xl font-semibold mb-8">
            Otros vinos de Catena Zapata
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/vino/catena-alta-malbec"
              className="bg-white rounded-2xl p-5 border border-ink/10 hover:shadow-lg transition-shadow"
            >
              <div className="display text-lg font-semibold">
                Catena Alta Malbec
              </div>
              <div className="text-xs text-graphite mt-0.5">Cosecha 2019</div>
              <div className="display text-2xl font-semibold text-cobalt mt-3">
                $32.400
              </div>
              <div className="text-xs text-graphite">desde · 11 vinotecas</div>
            </a>
            <a
              href="/vino/catena-appellation-malbec"
              className="bg-white rounded-2xl p-5 border border-ink/10 hover:shadow-lg transition-shadow"
            >
              <div className="display text-lg font-semibold">
                Catena Appellation Malbec
              </div>
              <div className="text-xs text-graphite mt-0.5">Cosecha 2020</div>
              <div className="display text-2xl font-semibold text-cobalt mt-3">
                $24.890
              </div>
              <div className="text-xs text-graphite">desde · 9 vinotecas</div>
            </a>
            <a
              href="/vino/catena-chardonnay"
              className="bg-white rounded-2xl p-5 border border-ink/10 hover:shadow-lg transition-shadow"
            >
              <div className="display text-lg font-semibold">
                Catena Chardonnay
              </div>
              <div className="text-xs text-graphite mt-0.5">Cosecha 2022</div>
              <div className="display text-2xl font-semibold text-cobalt mt-3">
                $16.200
              </div>
              <div className="text-xs text-graphite">desde · 13 vinotecas</div>
            </a>
            <a
              href="/vino/angelica-zapata-malbec"
              className="bg-white rounded-2xl p-5 border border-ink/10 hover:shadow-lg transition-shadow"
            >
              <div className="display text-lg font-semibold">
                Angélica Zapata Malbec
              </div>
              <div className="text-xs text-graphite mt-0.5">Cosecha 2019</div>
              <div className="display text-2xl font-semibold text-cobalt mt-3">
                $41.900
              </div>
              <div className="text-xs text-graphite">desde · 8 vinotecas</div>
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-ink text-snow/70 px-6 py-10">
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
