import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pedir opt-out — Vinndex",
  description:
    "Si sos dueño o dueña de una vinoteca y preferís que no aparezca en Vinndex, te la sacamos. Así lo hacés.",
  alternates: { canonical: "https://vinndex.com.ar/opt-out" },
  robots: { index: true, follow: true },
};

export default function OptOutPage() {
  const mailSubject = encodeURIComponent(
    "Pedido de opt-out desde Vinndex",
  );
  const mailBody = encodeURIComponent(
    "Hola,\n\nSoy dueño/a de la vinoteca [NOMBRE] (URL: [https://tusitio.com]) y solicito que NO aparezca en Vinndex.\n\nDatos para verificar que soy responsable del dominio:\n- Email corporativo del mismo dominio\n- Nombre y apellido del responsable\n\nGracias!",
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

      <main id="contenido" className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16 space-y-10">
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
              Mandá un mail a{" "}
              <a
                href="mailto:hola@vinndex.com.ar"
                className="underline hover:text-cobalt"
              >
                hola@vinndex.com.ar
              </a>{" "}
              <strong>desde un email corporativo del mismo dominio</strong> que
              tu tienda (ej. <code className="bg-snow px-1 rounded text-sm">vos@tuvinoteca.com.ar</code>).
              Esto nos deja verificar que sos efectivamente responsable.
            </li>
            <li>
              En el mail, incluí el <strong>nombre de la vinoteca</strong> y la{" "}
              <strong>URL</strong> que querés sacar.
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

        <section className="bg-ink text-snow rounded-2xl p-8 md:p-10 text-center">
          <a
            href={`mailto:hola@vinndex.com.ar?subject=${mailSubject}&body=${mailBody}`}
            className="cursor-wine inline-flex items-center gap-2 bg-snow text-ink font-semibold px-8 py-3.5 rounded-full hover:bg-mustard transition-colors"
          >
            Pedir opt-out →
          </a>
          <p className="text-snow/60 text-xs mt-4">
            Template de mail pre-llenado con los datos que necesitamos.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
