import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { snapshotStats } from "@/lib/snapshot";

export const metadata: Metadata = {
  title: "Sobre Vinndex — Comparador de precios de vinos en Argentina",
  description:
    "Qué es Vinndex, por qué lo hacemos, cómo se sostiene y quién está detrás. Un comparador de precios de vinos online de Argentina, sin comisiones, hecho con transparencia.",
  alternates: { canonical: "https://vinndex.com.ar/sobre" },
};

export default function SobrePage() {
  const stats = snapshotStats();
  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <a href="/" className="hover:text-ink">
              Inicio
            </a>
            <span>/</span>
            <span>Sobre</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Sobre Vinndex
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            Un comparador de precios de vinos online de Argentina. Sin
            comisiones, sin pop-ups, sin listas patrocinadas. Vas a la vinoteca
            que te convenga y listo.
          </p>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16 space-y-12">
        <section>
          <h2 className="display text-3xl font-semibold text-ink mb-4">
            Por qué existe
          </h2>
          <p className="text-ink/80 leading-relaxed mb-4">
            En Argentina hay decenas de vinotecas online con precios muy
            distintos para el mismo vino. Una botella de Zuccardi Concreto
            Malbec puede salir <strong>$7.800 en una tienda y $26.000 en
            otra</strong>. Nadie tenía una forma simple de comparar todo en un
            solo lugar.
          </p>
          <p className="text-ink/80 leading-relaxed">
            Vinndex lo resuelve: buscás el vino que te interesa y ves todas las
            vinotecas que lo tienen, ordenadas por precio. Tocás la que más te
            guste y vas directo a comprar.
          </p>
        </section>

        <section>
          <h2 className="display text-3xl font-semibold text-ink mb-4">
            Cómo se sostiene
          </h2>
          <p className="text-ink/80 leading-relaxed mb-4">
            Vinndex no cobra comisiones ni tiene acuerdos de exclusividad con
            ninguna vinoteca. Tampoco hay listas patrocinadas: el orden es el
            precio real del vino en cada tienda, y punto.
          </p>
          <p className="text-ink/80 leading-relaxed">
            El costo del servicio (hosting, dominio, APIs) lo banca el creador.
            Si más adelante sumamos ingresos va a ser por vías que no afecten el
            orden de los resultados (ej. publicidad contextual no-intrusiva,
            partnerships transparentes de contenido).
          </p>
        </section>

        <section>
          <h2 className="display text-3xl font-semibold text-ink mb-4">
            Qué hay hoy
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-snow border border-ink/10 rounded-2xl p-5">
              <div className="display text-4xl font-semibold text-cobalt">
                {stats.storeCount}
              </div>
              <div className="text-sm text-ink font-semibold mt-2">
                vinotecas online
              </div>
            </div>
            <div className="bg-snow border border-ink/10 rounded-2xl p-5">
              <div className="display text-4xl font-semibold text-malbec">
                {stats.multiStoreGroupCount.toLocaleString("es-AR")}
              </div>
              <div className="text-sm text-ink font-semibold mt-2">
                vinos comparables
              </div>
            </div>
            <div className="bg-snow border border-ink/10 rounded-2xl p-5">
              <div
                className="display text-4xl font-semibold"
                style={{ color: "#E8B547" }}
              >
                {stats.productCount.toLocaleString("es-AR")}
              </div>
              <div className="text-sm text-ink font-semibold mt-2">
                ofertas sincronizadas
              </div>
            </div>
          </div>
          <p className="text-ink/80 leading-relaxed mt-6">
            Los datos se refrescan todas las noches (hora Argentina). Podés ver
            el estado actual en{" "}
            <a href="/admin/fuentes" className="underline hover:text-cobalt">
              /admin/fuentes
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="display text-3xl font-semibold text-ink mb-4">
            Quién está detrás
          </h2>
          <p className="text-ink/80 leading-relaxed mb-4">
            Vinndex lo construyo yo, Juan, en mi tiempo libre. No soy ingeniero:
            el código lo escribimos con Claude (el asistente de IA de
            Anthropic), en sesiones largas donde yo aporto el contexto del mundo
            del vino argentino y Claude escribe las partes técnicas.
          </p>
          <p className="text-ink/80 leading-relaxed">
            Si algo no funciona, una vinoteca no aparece, o tenés una sugerencia
            concreta, <a href="/contacto" className="underline hover:text-cobalt">escribime</a>.
          </p>
        </section>

        <section className="bg-ink text-snow rounded-2xl p-8 md:p-10">
          <h2 className="display text-2xl font-semibold mb-3">
            Transparencia
          </h2>
          <ul className="space-y-2 text-snow/85 text-sm leading-relaxed">
            <li>
              · Todos los precios que ves son los que publican las vinotecas en
              sus propias tiendas online. Nada es negociado aparte.
            </li>
            <li>
              · Las ofertas con "sin stock" se marcan claramente y no cuentan
              para el "Desde $X" de cada vino.
            </li>
            <li>
              · Cuando tocás "Visitar" vas directo a la tienda: no hay
              redirecciones ni tracking de afiliado.
            </li>
            <li>
              · Si sos dueño/a de una vinoteca y no querés aparecer, podés
              pedirlo en{" "}
              <a href="/opt-out" className="underline hover:text-mustard">
                /opt-out
              </a>
              .
            </li>
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
