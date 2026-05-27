---
name: Vinndex
description: El atardecer mendocino digital. Comparador editorial de precios de vino argentino online.
colors:
  cobalt: "#1e3fbf"
  sky2: "#4d79e8"
  andes: "#7c8fd9"
  snow: "#f5ede0"
  magenta: "#d63a7a"
  terracota: "#d97449"
  mustard: "#e8b547"
  malbec: "#6b1e2e"
  rosado: "#e8859e"
  chardonnay: "#e8d47c"
  ink: "#0f1729"
  graphite: "#4a5468"
  vine: "#3d6b47"
  green2: "#1b7a4f"
  yellow2: "#b88a1b"
  red2: "#a6262f"
  surface: "#ffffff"
  surface-2: "#f5ede0"
  surface-3: "#faf4ea"
  ink-dark: "#0b1020"
  surface-dark: "#141b2d"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(2.25rem, 6vw, 5.5rem)"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(1.75rem, 4vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.05
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.2em"
  numeric:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 600
    fontFeature: "'tnum'"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.snow}"
    rounded: "{rounded.pill}"
    padding: "12px 32px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.snow}"
  button-on-gradient:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.malbec}"
    rounded: "{rounded.pill}"
    padding: "14px 32px"
  button-on-gradient-hover:
    backgroundColor: "{colors.mustard}"
    textColor: "{colors.malbec}"
  chip-glass:
    backgroundColor: "rgba(255,255,255,0.15)"
    textColor: "{colors.snow}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  chip-filter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  chip-filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.snow}"
    rounded: "{rounded.pill}"
  postcard:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.xl}"
    padding: "20px"
  input-hero:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 8px 8px 24px"
  store-logo:
    backgroundColor: "{colors.malbec}"
    textColor: "{colors.snow}"
    rounded: "{rounded.sm}"
    size: "44px"
  tag-best-price:
    backgroundColor: "rgba(232,181,71,0.14)"
    textColor: "{colors.ink}"
---

# Design System: Vinndex

## 1. Overview

**Creative North Star: "El atardecer mendocino digital"**

Vinndex no se ve como un comparador de precios. Se ve como una postal editorial de Mendoza al atardecer, con la utilidad escondida adentro. El hero pone una botella ilustrada estilo Bordeaux contra un gradient sky tipo Hiroshi Nagai (azul medianoche → rosa → mustard), con montañas siluetadas y vineyard rows abajo. La textura grain encima de los gradients le da grano de papel impreso. La paleta tiene nombre vinoso (malbec, mustard, terracota, snow, chardonnay) y se conjuga con el cobalt como el único primary "tech" del sistema. Es un proyecto de utilidad pública (comparador independiente, no vende vino) construido con la prolijidad de una marca editorial: Fraunces para todo lo display y los precios grandes, Inter para todo lo funcional.

El sistema rechaza activamente los reflejos AI-tell de la categoría: SaaS dark con gradients de neón, gradient-mesh con glassmorphism por defecto, identical card grids con `icon + heading + text`, hero-metric templates ("big number + small label" copiado de SaaS), gradient text en headlines. Donde otros comparadores eligen "trust = dark navy + sans serif", Vinndex elige "trust = la calidez de una bodega". El cobalt es el único guiño tech; el resto del sistema es papel, polvo, vid, sol.

**Key Characteristics:**
- Editorial-typographic, no SaaS.
- Paleta vinosa (malbec, mustard, terracota, snow) con cobalt como único acento técnico.
- Hero con ilustración SVG dibujada a mano, no stock 3D ni gradient mesh.
- Grain texture sobre gradients para textura de papel.
- Voseo rioplatense en todo el copy ("Buscás", "Compará", "Sumate").
- Polifonía por sección, no monocromía: cada zona tiene su acento (regiones con gradient único por terroir, bodegas con monograma + color propio, varietals con su pill color).
- Cursor custom de gota de vino en todos los elementos interactivos.

## 2. Colors

Paleta vinosa de 13 colores nombrados semánticamente (no `blue-800` / `red-500`), con un solo primary tech (cobalt) y el resto orbitando el imaginario de la bodega: vino, cuero, sol, cielo, montaña.

