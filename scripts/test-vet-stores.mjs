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
import { ocultaBotonDeCompra } from "./vet-store-candidates.mjs";

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

console.log("");
if (fallos) {
  console.log(`❌ ${fallos} caso(s) fallaron. Revisar scripts/vet-store-candidates.mjs.`);
  process.exit(1);
}
console.log("✅ Todos los casos dorados del filtro de tiendas pasan (9).");
