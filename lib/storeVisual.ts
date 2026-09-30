/**
 * Identidad visual de una vinoteca (placa "store-logo" de DESIGN.md):
 * iniciales + color determinístico por slug. Vivía en la ficha de vino;
 * se extrajo para que /vinoteca/[slug] y el badge muestren exactamente
 * la misma placa que la tabla de precios.
 */

export function storeInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Color determinístico por slug · cada tienda tiene su badge color.
// Todos los tonos están oscurecidos lo suficiente para pasar contraste
// WCAG AA (≥4.5) con el texto cream `#f5ede0`. Antes había mustard
// (#E8B547), verde (#2FB344), terracota (#D97449), azul claro
// (#7C8FD9) que daban ratios ≤4.5 · Lighthouse a11y los flaggeaba.
const STORE_COLORS = [
  "#6B1E2E", // malbec oscuro
  "#1E3FBF", // cobalt
  "#A4441C", // terracota oscuro (era #D97449)
  "#9C7517", // mustard oscuro (era #E8B547)
  "#2B4FA8", // azul medio (era #4D79E8)
  "#A02356", // rosa oscuro (era #D63A7A)
  "#4D5FA3", // azul claro oscurecido (era #7C8FD9)
  "#1C6929", // verde oscuro (era #2FB344)
  "#5C3D87", // violeta oscuro (era #7F54B3)
];

export function colorForStore(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return STORE_COLORS[h % STORE_COLORS.length];
}
