/**
 * Casos dorados del arrastre de fichas (scripts/lib-carryover.mjs).
 * BLOQUEANTE en el daily-scrape: si falla, no se publica.
 *
 * Los casos salen de datos reales medidos el 20/09/2026 sobre los
 * snapshots del 13 al 20/09 y de curls contra producción.
 */
import { planCarryover, dropResolved, stripPrices, daysBetween, CARRYOVER_DAYS } from "./lib-carryover.mjs";

let fallos = 0;
function check(desc, cond, got) {
  const ok = !!cond;
  if (!ok) fallos++;
  console.log(`  ${ok ? "✅" : "❌ FALLA"}  ${desc}  →  ${got}`);
}

const g = (slug, urls, extra = {}) => ({
  groupSlug: slug,
  wineKey: "fb|" + slug,
  canonicalName: slug,
  imageUrl: "https://x/y.jpg",
  totalStoreCount: urls.length,
  totalOfferCount: urls.length,
  storeCount: urls.length,
  minPrice: 2400,
  maxPrice: 2400,
  variants: [{ volumeMl: 750, pack: 0, offerCount: 1, minPrice: 2400 }],
  offers: urls.map((u) => ({ storeSlug: "carrefour", externalUrl: u, priceArs: 2400, inStock: true })),
  ...extra,
});

console.log("=== ARRASTRE: qué se mantiene vivo ===");
{
  // Caso real: La Fusta Malbec. Carrefour la listó ayer y hoy no (la
  // búsqueda de VTEX devolvió otro set), y la tienda NO estuvo en cero.
  const { groups, stats } = planCarryover({
    prevGroups: [g("fusta-malbec", ["https://carrefour/fusta"]), g("colon-frutos-rojos", ["https://carrefour/colon"])],
    liveUrls: new Set(["https://carrefour/colon"]),
    today: "2026-09-20T07:00:00Z",
    prevRunAt: "2026-09-19T07:00:00Z",
  });
  check("la ficha que el scrape no vio hoy se arrastra", groups.length === 1 && groups[0].groupSlug === "fusta-malbec", `${groups.length} arrastrada(s)`);
  check("la que sí vino hoy no se arrastra (la rehace el pipeline)", stats.vivas === 1, `vivas=${stats.vivas}`);
  check("la ventana arranca el día de la corrida anterior, no hoy", groups[0]?.lastSeenAt === "2026-09-19", groups[0]?.lastSeenAt);
}
{
  // Una sola de sus ofertas alcanza: la ficha se reconstruye sola.
  const { groups } = planCarryover({
    prevGroups: [g("dos-tiendas", ["https://a/x", "https://b/x"])],
    liveUrls: new Set(["https://b/x"]),
    today: "2026-09-20T07:00:00Z",
  });
  check("con UNA oferta viva no se arrastra nada", groups.length === 0, `${groups.length} arrastrada(s)`);
}

console.log("\n=== SIN UN SOLO PRECIO (doctrina PR #129) ===");
{
  const s = stripPrices(g("x", ["https://a/x"]), "2026-09-19");
  check("minPrice/maxPrice en null", s.minPrice === null && s.maxPrice === null, `${s.minPrice}/${s.maxPrice}`);
  check("ninguna oferta con precio", s.offers.every((o) => o.priceArs === null), `${s.offers.length} ofertas`);
  check("ninguna oferta con stock", s.offers.every((o) => o.inStock === false), "todas sin stock");
  check("variantes sin precio", s.variants.every((v) => v.minPrice === null), `${s.variants.length} variantes`);
  check("no entra en ninguna comparación", s.storeCount === 0 && s.comparableBasis === 0, `storeCount=${s.storeCount}`);
  check("conserva las vinotecas para el título 'sin stock en N'", s.totalStoreCount === 1, `totalStoreCount=${s.totalStoreCount}`);
  check("conserva imagen y nombre (la página tiene que renderizar)", !!s.imageUrl && !!s.canonicalName, "sí");
  check("queda marcada como arrastrada", s.carriedOver === true && s.lastSeenAt === "2026-09-19", s.lastSeenAt);
}
{
  // Sin oferta con stock, el filtro que ya existe en lib/sitemap-buckets.ts
  // la deja afuera del sitemap. No hay que tocar el sitemap.
  const s = stripPrices(g("x", ["https://a/x"]), "2026-09-19");
  check("fuera del sitemap por el filtro que ya existe", !s.offers.some((o) => o.inStock), "sin ofertas con stock");
}

