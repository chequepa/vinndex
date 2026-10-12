import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * Confirmación de baja. El link del mail cae acá (GET, inofensivo) y la
 * baja ocurre recién con el botón (POST a /api/alertas/baja): así un
 * escáner de links no da de baja a nadie.
 */

export const metadata: Metadata = {
  title: "Dar de baja la alerta · Vinndex",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ id?: string; h?: string; t?: string }> };

export default async function BajaPage({ searchParams }: Props) {
  const { id = "", h = "", t = "" } = await searchParams;
  const all = Boolean(h);
  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />
      <main id="contenido" className="max-w-2xl mx-auto px-4 lg:px-8 py-16 lg:py-24">
        <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-4">
          Alertas de precio
        </p>
        <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-6">
          {all ? "¿Dejamos de escribirte?" : "¿Damos de baja esta alerta?"}
        </h1>
        <p className="text-graphite text-lg leading-relaxed mb-8">
          {all
            ? "Borramos todas las alertas de tu mail y no te escribimos más."
            : "No te vamos a avisar más por este vino. Tus otras alertas siguen activas."}
        </p>
        <form method="post" action="/api/alertas/baja">
          {all ? <input type="hidden" name="h" value={h} /> : <input type="hidden" name="id" value={id} />}
          <input type="hidden" name="t" value={t} />
          <button
            type="submit"
            className="inline-flex items-center min-h-11 px-6 rounded-full bg-ink text-snow text-sm font-semibold hover:bg-malbec"
          >
            {all ? "Sí, dar de baja todo" : "Sí, dar de baja"}
          </button>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
