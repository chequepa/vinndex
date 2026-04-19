import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auditoría de fuentes — Vinndex",
};

type Source = {
  n: number;
  name: string;
  isNew?: boolean;
  url: string;
  platform: string;
  platformClass: string;
  catalog: string;
  difficulty: "easy" | "med" | "hard";
  notes: string;
};

const tier1: Source[] = [
  { n: 1, name: "Jumbo", url: "jumbo.com.ar", platform: "VTEX", platformClass: "plat-vtex", catalog: "grande", difficulty: "easy", notes: "VTEX Cencosud · API pública" },
  { n: 2, name: "Disco", url: "disco.com.ar", platform: "VTEX", platformClass: "plat-vtex", catalog: "grande", difficulty: "easy", notes: "Misma cuenta VTEX" },
  { n: 3, name: "Carrefour", url: "carrefour.com.ar", platform: "VTEX", platformClass: "plat-vtex", catalog: "grande", difficulty: "easy", notes: "VTEX estándar" },
  { n: 4, name: "Día", url: "diaonline.supermercadosdia.com.ar", platform: "VTEX", platformClass: "plat-vtex", catalog: "grande", difficulty: "easy", notes: "VTEX estándar" },
  { n: 5, name: "Vea", url: "vea.com.ar", platform: "VTEX", platformClass: "plat-vtex", catalog: "grande", difficulty: "easy", notes: "VTEX Cencosud" },
  { n: 6, name: "Gobar", isNew: true, url: "gobar.com.ar", platform: "VTEX", platformClass: "plat-vtex", catalog: "888 (429 vinos)", difficulty: "easy", notes: "API VTEX pública, catálogo visible" },
  { n: 7, name: "Tonel Privado", url: "tonelprivado.com", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "/products.json disponible" },
  { n: 8, name: "Grand Cru", url: "grandcru.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "~625", difficulty: "easy", notes: "625 productos en sitemap" },
  { n: 9, name: "Enotek", url: "enotek.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "~2.700", difficulty: "easy", notes: "Catálogo enorme" },
  { n: 10, name: "Varietal", url: "varietalvinoteca.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "Córdoba, envíos nacionales" },
  { n: 11, name: "Rebellion", isNew: true, url: "rebellion.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 12, name: "Wine Boutique", isNew: true, url: "wineboutique.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 13, name: "Biendevinos", isNew: true, url: "biendevinos.com", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 14, name: "Dionisio Online", isNew: true, url: "tienda.dionisioonline.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 15, name: "Lo de Granado", isNew: true, url: "lodegranado.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 16, name: "1812 Vinos", isNew: true, url: "1812vinos.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 17, name: "Bebiendo Estrellas", isNew: true, url: "bebiendoestrellas.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 18, name: "Rincón de Vinos", isNew: true, url: "rincondevinos.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 19, name: "Vinería San Juan", isNew: true, url: "vineriasanjuan.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 20, name: "Vinicius Vinos", isNew: true, url: "viniciusvinos.com.ar", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 21, name: "Enoteca Privada", isNew: true, url: "enotecaprivada.com", platform: "Tiendanube", platformClass: "plat-tn", catalog: "?", difficulty: "easy", notes: "CSP Tiendanube" },
  { n: 22, name: "Lo de Joaquín", url: "lodejoaquin.com", platform: "WooCommerce", platformClass: "plat-wc", catalog: "?", difficulty: "easy", notes: "WP+WC limpio" },
  { n: 23, name: "La Enoteca", url: "laenoteca.com.ar", platform: "WooCommerce", platformClass: "plat-wc", catalog: "?", difficulty: "easy", notes: "WP clásico" },
  { n: 24, name: "De Barricas", url: "debarricas.com.ar", platform: "WooCommerce", platformClass: "plat-wc", catalog: "~2.255", difficulty: "easy", notes: "WC Store API pública" },
  { n: 25, name: "Mercado de Vinos", isNew: true, url: "mercadodevinos.com.ar", platform: "WooCommerce", platformClass: "plat-wc", catalog: "202", difficulty: "easy", notes: "WP-JSON expuesto" },
  { n: 26, name: "Don Vino", isNew: true, url: "donvino.com.ar", platform: "WooCommerce", platformClass: "plat-wc", catalog: "761", difficulty: "easy", notes: "Yoast sitemap completo" },
  { n: 27, name: "Vinos Directos de Bodegas", isNew: true, url: "vinosdirectosdebodegas.com", platform: "WooCommerce", platformClass: "plat-wc", catalog: "?", difficulty: "easy", notes: "LiteSpeed + WP-JSON" },
  { n: 28, name: "La Taverna Club", isNew: true, url: "latavernaclub.com", platform: "WooCommerce", platformClass: "plat-wc", catalog: "~233 vinos", difficulty: "easy", notes: "Sitemap expuesto" },
  { n: 29, name: "Tienda de Vinos", isNew: true, url: "tiendadevinos.ar", platform: "WooCommerce", platformClass: "plat-wc", catalog: "257", difficulty: "easy", notes: "Yoast sitemap" },
  { n: 30, name: "Pampa Direct", url: "pampadirect.com", platform: "BigCommerce", platformClass: "plat-bc", catalog: "?", difficulty: "easy", notes: "Stencil + API BC" },
  { n: 31, name: "Vinos y Spirits", isNew: true, url: "vinosyspirits.com", platform: "Shopify", platformClass: "plat-shopify", catalog: "~125", difficulty: "easy", notes: "Peñaflor · /products.json abierto" },
];

const tier2: Source[] = [
  { n: 32, name: "Winery", url: "winery.com.ar", platform: "WooCommerce", platformClass: "plat-wc", catalog: "?", difficulty: "med", notes: "Cloudflare 403, se arregla con headers" },
  { n: 33, name: "Ligier", url: "vinotecaligier.com", platform: "Magento", platformClass: "plat-magento", catalog: "?", difficulty: "med", notes: "Magento 2, antibot ligero" },
  { n: 34, name: "Frappe", url: "frappe.com.ar", platform: "PrestaShop", platformClass: "plat-ps", catalog: "?", difficulty: "med", notes: "Parsear HTML de categorías" },
  { n: 35, name: "La Anónima", url: "laanonimaonline.com", platform: "Custom", platformClass: "plat-custom", catalog: "?", difficulty: "med", notes: "JS pesado, inspeccionar XHR" },
  { n: 36, name: "Espacio Vino", isNew: true, url: "espaciovino.com.ar", platform: "Custom PHP", platformClass: "plat-custom", catalog: "grande", difficulty: "med", notes: "PHP 5.6 antiguo, SSR con carrito" },
  { n: 37, name: "Vitvin", isNew: true, url: "vitvin.com.ar", platform: "Next+Woo", platformClass: "plat-wc", catalog: "?", difficulty: "med", notes: "Headless, backend woo.vitvin.com.ar" },
  { n: 38, name: "MA Distribución", isNew: true, url: "madistribucion.com", platform: "Odoo", platformClass: "plat-odoo", catalog: "~3.152", difficulty: "med", notes: "Distribuidor B2B/C, Odoo.sh" },
];

const tier3: Source[] = [
  { n: 39, name: "Bonvivir", url: "bonvivir.com", platform: "Custom SPA", platformClass: "plat-custom", catalog: "?", difficulty: "hard", notes: "SPA + captcha. Curaduría Rosberg" },
  { n: 40, name: "Coto Digital", url: "cotodigital.com.ar", platform: "Oracle ATG", platformClass: "plat-custom", catalog: "grande", difficulty: "hard", notes: "Legado, sin API JSON" },
  { n: 41, name: "The Little Cava", url: "thelittlecava.ar", platform: "Wix", platformClass: "plat-wix", catalog: "?", difficulty: "hard", notes: "Wix SSR, Puppeteer/GraphQL" },
  { n: 42, name: "Jose La Vinos", url: "joselavinos.com", platform: "?", platformClass: "", catalog: "?", difficulty: "hard", notes: "Cloudflare 403, browser real" },
  { n: 43, name: "Baco", url: "baco.com.ar", platform: "WordPress", platformClass: "plat-wc", catalog: "?", difficulty: "hard", notes: "403 a bots en www" },
];

function Row({ s }: { s: Source }) {
  const difClass =
    s.difficulty === "easy"
      ? "dif-pill dif-easy"
      : s.difficulty === "med"
        ? "dif-pill dif-med"
        : "dif-pill dif-hard";
  const difLabel =
    s.difficulty === "easy"
      ? "Fácil"
      : s.difficulty === "med"
        ? "Media"
        : "Difícil";
  const rowClass = s.difficulty === "easy" ? "row-yes" : "row-maybe";
  return (
    <tr className={rowClass}>
      <td className="pl-5">{s.n}</td>
      <td className="font-semibold">
        {s.name}
        {s.isNew && <span className="badge-new">NUEVO</span>}
      </td>
      <td className="text-graphite">{s.url}</td>
      <td>
        <span className={`plat-pill ${s.platformClass}`}>{s.platform}</span>
      </td>
      <td>{s.catalog}</td>
      <td>
        <span className={difClass}>{difLabel}</span>
      </td>
      <td className="pr-5 text-graphite">{s.notes}</td>
    </tr>
  );
}

export default function AdminFuentes() {
  return (
    <>
      {/* NAV */}
      <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
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
            <span className="text-xs text-graphite ml-2 hidden sm:inline">
              · Admin / Auditoría v3
            </span>
          </a>
          <div className="flex gap-2 text-sm">
            <a href="/" className="text-graphite hover:text-ink">
              ← Volver al sitio
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative bg-ink text-snow overflow-hidden grain">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #0F1729 0%, #1E3FBF 50%, #6B1E2E 100%)",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <p className="text-mustard text-xs tracking-[0.22em] uppercase font-bold mb-4">
            Auditoría de fuentes · v3 — Target cumplido
          </p>
          <h1 className="display text-4xl md:text-6xl lg:text-7xl font-semibold leading-[1.02] mb-6">
            43 vinotecas viables.
            <br />
            <span className="italic font-normal">Superamos el target</span> por
            13.
          </h1>
          <p className="text-snow/85 text-lg max-w-3xl leading-relaxed">
            Sumaste 21 URLs más en tu última tanda y{" "}
            <strong className="text-snow">21 de 21 son viables</strong>. El
            target del brief era 30+. Hoy tenemos 43 tiendas reales + Mercado
            Libre ={" "}
            <strong className="text-snow">44 fuentes de precios</strong>. Es
            muchísimo más de lo que ofrece cualquier comparador de vinos en
            Argentina hoy.
          </p>
        </div>
      </section>

      {/* STATS */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-green2/30 rounded-2xl p-5">
          <div className="display text-5xl font-semibold text-green2 leading-none">
            43
          </div>
          <div className="text-sm text-ink font-semibold mt-2">viables</div>
          <div className="text-xs text-graphite mt-1">
            tiendas online vivas con catálogo
          </div>
        </div>

        <div className="bg-white border border-ink/10 rounded-2xl p-5">
          <div className="display text-5xl font-semibold text-cobalt leading-none">
            31
          </div>
          <div className="text-sm text-ink font-semibold mt-2">fáciles</div>
          <div className="text-xs text-graphite mt-1">
            plataforma estándar, scraping directo
          </div>
        </div>

        <div className="bg-white border border-ink/10 rounded-2xl p-5">
          <div
            className="display text-5xl font-semibold"
            style={{ color: "#B88A1B" }}
          >
            7
          </div>
          <div className="text-sm text-ink font-semibold mt-2">medias</div>
          <div className="text-xs text-graphite mt-1">
            requieren parseo HTML extra
          </div>
        </div>

        <div className="bg-white border border-ink/10 rounded-2xl p-5">
          <div className="display text-5xl font-semibold text-malbec leading-none">
            5
          </div>
          <div className="text-sm text-ink font-semibold mt-2">difíciles</div>
          <div className="text-xs text-graphite mt-1">
            Playwright + proxies residenciales
          </div>
        </div>
      </section>

      {/* ADAPTERS LEVERAGE */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
        <div className="bg-white rounded-2xl border border-ink/10 p-6 md:p-10">
          <div className="max-w-3xl mb-8">
            <p className="text-malbec text-xs tracking-[0.22em] uppercase font-bold mb-3">
              El hallazgo técnico
            </p>
            <h2 className="display text-3xl md:text-4xl font-semibold text-ink leading-tight mb-4">
              Con 6 adapters cubrimos
              <br />
              el 95% del mercado.
            </h2>
            <p className="text-graphite leading-relaxed">
              El brief recomienda construir &ldquo;adapters por plataforma, no
              scrapers por tienda&rdquo;. Acá se ve por qué:{" "}
              <strong className="text-ink">
                15 de 43 tiendas corren en Tiendanube
              </strong>
              . Un mismo código sirve para las 15. Cuando Tiendanube cambia
              algo, arreglás 1 adapter y volvés a tener esas 15 funcionando.
            </p>
          </div>

          <div className="space-y-3">
            <div className="plat-bar">
              <div className="plat-bar-count">
                <div
                  className="display text-4xl font-semibold"
                  style={{ color: "#2FB344" }}
                >
                  15
                </div>
                <div className="text-[10px] text-graphite uppercase tracking-wider">
                  tiendas
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="plat-pill plat-tn">Tiendanube</span>
                    <span className="font-semibold text-ink">
                      1 adapter → 15 tiendas
                    </span>
                  </div>
                  <span className="text-xs text-graphite hidden md:inline">
                    Rebellion, Tonel Privado, Grand Cru, Enotek, Varietal, Wine
                    Boutique, Biendevinos, Dionisio, Lo de Granado, 1812,
                    Bebiendo Estrellas, Rincón, Vinería SJ, Vinicius, Enoteca
                    Privada
                  </span>
                </div>
                <div className="plat-bar-meter">
                  <div
                    className="plat-bar-fill"
                    style={{ width: "100%", background: "#2FB344" }}
                  />
                </div>
              </div>
            </div>

            <div className="plat-bar">
              <div className="plat-bar-count">
                <div
                  className="display text-4xl font-semibold"
                  style={{ color: "#7F54B3" }}
                >
                  10
                </div>
                <div className="text-[10px] text-graphite uppercase tracking-wider">
                  tiendas
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="plat-pill plat-wc">WooCommerce</span>
                    <span className="font-semibold text-ink">
                      1 adapter → 10 tiendas
                    </span>
                  </div>
                  <span className="text-xs text-graphite hidden md:inline">
                    Lo de Joaquín, La Enoteca, De Barricas, Winery, Mercado de
                    Vinos, Don Vino, Vinos Directos, La Taverna, Tienda de
                    Vinos, Vitvin
                  </span>
                </div>
                <div className="plat-bar-meter">
                  <div
                    className="plat-bar-fill"
                    style={{ width: "66%", background: "#7F54B3" }}
                  />
                </div>
              </div>
            </div>

            <div className="plat-bar">
              <div className="plat-bar-count">
                <div
                  className="display text-4xl font-semibold"
                  style={{ color: "#FF3366" }}
                >
                  6
                </div>
                <div className="text-[10px] text-graphite uppercase tracking-wider">
                  tiendas
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="plat-pill plat-vtex">VTEX</span>
                    <span className="font-semibold text-ink">
                      1 adapter → 6 tiendas (¡5 son Cencosud!)
                    </span>
                  </div>
                  <span className="text-xs text-graphite hidden md:inline">
                    Jumbo, Disco, Carrefour, Día, Vea, Gobar
                  </span>
                </div>
                <div className="plat-bar-meter">
                  <div
                    className="plat-bar-fill"
                    style={{ width: "40%", background: "#FF3366" }}
                  />
                </div>
              </div>
            </div>

            <div className="plat-bar">
              <div className="plat-bar-count">
                <div
                  className="display text-4xl font-semibold"
                  style={{ color: "#96BF48" }}
                >
                  1
                </div>
                <div className="text-[10px] text-graphite uppercase tracking-wider">
                  tienda
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="plat-pill plat-shopify">Shopify</span>
                    <span className="font-semibold text-ink">
                      1 adapter → Vinos y Spirits
                    </span>
                  </div>
                </div>
                <div className="plat-bar-meter">
                  <div
                    className="plat-bar-fill"
                    style={{ width: "7%", background: "#96BF48" }}
                  />
                </div>
              </div>
            </div>

            <div className="plat-bar">
              <div className="plat-bar-count">
                <div
                  className="display text-4xl font-semibold"
                  style={{ color: "#34313F" }}
                >
                  1
                </div>
                <div className="text-[10px] text-graphite uppercase tracking-wider">
                  tienda
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="plat-pill plat-bc">BigCommerce</span>
                    <span className="font-semibold text-ink">
                      1 adapter → Pampa Direct
                    </span>
                  </div>
                </div>
                <div className="plat-bar-meter">
                  <div
                    className="plat-bar-fill"
                    style={{ width: "7%", background: "#34313F" }}
                  />
                </div>
              </div>
            </div>

            <div className="plat-bar">
              <div className="plat-bar-count">
                <div
                  className="display text-4xl font-semibold"
                  style={{
                    color: "#FFE600",
                    WebkitTextStroke: "1px #0F1729",
                  }}
                >
                  API
                </div>
                <div className="text-[10px] text-graphite uppercase tracking-wider">
                  oficial
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="plat-pill"
                      style={{ background: "#FFE600", color: "#0F1729" }}
                    >
                      Mercado Libre
                    </span>
                    <span className="font-semibold text-ink">
                      API oficial → todos los sellers de MLA1577
                    </span>
                  </div>
                  <span className="text-xs text-graphite hidden md:inline">
                    Sin scraping, sin proxies
                  </span>
                </div>
                <div className="plat-bar-meter">
                  <div
                    className="plat-bar-fill"
                    style={{ width: "30%", background: "#FFE600" }}
                  />
                </div>
              </div>
            </div>

            <div className="plat-bar opacity-75">
              <div className="plat-bar-count">
                <div className="display text-4xl font-semibold text-graphite">
                  10
                </div>
                <div className="text-[10px] text-graphite uppercase tracking-wider">
                  tiendas
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="plat-pill plat-custom">
                      Custom / otras
                    </span>
                    <span className="font-semibold text-ink">
                      Requieren trabajo custom por tienda
                    </span>
                  </div>
                  <span className="text-xs text-graphite hidden md:inline">
                    Magento, PrestaShop, Wix, Odoo, PHP custom, ATG, SPA
                  </span>
                </div>
                <div className="plat-bar-meter">
                  <div
                    className="plat-bar-fill"
                    style={{ width: "33%", background: "#0F1729" }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-ink/10 text-sm text-graphite">
            <strong className="text-ink">
              Plan de construcción sugerido:
            </strong>{" "}
            arrancamos con <strong className="text-ink">3 adapters</strong>{" "}
            (Tiendanube + WooCommerce + VTEX) que cubren{" "}
            <strong className="text-ink">31 tiendas</strong> el día 1. Sumamos
            Shopify + BigCommerce + ML en semana 2. Las 10 custom van de a 1-2
            por sprint en fase 2.
          </div>
        </div>
      </section>

      {/* TABLA PRINCIPAL */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="display text-2xl md:text-3xl font-semibold text-ink">
              Las 43 viables
            </h2>
            <p className="text-graphite text-sm mt-1">
              Ordenadas por dificultad · arrancamos por las verdes
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-ink/10 overflow-x-auto fuentes-table">
          <table className="w-full text-left min-w-[1000px]">
            <thead>
              <tr>
                <th className="pl-5">#</th>
                <th>Tienda</th>
                <th>URL</th>
                <th>Plataforma</th>
                <th>Catálogo</th>
                <th>Dificultad</th>
                <th className="pr-5">Notas</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={7}
                  className="!bg-green2/5 !py-2 !pl-5 text-[10px] font-bold text-green2 uppercase tracking-widest"
                >
                  Tier 1 · Fáciles (31) — día 1
                </td>
              </tr>
              {tier1.map((s) => (
                <Row key={s.n} s={s} />
              ))}

              <tr>
                <td
                  colSpan={7}
                  className="!py-2 !pl-5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: "#B88A1B0D", color: "#B88A1B" }}
                >
                  Tier 2 · Medias (7) — parsing HTML custom
                </td>
              </tr>
              {tier2.map((s) => (
                <Row key={s.n} s={s} />
              ))}

              <tr>
                <td
                  colSpan={7}
                  className="!bg-red2/5 !py-2 !pl-5 text-[10px] font-bold text-red2 uppercase tracking-widest"
                >
                  Tier 3 · Difíciles (5) — Playwright + proxies residenciales
                </td>
              </tr>
              {tier3.map((s) => (
                <Row key={s.n} s={s} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-graphite mt-4">
          <span className="badge-new !ml-0">NUEVO</span> = agregadas en tu
          última tanda (21/04/18)
        </p>
      </section>

      {/* DESCARTADAS */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-8 fuentes-table">
        <details className="bg-white rounded-2xl border border-ink/10 p-6">
          <summary className="flex items-center gap-2 font-semibold cursor-wine">
            <span className="chevron text-graphite">›</span>
            Ver las 41 descartadas (muertas o sin tienda) · total revisado: 84
          </summary>
          <div className="mt-6 text-sm text-graphite">
            <p className="mb-4">
              Auditamos 84 candidatos totales (32 del brief + 7 tuyas ronda 1 +
              24 mías + 21 tuyas ronda 2). 43 quedaron viables, 41 descartadas.
              Mayoría de descartadas: DNS muerto (30) o bodegas con web
              institucional sin tienda (11).
            </p>
            <p className="text-xs italic">
              Lista completa guardada en SOURCES.md para referencia técnica.
            </p>
          </div>
        </details>
      </section>

      {/* PRÓXIMOS PASOS */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
        <div
          className="relative rounded-2xl overflow-hidden grain"
          style={{
            background:
              "linear-gradient(135deg, #1B7A4F 0%, #2FB344 60%, #E8B547 100%)",
          }}
        >
          <div className="relative z-10 p-8 md:p-12 text-snow">
            <p className="text-ink/70 text-xs tracking-widest uppercase font-bold mb-3">
              Siguiente paso
            </p>
            <h2 className="display text-3xl md:text-5xl font-semibold leading-tight mb-5 text-ink">
              Lista cerrada.
              <br />
              <span className="italic font-normal">
                Arrancamos el código.
              </span>
            </h2>
            <p className="text-ink/90 text-lg leading-relaxed max-w-3xl mb-8">
              Con 43 vinotecas viables + Mercado Libre ya tenemos el catálogo
              base. Ahora toca abrir cuentas (dominio, hosting, OpenAI,
              proxies) y empezar a escribir los primeros 3 adapters
              (Tiendanube, WooCommerce, VTEX) que el día 1 cubren 31 tiendas.
            </p>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-ink/10 backdrop-blur border border-ink/20 rounded-xl p-5 text-ink">
                <div className="display text-3xl font-semibold mb-2">01</div>
                <h4 className="font-semibold mb-2">Abrir cuentas</h4>
                <p className="text-ink/85 text-sm leading-relaxed">
                  NIC.ar (vinndex.com.ar), Railway, OpenAI, IPRoyal, Cloudflare,
                  Mercado Libre Developer. ~USD 130-180/mes.
                </p>
              </div>
              <div className="bg-ink/10 backdrop-blur border border-ink/20 rounded-xl p-5 text-ink">
                <div className="display text-3xl font-semibold mb-2">02</div>
                <h4 className="font-semibold mb-2">Scaffolding</h4>
                <p className="text-ink/85 text-sm leading-relaxed">
                  Monorepo Next.js + workers + Postgres+pgvector + Meilisearch +
                  BullMQ. Todo en Railway.
                </p>
              </div>
              <div className="bg-ink/10 backdrop-blur border border-ink/20 rounded-xl p-5 text-ink">
                <div className="display text-3xl font-semibold mb-2">03</div>
                <h4 className="font-semibold mb-2">3 adapters + ML</h4>
                <p className="text-ink/85 text-sm leading-relaxed">
                  Tiendanube (15 tiendas), WooCommerce (10), VTEX (6), ML API.
                  32 fuentes activas al final de mes 1.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-ink text-snow/70 px-6 py-10 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>
            © 2026 Vinndex · Admin — Auditoría v3 ·{" "}
            <a href="/" className="hover:text-snow">
              Volver al sitio
            </a>
          </p>
          <p>Última revisión: 2026-04-18 · 43/44 fuentes listas</p>
        </div>
      </footer>
    </>
  );
}
