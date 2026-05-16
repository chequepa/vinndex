import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ContactForm } from "@/components/ContactForm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contacto — Vinndex",
  description:
    "Escribinos: sugerencias, problemas, vinotecas que debería estar, feedback. Todo se lee y se responde.",
  alternates: { canonical: "https://vinndex.com.ar/contacto" },
};

export default function ContactoPage() {
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
            <span>Contacto</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Contacto
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            Escribime. Sugerencias, problemas, vinotecas que deberían estar,
            feedback. Todo se lee y se responde.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16 space-y-10">
        <section className="bg-white border border-ink/10 rounded-2xl p-8 md:p-10">
          <h2 className="display text-2xl font-semibold text-ink mb-2">
            Escribime
          </h2>
          <p className="text-graphite text-sm mb-6">
            Lo leo y respondo personalmente, típicamente en &lt; 24hs (días
            hábiles).
          </p>
          <ContactForm kind="contacto" />
        </section>

        <section>
          <h2 className="display text-2xl font-semibold text-ink mb-4">
            Casos comunes
          </h2>
          <div className="space-y-4">
            <div className="bg-white border border-ink/10 rounded-xl p-5">
              <h3 className="font-semibold text-ink mb-1">
                Vi un precio desactualizado
              </h3>
              <p className="text-ink/70 text-sm leading-relaxed">
                Los precios se refrescan todas las noches (3 AM AR). Si ves
                algo desfasado más de 24hs, avisame con el link — puede ser un
                scraper que quedó colgado.
              </p>
            </div>
            <div className="bg-white border border-ink/10 rounded-xl p-5">
              <h3 className="font-semibold text-ink mb-1">
                Una vinoteca que conozco no está
              </h3>
              <p className="text-ink/70 text-sm leading-relaxed">
                Decime el nombre + URL. Si tiene tienda online con catálogo
                público, la sumo al siguiente ciclo. También podés mandarme a
                la vinoteca directo a{" "}
                <Link href="/sumate" className="underline hover:text-cobalt">
                  /sumate
                </Link>
                .
              </p>
            </div>
            <div className="bg-white border border-ink/10 rounded-xl p-5">
              <h3 className="font-semibold text-ink mb-1">
                El mismo vino aparece como 3 distintos
              </h3>
              <p className="text-ink/70 text-sm leading-relaxed">
                El matching es bastante bueno pero no perfecto. Si ves
                duplicados obvios, mandame screenshot y los corrijo.
              </p>
            </div>
            <div className="bg-white border border-ink/10 rounded-xl p-5">
              <h3 className="font-semibold text-ink mb-1">
                Soy vinoteca y quiero opt-out
              </h3>
              <p className="text-ink/70 text-sm leading-relaxed">
                Ver{" "}
                <Link href="/opt-out" className="underline hover:text-cobalt">
                  /opt-out
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
