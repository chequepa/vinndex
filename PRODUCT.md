# Product

## Register

product

## Users

El comprador argentino de vino online. Tres perfiles que conviven:

- **Buscador de oferta** (el más volumen): viene con intención general ("un malbec rico bajo $10k", "espumante para regalo"). Entra al catálogo o a un ranking, navega varietal/precio. Quiere el feedback rápido: ¿en cuántas vinotecas está? ¿cuánto se ahorra?
- **Buscador de etiqueta específica** (la conversión más alta): ya sabe qué vino quiere ("Catena Zapata Malbec Argentino 2023", "Luigi Bosca Reserva Cabernet"). Llega por search (Google) o por escribir el nombre. La métrica de éxito es: ¿le mostramos las 30+ vinotecas que lo venden ordenadas por precio total con envío?
- **Curioso de precios** (el que vuelve): ya compró antes, quiere ver "qué bajó esta semana" o "qué está pasando con tal bodega". Va a Price Drops, Rankings, /bodega/{slug}, /data.

Contexto típico: mobile mientras cocina (decide el vino de la cena), desktop al armar una compra de cajón, ambos en CABA o GBA con envío a domicilio (zona "CABA" es la base default).

El job principal: **decidir dónde comprar un vino específico al mejor precio, sin tener que abrir 10 tabs en distintas vinotecas**. Vinndex no es destino — es el step intermedio entre "quiero comprar este vino" y "click directo a la vinoteca que lo vende más barato".

## Product Purpose

Vinndex es un comparador independiente de precios de vinos online en Argentina. Scrape 100+ vinotecas todas las noches, hace matching de SKUs entre tiendas (EAN → nombres normalizados → embeddings → LLM adjudicator), y publica precios comparados con CTA directo a la vinoteca ganadora.

Lo que NO es: no vende vino, no cobra comisión por venta, no tiene listas patrocinadas, no tiene acuerdos de exclusividad con tiendas. El orden de los resultados es el precio real del vino en cada vinoteca, sin intervención humana.

Lo que mide éxito: usuarios que entran con intención específica → clickean "Visitar" en una vinoteca. El sitio existe para resolver una decisión, no para retener usuarios. El SEO es la principal fuente de tráfico (cada ficha de vino, ranking, bodega, varietal, región es una URL indexable con structured data).

Estado actual (2026-05): live en vinndex.com.ar (Vercel dominio + Railway backend), 100+ vinotecas integradas, 5.000+ vinos comparables (en 2+ vinotecas), 70k+ ofertas sincronizadas. Sesiones recientes: limpieza de vinotecas sin checkout real (113→104), QA SEO técnico, audit mobile (touch targets, sticky stack, safe-area-inset), audit a11y (WCAG AA).

## Brand Personality

Tres palabras: **editorial, independiente, rioplatense**.

- **Editorial**: porque el sitio se ve más como una revista de vinos (Fraunces para todo display, Inter para body, grain texture, hero ilustrado a mano estilo postal mendocina) que como un comparador funcional. La utility está adentro, envuelta en una identidad de prensa.
- **Independiente**: en el copy y en la arquitectura. "No vendemos vino, te ayudamos a comprarlo al mejor precio." Sin sponsored listings. Sin acuerdos de exclusividad. Sin pop-ups. Sin newsletter forzado.
- **Rioplatense**: voseo siempre ("Buscás", "Compará", "Sumate"), modismos locales ("ahorrá hasta X%", "elegí la más barata"), respeto por regulaciones AR ("Beber con moderación · Prohibida la venta de bebidas alcohólicas a menores de 18 años"). Sitio en es-AR, precios en ARS, foco AR-only.

Voz: directa, cálida, técnicamente honesta. Cuando algo es complejo (matching de SKUs, scrapeo) lo explicamos con la prolijidad de una nota periodística, no con jerga de developer. Cuando algo es simple (compará precios) lo decimos simple ("Un vino. Todos los precios.").

## Anti-references

