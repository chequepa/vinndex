/**
 * Extracción de "envío gratis desde $X" del texto de una vinoteca.
 *
 * Lo usa scripts/survey-shipping.mjs (relevamiento mensual) y lo prueban
 * los casos dorados de scripts/test-shipping.mjs, sin red.
 *
 * Qué se busca: la frase en la que la TIENDA publica su mínimo para envío
 * gratis ("Envío gratis en CABA a partir de $60.000", "ENVÍOS SIN CARGO
 * DESDE $ 85.000 A TODO EL PAÍS"). Se guarda el monto, la zona y la frase
 * textual como evidencia: el dato se muestra al público en /compra, así
 * que tiene que poder revisarse a ojo en el PR.
 *
 * Qué NO se hace: inventar costos. Si la frase no trae un monto creíble
 * ($10.000 – $1.000.000), no hay dato.
 */

/** HTML → texto plano, con saltos donde había bloques. */
export function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/td|\/tr|\/section|\/span)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const GRATIS_RE = /(env[ií]os?|despachos?)\s*(?:a domicilio\s*)?(gratis|gratuitos?|sin\s+cargo|sin\s+costo|bonificados?)|(gratis|sin\s+cargo|sin\s+costo)\s+(?:el\s+|tu\s+|los\s+)?env[ií]o/i;
// "$60.000", "$ 60000", "$60.000,00", "60 mil", "$60k"
const MONTO_RE = /\$\s?(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?:,\d{2})?|(\d{2,3})\s?(?:mil\b|k\b)/gi;

// Orden = prioridad ante empate de distancia. "local" son ciudades fuera
// de AMBA: un "gratis en Rosario desde $100.000" no le sirve a alguien de
// Palermo y la UI no lo muestra (queda guardado para cuando el sitio sepa
// la zona de la persona, docs/cobertura-nacional.md).
const ZONAS = [
  { zona: "nacional", re: /todo el pa[ií]s|todo argentina|toda la argentina|a nivel nacional|env[ií]os? nacionales?|interior del pa[ií]s|resto del pa[ií]s/gi },
  { zona: "amba", re: /\bcaba\b|capital federal|ciudad aut[oó]noma|\bamba\b|gran buenos aires|\bgba\b|conurbano|zona norte|zona sur|zona oeste|vicente l[oó]pez|avellaneda|san isidro/gi },
  { zona: "local", re: /\brosario\b|la plata|c[oó]rdoba|\bmendoza\b|neuqu[eé]n|tucum[aá]n|mar del plata|bah[ií]a blanca|\bsalta\b|santa fe|san juan|bariloche|alrededores|localidades seleccionadas|\binterior zona\b/gi },
];

// Un monto es un MÍNIMO de envío gratis sólo si viene con su palabra
// ("desde $X", "superando $X", "compras de $X"). Sin eso suele ser un
// precio: "2 cajas 50% OFF + envío gratis en CABA $94.800" (Vinos x Caja,
// 12/10/2026) es el precio de la promo, no el mínimo.
const CUE_RE = /(desde|a partir de|partir de los?|superando( los)?|supera(n)?( los)?|superiores? a|mayor(es)? a|m[aá]s de|por encima de|m[ií]n(imo|\.)?|monto m[ií]nimo|sumando|compras? de|compras? por|en compras de)\s*(los\s*)?$/i;

function parseMonto(m) {
  if (m[1]) return Number(m[1].replace(/[.\s]/g, ""));
  if (m[2]) return Number(m[2]) * 1000;
  return null;
}

/** Zona más cercana a `pos` dentro de `text` (o null). */
function nearestZone(text, pos) {
  let best = null;
  for (const z of ZONAS) {
    z.re.lastIndex = 0;
    let m;
    while ((m = z.re.exec(text))) {
      const d = Math.min(Math.abs(m.index - pos), Math.abs(m.index + m[0].length - pos));
      if (!best || d < best.d) best = { zona: z.zona, d };
    }
  }
  return best?.zona ?? null;
}

/**
 * Frases candidatas. La zona se asigna POR MONTO y dentro de su oración:
 * "gratis en La Plata desde $10.000 y CABA y GBA desde $100.000" son dos
 * mínimos distintos (Casa Dionisio), igual que "desde $150.000 en CABA y
 * GBA · desde $350.000 a todo el país" (Central de Vinos). Para cada monto
 * se mira primero el tramo entre el monto anterior y éste; si ahí no hay
 * zona, el tramo siguiente hasta el próximo monto (y ese tramo queda
 * "usado", para que no lo tome también el monto de después).
 * Devuelve [{ zona: "amba"|"nacional"|"local"|"general", monto, frase }].
 */
