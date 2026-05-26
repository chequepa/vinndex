import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { snapshotStats } from "@/lib/snapshot";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Preguntas frecuentes sobre Vinndex — Comparador de vinos",
  description:
    "Cómo funciona Vinndex, cada cuánto se actualizan los precios, por qué un vino dice 'sin stock' y todas las dudas comunes de usuarios y vinotecas.",
  alternates: { canonical: "https://vinndex.com.ar/preguntas" },
};

type QA = { q: string; a: string | React.ReactNode; aForSchema: string };

export default function PreguntasPage() {
  const stats = snapshotStats();
  const storeCount = stats.storeCount;

  const faqs: QA[] = [
    {
      q: "¿Por qué dice “Precios en CABA”?",
      a: (
        <>
          Hoy comparamos solo ofertas online disponibles para envío a Ciudad de
          Buenos Aires. Es la zona con más vinotecas integradas y donde el
          stock cambia más seguido, así arrancamos con un dataset confiable.
          En las próximas iteraciones vamos a sumar zonas (GBA, interior) y
          el costo de envío real por vinoteca, así el ranking refleja el
          precio total puerta-a-puerta. Si querés que avisemos cuando salga,{" "}
          <a href="/contacto" className="underline hover:text-cobalt">
            escribinos
          </a>
          .
        </>
      ),
      aForSchema:
        "Hoy comparamos solo ofertas online disponibles para envío a Ciudad de Buenos Aires. Es la zona con más vinotecas integradas y donde el stock cambia más seguido. En las próximas iteraciones vamos a sumar zonas (GBA, interior) y el costo de envío real por vinoteca.",
    },
    {
      q: "¿Qué es Vinndex?",
      a: (
        <>
          Un comparador de precios de vinos online en Argentina. Buscás el vino
          que te interesa y ves <strong>todas las vinotecas</strong> que lo
          tienen, ordenadas por precio real con stock disponible. Tocás la que
          te convenga y vas directo a comprar a esa tienda.
        </>
      ),
      aForSchema:
        "Un comparador de precios de vinos online en Argentina. Buscás el vino que te interesa y ves todas las vinotecas que lo tienen, ordenadas por precio real con stock disponible. Tocás la que te convenga y vas directo a comprar a esa tienda.",
    },
    {
      q: "¿Cada cuánto se actualizan los precios?",
      a: (
        <>
          Una vez por día. Cada noche a las 3 AM (hora Argentina) un pipeline
          automatizado scrape a las {storeCount} vinotecas integradas y
          regenera el snapshot. Si viste un precio hace 24hs, puede que hoy
          haya cambiado.
        </>
      ),
      aForSchema: `Una vez por día. Cada noche a las 3 AM (hora Argentina) un pipeline automatizado scrape a las ${storeCount} vinotecas integradas y regenera el snapshot. Si viste un precio hace 24hs, puede que hoy haya cambiado.`,
    },
    {
      q: "¿Cobran comisión o los precios tienen recargo?",
      a: (
        <>
          No. Los precios que ves son exactamente los que publica cada vinoteca
          en su propia tienda online. Vinndex <strong>no cobra</strong>{" "}
          comisiones, ni tiene acuerdos de afiliado, ni recarga nada. Cuando
          tocás &ldquo;Visitar&rdquo; vas directo al sitio de la vinoteca.
        </>
      ),
      aForSchema:
        "No. Los precios que ves son exactamente los que publica cada vinoteca en su propia tienda online. Vinndex no cobra comisiones, ni tiene acuerdos de afiliado, ni recarga nada. Cuando tocás 'Visitar' vas directo al sitio de la vinoteca.",
    },
    {
      q: "¿Por qué a veces un vino dice 'Sin stock'?",
      a: (
        <>
          Algunas vinotecas dejan el producto visible en su catálogo aunque
          estén sin stock. Nosotros detectamos ese estado y lo marcamos con un
          badge gris + opacidad. Los precios del comparador (mínimo, máximo,
          ahorro) se calculan solo con ofertas in-stock, así no aparece un
          &ldquo;ahorrá 70%&rdquo; fantasma. Los ítems sin stock igual se
          listan para que sepas dónde suele aparecer el vino cuando vuelve.
        </>
      ),
      aForSchema:
        "Algunas vinotecas dejan el producto visible en su catálogo aunque estén sin stock. Nosotros detectamos ese estado y lo marcamos con un badge gris + opacidad. Los precios del comparador (mínimo, máximo, ahorro) se calculan solo con ofertas in-stock, así no aparece un 'ahorrá 70%' fantasma. Los ítems sin stock igual se listan para que sepas dónde suele aparecer el vino cuando vuelve.",
    },
    {
      q: "¿Cómo deciden que dos vinos de dos tiendas son el mismo?",
      a: (
        <>
          Con un pipeline de 4 etapas: primero comparamos el código de barras
          cuando la tienda lo expone (match perfecto), después normalizamos
          nombre + bodega + cosecha + formato, después usamos embeddings de
          OpenAI para captar casos como &ldquo;Don David Reserva Malbec&rdquo;
          vs &ldquo;Don David Malbec Reserva&rdquo;, y por último un LLM
          (GPT-4o-mini) decide los casos ambiguos. Tiene un ratio de falso
          positivo muy bajo, pero si ves un match raro,{" "}
          <Link href="/contacto" className="underline hover:text-cobalt">
            avisanos
          </Link>
          .
        </>
      ),
      aForSchema:
        "Con un pipeline de 4 etapas: primero comparamos el código de barras cuando la tienda lo expone (match perfecto), después normalizamos nombre + bodega + cosecha + formato, después usamos embeddings de OpenAI para captar casos como 'Don David Reserva Malbec' vs 'Don David Malbec Reserva', y por último un LLM (GPT-4o-mini) decide los casos ambiguos. Tiene un ratio de falso positivo muy bajo, pero si ves un match raro, avisanos.",
    },
    {
      q: "¿Puedo comprar desde Vinndex?",
      a: (
        <>
          No. Vinndex no vende vinos. Es un comparador: te muestra dónde está
          el precio más conveniente y te manda a la vinoteca que elijas para
          que compres directo con ellos. Ellos se encargan del pago, la
          facturación y el envío.
        </>
      ),
      aForSchema:
        "No. Vinndex no vende vinos. Es un comparador: te muestra dónde está el precio más conveniente y te manda a la vinoteca que elijas para que compres directo con ellos. Ellos se encargan del pago, la facturación y el envío.",
    },
    {
      q: "¿Hay algún costo para los usuarios?",
      a: "Ninguno. Usar Vinndex es gratis. No pedimos registro, no mostramos publicidad intrusiva, no guardamos tus búsquedas asociadas a un perfil. La filosofía es servicio público, no monetización agresiva.",
      aForSchema:
        "Ninguno. Usar Vinndex es gratis. No pedimos registro, no mostramos publicidad intrusiva, no guardamos tus búsquedas asociadas a un perfil. La filosofía es servicio público, no monetización agresiva.",
    },
    {
      q: "¿Qué plataformas de tiendas online scrapean?",
      a: (
        <>
          Las 7 más comunes de Argentina: Tiendanube, WooCommerce, Shopify,
          VTEX (Cencosud, Carrefour, Día), Magento, PrestaShop y Mercado Libre.
          Si una vinoteca usa una plataforma distinta o tiene un desarrollo
          custom, evaluamos caso por caso. Ver el{" "}
          <Link href="/bodegas" className="underline hover:text-cobalt">
            listado completo de bodegas
          </Link>{" "}
          para conocer todas las vinotecas integradas.
        </>
      ),
      aForSchema:
        "Las 7 más comunes de Argentina: Tiendanube, WooCommerce, Shopify, VTEX (Cencosud, Carrefour, Día), Magento, PrestaShop y Mercado Libre. Si una vinoteca usa una plataforma distinta o tiene un desarrollo custom, evaluamos caso por caso.",
    },
    {
      q: "Soy vinoteca y quiero aparecer. ¿Qué hago?",
      a: (
        <>
          Escribinos a{" "}
          <Link
            href="/sumate"
            className="underline hover:text-cobalt"
          >
            /sumate
          </Link>
          . Si tu tienda online usa una plataforma estándar con catálogo
          público (Tiendanube, WooCommerce, Shopify, VTEX, Magento, PrestaShop)
          la integración es rápida y gratuita. Sin comisiones, sin exclusividad,
          sin letra chica.
        </>
      ),
      aForSchema:
        "Escribinos a /sumate. Si tu tienda online usa una plataforma estándar con catálogo público (Tiendanube, WooCommerce, Shopify, VTEX, Magento, PrestaShop) la integración es rápida y gratuita. Sin comisiones, sin exclusividad, sin letra chica.",
    },
    {
      q: "Soy vinoteca y NO quiero aparecer. ¿Cómo pido opt-out?",
      a: (
        <>
          Respetamos al 100%. Mandanos un mail desde un email corporativo del
          mismo dominio que tu tienda (para verificar que sos responsable) con
          el nombre de la vinoteca y la URL. En &le; 48hs la removemos del
          próximo scrape nocturno. Más detalles en{" "}
          <Link href="/opt-out" className="underline hover:text-cobalt">
            /opt-out
          </Link>
          .
        </>
      ),
      aForSchema:
        "Respetamos al 100%. Mandanos un mail desde un email corporativo del mismo dominio que tu tienda (para verificar que sos responsable) con el nombre de la vinoteca y la URL. En menos de 48hs la removemos del próximo scrape nocturno.",
    },
    {
      q: "¿El descuento mostrado es 'real' o es inflado?",
      a: (
        <>
          Es el descuento real entre el precio mínimo y el máximo que hay hoy
          en las vinotecas del comparador, contando solo ofertas in-stock.
          Limitamos el &ldquo;ahorro hasta X%&rdquo; al 70% en rankings para
          evitar outliers por precios mal cargados (ej. un vino de $250k que
          en realidad viene por caja de 6). Si ves un descuento que te llama la
          atención, siempre chequeá el nombre y el formato (750ml vs 1.5L vs
          caja) antes de comprar.
        </>
      ),
      aForSchema:
        "Es el descuento real entre el precio mínimo y el máximo que hay hoy en las vinotecas del comparador, contando solo ofertas in-stock. Limitamos el 'ahorro hasta X%' al 70% en rankings para evitar outliers por precios mal cargados. Si ves un descuento que te llama la atención, siempre chequeá el nombre y el formato antes de comprar.",
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org/",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.aForSchema,
      },
    })),
  };

  return (
    <div className="bg-white min-h-[100dvh]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SiteHeader />

      <section className="bg-snow border-b border-ink/10">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <div className="flex items-center gap-2 text-xs text-graphite uppercase tracking-wider mb-6">
            <Link href="/" className="hover:text-ink">
              Inicio
            </Link>
            <span>/</span>
            <span>Preguntas</span>
          </div>
          <h1 className="display text-4xl md:text-6xl font-semibold text-ink leading-[1.05] mb-6">
            Preguntas frecuentes
          </h1>
          <p className="text-graphite text-xl leading-relaxed max-w-3xl">
            Lo que suelen preguntarnos usuarios y vinotecas. Si no ves lo tuyo
            acá, <Link href="/contacto" className="underline hover:text-ink">escribinos</Link>.
          </p>
        </div>
      </section>

      <main id="contenido" className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <div className="space-y-4">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="group bg-snow/40 hover:bg-snow/60 border border-ink/10 rounded-xl overflow-hidden transition-colors"
            >
              <summary className="cursor-wine px-6 py-5 flex items-center justify-between gap-4 list-none">
                <h2 className="display text-lg md:text-xl font-semibold text-ink">
                  {f.q}
                </h2>
                <span className="text-graphite text-2xl group-open:rotate-45 transition-transform shrink-0">
                  +
                </span>
              </summary>
              <div className="px-6 pb-6 text-ink/80 leading-relaxed">
                {f.a}
              </div>
            </details>
          ))}
        </div>

        <section className="mt-16 bg-ink text-snow rounded-2xl p-8 md:p-10 text-center">
          <h2 className="display text-2xl font-semibold mb-3">
            ¿Tenés una pregunta que no está?
          </h2>
          <p className="text-snow/80 mb-6 max-w-2xl mx-auto">
            Todo mail se lee y se responde. Si te encontraste con algo que no
            funciona o una duda que no resolvimos, escribinos.
          </p>
          <Link
            href="/contacto"
            className="cursor-wine inline-flex items-center gap-2 bg-snow text-ink font-semibold px-8 py-3.5 rounded-full hover:bg-mustard transition-colors"
          >
            Ir a contacto →
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
