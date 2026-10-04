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
  ["Heineken Lata x 473ml", "cerveza por marca"],
  ["Imperial Lager 473ml", "cerveza por estilo (Imperial también es Moët)"],
  ["Corona Porron 330 Ml", "cerveza por envase"],
  ["Andes Origen Roja Lata 473 Ml", "cerveza por marca"],
  ["Quilmes Clasica 1 Litro", "cerveza por marca"],
  ["Gin Hilbing Malbec 750ml", "gin aunque diga Malbec"],
  ["GRAPPA ANIAPA CABERNET SAUVIGNON", "grappa aunque diga Cabernet"],
  ["Copon Wine Malbec Liso 800cc", "copón encabezando = cristalería"],
  ["The Lakes Whiskymaker\u2019s Editions Single Malt Resfeber 700ml", "whisky pegado a otra palabra"],
  ["Glen Moray Our Classic Single Malt 700ml", "single malt sin decir whisky"],
  ["Single Malt Glen Moray Chardonnay Cask Finish 700 Ml", "single malt manda sobre chardonnay"],
  ["Cutty Sark Blended Scotch 750 Cc", "blended scotch"],
  ["TE LA VIRGINIA CEDRON X 25 SAQ.", "té en saquitos"],
  ["Fika Infusión Herbal x 40 saquitos", "infusión en saquitos"],
  ["Puritos Panter Mignon Red x 1", "cigarros"],
  ["Tabaco Cerrito Vainilla Extra para armar cigarrillos", "tabaco encabezando"],
  ["Habano Montecristo N 4", "habano"],
  ["Chips De Papa Merken Lyv Snacks X 55g", "snack"],
  ["Nueces Pecan Mariposa x 100 grs", "frutos secos"],
  ["Cafe Molido Segafredo Espresso Casa 250g Tostado", "café"],
  ["Pack 3 Agua De Coco Pura Natural Sin Azucares 500ml Goya", "agua de coco"],
  ["SAL MARINA GRUESA LIBERATO X 500 GR", "sal gourmet"],
  ["Pack X6 Cervezas Lester Free Rice 330 Ml", "cerveza en plural (04/10)"],
  ["Corona 330ml", "Corona con envase pegado a ml"],
  ["Corona 0.0 330ml", "Corona sin alcohol"],
  ["Aceitunas Negras Familia Gullo", "aceitunas en plural"],
  ["GLENMORANGIE 18 YO", "single malt por marca"],
  ["Coñac HENNESSY V.S.O.P 700cc", "coñac"],
  ["CYNAR", "aperitivo por marca"],
  ["Vermú Tripulante al Malbec", "vermú aunque diga Malbec"],
  ["Anteojos De Sol Polarizados Ray-ban Erika Classic", "anteojos"],
  ["Toallon Corona", "merch encabezando"],
  ["NUTELLA X 140G", "almacén"],
  ["Dulce De Frutilla Beepure Balde 5kg", "dulce de fruta, no vino dulce"],
  ["Asta Negra Pasta De Trucha Al Chardonnay Lata 80g", "pasta de trucha aunque diga Chardonnay"],
  ["ACEITE DON DOMINGO V. CATENA Blend Suave x 250cc", "aceite aunque diga Blend y Catena"],
]) check(n, fuera(n) === true, por);

console.log("\n=== SÍ ES VINO (no se puede borrar) ===");
for (const [n, por] of [
  ["MOET & CHANDON IMPERIAL BRUT", "Imperial sin estilo de cerveza es champagne"],
  ["Patagonia Select Chardonnay", "Patagonia es región"],
  ["Riccitelli Old Vines From Patagonia Malbec", "Patagonia es región"],
  ["Corazon Del Sol Semillon", "Sol no es la cerveza"],
  ["TERRAZAS DE LOS ANDES ORIGEN ALTAMIRA BLEND", "Andes Origen con 'de los' adelante es Terrazas"],
  ["Vino Samt Rojo Pomelo Lata 473cc", "lata de 473 pero dice vino"],
  ["Vino Tinto Corte Real 710 Ml", "710 ml pero dice vino"],
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
  ["Angélica Zapata Cabernet Sauvignon - notas de tabaco y cuero", "tabaco al final es nota de cata"],
  ["Salentein Numina Gran Corte", "control, nada que ver"],
  ["Tapiz Clásico Malbec", "Tapiz es bodega, no tapicería (04/10)"],
  ["Vino Tinto TRES CORONAS Cabernet Sauvignon 750", "Coronas no es la cerveza"],
  ["Expresión Dulce de Altura 2022 by Domingo Molina", "dulce de + no-fruta es vino"],
  ["Trumpeter Reserva Dulce de Malbec 750 cc", "dulce de Malbec es vino"],
  ["Kit Regalo Día de la Madre Box N°1: Vino + Choco + Aceitunas", "dice vino: kit con regalo"],
  ["Gut Oggau Theodora (Weiss) 2023", "Weiss no es cerveza acá"],
  ["Stella Crinita Omaggio Cabernet Franc", "Stella no es Artois"],
]) check(n, fuera(n) === false, por);

console.log("\n=== SEÑAL POR OFERTAS (04/10) ===");
check("CYNAR con ofertas 'Aperitivo Cynar'", isNonWineGroup({ canonicalName: "Producto X", offers: [{ name: "Aperitivo Producto X 750 ml" }, { name: "Producto X" }] }) === true, "mitad de las ofertas dicen aperitivo");
check("vino del catálogo no cae por una oferta rara", isNonWineGroup({ canonicalName: "Producto X", catalogId: "x", offers: [{ name: "Aperitivo Producto X" }] }) === false, "catálogo manda");
check("ficha con tipo no cae por ofertas", isNonWineGroup({ canonicalName: "Champ. Obsession", type: "Espumante", offers: [{ name: "Champ. Obsession c/ pulpa de limon" }] }) === false, "tipo manda");

console.log();
if (fail === 0) console.log(`✅ Todos los casos dorados de solo-vino pasan (${pass}).`);
else { console.log(`❌ ${fail} caso(s) fallan de ${pass + fail}.`); process.exit(1); }