- **SaaS dashboards** (Stripe, Linear, Vercel): la estética "fintech-tech-minimal navy + neutral grays + crisp sans" es exactamente lo que NO somos. Si Vinndex se ve a una sola pasada como "una app de productividad para vinos", está roto.
- **Comparadores genéricos** (Buscapé, eBay, Amazon listings): grids saturados de cards idénticas con thumbnails chicos, banners flotantes, sponsored listings disfrazados de resultados orgánicos.
- **Apps de delivery** (PedidosYa, Rappi): no somos checkout. No tenemos carrito. No cobramos. La interfaz no debería sugerir "agregar al carrito".
- **Sites de vino "fancy hotel sommelier"** (estética dark navy + gold serif + jerga catador): elitismo intimidante. Vinndex es para cualquiera que va a comprar una botella, no solo para el coleccionista.
- **AI tool aesthetic 2024-2026** (dark mode con purple/pink neón gradients, glassmorphism por default, gradient mesh, "Generate" CTAs gigantes): la categoría AI marketing es el reflejo first-order del impeccable y queda lejos del lenguaje vinoso editorial.
- **Identical card grids con `01/02/03 + icono + heading + texto`**: el template "Cómo funciona" SaaS. Cada paso necesita su propia ilustración con personalidad.
- **Hero-metric template** ("big number + small label" sin contexto): tres stats decorativos sin rol distinto. Si los números no cuentan algo, no van.

## Design Principles

1. **No vendemos vino, te ayudamos a comprarlo.** Cualquier feature, copy, o componente que sugiera lo contrario (carrito, checkout, "agregar a la lista de compras", "mi pedido") está fuera. El CTA primario es "Visitar" / "Ir al mejor precio en {tienda}", siempre `target="_blank"`, siempre `rel="noopener nofollow"`.

2. **El orden es el precio real.** Cero patrocinios disfrazados. Si hay que monetizar, será explícito (publicidad contextual etiquetada) y nunca afectará el orden de la tabla de comparación. Esto es lo más importante del valor que ofrecemos a usuarios y a Google.

3. **Identidad por item.** Cada bodega tiene su monograma + color. Cada región tiene su gradient + montaña silueta. Cada varietal tiene su pill color. Cada vinoteca tiene su badge determinístico. Donde otros usan template repetido, Vinndex usa diferenciación por contenido. Tres similar es identidad; tres iguales es slop.

4. **Editorial primero, tech segundo.** El registro visual es periodismo + bodega: Fraunces, grain, ilustración hand-drawn, voseo, calidez vinosa. El cobalt es el único guiño tech y vive solo en las acciones primarias (botones, links activos, contadores). Si una decisión visual te lleva a "más SaaS", probá la dirección opuesta.

5. **Mobile-first y SEO-first.** La mayoría del tráfico llega a una ficha de vino específica desde Google en mobile, no a la homepage en desktop. Cada componente nuevo se prueba primero en mobile (375px) y se valida con Lighthouse antes de salir. El JSON-LD (Product, Offer, FAQ, HowTo, ItemList, BreadcrumbList) es feature, no afterthought.

## Accessibility & Inclusion

- **WCAG AA mínimo, AAA aspirado donde tiene sentido**. Todos los pares text/bg de la paleta nombrada pasan AA; algunos colores específicos están aclarados en dark mode para mantener AA contra surface oscuro (cobalt → #6b8fff, malbec → #d96a82, comentado en globals.css).
- **Focus-visible global**: outline 2px cobalt con offset 2px, custom en dark a cyan más claro. Skip-to-content link en `:focus`.
- **Touch targets ≥44px en mobile**: comentado en globals.css en `.filter-chip` y otros. Audit móvil de mayo 2026 cubrió esto.
- **Voseo y es-AR**: lang attribute, accesible a screen readers en castellano rioplatense.
- **Aria-labels en inputs**: SearchInput deriva aria-label desde placeholder cuando el caller no lo provee.
- **Reducción de glassmorphism decorativo**: limitado a contextos justificados (chips sobre gradient hero, info-box sobre ficha hero). Sobre cream, los chips son sólidos para no entorpecer a usuarios con baja agudeza visual.
- **Reduced-motion**: la única animación always-on es `.float` (sol del hero). El resto son transiciones de estado (hover, focus). Aún así, falta un `@media (prefers-reduced-motion)` que desactive el float para usuarios sensibles — TODO conocido.