export function extractFreeShipping(text) {
  if (!text) return [];
  const out = [];
  const seen = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Todas las menciones de la línea: "…de tener envío gratis! Envío
    // gratis superando los $200.000" (Varietal) tiene dos, y la primera
    // termina su oración antes del monto.
    for (const g of line.matchAll(new RegExp(GRATIS_RE.source, "gi"))) {
    // La frase puede seguir en la línea siguiente ("Envío gratis" / "desde
    // $60.000"), pero sólo si la línea del "gratis" no trae monto propio.
    const startAt = Math.max(0, g.index - 120);
    const own = line.slice(startAt, g.index + 260);
    MONTO_RE.lastIndex = 0;
    const ctx = MONTO_RE.test(own) ? own : (line + " " + (lines[i + 1] ?? "")).slice(startAt, g.index + 260);

    // Oración que contiene el "gratis": de ahí no se sale. Empieza en el
    // último corte (punto, ¡!, ¿?, "|") antes del "gratis": "…cuotas sin
    // interés en compras superiores a $200.000 💳 ¡Envío gratis a todo el
    // país a partir de $100.000" (Bianchi) — los $200.000 son de las cuotas.
    const gIdx = Math.max(0, g.index - startAt);
    const before = ctx.slice(0, gIdx);
    const cut = Math.max(before.lastIndexOf(". "), before.lastIndexOf("¡"), before.lastIndexOf("!"), before.lastIndexOf("¿"), before.lastIndexOf("?"), before.lastIndexOf("|"));
    const sentStart = cut >= 0 ? cut + 1 : 0;
    // Fin de oración: punto después de minúscula o paréntesis. "24 HS. Y
    // DESDE $350.000…" (todo en mayúsculas) NO corta: es una abreviatura.
    const nextDot = ctx.slice(gIdx).search(/[a-záéíóúñ)]\.\s+[A-ZÁÉÍÓÚ¡]|!\s|\?\s/);
    const sentEnd = nextDot >= 0 ? gIdx + nextDot + 2 : ctx.length;
    const sent = ctx.slice(sentStart, sentEnd);
    const frase = sent.replace(/\s+/g, " ").trim().slice(0, 240);

    MONTO_RE.lastIndex = 0;
    const montos = [];
    let m;
    while ((m = MONTO_RE.exec(sent))) montos.push({ m, start: m.index, end: m.index + m[0].length });
    let consumedUpTo = 0;
    let lastAcceptedEnd = -1;
    for (let k = 0; k < montos.length; k++) {
      const { m: mm, start, end } = montos[k];
      const monto = parseMonto(mm);
      if (monto == null || monto < 10_000 || monto > 1_000_000) continue;
      // Con su palabra ("desde $X") o encadenado a un mínimo anterior de la
      // misma frase ("desde $60.000 (CABA) y $80.000 (Zona Norte)").
      const chained = lastAcceptedEnd >= 0 && start - lastAcceptedEnd <= 40;
      if (!chained && !CUE_RE.test(sent.slice(Math.max(0, start - 45), start))) continue;
      lastAcceptedEnd = end;
      const prevEnd = Math.max(k > 0 ? montos[k - 1].end : 0, consumedUpTo);
      const nextStart = k + 1 < montos.length ? montos[k + 1].start : sent.length;
      const segBefore = sent.slice(prevEnd, start);
      let zona = nearestZone(segBefore, segBefore.length);
      if (!zona) {
        const after = sent.slice(end, nextStart);
        zona = nearestZone(after, 0);
        if (zona) consumedUpTo = nextStart;
      }
      zona ??= "general";
      const key = `${zona}|${monto}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ zona, monto, frase });
    }
    }
  }
  return out;
}

/**
 * Resumen por tienda: el mínimo más bajo publicado por zona. Si hay frases
 * contradictorias (dos montos distintos para la misma zona) se queda el más
 * bajo y lo marca `conflicto` para revisar a mano.
 */
export function summarize(candidates) {
  const byZona = {};
  let conflicto = false;
  for (const c of candidates) {
    const prev = byZona[c.zona];
    if (prev && prev.monto !== c.monto) conflicto = true;
    if (!prev || c.monto < prev.monto) byZona[c.zona] = c;
  }
  return { byZona, conflicto };
}

/**
 * Links a páginas de envío desde el home: el texto o el href mencionan
 * envío/despacho/entregas. Rutas relativas se resuelven contra `base`.
 */
export function shippingLinks(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, " ");
    if (!/env[ií]o|despacho|entrega|shipping/i.test(href + " " + label)) continue;
    try {
      const u = new URL(href, base);
      if (u.hostname !== new URL(base).hostname) continue;
      if (/\.(jpg|png|webp|pdf)$/i.test(u.pathname)) continue;
      out.add(u.origin + u.pathname);
    } catch {
      /* href roto */
    }
  }
  return [...out].slice(0, 4);
}

/** Rutas típicas de la página de envíos por plataforma. */
export function candidatePaths(platform) {
  const common = ["/envios/", "/envios", "/politica-de-envios/", "/preguntas-frecuentes/"];
  if (platform === "shopify") return ["/policies/shipping-policy", "/pages/envios", "/pages/envios-y-entregas", ...common];
  if (platform === "tiendanube") return ["/envios/", "/politica-de-envios/", "/como-comprar/", "/preguntas-frecuentes/"];
  if (platform === "woocommerce") return ["/envios/", "/politica-de-envios/", "/envios-y-devoluciones/", "/preguntas-frecuentes/", "/terminos-y-condiciones/"];
  return common;
}
