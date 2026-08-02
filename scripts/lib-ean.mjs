/**
 * Validación de EAN/GTIN para el camino de IDENTIDAD.
 *
 * El pipeline trata al código de barras como evidencia fuerte: dos ofertas
 * que comparten EAN son el mismo producto, y con eso se fusionan grupos y
 * se generan las preguntas "¿es el mismo vino?". Esa confianza se apoya en
 * que el código sea realmente un GTIN, no un ID interno de la tienda.
 *
 * El campo `externalSku` es un cajón de sastre: de las 50.484 ofertas que
 * lo traen, sólo 19.468 tienen forma de EAN. El resto son IDs de la tienda
 * ("GRANDCRU", "CPAR-0001", "234", "0") y ya los descarta el chequeo de
 * 12-14 dígitos que había antes. Lo que NO descartaba es el número que
 * tiene la forma correcta pero no es un GTIN válido — hoy 116 ofertas, de
 * las cuales 2 códigos aparecen en 2 fichas distintas cada uno:
 *
 *   5400141902398 → assemblage-catalpa + set-de-cocteleria-3-piezas-schon
 *   7795260000000 → dos molinillos de pimienta El Castillo
 *
 * Un vino fusionado con un set de coctelería es exactamente la quimera que
 * el proyecto combate. El dígito verificador lo corta sin costo.
 *
 * Ojo: esto es para identidad, no para búsqueda. `/buscar` sigue aceptando
 * cualquier cosa con forma de EAN a propósito — si una tienda publicó el
 * código con un typo y alguien lo busca tal cual, encontrar la ficha es lo
 * correcto. Un falso positivo en búsqueda es barato; en un merge, no.
 */

/** Formas aceptadas: EAN-8, UPC-A (12), EAN-13, GTIN-14. */
const EAN_SHAPE_RE = /^(?:\d{8}|\d{12,14})$/;

/**
 * Dígito verificador GS1 (mod 10). Se pesan los dígitos de derecha a
 * izquierda alternando 3 y 1, arrancando en 3 sobre el que está pegado al
 * verificador. Vale igual para EAN-8, UPC-A, EAN-13 y GTIN-14.
 */
function checkDigitOk(code) {
  const digits = code.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * `true` si el valor es un GTIN usable como evidencia de identidad.
 * Acepta string o cualquier cosa (los scrapers a veces dejan números).
 */
export function isValidEan(raw) {
  const v = String(raw ?? "").trim();
  if (!EAN_SHAPE_RE.test(v)) return false;
  return checkDigitOk(v);
}

/**
 * Devuelve el EAN normalizado (sin espacios) si es válido, o `null`.
 * Pensado para usar como clave de Map sin repetir el trim en cada llamada.
 */
export function toEan(raw) {
  const v = String(raw ?? "").trim();
  return isValidEan(v) ? v : null;
}
