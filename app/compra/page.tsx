import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BasketPlanner } from "@/components/BasketPlanner";
import { buildBasketMatrix, parseBasketParam } from "@/lib/basket";
import { snapshot } from "@/lib/snapshot";

/**
 * /compra — compra combinada: "quiero estos vinos, en estas cantidades:
 * ¿dónde me conviene comprar todo?". La lista viaja en la URL
 * (`?v=slug*6,slug2*12`) para que se pueda compartir por WhatsApp; el
 * navegador la recuerda en localStorage (components/Basket.tsx). Lógica
 * en lib/basket.ts (matriz) y lib/basketPlan.ts (combinaciones).
 *
 * No se indexa: cada URL es una compra particular.
 */

export const metadata: Metadata = {
  title: "Compra combinada: dónde comprar varios vinos juntos · Vinndex",
  description:
    "Elegí varios vinos y cuántas botellas de cada uno: te decimos en qué vinoteca (o en qué dos) te sale más barato comprar todo junto.",
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ v?: string }> };

export default async function CompraPage({ searchParams }: Props) {
  const { v } = await searchParams;
  const request = parseBasketParam(v);
  const matrix = request.length ? buildBasketMatrix(request) : null;

  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />
      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Compra combinada</span>
          </div>
          <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-4">
            Compra combinada
          </p>
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-5">
            Varios vinos,{" "}
            <span className="italic font-normal">¿dónde compro todo?</span>
          </h1>
          <p className="text-graphite text-lg leading-relaxed max-w-3xl">
            Comprar cada vino donde está más barato puede salir más caro que
            juntar todo en una vinoteca: cada tienda extra es otro envío.
            Elegí los vinos y cuántas botellas querés de cada uno, y te
            mostramos las dos cuentas. Si una vinoteca vende la caja cerrada
            más barata, la usamos.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        <BasketPlanner
          matrix={matrix}
          param={v ?? ""}
          snapshotDate={snapshot.generatedAt}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
