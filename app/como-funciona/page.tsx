import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { snapshotStats } from "@/lib/snapshot";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cómo funciona Vinndex — Metodología del comparador",
  description:
    "Cómo scrapeamos, matcheamos y comparamos los precios de vinos de 60+ vinotecas online de Argentina. Pipeline técnico sin adornos.",
  alternates: { canonical: "https://vinndex.com.ar/como-funciona" },
};

export default function ComoFuncionaPage() {
  const stats = snapshotStats();
  const generatedAt = new Date(stats.generatedAt).toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  });
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
            <span>Cómo funciona</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Cómo funciona
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            Cada noche el pipeline scrape a {stats.storeCount} vinotecas,
            matchea qué vino es el mismo en cuáles tiendas, y te arma la
            comparación. Sin intervención humana.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <ol className="space-y-10">
          <li className="flex gap-5">
            <div className="display text-5xl font-semibold text-cobalt leading-none shrink-0 w-16">
              01
            </div>
            <div>
              <h2 className="display text-2xl font-semibold text-ink mb-2">
                Scrapeamos las vinotecas
              </h2>
              <p className="text-ink/80 leading-relaxed mb-2">
                Cada noche a las 3 AM (hora Argentina), un workflow corre
                contra las {stats.storeCount} vinotecas online que tenemos
                integradas. Leemos sus catálogos públicos vía las APIs
                estándar de sus plataformas (Tiendanube, WooCommerce, Shopify,
                VTEX, Magento, PrestaShop) o el HTML cuando no hay API.
              </p>
              <p className="text-ink/70 text-sm italic">
                Ninguna vinoteca nos da datos privados. Todo lo que leemos es
                lo mismo que verías vos entrando al sitio.
              </p>
            </div>
          </li>

          <li className="flex gap-5">
            <div className="display text-5xl font-semibold text-cobalt leading-none shrink-0 w-16">
              02
            </div>
            <div>
              <h2 className="display text-2xl font-semibold text-ink mb-2">
                Matcheamos el mismo vino
              </h2>
              <p className="text-ink/80 leading-relaxed mb-2">
                El mismo vino se llama distinto en cada tienda: &ldquo;Zuccardi
                Concreto Malbec&rdquo; vs &ldquo;Vino Concreto Zuccardi
                750ml&rdquo;. Usamos 4 etapas de matching:
              </p>
              <ul className="space-y-2 text-sm text-ink/80 leading-relaxed ml-4 list-disc">
                <li>
                  <strong>Stage 0 — Código de barras (EAN):</strong> si dos
                  tiendas exponen el mismo GTIN, es el mismo vino. Zero falsos
                  positivos.
                </li>
                <li>
                  <strong>Stage 1 — Nombres normalizados:</strong> tokens
                  ordenados alfabéticamente + brand + cosecha + formato.
                  Colapsa la mayoría de casos.
                </li>
                <li>
                  <strong>Stage 2 — Embeddings:</strong> pasamos los nombres
                  por OpenAI text-embedding-3-small y medimos similitud
                  coseno. Captura casos como &ldquo;Don David Reserva
                  Malbec&rdquo; vs &ldquo;Don David Malbec Reserva&rdquo;.
                </li>
                <li>
                  <strong>Stage 3 — LLM adjudicator:</strong> los pares en
                  &ldquo;zona gris&rdquo; (similitud entre 0.85 y 0.93) se los
                  preguntamos a GPT-4o-mini: &ldquo;¿es el mismo vino?&rdquo;.
                  Resuelve los casos difíciles.
                </li>
              </ul>
            </div>
          </li>

          <li className="flex gap-5">
            <div className="display text-5xl font-semibold text-cobalt leading-none shrink-0 w-16">
              03
            </div>
            <div>
              <h2 className="display text-2xl font-semibold text-ink mb-2">
                Filtramos ofertas reales
              </h2>
              <p className="text-ink/80 leading-relaxed">
                Muchos catálogos online dejan productos &ldquo;sin stock&rdquo;
                con un precio bajísimo de hace meses. Si contamos ese precio
                como oferta, te mostramos un &ldquo;ahorrá 70%&rdquo; falso.
                Por eso los precios del grupo (min, max, ahorro) se calculan
                SOLO con ofertas in-stock. Las sin stock igual aparecen en la
                ficha, pero con un badge claro y no cuentan.
              </p>
            </div>
          </li>

          <li className="flex gap-5">
            <div className="display text-5xl font-semibold text-cobalt leading-none shrink-0 w-16">
              04
            </div>
            <div>
              <h2 className="display text-2xl font-semibold text-ink mb-2">
                Te mostramos la comparación
              </h2>
              <p className="text-ink/80 leading-relaxed">
                Todo esto se empaqueta en{" "}
                <code className="bg-snow px-1.5 py-0.5 rounded text-sm">
                  data/snapshot.json
                </code>{" "}
                y se deploya automáticamente. Cuando entrás a una ficha, ves
                las tiendas ordenadas de menor a mayor precio, con diferencia
                porcentual vs el mínimo y CTA para ir directo a la compra.
              </p>
            </div>
          </li>
        </ol>

        <section className="bg-snow border border-ink/10 rounded-2xl p-6 md:p-8 mt-12">
          <h3 className="display text-lg font-semibold text-ink mb-2">
            Última actualización
          </h3>
          <p className="text-ink/80 text-sm leading-relaxed">
            {generatedAt} · Snapshot con {stats.storeCount} vinotecas,{" "}
            {stats.productCount.toLocaleString("es-AR")} ofertas,{" "}
            {stats.multiStoreGroupCount.toLocaleString("es-AR")} vinos
            comparables en 2+ tiendas.
          </p>
          <p className="text-ink/60 text-xs mt-3">
            Podés ver las{" "}
            <Link href="/bodegas" className="underline hover:text-cobalt">
              bodegas y vinotecas integradas
            </Link>{" "}
            o explorar{" "}
            <Link href="/data" className="underline hover:text-cobalt">
              estadísticas del mercado argentino
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
