/**
 * Casos dorados del filtro de vinotecas candidatas.
 * Offline: no toca la red. Corre en CI junto al resto.
 *
 * El caso testigo es Vinoteca Masis (commit 843f9dd), que se dio de alta
 * sin este filtro y hubo que sacarla: WooCommerce en catalog-mode, con el
 * botón de comprar escondido por CSS. La API dice `is_purchasable: true`
 * igual, así que mirar sólo la API NO alcanza — por eso el chequeo del
 * HTML corre siempre. El fragmento de abajo es el CSS real que el sitio
 * servía el 20/09/2026.
 */
import { ocultaBotonDeCompra, parseTiendanubeListing, storeNameFromHtml } from "./vet-store-candidates.mjs";
import { slugFromHost } from "./detect-platform.mjs";

let fallos = 0;
function check(desc, cond, got) {
  const ok = !!cond;
  if (!ok) fallos++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${desc}  →  ${got}`);
}

console.log("=== CATALOG-MODE: el botón de comprar está escondido ===");

// CSS real de vinotecamasis.com.ar. Lo que importa: entre el selector y la
// llave hay una LISTA de selectores, así que una regex que pida `{` pegado
// al selector no lo ve (fue el primer intento y dejó pasar el caso).
const MASIS = `
.woocommerce div.product form.cart .single_add_to_cart_button, .ppc-button-wrapper,
.wc-ppcp-paylater-msg__container, form.cart .quantity, table.variations,
form.variations_form, .single_variation_wrap .variations_button,
.widget.woocommerce.widget_shopping_cart{display: none !important}
/*# sourceURL=ywctm-frontend-inline-css */`;
check("Masis: lista de selectores + display:none", ocultaBotonDeCompra(MASIS), "detectado");

check(
  "marcador del plugin YITH Catalog Mode solo",
  ocultaBotonDeCompra("<style id='ywctm-frontend-inline-css'>.x{color:red}</style>"),
  "detectado",
);
check(
  "llave pegada al selector (la forma simple)",
  ocultaBotonDeCompra(".single_add_to_cart_button{display:none}"),
  "detectado",
);
check(
  "display : none con espacios",
  ocultaBotonDeCompra(".single_add_to_cart_button, .otra { display : none !important }"),
  "detectado",
);

console.log("\n=== TIENDAS SANAS: no se las marca de más ===");
// Regla real de foco: nombra el selector y NO apaga el display. Aparece en
// las 8 vinotecas Woo vivas que se probaron el 20/09 y ninguna dio positivo.
check(
  "regla :focus que sólo cambia el outline",
  !ocultaBotonDeCompra(".single_add_to_cart_button:focus{outline:2px solid #333}"),
  "no detectado",
);
check(
  "la palabra aparece sin regla de CSS",
  !ocultaBotonDeCompra('<button class="single_add_to_cart_button">Agregar al carrito</button>'),
  "no detectado",
);
check(
  "display:none de otro elemento, en otra regla",
  !ocultaBotonDeCompra(".single_add_to_cart_button{color:#fff}\n.modal{display:none}"),
  "no detectado",
);
check("HTML vacío no rompe", !ocultaBotonDeCompra(""), "no detectado");
check("null/undefined no rompen", !ocultaBotonDeCompra(null) && !ocultaBotonDeCompra(undefined), "no detectado");

console.log("\n=== LISTADO TIENDANUBE: lo mismo que lee el scraper (JSON-LD) ===");
// Tema nuevo: el nombre del producto va en un <div> adentro del <a
// class="js-item-name">, así que la regex vieja (texto pegado al <a>) no
// veía nada y el vet descartaba 20 tiendas el 12/10/2026.
const TN_NUEVO = `
<a href="/productos/kung-fu/" class="js-item-name item-link" title="Kung Fu Malbec"><div class="item-name">Kung Fu Malbec</div></a>
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Kung Fu Malbec","offers":{"@type":"Offer","price":"24740.00","priceCurrency":"ARS","availability":"http://schema.org/InStock"}}</script>
<script type="application/ld+json">[{"@type":"Product","name":"Saint Felicien Malbec","offers":{"price":9100,"priceCurrency":"ARS","availability":"http://schema.org/OutOfStock"}}]</script>`;
const tn = parseTiendanubeListing(TN_NUEVO);
check("tema nuevo: lee los 2 productos del JSON-LD", tn.length === 2, tn.length);
check("precio y moneda del JSON-LD", tn[0]?.price === 24740 && tn[0]?.currency === "ARS", `${tn[0]?.price} ${tn[0]?.currency}`);
check("sin stock marcado como no comprable", tn[1]?.comprable === false, String(tn[1]?.comprable));
const TN_VIEJO = `<a class="js-item-name" href="/x">Malbec Reserva</a><meta itemprop="price" content="12000">`;
const tv = parseTiendanubeListing(TN_VIEJO);
check("tema viejo sin JSON-LD: cae a las clases del markup", tv.length === 1 && tv[0].name === "Malbec Reserva", tv.map((x) => x.name).join(","));
check("HTML sin productos → lista vacía", parseTiendanubeListing("<html></html>").length === 0, "0");

console.log("\n=== NOMBRE Y SLUG DE LA TIENDA ===");
check("og:site_name", storeNameFromHtml('<meta property="og:site_name" content="Llegó el Vino!">') === "Llegó el Vino!", storeNameFromHtml('<meta property="og:site_name" content="Llegó el Vino!">'));
check("<title> hasta el separador", storeNameFromHtml("<title>Herencia Deli &amp; Wine | Tienda online</title>") === "Herencia Deli & Wine", storeNameFromHtml("<title>Herencia Deli &amp; Wine | Tienda online</title>"));
check("title genérico → null (respaldo del dominio)", storeNameFromHtml("<title>Inicio</title>") === null, String(storeNameFromHtml("<title>Inicio</title>")));
check("slug sin '-mitiendanube'", slugFromHost("llegoelvino.mitiendanube.com") === "llegoelvino", slugFromHost("llegoelvino.mitiendanube.com"));
check("slug sin prefijo shop./tienda.", slugFromHost("shop.norton.com.ar") === "norton" && slugFromHost("tienda.escorihuela.com") === "escorihuela", `${slugFromHost("shop.norton.com.ar")} ${slugFromHost("tienda.escorihuela.com")}`);
check("slug de dominio común no cambia", slugFromHost("www.vinotecacampos.com.ar") === "vinotecacampos", slugFromHost("www.vinotecacampos.com.ar"));

console.log("");
if (fallos) {
  console.log(`❌ ${fallos} caso(s) fallaron. Revisar scripts/vet-store-candidates.mjs.`);
  process.exit(1);
}
console.log("✅ Todos los casos dorados del filtro de tiendas pasan.");
