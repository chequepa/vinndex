import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sos vinoteca? Sumate a Vinndex",
  description:
    "Si tenés una vinoteca online en Argentina, sumala gratis a Vinndex. Tráfico cualificado de usuarios que ya decidieron qué vino quieren comprar.",
  alternates: { canonical: "https://vinndex.com.ar/sumate" },
};

export default function SumatePage() {
  const mailSubject = encodeURIComponent("Quiero sumar mi vinoteca a Vinndex");
  const mailBody = encodeURIComponent(
    "Hola,\n\nTengo una vinoteca online y me gustaría sumarla a Vinndex.\n\nNombre de la vinoteca:\nURL del sitio:\nPlataforma (Tiendanube / WooCommerce / Shopify / VTEX / otra):\nPersona de contacto:\n\nGracias!",
  );
  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
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

        <section className="bg-ink text-snow rounded-2xl p-8 md:p-10 text-center">
          <h2 className="display text-3xl font-semibold mb-4">Contanos</h2>
          <p className="text-snow/85 mb-6 max-w-2xl mx-auto">
            Mandanos un mail con el nombre de tu vinoteca, la URL y la
            plataforma. Te confirmamos en &le; 48hs si podemos integrarla y te
            avisamos cuando ya estés en el comparador.
          </p>
          <a
            href={`mailto:hola@vinndex.com.ar?subject=${mailSubject}&body=${mailBody}`}
            className="cursor-wine inline-flex items-center gap-2 bg-snow text-ink font-semibold px-8 py-3.5 rounded-full hover:bg-mustard transition-colors"
          >
            Escribinos →
          </a>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