console.log("\n=== LA VENTANA CIERRA (el 404 vuelve a ser correcto) ===");
{
  const carried = [{ ...stripPrices(g("viejo", ["https://a/x"]), "2026-09-10"), lastSeenAt: "2026-09-10" }];
  const { groups, stats } = planCarryover({
    prevGroups: [],
    prevCarry: carried,
    liveUrls: new Set(),
    today: "2026-09-20T07:00:00Z",
  });
  check(`a los ${CARRYOVER_DAYS} días sin verla se cae sola`, groups.length === 0 && stats.vencidas === 1, `vencidas=${stats.vencidas}`);
}
{
  // El lastSeenAt NO se pisa en cada corrida: si se pisara, una ficha
  // muerta se arrastraría para siempre.
  const carried = [{ ...stripPrices(g("ayer", ["https://a/x"]), "2026-09-18"), lastSeenAt: "2026-09-18" }];
  const { groups } = planCarryover({
    prevGroups: [],
    prevCarry: carried,
    liveUrls: new Set(),
    today: "2026-09-20T07:00:00Z",
  });
  check("la ficha arrastrada conserva su lastSeenAt original", groups[0]?.lastSeenAt === "2026-09-18", groups[0]?.lastSeenAt);
  check("y la ventana corre desde ahí", daysBetween("2026-09-18", "2026-09-20") === 2, "2 días");
}
{
  // Una ficha que reaparece deja de estar arrastrada: vuelve con precio
  // por el pipeline normal.
  const carried = [{ ...stripPrices(g("vuelve", ["https://a/x"]), "2026-09-19"), lastSeenAt: "2026-09-19" }];
  const { groups, stats } = planCarryover({
    prevGroups: [],
    prevCarry: carried,
    liveUrls: new Set(["https://a/x"]),
    today: "2026-09-20T07:00:00Z",
  });
  check("si el producto vuelve, se deja de arrastrar", groups.length === 0 && stats.vivas === 1, `vivas=${stats.vivas}`);
}

console.log("\n=== LA PÁGINA VIVA Y EL REDIRECT GANAN ===");
{
  const carried = [stripPrices(g("a", ["https://a/x"]), "2026-09-19"), stripPrices(g("b", ["https://b/x"]), "2026-09-19")];
  const out = dropResolved(carried, { liveSlugs: new Set(["a"]), liveWineKeys: new Set(), redirectFrom: new Set() });
  check("un slug que hoy es página viva no se arrastra", out.length === 1 && out[0].groupSlug === "b", `quedan ${out.length}`);
}
{
  const carried = [stripPrices(g("viejo-slug", ["https://a/x"]), "2026-09-19")];
  const out = dropResolved(carried, { liveSlugs: new Set(), liveWineKeys: new Set(["fb|viejo-slug"]), redirectFrom: new Set() });
  check("cambio de identidad: manda el redirect 308, no el arrastre", out.length === 0, `quedan ${out.length}`);
}
{
  const carried = [stripPrices(g("origen", ["https://a/x"]), "2026-09-19")];
  const out = dropResolved(carried, { liveSlugs: new Set(), liveWineKeys: new Set(), redirectFrom: new Set(["origen"]) });
  check("un slug que ya es origen de un redirect no se arrastra", out.length === 0, `quedan ${out.length}`);
}

console.log("");
if (fallos) {
  console.log(`❌ ${fallos} caso(s) fallaron. NO publicar — revisar scripts/lib-carryover.mjs.`);
  process.exit(1);
}
console.log("✅ Todos los casos dorados del arrastre pasan (18).");
