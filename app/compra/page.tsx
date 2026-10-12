import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BasketPlanner } from "@/components/BasketPlanner";

/**
 * /compra — "voy a comprar varios vinos: ¿en qué vinoteca compro todo
 * junto?". La lista vive en el navegador (components/Basket.tsx) y el
 * cálculo en /api/compra (lib/basket.ts + lib/basketPlan.ts). Un link
 * compartido (`?v=slug*6,...`) carga esa lista al abrirlo.
 *
 * No se indexa: cada compra es particular.
 */

export const metadata: Metadata = {
  title: "Comprá varios vinos juntos: dónde te conviene · Vinndex",
  description:
    "Elegí los vinos que te querés llevar y cuántas botellas de cada uno: te decimos en qué vinoteca te sale más barato comprar todo junto.",
  robots: { index: false, follow: true },
};

export default function CompraPage() {
  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />
      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-5">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Mi compra</span>
          </div>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-4">
            Varios vinos,{" "}
            <span className="italic font-normal">una sola vinoteca.</span>
          </h1>
          <p className="text-graphite text-lg leading-relaxed max-w-3xl">
            Elegí los vinos que te querés llevar y cuántas botellas de cada
            uno. Te decimos en qué vinoteca te sale más barato comprar todo
            junto, en un solo pedido.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        <BasketPlanner />
      </main>
      <SiteFooter />
    </div>
  );
}
