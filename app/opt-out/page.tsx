import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Pedir opt-out — Vinndex",
  description:
    "Si sos dueño o dueña de una vinoteca y preferís que no aparezca en Vinndex, te la sacamos. Así lo hacés.",
  alternates: { canonical: "https://vinndex.com.ar/opt-out" },
  robots: { index: true, follow: true },
};

export default function OptOutPage() {
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
            <span>Opt-out</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Pedir opt-out
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            Si sos dueño o dueña de una vinoteca y preferís que no aparezca en
            Vinndex, te la sacamos. Sin vueltas.
          </p>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16 space-y-10">
        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Antes de pedirlo, tené en cuenta
          </h2>
          <ul className="space-y-2 text-ink/80 leading-relaxed">
            <li>
              · Vinndex solo lee precios públicos que vos ya mostrás en tu
              tienda online. No usamos datos privados, no tenemos cuentas
              tuyas, no hay &ldquo;cosecha&rdquo; de leads.
            </li>
            <li>
              · El tráfico que te mandamos viene de gente que ya decidió qué
              vino quiere. Típicamente convierte muy bien.
            </li>
            <li>
              · Podés pedir el opt-out igual y lo respetamos a rajatabla.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Cómo pedirlo
          </h2>
          <ol className="space-y-3 text-ink/80 leading-relaxed list-decimal ml-5">
            <li>
              Completá el formulario abajo con el{" "}
              <strong>nombre de la vinoteca</strong> y la <strong>URL</strong>{" "}
              que querés sacar.
            </li>
            <li>
              Indicá un <strong>email corporativo del mismo dominio</strong> que
              tu tienda (ej.{" "}
              <code className="bg-snow px-1 rounded text-sm">
                vos@tuvinoteca.com.ar
              </code>
              ). Te escribo desde mi mail personal para confirmar y dejar el
              registro de quién pidió el opt-out.
            </li>
            <li>
              En máximo <strong>48 horas hábiles</strong> te confirmamos y
              removemos la vinoteca del próximo scrape nocturno.
            </li>
            <li>
              Si al mes siguiente querés volver, también sin drama. Nos
              escribís y te re-integramos.
            </li>
          </ol>
        </section>

        <section className="bg-ink text-snow rounded-2xl p-8 md:p-10">
          <div className="text-center mb-8">
            <h2 className="display text-3xl font-semibold mb-3">
              Pedir opt-out
            </h2>
            <p className="text-snow/80 max-w-2xl mx-auto">
              Sin vueltas. Lo confirmamos en menos de 48hs y removemos la
              vinoteca del próximo scrape.
            </p>
          </div>
          <ContactForm
            kind="opt-out"
            submitLabel="Pedir opt-out"
            successText="Pedido recibido. Te confirmo por mail desde mi cuenta personal en menos de 48hs."
            fields={[
              {
                name: "vinoteca",
                label: "Nombre de la vinoteca",
                required: true,
              },
              {
                name: "url",
                label: "URL de la tienda",
                type: "url",
                required: true,
                placeholder: "https://tuvinoteca.com.ar",
              },
              {
                name: "email_corporativo",
                label: "Email corporativo (mismo dominio que la tienda)",
                type: "email",
                required: true,
                placeholder: "vos@tuvinoteca.com.ar",
                helper:
                  "Necesario para verificar que sos responsable del dominio.",
              },
              {
                name: "nombre",
                label: "Tu nombre y apellido",
                required: true,
              },
              {
                name: "motivo",
                label: "Motivo (opcional)",
                type: "textarea",
                placeholder:
                  "Si querés contarnos por qué, nos sirve para mejorar.",
              },
            ]}
          />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
