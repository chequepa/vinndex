import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "API pública para desarrolladores · Vinndex",
  description:
    "API REST pública de Vinndex: vinos, búsqueda, vinotecas, rankings, price drops. Sin auth, CORS abierto, JSON, cache 5min. Para agentes IA, apps y scripts.",
  keywords: [
    "vinndex api",
    "api vinos argentina",
    "wine api argentina",
    "comparador vinos api",
  ],
  alternates: { canonical: "https://vinndex.com.ar/developers" },
};

type Endpoint = {
  method: "GET";
  path: string;
  desc: string;
  example?: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/wine/{slug}",
    desc: "Info completa de un vino + offers de cada vinoteca + scores de críticos.",
    example: "/api/v1/wine/felicien-malbec-saint",
  },
  {
    method: "GET",
    path: "/api/v1/search?q={query}",
    desc: "Búsqueda de vinos con filtros (varietal, region, type, multi, instock, priceMin, priceMax, sort, limit).",
    example: "/api/v1/search?q=malbec&priceMax=10000&sort=score-desc&limit=10",
  },
  {
    method: "GET",
    path: "/api/v1/stores",
    desc: "Lista de las vinotecas relevadas con su slug, nombre y productCount.",
    example: "/api/v1/stores",
  },
  {
    method: "GET",
    path: "/api/v1/rankings",
    desc: "Lista de rankings disponibles (top-malbecs-baratos, top-espumantes, etc.).",
    example: "/api/v1/rankings",
  },
  {
    method: "GET",
    path: "/api/v1/rankings/{slug}",
    desc: "Items de un ranking específico, ordenados.",
    example: "/api/v1/rankings/top-malbecs-baratos",
  },
  {
    method: "GET",
    path: "/api/price-drops",
    desc: "Lista de price drops del día. Mismo data que la sección 'Bajaron de precio' de la home.",
    example: "/api/price-drops",
  },
];

export default function DevelopersPage() {
  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-4">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Developers</span>
          </div>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-4">
            API pública
          </h1>
          <p className="text-graphite text-base md:text-lg leading-relaxed max-w-3xl">
            Vinndex expone una API REST de sólo lectura sobre el catálogo de
            vinos argentinos. Sin auth, sin rate limit estricto, CORS abierto.
            Pensada para agentes IA, apps de delivery, scripts personales,
            integraciones con Slack/Telegram, lo que se te ocurra.
          </p>
        </div>
      </section>

      <main
        id="contenido"
        className="max-w-4xl mx-auto px-4 lg:px-8 py-10 lg:py-14 space-y-12"
      >
        {/* Quick start */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-3">
            Quick start
          </h2>
          <pre className="bg-ink text-snow text-xs md:text-sm rounded-2xl p-4 overflow-x-auto">
            {`curl https://vinndex.com.ar/api/v1/search?q=malbec | jq`}
          </pre>
        </section>

        {/* Endpoints */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Endpoints
          </h2>
          <ul className="space-y-4">
            {ENDPOINTS.map((e) => (
              <li
                key={e.path}
                className="bg-white border border-ink/10 rounded-2xl p-4 md:p-5"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="bg-mustard/25 text-ink text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                    {e.method}
                  </span>
                  <code className="text-sm font-mono text-ink">{e.path}</code>
                </div>
                <p className="text-sm text-graphite leading-relaxed mb-3">
                  {e.desc}
                </p>
                {e.example && (
                  <a
                    href={e.example}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cobalt hover:underline font-mono break-all"
                  >
                    GET {e.example} ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Common patterns */}
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Casos de uso
          </h2>
          <div className="space-y-6 text-sm">
            <div>
              <h3 className="display text-base font-semibold text-ink mb-2">
                Buscar Malbec barato con stock
              </h3>
              <pre className="bg-ink text-snow text-xs rounded-xl p-3 overflow-x-auto">
                {`GET /api/v1/search?q=malbec&priceMax=10000&instock=1&sort=price-asc`}
              </pre>
            </div>
            <div>
              <h3 className="display text-base font-semibold text-ink mb-2">
                Pedirle a un agente IA el mejor precio de un vino específico
              </h3>
              <pre className="bg-ink text-snow text-xs rounded-xl p-3 overflow-x-auto">
                {`GET /api/v1/wine/felicien-malbec-saint
# Devuelve el array offers[] con cada precio + storeName + url`}
              </pre>
            </div>
            <div>
              <h3 className="display text-base font-semibold text-ink mb-2">
                Listar todos los price drops del día
              </h3>
              <pre className="bg-ink text-snow text-xs rounded-xl p-3 overflow-x-auto">
                {`GET /api/price-drops
# Devuelve top 50 drops con dropPct y medianPrice7d`}
              </pre>
            </div>
            <div>
              <h3 className="display text-base font-semibold text-ink mb-2">
                Top espumantes según el ranking curado
              </h3>
              <pre className="bg-ink text-snow text-xs rounded-xl p-3 overflow-x-auto">
                {`GET /api/v1/rankings/top-espumantes`}
              </pre>
            </div>
          </div>
        </section>

        {/* Política */}
        <section className="bg-snow rounded-2xl p-6 lg:p-8">
          <h2 className="display text-lg font-semibold text-ink mb-3">
            Política de uso
          </h2>
          <ul className="space-y-2 text-sm text-graphite leading-relaxed">
            <li>
              · <strong>Sin auth, sin rate limit estricto</strong>. Pedimos
              que seas razonable · cache local cuando puedas, respetá los
              headers de <code>cache-control</code> que mandamos (5 min en
              cliente / 15 min en edge).
            </li>
            <li>
              · <strong>CORS abierto</strong>:{" "}
              <code>access-control-allow-origin: *</code>. Podés llamarla
              directamente desde el browser sin proxy.
            </li>
            <li>
              · <strong>Datos actualizados a diario</strong> con el snapshot
              de las 03:00 ART. Si tu app necesita stock real-time, llamá a
              la tienda directamente con el <code>url</code> que devolvemos
              en <code>offers[]</code>.
            </li>
            <li>
              · <strong>Atribución</strong>: si lo usás en producción,
              ponele un &ldquo;Datos de Vinndex&rdquo; con link a{" "}
              <Link href="/" className="text-cobalt underline">
                vinndex.com.ar
              </Link>
              . No es obligatorio pero ayuda.
            </li>
            <li>
              · <strong>Sin garantías</strong>. La API es free como cortesía
              al ecosistema. Si necesitás SLA, hablemos por{" "}
              <Link href="/contacto" className="text-cobalt underline">
                contacto
              </Link>
              .
            </li>
          </ul>
        </section>

        {/* Cambios y feedback */}
        <section className="text-sm text-graphite border-t border-ink/10 pt-6">
          <p className="mb-2">
            Versión: <code className="bg-snow px-1.5 py-0.5 rounded">v1</code>{" "}
            · Si rompemos compat haremos <code>v2</code> sin afectar v1
            durante un período razonable (≥3 meses).
          </p>
          <p>
            Encontrás un bug, te falta un endpoint o querés cambiar el shape
            de algo →{" "}
            <Link href="/contacto" className="text-cobalt underline">
              contacto
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
