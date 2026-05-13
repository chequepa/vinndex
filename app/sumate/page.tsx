import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Sos vinoteca? Sumate a Vinndex",
  description:
    "Si tenés una vinoteca online en Argentina, sumala gratis a Vinndex. Tráfico cualificado de usuarios que ya decidieron qué vino quieren comprar.",
  alternates: { canonical: "https://vinndex.com.ar/sumate" },
};

export default function SumatePage() {
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
            <span>Sumate</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Sos vinoteca?
            <br />
            <span className="italic font-normal">Sumate.</span>
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            Si vendés vinos online en Argentina, te podemos sumar al comparador
            gratis. Sin comisiones, sin contratos, sin letra chica.
          </p>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16 space-y-12">
        <section>
          <h2 className="display text-3xl font-semibold text-ink mb-4">
            Qué te traemos
          </h2>
          <ul className="space-y-3 text-ink/80 leading-relaxed">
            <li className="flex gap-3">
              <span className="text-cobalt font-semibold shrink-0">→</span>
              <span>
                <strong>Tráfico cualificado.</strong> Los usuarios que te
                llegan desde Vinndex ya saben qué vino quieren y vos ya le
                ganaste al precio — es un lead en la última milla.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-cobalt font-semibold shrink-0">→</span>
              <span>
                <strong>Backlinks reales.</strong> Cada vino tuyo va a tener
                una ficha en vinndex.com.ar que linkea a tu tienda. Buena
                señal para SEO.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-cobalt font-semibold shrink-0">→</span>
              <span>
                <strong>Presencia en la página de bodega.</strong> Si tenés
                una etiqueta de una bodega popular, también aparecés en{" "}
                <code className="bg-snow px-1.5 rounded text-sm">
                  /bodega/[nombre]
                </code>{" "}
                ordenado por tu precio.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-cobalt font-semibold shrink-0">→</span>
              <span>
                <strong>Cero fricción.</strong> Nos das el URL de tu tienda y
                nosotros nos encargamos de integrar. Si usás una plataforma
                estándar (Tiendanube, WooCommerce, Shopify, VTEX) generalmente
                es instantáneo.
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="display text-3xl font-semibold text-ink mb-4">
            Requisitos
          </h2>
          <ul className="space-y-2 text-ink/80 leading-relaxed">
            <li>
              · Vinoteca registrada en Argentina, con venta online (envíos a
              todo el país o al menos a CABA/GBA).
            </li>
            <li>
              · Catálogo público en tu sitio — no necesitamos credenciales ni
              APIs privadas.
            </li>
            <li>
              · Precios actualizados regularmente (idealmente &le; semanal).
            </li>
            <li>
              · Plataforma soportada: Tiendanube, WooCommerce, Shopify, VTEX,
              Magento, PrestaShop. Si es otra, evaluamos.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="display text-3xl font-semibold text-ink mb-4">
            Qué NO hacemos
          </h2>
          <ul className="space-y-2 text-ink/80 leading-relaxed">
            <li>
              · <strong>No cobramos nada.</strong> Ni fee, ni comisión, ni
              suscripción.
            </li>
            <li>
              · <strong>No promocionamos.</strong> No hay &ldquo;destacados
              pagos&rdquo; — el ranking es precio real.
            </li>
            <li>
              · <strong>No compartimos tus ventas.</strong> No tenemos acceso
              a eso y no nos interesa.
            </li>
          </ul>
        </section>

        <section className="bg-ink text-snow rounded-2xl p-8 md:p-10">
          <div className="text-center mb-8">
            <h2 className="display text-3xl font-semibold mb-3">Contanos</h2>
            <p className="text-snow/80 max-w-2xl mx-auto">
              Pasanos la URL de tu tienda y un par de datos. Te respondemos en
              &le; 48hs si podemos integrarla y te avisamos cuando ya estés en
              el comparador.
            </p>
          </div>
          <ContactForm
            kind="sumate"
            submitLabel="Enviar"
            successText="Recibimos tu pedido. Te respondemos en menos de 48hs."
            fields={[
              {
                name: "vinoteca",
                label: "Nombre de la vinoteca",
                required: true,
                placeholder: "Ej. Vinoteca del Centro",
              },
              {
                name: "url",
                label: "URL de la tienda online",
                type: "url",
                required: true,
                placeholder: "https://tuvinoteca.com.ar",
                helper:
                  "Con eso solo ya alcanza — chequeamos la plataforma del lado nuestro.",
              },
              {
                name: "contacto",
                label: "Email o WhatsApp",
                required: true,
                placeholder: "Para responderte",
              },
              {
                name: "notas",
                label: "Algo más que quieras contar (opcional)",
                type: "textarea",
                placeholder: "Plataforma, tamaño del catálogo, lo que sea...",
              },
            ]}
          />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
