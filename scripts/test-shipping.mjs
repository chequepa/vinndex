#!/usr/bin/env node
/**
 * Casos dorados del extractor de envío gratis (scripts/lib-shipping.mjs).
 * Offline. Los textos imitan las franjas de anuncio y las páginas de envío
 * reales de Tiendanube / WooCommerce / Shopify.
 */
import { htmlToText, extractFreeShipping, summarize, shippingLinks } from "./lib-shipping.mjs";

let fallos = 0;
function check(desc, cond, got) {
  if (!cond) fallos++;
  console.log(`  ${cond ? "✅" : "❌ FALLA"}  ${desc}  →  ${got}`);
}
const one = (html) => {
  const c = extractFreeShipping(htmlToText(html));
  return c.map((x) => `${x.zona}:${x.monto}`).join(" ") || "(nada)";
};

console.log("=== Franja de anuncio / página de envíos ===");
check("CABA a partir de $60.000", one(`<div class="announcement">Envío gratis en CABA a partir de $60.000</div>`) === "amba:60000", one(`<div class="announcement">Envío gratis en CABA a partir de $60.000</div>`));
check("todo el país, mayúsculas y espacio", one(`<p>ENVÍOS SIN CARGO DESDE $ 85.000 A TODO EL PAÍS</p>`) === "nacional:85000", one(`<p>ENVÍOS SIN CARGO DESDE $ 85.000 A TODO EL PAÍS</p>`));
check("sin zona → general", one(`<span>Envío gratis superando $120.000</span>`) === "general:120000", one(`<span>Envío gratis superando $120.000</span>`));
check("con decimales", one(`<li>Envío gratuito en AMBA en compras mayores a $75.000,00</li>`) === "amba:75000", one(`<li>Envío gratuito en AMBA en compras mayores a $75.000,00</li>`));
check("'mil'", one(`<p>Envío sin costo en Capital Federal desde 90 mil</p>`) === "amba:90000", one(`<p>Envío sin costo en Capital Federal desde 90 mil</p>`));
check("frase partida en dos líneas", one(`<div>Envío gratis</div><div>en GBA desde $100.000</div>`) === "amba:100000", one(`<div>Envío gratis</div><div>en GBA desde $100.000</div>`));
check("entidad &#36;", one(`<p>Envío gratis en CABA desde &#36;55.000</p>`) === "amba:55000", one(`<p>Envío gratis en CABA desde &#36;55.000</p>`));
const dos = `<p>Envío gratis en CABA desde $60.000</p><p>Envío gratis a todo el país desde $150.000</p>`;
check("dos zonas en la misma página", one(dos) === "amba:60000 nacional:150000", one(dos));

console.log("\n=== Lo que NO tiene que contar ===");
check("precio de un vino, sin 'envío gratis'", one(`<p>Catena Zapata Malbec $57.900</p>`) === "(nada)", one(`<p>Catena Zapata Malbec $57.900</p>`));
check("envío gratis sin monto", one(`<p>Envío gratis a todo el país</p>`) === "(nada)", one(`<p>Envío gratis a todo el país</p>`));
check("monto absurdo ($500)", one(`<p>Envío gratis desde $500</p>`) === "(nada)", one(`<p>Envío gratis desde $500</p>`));
check("script con 'envío gratis' no cuenta", one(`<script>var x="Envío gratis desde $60.000"</script><p>Hola</p>`) === "(nada)", one(`<script>var x="Envío gratis desde $60.000"</script><p>Hola</p>`));

console.log("\n=== Resumen ===");
const s = summarize([
  { zona: "amba", monto: 60000, frase: "a" },
  { zona: "amba", monto: 80000, frase: "b" },
]);
check("se queda el más bajo y marca conflicto", s.byZona.amba.monto === 60000 && s.conflicto, `${s.byZona.amba.monto} conflicto=${s.conflicto}`);

console.log("\n=== Links a la página de envíos ===");
const home = `<a href="/envios/">Envíos</a><a href="https://otra.com/envios">x</a><a href="/productos/">Productos</a><a href="/pages/politica">Política de despacho</a>`;
const links = shippingLinks(home, "https://tienda.com.ar");
check("toma los internos con envío/despacho", links.join(",") === "https://tienda.com.ar/envios/,https://tienda.com.ar/pages/politica", links.join(","));

console.log("");
if (fallos) {
  console.log(`❌ ${fallos} caso(s) fallaron. Revisar scripts/lib-shipping.mjs.`);
  process.exit(1);
}
console.log("✅ Todos los casos dorados del extractor de envíos pasan.");
