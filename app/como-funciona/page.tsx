import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { snapshotStats } from "@/lib/snapshot";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cómo funciona Vinndex · Metodología del comparador",
  description:
    "Cómo scrapeamos, matcheamos y comparamos los precios de vinos de 110+ vinotecas online de Argentina. Pipeline técnico sin adornos.",
  alternates: { canonical: "https://vinndex.com.ar/como-funciona" },
};

export default function ComoFuncionaPage() {
  const stats = snapshotStats();
  const generatedAt = new Date(stats.generatedAt).toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: "https://vinndex.com.ar" },
      { "@type": "ListItem", position: 2, name: "Cómo funciona", item: "https://vinndex.com.ar/como-funciona" },
    ],
  };
  const howToJsonLd = {
    "@context": "https://schema.org/",
    "@type": "HowTo",
    name: "Cómo Vinndex compara precios de vinos online en Argentina",
    description: `Pipeline automático que scrape ${stats.storeCount} vinotecas online cada noche, matchea el mismo vino entre tiendas y publica precios comparados. Sin intervención humana.`,
    totalTime: "PT1H20M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Scrapeamos las vinotecas",
        text: `Cada noche a las 3 AM (hora Argentina) corre un workflow contra las ${stats.storeCount} vinotecas integradas. Leemos catálogos públicos vía APIs estándar (Tiendanube, WooCommerce, Shopify, VTEX, Magento, PrestaShop) o HTML cuando no hay API.`,
        url: "https://vinndex.com.ar/como-funciona#contenido",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Matcheamos el mismo vino",
        text: "Cada oferta se canonicaliza (sin puntuación de iniciales, volumen, pack, añada ni muletillas de retail) y se separa en vino (bodega + línea + varietal + color) y variante (botella, magnum, caja, estuche). Un diccionario de bodegas y líneas infiere la bodega desde el título; cada oferta se asigna a un catálogo de 3.000+ vinos validado con GPT-4o-mini; el código de barras fusiona fichas sólo cuando lo cargan 2+ vinotecas sin conflicto de identidad.",
        url: "https://vinndex.com.ar/como-funciona#contenido",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Filtramos ofertas reales",
        text: "Los precios del grupo (min, max, ahorro) se calculan solo con ofertas in-stock. Las ofertas sin stock aparecen en la ficha con badge claro pero no inflan el ahorro.",
        url: "https://vinndex.com.ar/como-funciona#contenido",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Te mostramos la comparación",
        text: "El snapshot se empaqueta y deploya automáticamente. Al entrar a una ficha ves las tiendas ordenadas de menor a mayor precio, con diferencia porcentual vs el mínimo y CTA directo a la compra.",
        url: "https://vinndex.com.ar/como-funciona#contenido",
      },
    ],
  };
  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
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
                750ml&rdquo;, &ldquo;D.V. Catena&rdquo; vs &ldquo;DV
                Catena&rdquo;. En vez de comparar títulos entre sí, le
                preguntamos a cada oferta <em>qué vino es</em>:
              </p>
              <ul className="space-y-2 text-sm text-ink/80 leading-relaxed ml-4 list-disc">
                <li>
                  <strong>Título limpio:</strong> sacamos del nombre la
                  puntuación de iniciales, el volumen, el pack, la añada,
                  el estuche y las muletillas de retail (&ldquo;Vino
                  Tinto&rdquo;, &ldquo;750 Cc&rdquo;, el nombre de la
                  tienda). Lo que queda es el vino: bodega + línea +
                  varietal + color. Lo que sacamos no se tira: es la{" "}
                  <em>variante</em> (botella, magnum, caja x6, estuche),
                  que vive adentro de la ficha y no compite en el precio.
                </li>
                <li>
                  <strong>Diccionario de bodegas y líneas:</strong> sabemos
                  que &ldquo;DV Catena&rdquo;, &ldquo;Saint Felicien&rdquo;
                  y &ldquo;Nicasia&rdquo; son líneas de Catena Zapata, o
                  que &ldquo;Trumpeter&rdquo; es de Rutini. Con eso
                  inferimos la bodega desde el título aunque la tienda no
                  la declare.
                </li>
                <li>
                  <strong>Catálogo de vinos:</strong> cada oferta se asigna
                  a un vino de un catálogo de 3.000+ vinos argentinos
                  validado con GPT-4o-mini, que sabe qué parajes y gamas
                  distinguen un vino de otro (Aluvional Gualtallary no es
                  Aluvional Altamira; Concreto es siempre de Paraje
                  Altamira). Lo que el catálogo todavía no cubre se agrupa
                  por esa misma identidad estructurada.
                </li>
                <li>
                  <strong>Código de barras (EAN):</strong> si dos fichas
                  comparten un GTIN cargado por dos o más vinotecas y no
                  hay conflicto de identidad (color, volumen, varietal,
                  paraje), se fusionan. Nunca fusionamos por parecido de
                  texto solo: un falso &ldquo;mismo vino&rdquo; es peor que
                  uno faltante.
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
