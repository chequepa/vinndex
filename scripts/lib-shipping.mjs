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

const ZONAS = [
  { zona: "nacional", re: /todo el pa[ií]s|todo argentina|toda la argentina|a nivel nacional|env[ií]os? nacionales?|interior del pa[ií]s|resto del pa[ií]s/i },
  { zona: "amba", re: /\bcaba\b|capital federal|ciudad aut[oó]noma|\bamba\b|gran buenos aires|\bgba\b|conurbano|zona norte|zona sur|zona oeste/i },
];

function parseMonto(m) {
  if (m[1]) return Number(m[1].replace(/[.\s]/g, ""));
  if (m[2]) return Number(m[2]) * 1000;
  return null;
}

/**
 * Frases candidatas: cada línea (o ventana de ~220 caracteres alrededor del
 * "envío gratis") que tenga un monto creíble.
 * Devuelve [{ zona: "amba"|"nacional"|"general", monto, frase }].
 */
export function extractFreeShipping(text) {
  if (!text) return [];
  const out = [];
  const seen = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const g = GRATIS_RE.exec(line);
    if (!g) continue;
    // La frase puede seguir en la línea siguiente ("Envío gratis" / "desde
    // $60.000"), pero sólo si la línea del "gratis" no trae monto propio:
    // si no, la zona de la línea de abajo ("…a todo el país desde
    // $150.000") contaminaba a la de arriba.
    const start = Math.max(0, g.index - 120);
    const own = line.slice(start, g.index + 220);
    MONTO_RE.lastIndex = 0;
    const ownHasMonto = MONTO_RE.test(own);
    const ctx = ownHasMonto ? own : (line + " " + (lines[i + 1] ?? "")).slice(start, g.index + 220);
    MONTO_RE.lastIndex = 0;
    let m;
    while ((m = MONTO_RE.exec(ctx))) {
      const monto = parseMonto(m);
      if (monto == null || monto < 10_000 || monto > 1_000_000) continue;
      const zona = ZONAS.find((z) => z.re.test(ctx))?.zona ?? "general";
      const frase = ctx.replace(/\s+/g, " ").trim().slice(0, 240);
      const key = `${zona}|${monto}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ zona, monto, frase });
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
