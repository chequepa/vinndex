import { SearchInput } from "@/components/SearchInput";
import Image from "next/image";
import { BottleFallback } from "@/components/BottleFallback";
import {
  snapshotStats,
  topBrands,
  topDeals,
  formatArs,
  displayBrand,
  brandSlug,
  varietalPages,
  regionPages,
} from "@/lib/snapshot";

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    return `${k}k+`;
  }
  return String(n);
}

export default function Home() {
  const stats = snapshotStats();
  const brands = topBrands(12);
  const deals = topDeals(6);
  const varietals = varietalPages().slice(0, 8);
  const regions = regionPages().slice(0, 6);
  return (
    <>
      {/* NAV */}
      <nav className="absolute top-0 left-0 right-0 z-30 px-6 py-5 lg:px-12">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-snow cursor-wine">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
                fill="#F5EDE0"
                stroke="#F5EDE0"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="24" cy="8" r="3" fill="#E8B547" />
            </svg>
            <span className="display text-2xl font-semibold tracking-tight">
              Vinndex
            </span>
          </a>
          <div className="hidden md:flex items-center gap-2">
            <a href="#como-funciona" className="chip">
              Cómo funciona
            </a>
            <a href="#regiones" className="chip">
              Regiones
            </a>
            <a href="#bodegas" className="chip">
              Bodegas
            </a>
          </div>
          {/*
            "Enviando a" estático por ahora — la filtración por zona de envío
            llega cuando tengamos cálculo de costo real por tienda. Era un
            <select> pero (1) no hacía nada (2) su dropdown nativo se superponía
            mal sobre el hero. Lo dejamos como indicador visual.
          */}
          <div className="hidden sm:flex items-center gap-2 text-snow text-sm bg-white/10 border border-white/20 backdrop-blur rounded-full px-3 py-1.5 font-medium">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 1 0 10 10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Precios en CABA</span>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative nagai-sky min-h-[100dvh] flex items-center justify-center overflow-hidden grain">
        <div className="absolute top-32 right-[18%] float">
          <div
            className="w-28 h-28 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 40% 40%, #F5EDE0 0%, #E8B547 45%, #D97449 100%)",
              boxShadow: "0 0 80px 20px rgba(232, 181, 71, 0.4)",
            }}
          />
        </div>

        <svg
          className="absolute bottom-0 left-0 w-full"
          viewBox="0 0 1440 520"
          preserveAspectRatio="none"
          style={{ height: "65vh" }}
        >
          <path
            d="M0 400 L120 280 L220 340 L340 220 L460 300 L580 190 L700 260 L820 170 L940 240 L1060 180 L1180 260 L1320 210 L1440 280 L1440 520 L0 520 Z"
            fill="#7C8FD9"
            opacity="0.55"
          />
          <path
            d="M0 460 L140 360 L260 400 L380 320 L520 380 L660 310 L800 370 L940 300 L1080 370 L1220 320 L1360 380 L1440 350 L1440 520 L0 520 Z"
            fill="#1E3FBF"
            opacity="0.75"
          />
          <path
            d="M0 500 L200 440 L420 470 L640 430 L880 470 L1100 440 L1320 475 L1440 450 L1440 520 L0 520 Z"
            fill="#0F1E4D"
          />
          <g stroke="#6B1E2E" strokeWidth="1.5" opacity="0.55">
            <line x1="100" y1="505" x2="180" y2="485" />
            <line x1="220" y1="503" x2="320" y2="482" />
            <line x1="360" y1="500" x2="460" y2="480" />
            <line x1="500" y1="498" x2="600" y2="478" />
            <line x1="640" y1="496" x2="740" y2="476" />
            <line x1="780" y1="494" x2="880" y2="475" />
            <line x1="920" y1="492" x2="1020" y2="474" />
            <line x1="1060" y1="490" x2="1160" y2="473" />
            <line x1="1200" y1="488" x2="1300" y2="472" />
          </g>
          <g fill="#0F1E4D">
            <ellipse cx="80" cy="470" rx="6" ry="28" />
            <ellipse cx="105" cy="465" rx="5" ry="22" />
            <ellipse cx="1200" cy="460" rx="7" ry="30" />
            <ellipse cx="1225" cy="455" rx="5" ry="24" />
            <ellipse cx="1250" cy="463" rx="6" ry="26" />
          </g>
        </svg>

        <div className="relative z-20 max-w-5xl mx-auto px-6 pt-32 pb-24 text-center hero-text">
          <p className="text-snow/90 text-sm md:text-base tracking-[0.25em] uppercase mb-6 font-medium">
            La biblia para comprar vino online en Argentina
          </p>

          <h1 className="display text-snow text-5xl md:text-7xl lg:text-8xl font-semibold leading-[0.95] tracking-tight mb-8">
            Un vino.
            <br />
            <span className="italic font-normal">Todos</span> los precios.
          </h1>

          <p className="text-snow/85 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Buscás el vino que querés. Te decimos{" "}
            <span className="underline decoration-mustard decoration-2 underline-offset-4">
              todas las vinotecas online
            </span>{" "}
            que lo tienen, ordenadas por precio total con envío a tu casa.
          </p>

          <form action="/buscar" className="max-w-2xl mx-auto">
            <div className="relative flex items-center bg-snow rounded-full shadow-2xl p-2 pl-6 ring-1 ring-ink/5">
              <svg
                width="22"
                height="22"
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
                placeholder="Malbec, Luigi Bosca, Catena Zapata..."
                className="w-full bg-transparent border-0 outline-none px-4 py-3 text-ink placeholder:text-graphite/70 text-base md:text-lg"
              />
              <button
                type="submit"
                className="cursor-wine bg-cobalt hover:bg-ink text-snow font-semibold px-6 md:px-8 py-3 rounded-full transition-colors text-sm md:text-base"
              >
                Buscar
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-snow/80 text-sm">
              <span className="opacity-70">Popular hoy:</span>
              <a href="/varietal/malbec" className="chip text-xs !py-1.5">
                Malbec
              </a>
              <a
                href="/varietal/cabernet-sauvignon"
                className="chip text-xs !py-1.5"
              >
                Cabernet Sauvignon
              </a>
              <a href="/region/valle-de-uco" className="chip text-xs !py-1.5">
                Valle de Uco
              </a>
              <a href="/buscar?tipo=Espumante" className="chip text-xs !py-1.5">
                Espumantes
              </a>
            </div>
          </form>
        </div>
      </section>

      {/* STATS */}
      <section className="bg-snow border-y border-ink/10 relative grain">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div>
            <div className="display text-5xl md:text-6xl font-semibold text-cobalt leading-none">
              {formatCount(stats.productCount)}
            </div>
            <div className="text-graphite text-sm mt-2">
              vinos en el catálogo
            </div>
          </div>
          <div>
            <div className="display text-5xl md:text-6xl font-semibold text-malbec leading-none">
              {stats.storeCount}
            </div>
            <div className="text-graphite text-sm mt-2">
              vinotecas sincronizando
            </div>
          </div>
          <div>
            <div className="display text-5xl md:text-6xl font-semibold text-mustard leading-none">
              $0
            </div>
            <div className="text-graphite text-sm mt-2">gratis para vos</div>
          </div>
        </div>
      </section>

      {/* TOP OFERTAS */}
      {deals.length > 0 && (
        <section id="ofertas" className="py-24 lg:py-32 px-6 bg-snow/50">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
              <div className="max-w-2xl">
                <p className="text-malbec text-sm tracking-[0.2em] uppercase font-semibold mb-4">
                  Top ofertas del snapshot
                </p>
                <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold text-ink leading-[1.05]">
                  El mismo vino,
                  <br />
                  <span className="italic font-normal">precios muy distintos.</span>
                </h2>
                <p className="text-graphite mt-5 text-lg leading-relaxed">
                  Vinos que aparecen en 2+ vinotecas con diferencias de precio que
                  importan. Elegí la más barata — o la que te llega más rápido.
                </p>
              </div>
              <a href="/buscar?multi=1" className="chip !bg-ink !text-snow hover:!bg-malbec">
                Ver todos los comparables →
              </a>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {deals.map((g) => {
                const savingsPct =
                  g.minPrice != null && g.maxPrice != null && g.maxPrice > 0
                    ? Math.round(
                        ((g.maxPrice - g.minPrice) / g.maxPrice) * 100,
                      )
                    : 0;
                return (
                  <a
                    key={g.groupSlug}
                    href={`/vino/${g.groupSlug}`}
                    className="postcard p-6 flex gap-5 items-start"
                  >
                    <div className="relative w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-snow border border-ink/10">
                      {g.imageUrl ? (
                        <Image
                          src={g.imageUrl}
                          alt={g.canonicalName}
                          fill
                          sizes="96px"
                          className="object-contain"
                        />
                      ) : (
                        <BottleFallback name={g.canonicalName} brand={g.brand} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="inline-flex items-center gap-1.5 bg-malbec text-snow text-xs font-bold px-2.5 py-1 rounded-full mb-3 uppercase tracking-wide">
                        Ahorrá {savingsPct}%
                      </div>
                      <h3 className="display text-lg font-semibold text-ink leading-tight line-clamp-2 mb-1">
                        {g.canonicalName}
                      </h3>
                      <p className="text-xs text-graphite mb-3 truncate">
                        {g.brand ? `${displayBrand(g.brand)} · ` : ""}
                        {g.storeCount} vinoteca{g.storeCount === 1 ? "" : "s"}
                        {g.vintage ? ` · ${g.vintage}` : ""}
                      </p>
                      <div className="flex items-baseline gap-2">
                        <div className="display text-2xl font-semibold text-cobalt">
                          {formatArs(g.minPrice)}
                        </div>
                        <div className="text-xs text-graphite line-through">
                          {formatArs(g.maxPrice)}
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* CÓMO FUNCIONA */}
      <section id="como-funciona" className="py-24 lg:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-4">
              Cómo funciona
            </p>
            <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold text-ink leading-[1.05]">
              Simple como pedir
              <br />
              una copa.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="postcard p-8">
              <div className="flex items-center justify-between mb-6">
                <span className="display text-6xl font-semibold text-cobalt/25 leading-none">
                  01
                </span>
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  fill="none"
                  className="text-cobalt"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M26 26 L34 34"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h3 className="display text-2xl font-semibold mb-3">
                Buscá el vino
              </h3>
              <p className="text-graphite leading-relaxed">
                Por nombre, bodega, varietal o región.
              </p>
            </div>

            <div className="postcard p-8">
              <div className="flex items-center justify-between mb-6">
                <span className="display text-6xl font-semibold text-malbec/25 leading-none">
                  02
                </span>
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  fill="none"
                  className="text-malbec"
                >
                  <rect
                    x="8"
                    y="10"
                    width="24"
                    height="22"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path d="M8 18 L32 18" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M14 24 L20 24 M14 28 L26 28"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h3 className="display text-2xl font-semibold mb-3">
                Comparamos todo
              </h3>
              <p className="text-graphite leading-relaxed">
                Te mostramos todas las vinotecas que lo venden online con precio
                actualizado y costo de envío a tu zona.
              </p>
            </div>

            <div className="postcard p-8">
              <div className="flex items-center justify-between mb-6">
                <span className="display text-6xl font-semibold text-terracota/30 leading-none">
                  03
                </span>
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  fill="none"
                  className="text-terracota"
                >
                  <path
                    d="M12 8 L28 8 L26 28 L14 28 Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 8 L16 4 L24 4 L24 8"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle cx="20" cy="20" r="3" fill="currentColor" />
                </svg>
              </div>
              <h3 className="display text-2xl font-semibold mb-3">
                Comprás al mejor precio
              </h3>
              <p className="text-graphite leading-relaxed">
                Click y vas directo al sitio de la vinoteca a completar la
                compra. Nosotros no te vendemos nada.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* REGIONES */}
      <section
        id="regiones"
        className="bg-ink text-snow py-24 lg:py-32 px-6 relative overflow-hidden grain"
      >
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex items-end justify-between mb-12 flex-wrap gap-6">
            <div>
              <p className="text-mustard text-sm tracking-[0.2em] uppercase font-semibold mb-4">
                Explorá por región
              </p>
              <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] max-w-2xl">
                Del Uco a Cafayate,
                <br />
                pasando por Río Negro.
              </h2>
            </div>
            <a href="/buscar" className="chip !bg-snow/10">
              Ver todas las regiones →
            </a>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/buscar?region=valle-de-uco"
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #1E3FBF 0%, #4D79E8 50%, #D97449 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 70 L40 40 L70 55 L110 30 L140 50 L180 35 L200 55 L200 100 L0 100 Z"
                  fill="#0F1E4D"
                  opacity="0.7"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-snow/70 tracking-widest uppercase">
                  Mendoza
                </span>
                <div>
                  <div className="display text-2xl font-semibold">
                    Valle de Uco
                  </div>
                  <div className="text-snow/70 text-sm mt-1">4.123 vinos</div>
                </div>
              </div>
            </a>

            <a
              href="/buscar?region=lujan"
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #4D79E8 0%, #E8859E 55%, #E8B547 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 75 L50 50 L90 65 L130 45 L170 60 L200 50 L200 100 L0 100 Z"
                  fill="#0F1E4D"
                  opacity="0.7"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-snow/70 tracking-widest uppercase">
                  Mendoza
                </span>
                <div>
                  <div className="display text-2xl font-semibold">
                    Luján de Cuyo
                  </div>
                  <div className="text-snow/70 text-sm mt-1">3.847 vinos</div>
                </div>
              </div>
            </a>

            <a
              href="/buscar?region=cafayate"
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #D97449 0%, #E8B547 50%, #F5EDE0 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 60 L30 30 L70 50 L110 25 L150 45 L180 30 L200 50 L200 100 L0 100 Z"
                  fill="#6B1E2E"
                  opacity="0.75"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-ink/70 tracking-widest uppercase">
                  Salta
                </span>
                <div>
                  <div className="display text-2xl font-semibold text-ink">
                    Cafayate
                  </div>
                  <div className="text-ink/70 text-sm mt-1">847 vinos</div>
                </div>
              </div>
            </a>

            <a
              href="/buscar?region=patagonia"
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-snow/10"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #0F1E4D 0%, #1E3FBF 55%, #7C8FD9 100%)",
                }}
              />
              <svg
                className="absolute bottom-0 w-full"
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 58 L40 32 L80 44 L130 22 L170 38 L200 42 L200 100 L0 100 Z"
                  fill="#0F1E4D"
                  opacity="0.85"
                />
                <path
                  d="M40 32 L52 46 L28 46 Z M130 22 L143 38 L117 38 Z M170 38 L180 48 L160 48 Z"
                  fill="#F5EDE0"
                  opacity="0.9"
                />
              </svg>
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs text-snow/70 tracking-widest uppercase">
                  Río Negro
                </span>
                <div>
                  <div className="display text-2xl font-semibold">
                    Patagonia
                  </div>
                  <div className="text-snow/70 text-sm mt-1">612 vinos</div>
                </div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* BODEGAS */}
      <section id="bodegas" className="py-24 lg:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-12">
            <p className="text-cobalt text-sm tracking-[0.2em] uppercase font-semibold mb-4">
              Bodegas más buscadas
            </p>
            <h2 className="display text-4xl md:text-5xl lg:text-6xl font-semibold text-ink leading-[1.05]">
              Las que siempre rinden.
            </h2>
          </div>

          {brands.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {brands.map((b) => (
                <a
                  key={b.name}
                  href={`/bodega/${brandSlug(b.name)}`}
                  className="postcard p-5 text-center"
                >
                  <div className="display text-xl font-semibold line-clamp-2 min-h-[2.5em] flex items-center justify-center">
                    {b.name}
                  </div>
                  <div className="text-graphite text-xs mt-1">
                    {b.count} vino{b.count === 1 ? "" : "s"} ·{" "}
                    {b.storeCount} vinoteca{b.storeCount === 1 ? "" : "s"}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-graphite">
              Todavía no sincronizamos marcas suficientes.
            </p>
          )}
        </div>
      </section>

      {/* DESCUBRÍ — varietals + regiones */}
      <section className="py-16 lg:py-24 px-6 bg-snow/50 border-y border-ink/10">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-10">
            <p className="text-cobalt text-sm tracking-[0.2em] uppercase font-semibold mb-3">
              Descubrí
            </p>
            <h2 className="display text-3xl md:text-4xl lg:text-5xl font-semibold text-ink leading-[1.05]">
              Elegí por dónde arrancar.
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-10">
            {varietals.length > 0 && (
              <div>
                <h3 className="display text-xl font-semibold text-ink mb-5">
                  Por varietal
                </h3>
                <div className="flex flex-wrap gap-2">
                  {varietals.map((v) => (
                    <a
                      key={v.slug}
                      href={`/varietal/${v.slug}`}
                      className="inline-flex items-center gap-2 bg-white border border-ink/10 hover:border-cobalt rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors"
                    >
                      {v.name}
                      <span className="text-xs text-graphite">
                        {v.groupCount}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {regions.length > 0 && (
              <div>
                <h3 className="display text-xl font-semibold text-ink mb-5">
                  Por región
                </h3>
                <div className="flex flex-wrap gap-2">
                  {regions.map((r) => (
                    <a
                      key={r.slug}
                      href={`/region/${r.slug}`}
                      className="inline-flex items-center gap-2 bg-white border border-ink/10 hover:border-malbec rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors"
                    >
                      {r.name}
                      <span className="text-xs text-graphite">
                        {r.groupCount}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-6 pb-24">
        <div
          className="max-w-5xl mx-auto relative rounded-3xl overflow-hidden grain"
          style={{
            background:
              "linear-gradient(135deg, #6B1E2E 0%, #D63A7A 55%, #D97449 100%)",
          }}
        >
          <div className="relative z-10 p-10 md:p-16 text-snow">
            <div className="max-w-2xl">
              <h2 className="display text-4xl md:text-5xl font-semibold leading-[1.05] mb-5">
                ¿Un vino específico en mente?
              </h2>
              <p className="text-snow/90 text-lg mb-8">
                Escribilo y en segundos tenés todos los lugares donde
                conseguirlo, del más barato al más caro.
              </p>
              <form
                action="/buscar"
                className="flex flex-col sm:flex-row gap-3 max-w-xl"
              >
                <SearchInput
                  placeholder="Ej: Luigi Bosca Reserva Malbec"
                  className="flex-1 bg-snow/15 backdrop-blur border border-snow/25 rounded-full px-6 py-3.5 text-snow placeholder:text-snow/60 outline-none focus:border-snow/60"
                />
                <button className="cursor-wine bg-snow text-malbec font-semibold px-8 py-3.5 rounded-full hover:bg-mustard transition-colors">
                  Buscar
                </button>
              </form>
            </div>
          </div>
          <svg
            className="absolute right-0 bottom-0 opacity-25"
            width="260"
            height="260"
            viewBox="0 0 200 200"
          >
            <circle cx="60" cy="60" r="10" fill="#0F1729" />
            <circle cx="80" cy="70" r="10" fill="#0F1729" />
            <circle cx="100" cy="60" r="10" fill="#0F1729" />
            <circle cx="70" cy="90" r="10" fill="#0F1729" />
            <circle cx="90" cy="95" r="10" fill="#0F1729" />
            <circle cx="110" cy="85" r="10" fill="#0F1729" />
            <circle cx="80" cy="115" r="10" fill="#0F1729" />
            <circle cx="100" cy="120" r="10" fill="#0F1729" />
            <path
              d="M90 30 Q 110 50 95 70"
              stroke="#0F1729"
              strokeWidth="3"
              fill="none"
            />
          </svg>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-ink text-snow/80 px-6 py-16 relative grain">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
                    fill="#F5EDE0"
                    stroke="#F5EDE0"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="24" cy="8" r="3" fill="#E8B547" />
                </svg>
                <span className="display text-xl font-semibold text-snow">
                  Vinndex
                </span>
              </div>
              <p className="max-w-md text-sm leading-relaxed">
                Comparador independiente de precios de vinos online en
                Argentina. No vendemos vino — te ayudamos a comprarlo al mejor
                precio.
              </p>
              <p className="text-xs text-snow/50 mt-4">
                Precios relevados 1 vez por día. Confirmá en la vinoteca antes
                de comprar.
              </p>
            </div>
            <div>
              <h4 className="display text-snow font-semibold mb-4">Explorar</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="/buscar?varietal=malbec"
                    className="hover:text-snow"
                  >
                    Malbec
                  </a>
                </li>
                <li>
                  <a
                    href="/buscar?varietal=cabernet"
                    className="hover:text-snow"
                  >
                    Cabernet Sauvignon
                  </a>
                </li>
                <li>
                  <a
                    href="/buscar?varietal=chardonnay"
                    className="hover:text-snow"
                  >
                    Chardonnay
                  </a>
                </li>
                <li>
                  <a
                    href="/buscar?varietal=espumante"
                    className="hover:text-snow"
                  >
                    Espumantes
                  </a>
                </li>
                <li>
                  <a
                    href="/buscar?region=valle-de-uco"
                    className="hover:text-snow"
                  >
                    Valle de Uco
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="display text-snow font-semibold mb-4">Vinndex</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/sobre" className="hover:text-snow">
                    Sobre el proyecto
                  </a>
                </li>
                <li>
                  <a href="/como-funciona" className="hover:text-snow">
                    Cómo funciona
                  </a>
                </li>
                <li>
                  <a href="/sumate" className="hover:text-snow">
                    Sos vinoteca? Sumate
                  </a>
                </li>
                <li>
                  <a href="/opt-out" className="hover:text-snow">
                    Pedir opt-out
                  </a>
                </li>
                <li>
                  <a href="/contacto" className="hover:text-snow">
                    Contacto
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-snow/10 pt-6 text-xs text-snow/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
            <p>© 2026 Vinndex · Hecho en Argentina</p>
            <p>
              Beber con moderación · Prohibida la venta de bebidas alcohólicas a
              menores de 18 años
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