### Primary
- **Cobalt** (#1e3fbf): el único color "técnico" del sistema. Acción primaria (botón "Buscar" en hero, CTA "Visitar" en filas de comparación, links de filtros activos, contadores como "70k+ vinos"). En dark mode aclara a #6b8fff para mantener contraste AA sobre surface dark.
- **Malbec** (#6b1e2e): el corazón vinoso. Bg de scores de crítico, accent de price drops, fondo del store-logo, texto del CTA primario sobre gradient cream. En dark aclara a #d96a82.

### Secondary
- **Mustard** (#e8b547): highlight / pricing positivo. Underline editorial debajo de keywords del hero, bg del "AHORRA X%" badge, color del "ahorro máximo" numérico en ficha de vino, fila ganadora de comparación (bg tint `rgba(232,181,71,0.14)`), exit arrows en ilustraciones.
- **Terracota** (#d97449): eyebrows de sección sobre cream ("BAJARON DE PRECIO", "CÓMO FUNCIONA"). El paso 03 de "Cómo funciona". Acentos cálidos en regiones del norte.

### Tertiary
- **Magenta** (#d63a7a) / **Rosado** (#e8859e) / **Chardonnay** (#e8d47c) / **Andes** (#7c8fd9): paleta de placas de bodega (hashed por nombre) y stops del gradient sky del hero. No se usan sueltos como acento; son colores de placa / gradient.

### Neutral
- **Snow** (#f5ede0): el cream que envuelve todo. Bg de postcards, texto sobre el hero gradient, surface-2 del light theme. NO es blanco puro.
- **Surface** (#ffffff) / **Surface-2** (#f5ede0) / **Surface-3** (#faf4ea): jerarquía de fondos en light.
- **Ink** (#0f1729): texto principal sobre cream. En dark flippa a `#ece4d2` (cream pálido) — todo el sistema `text-ink` / `border-ink/X` auto-invierte.
- **Graphite** (#4a5468): texto secundario, captions, metadata. En dark `#9aa3b8`.
- **Vine** (#3d6b47): único acento verde del sistema (hoja de vid en la ilustración del hero, racimo en la lupa de "Cómo funciona"). Nunca para "success" generalizado; eso es `green2`.

### Named Rules

**The Cobalt-Is-The-Action Rule.** El cobalt es el único color que pertenece al lenguaje de acción primaria. No usar mustard, malbec o terracota para botones que el usuario tiene que clickear; esos son colores de contenido (precios, badges, highlights). El cream/snow como bg + malbec como texto es la única excepción, reservada para el CTA principal sobre el gradient hero de ficha de vino.

**The Drenched-Hero Rule.** El hero de homepage es Drenched (la superficie ES el color): gradient sky completo con grain encima, sin contenedor blanco que lo "encierre". La estrategia de color del resto del sitio es Restrained con accents tonales por sección.

**The Polyphonic Sections Rule.** Cada sección puede tener su propio acento dominante (mustard para "Bajaron de precio", malbec para "Top ofertas", cobalt para "Bodegas") siempre que ese acento esté justificado por el contenido (no decoración random). Tres números en colores distintos sin razón es slop; tres secciones con dominante cromático justificada por su tema es polifonía.

## 3. Typography

**Display Font:** Fraunces (con fallback Georgia, serif).
**Body Font:** Inter (con fallback system-ui, sans-serif).
**Numeric:** Fraunces con `font-feature-settings: 'tnum'` para todos los precios y números grandes; Inter `tabular-nums` para tablas y celdas de comparación.

**Character:** Fraunces aporta el corazón editorial (es un serif contemporáneo con personalidad fuerte: bracketing visible, italic con swash sutil). Inter es el sans default funcional, deliberadamente neutro. La tensión Fraunces (calidez, autoridad de prensa) + Inter (legibilidad de pantalla) es el equivalente tipográfico del cream + cobalt: tradición editorial encima, utilidad tech debajo.

### Hierarchy
- **Display** (Fraunces 600, `clamp(2.25rem, 6vw, 5.5rem)`, leading 0.95, tracking -0.01em): hero de homepage ("Un vino. Todos los precios.") y hero de ficha de vino. La cursiva (`<span className="italic font-normal">`) se usa para enfatizar UNA palabra dentro del headline, nunca el headline entero.
- **Headline** (Fraunces 600, `text-4xl md:text-5xl lg:text-6xl`, leading 1.05): h2 de cada sección de homepage. Siempre acompañado por un eyebrow uppercase tracking-wide arriba.
- **Title** (Fraunces 600, `text-xl` / `text-2xl`): nombres de vinos en cards, nombres de bodegas, headings de sub-secciones.
- **Body** (Inter 400, `text-base` / `text-lg`, leading 1.55, max 65–75ch): párrafos descriptivos. Las descripciones largas (cómo funciona, sobre el proyecto) viven aquí.
- **Label** (Inter 600, `text-xs`, letter-spacing 0.2em, uppercase): eyebrows de sección, columnas de tabla, store names en pills. Siempre uppercase con tracking ancho.
- **Numeric Display** (Fraunces 600, `text-4xl md:text-5xl`, `tabular-nums`): precios "DESDE $49.500", "AHORRO MÁXIMO 83%", contadores de stats.

### Named Rules

**The Italic-As-Emphasis Rule.** El italic Fraunces es para enfatizar una palabra dentro de un display heading (`<span className="italic font-normal">Todos</span> los precios.`). Nunca italic body. Nunca italic en botones. Nunca un párrafo entero italic.

**The Numeric-Always-Tabular Rule.** Todo precio, porcentaje y contador de stock usa `tabular-nums` o `font-feature-settings: 'tnum'`. Sin excepción. Los dígitos tienen que alinearse verticalmente en columnas de tabla y en flex rows con strike-through.

**The Eyebrow-Above-Headline Rule.** Toda sección importante lleva una etiqueta uppercase pequeña sobre el h2: `<p className="text-{color} text-sm tracking-[0.2em] uppercase font-semibold mb-4">[ZONA]</p>`. El color del eyebrow define el acento de la sección (mustard para price drops, terracota para "Cómo funciona", cobalt para bodegas). El eyebrow es lo que ata la sección al lenguaje editorial.

## 4. Elevation

Sistema mayormente flat con shadows como respuesta a hover (no como decoración estática). La profundidad estructural viene del **gradient sky del hero**, no de shadow-stacks. Cards descansan flat sobre bg cream; al hacer hover, suben 4px y aparecen shadows ambientales.

### Shadow Vocabulary
- **Hero bottle** (`drop-shadow(0 36px 60px rgba(15, 30, 77, 0.5))`): la única shadow grande del sistema, reservada exclusivamente para la ilustración del hero. Es shadow narrativa, no de componente: sostiene la botella visualmente sobre las montañas.
- **Postcard hover** (`box-shadow: 0 20px 40px -20px rgba(15, 23, 41, 0.2)`): aparece SOLO en hover, transición 0.3s con `cubic-bezier(0.65, 0, 0.35, 1)`. Acompaña `transform: translateY(-4px)`.
- **Bodega placa hover** (`box-shadow: 0 18px 36px -18px rgba(15, 23, 41, 0.45)`): variante más fuerte para las placas de bodega con bg coloreado pleno.
- **Search hero** (`shadow-2xl`): el único shadow de "always-on" del sistema, sobre el buscador del hero (justifica la separación visual del input contra el gradient).
- **Sun glow** (`box-shadow: 0 0 120px 30px rgba(232, 181, 71, 0.45)`): glow del sol del hero. Aporte atmosférico, no componente.

### Named Rules

**The Flat-By-Default Rule.** Las cards y botones son flat at rest. Las únicas elevations always-on son el search hero (shadow-2xl) y la botella del hero (drop-shadow narrativa). Todo lo demás se eleva en respuesta a hover. Si una card lleva shadow al estar parada, está rota.

**The No-Glassmorphism-Decorative Rule.** Glassmorphism (backdrop-filter blur) solo se permite cuando el elemento vive sobre un gradient con grain (chips del hero, nav del hero, hero box "Desde / Ahorro máximo" de ficha de vino). Sobre cream/surface, los chips son sólidos: bg blanco + border ink/10.

## 5. Components

### Buttons

- **Shape**: pill (`border-radius: 999px`). Sin botones rectos o `rounded-md` en todo el sistema; la pill es la firma.
- **Primary** (cobalt): bg `#1e3fbf`, texto snow, padding `12px 32px`. Para "Buscar", "Ver vinos comparables", links primarios en CTA finales.
- **Primary hover**: bg flippa a ink (`#0f1729`), transition 0.2s.
- **On-gradient** (cream sobre dark gradient): bg snow `#f5ede0`, texto malbec `#6b1e2e`, hover bg mustard. Es el CTA primario en ficha de vino ("Ir al mejor precio en {tienda}").
- **Secondary / Ghost**: border `ink/20`, texto ink, hover border cobalt + texto cobalt.
- **Outlined-on-dark** (sobre footer / gradient): `bg-snow/15 backdrop-blur border-snow/30`.

### Chips

- **Style sobre gradient** (`.chip`): `bg-white/15 backdrop-blur(8px) border-white/25 text-snow`, padding `10px 16px`, pill. Hover sube 2px + bg `white/25`. SOLO sobre gradient hero / footer dark.
- **Style sobre cream** (`.filter-chip`): bg white sólido, border `#d1d5db`, texto ink, padding `8px 14px`. Active: bg ink + texto snow. Hover: border cobalt + texto cobalt.
- **Mobile filter-chip**: en `max-width: 640px` el padding sube a `10px 16px` y el `font-size` a 14px para 44px touch target.

### Cards / Containers

- **Postcard** (`.postcard`): bg `#f5ede0` cream, border `ink/10` (1px), radius 24px (`xl`), padding 20–32px. Transición flat → translateY(-4px) + shadow `0 20px 40px -20px rgba(15,23,41,0.2)` en hover. Para grids de vinos / ofertas / regiones.
- **Hero info box** (ficha de vino, "Desde / Ahorro máximo"): `bg-snow/10 backdrop-blur border-snow/20 rounded-2xl px-6 py-5`. Glassmorphism justificada por vivir sobre el gradient.
- **Region card**: aspect-ratio 3/4, gradient único por región como bg, montañas siluetadas SVG al pie, label uppercase del macro-región + nombre display + contador de vinos.
- **Bodega placa**: aspect-ratio 5/6 (proporción etiqueta de botella), bg color pleno determinístico por hash del nombre, monograma 1–2 letras Fraunces 5rem centrado, nombre completo + counters chicos al pie.

### Inputs / Fields

- **Hero search** (`.input-hero`): bg snow cream sobre gradient, pill, padding `8px` con `pl-6`, ring `ink/5`, `shadow-2xl`. Botón "Buscar" cobalt inline a la derecha, separación visual por el contraste de fondos. SVG search icon graphite a la izquierda.
- **Sticky search header**: bg white, border `ink/10`, pill, padding `4px` con `pl-4`, sin shadow grande (el header ya tiene `shadow-sm`).
- **Filter input** (admin / bodegas filter): `varietal-tag` style, bg `snow/90`, border `ink/12`, pill 999px, padding `6px 12px`, font-weight 600, letter-spacing `0.01em`.
- **Focus visible global**: `outline: 2px solid cobalt, outline-offset: 2px, border-radius: 4px`. En dark, outline-color `#8eb4ff` (cyan claro).

### Navigation

- **Hero nav** (sobre gradient): `position: absolute`, sin bg propio, links como chips glass, padding `20–24px`. ThemeToggle + FavoritesNavLink siempre a la derecha. Logo Vinndex con el ícono SVG montaña + estrella mustard.
- **Sticky header** (ficha de vino, /buscar): `sticky top-0 z-30`, bg white, border-bottom `ink/10`, `shadow-sm`. Logo a la izquierda + form de búsqueda al medio (flex-1) + favoritos + theme toggle.
- **Skip-to-content**: `position: absolute, left: -9999px`. En `:focus` se materializa: bg ink, texto snow, padding `12px 20px`, border-radius `0 0 12px 0`.

### Signature Components

- **Hero bottle SVG** (homepage): ilustración inline de 240×560, botella Bordeaux con wax cap dripped, label cream con grape cluster + vine leaf, wordmark "VINNDEX" Fraunces 22 letter-spacing 2.5, "MENDOZA · ARGENTINA" Inter 7.5 tracking 3.5, "EST · 2026" stamp. La drop-shadow narrativa la separa del cielo.
- **Sky gradient** (`.nagai-sky`): `linear-gradient(180deg, #0F1E4D 0%, #1E3FBF 30%, #4D79E8 55%, #E8859E 78%, #E8B547 92%, #F5EDE0 100%)`. Hero homepage exclusivo. Inspirado en Hiroshi Nagai.
- **Ficha hero gradient** (`.ficha-hero`): `linear-gradient(160deg, #0F1E4D 0%, #1E3FBF 40%, #4D79E8 75%, #E8859E 100%)`. Variante diagonal para hero de ficha.
- **Grain texture** (`.grain::before`): SVG `feTurbulence` con `mix-blend-mode: multiply`, opacity 0.18. Encima de todo bg con gradient. Es lo que le da grano de papel impreso al sistema.
- **Wine cursor** (`.cursor-wine`): cursor custom SVG con forma de gota vinosa (`#6B1E2E`), aplicado a todo link/botón. Es la firma interactiva del sitio.
- **Store logo**: cuadrado 44×44, radius 10px, fondo color determinístico por slug (9 colores oscurecidos para pasar AA con texto cream), iniciales 2 letras Fraunces 14, text-shadow `0 1px 2px rgba(15,23,41,0.55)` para legibilidad sobre los bg más claros.

## 6. Do's and Don'ts

### Do:
- **Do** usar Fraunces 600 + italic para una palabra de énfasis dentro de un display heading. Una sola palabra, nunca el headline entero.
- **Do** acompañar cada h2 de sección con un eyebrow uppercase tracking-wide en el color de acento de la sección.
- **Do** dar a cada bodega/región/varietal su propia identidad visual (color + monograma + ilustración) cuando aparece en grids repetitivos. La diferencia entre "directorio funcional" y "memorable" es la identidad por item.
- **Do** usar `tabular-nums` o `font-feature-settings: 'tnum'` en TODO precio, porcentaje y contador. Sin excepciones.
- **Do** mantener el cursor wine en todos los elementos interactivos (links, botones, cards clickeables).
- **Do** justificar el glassmorphism por el contexto: chip glass sobre gradient sí, chip glass sobre cream no.
- **Do** preferir tonal-tint (`rgba(color, 0.14)`) para signaling de estado en filas/cards, sobre bordes de colores discretos.
- **Do** mantener el voseo rioplatense en todo copy ("Buscás", "Compará", "Sumate"). El registro es Argentina, no español neutro.

### Don't:
- **Don't** usar `border-left` (o `border-right`) mayor a 1px como acento de color en cards, filas o callouts. Side-stripe ban absoluto del impeccable.
- **Don't** combinar gradient + `background-clip: text` para hacer gradient text. Una sola palabra en color sólido y enfatizá con peso o italic.
- **Don't** usar em-dashes (`—`) en copy. Usá comas, puntos, paréntesis, o el interpunct `·` para titles. Los `—` standalone tabulares ("no data" en celdas) son la única excepción.
- **Don't** copiar el template SaaS "Cómo funciona" (3 cards postcards iguales con `01/02/03 + icono + heading + texto`). Cada paso necesita SU PROPIA ilustración.
- **Don't** caer en el hero-metric template ("big number + small label" copiado de SaaS). Si vas a poner 3 números, dales rol distinto (catálogo / cobertura / pricing), no decoración cromática random.
- **Don't** usar dark mode con purple gradients + neon accents. Ese no es nuestro lenguaje: el dark de Vinndex es `#0b1020` (azul medianoche profundo, no negro) con accents cálidos (mustard, malbec, terracota aclarados).
- **Don't** usar shadows decorativas estáticas. Una card con shadow al estar parada (sin hover) está rota.
- **Don't** glassmorphism por default. Solo sobre gradients, nunca sobre cream/surface flat.
- **Don't** mezclar font-families distintas de Fraunces + Inter. Si necesitás un tercer tipo (mono para código de admin), es system mono (`ui-monospace, "SF Mono", Menlo`), no una Google Font nueva.
- **Don't** introducir `border-radius: 0` o `border-radius: 4px` en componentes interactivos. La pill (999px) es la firma de Vinndex.
- **Don't** usar `#000` o `#fff` puros. Todo neutro tiene chroma mínima hacia la familia ink (`#0f1729` / `#f5ede0`).
