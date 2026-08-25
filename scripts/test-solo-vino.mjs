/**
 * Casos dorados de "solo vino" — `isNonWineGroup` en lib/junkSlugs.ts.
 *
 * Vinndex es un comparador de VINO (decisión de producto, 24/08/2026), y
 * este filtro es el que saca del sitio lo que no lo es. Un falso positivo
 * acá borra una ficha de comparación real, así que los casos de abajo son
 * los que hay que no romper.
 *
 * Importa el .ts DIRECTO: Node 24 le saca los tipos solo. Así el test
 * corre la función de verdad y no una copia que se desincroniza.
 *
 * Correr: node scripts/test-solo-vino.mjs
 */
import { isNonWineGroup } from "../lib/junkSlugs.ts";

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅  ${name}${detail ? "  →  " + detail : ""}`); }
  else { fail++; console.log(`  ❌ FALLA  ${name}${detail ? "  →  " + detail : ""}`); }
}
const fuera = (n) => isNonWineGroup({ canonicalName: n });

console.log("\n=== NO ES VINO (tiene que salir del sitio) ===");
for (const [n, por] of [
  ["Aperol Aperitivo 750ml", "aperitivo"],
  ["CAMPARI 750 CC", "aperitivo"],
  ["Chandon Apéritif", "aperitivo"],
  ["Johnnie Walker Black Label", "whisky por categoría"],
  ["Jim Beam Honey", "whisky SÓLO por marca"],
  ["Glenfiddich 12 Años", "single malt sólo por marca"],
  ["THE GLENLIVET 12 AÑOS", "single malt sólo por marca"],
  ["The Macallan Sherry Oak 12 Años", "single malt sólo por marca"],
  ["BEEFEATER 24", "gin sólo por marca"],
  ["ABSOLUT MANGO", "vodka sólo por marca"],
  ["Jagermeister", "licor sólo por marca"],
  ["Tres Plumas Chocolate Blanco", "licor por marca, no por sabor"],
  ["Gift Card $ 60000", "gift card"],
  ["Enófilo Blancos · Gift Cards", "gift card en plural"],
  ["ACEITE DE OLIVA ZUCCARDI ARAUCO 500 ML", "almacén"],
  ["Sacacorchos 2 tiempos", "barware"],
  ["Copa Riedel Winewings Pinot Noir", "cristalería"],
  ["FERNETOMETRO BRANCA", "merch"],
  ["Sidra la Farruca 710ml", "sidra no es vino"],
  ["Gin Hilbing Malbec 750ml", "gin aunque diga Malbec"],
  ["GRAPPA ANIAPA CABERNET SAUVIGNON", "grappa aunque diga Cabernet"],
  ["Copon Wine Malbec Liso 800cc", "copón encabezando = cristalería"],
  ["The Lakes Whiskymaker\u2019s Editions Single Malt Resfeber 700ml", "whisky pegado a otra palabra"],
  ["Glen Moray Our Classic Single Malt 700ml", "single malt sin decir whisky"],
  ["Single Malt Glen Moray Chardonnay Cask Finish 700 Ml", "single malt manda sobre chardonnay"],
  ["Cutty Sark Blended Scotch 750 Cc", "blended scotch"],
]) check(n, fuera(n) === true, por);

console.log("\n=== SÍ ES VINO (no se puede borrar) ===");
for (const [n, por] of [
  ["Zuccardi Concreto Malbec", "caso dorado"],
  ["El Enemigo Malbec", "caso dorado"],
  ["Colección Cabernet franc", "línea Colección de Rutini, 16 tiendas"],
  ["Rutini Pinot Noir", "slug arranca con coleccion-"],
  ["Sin Reglas Malbec", "la bodega se llama Sin Reglas"],
  ["Vino Cepa Tradicional Malbec", "la línea se llama Cepa Tradicional"],
  ["LOS INTOCABLES BOURBON BARREL MALBEC", "barrica de bourbon, no whisky"],
  ["Las Perdices Reserva Malbec Bag In Box", "vino en otro envase"],
  ["Estuche Madera Siesta Malbec X3", "vino en estuche"],
  ["Estuche Serie A Malbec + Copon 750 Cc", "vino con copa de regalo"],
  ["SANTA JULIA MALBEC + copa", "botella con copa, no venta por copa"],
  ["DADA 8 CHOCOLATE", "Dadá Art es vino; chocolate es nota de cata"],
  ["Vino Dada Art 1 Moka 750cc", "ídem con café"],
  ["Dadá Malbec", "misma bodega"],
]) check(n, fuera(n) === false, por);

console.log();
if (fail === 0) console.log(`✅ Todos los casos dorados de solo-vino pasan (${pass}).`);
else { console.log(`❌ ${fail} caso(s) fallan de ${pass + fail}.`); process.exit(1); }
