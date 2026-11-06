/**
 * Casos dorados del parser de Ligier (ligier.com.ar, Next.js).
 *
 * La primera card es HTML real de /vinos capturado desde un runner de
 * GitHub Actions el 30/10/2026 (srcSet recortado). Si Ligier cambia el
 * markup, el scrape del día lo marca como "sin cards" y acá se actualiza
 * el fixture.
 *
 * Correr: node scripts/test-ligier.mjs
 */
import { parseCards, parseLastPage } from "./scrape-ligier.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✅  ${name}  →  ${detail}`);
  } else {
    fail++;
    console.log(`  ❌ FALLA  ${name}  →  ${detail}`);
  }
}

const STORE = { slug: "ligier", baseUrl: "https://ligier.com.ar" };

// Real, 30/10/2026.
const REAL_CARD = `<div class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"><div class="group flex flex-col overflow-hidden rounded-sm border border-gris-line/70 bg-blanco transition-shadow hover:shadow-md"><a class="relative block overflow-hidden bg-blanco aspect-[3/4] p-4" href="/productos/uco-deus-naranjo-750-be80478"><img alt="Uco Deus Naranjo 750" loading="lazy" decoding="async" data-nimg="fill" class="object-contain transition-transform duration-500 group-hover:scale-105" style="position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" srcSet="/_next/image?url=https%3A%2F%2Flgr.vinotecaligier.com%2Fproductos%2FBE80478.jpg%3Fv%3D1792074014&amp;w=256&amp;q=75 256w" src="/_next/image?url=https%3A%2F%2Flgr.vinotecaligier.com%2Fproductos%2FBE80478.jpg%3Fv%3D1792074014&amp;w=3840&amp;q=75"/><button type="button" aria-label="Agregar a favoritos" aria-pressed="false" class="flex h-8 w-8 items-center justify-center rounded-full transition-colors absolute right-2 top-2 bg-blanco/90 text-negro hover:bg-blanco"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.050 3 5.5l7 7Z"></path></svg></button><div class="absolute left-3 top-3 flex flex-col items-start gap-1"><span class="rounded-sm bg-verde px-2 py-1 text-xs font-bold tracking-wide text-blanco">6<!-- -->×<!-- -->5</span></div></a><div class="flex flex-1 flex-col px-4 pb-3 pt-3"><p class="truncate text-[11px] uppercase tracking-[0.14em] text-gris">Uco Deus</p><a class="mt-0.5 line-clamp-2 min-h-[2.75em] font-display text-sm font-medium leading-snug text-negro transition-colors hover:text-verde" href="/productos/uco-deus-naranjo-750-be80478">Uco Deus Naranjo 750</a><p class="mt-1 h-4 truncate text-xs leading-4 text-gris">Naranjo · Argentina · 750 ml</p><div class="mt-2"><div class="flex items-baseline gap-1.5"><p class="font-display text-lg font-bold text-negro">$ 28.900</p></div><p class="mt-0.5 text-[10px] text-gris">$ 24.083 c/u llevando 6</p><div class="mt-1 h-4" aria-hidden="true"></div></div><div class="mt-auto pt-3"></div></div></div>`;

// Sintética: con precio tachado y sin stock (variantes que no aparecieron
// en la muestra; el parser tiene que tomar el vigente y marcar el stock).
const PROMO_CARD = `<div class="group flex flex-col overflow-hidden rounded-sm border"><a class="relative block" href="/productos/catena-zapata-nicolas-750-be71621"><img alt="x" src="/_next/image?url=https%3A%2F%2Flgr.vinotecaligier.com%2Fproductos%2FBE71621.jpg&amp;w=3840&amp;q=75"/></a><div class="flex flex-1 flex-col px-4 pb-3 pt-3"><p class="truncate text-[11px] uppercase tracking-[0.14em] text-gris">Catena Zapata</p><a class="mt-0.5 line-clamp-2 font-display" href="/productos/catena-zapata-nicolas-750-be71621">Catena Zapata Nicolás &amp; Cía 750</a><p class="mt-1 h-4 truncate text-xs">Blend · Argentina · 750 ml</p><div class="mt-2"><div class="flex items-baseline gap-1.5"><p class="font-display text-sm font-bold text-gris line-through">$ 190.000</p><p class="font-display text-lg font-bold text-negro">$ 171.000</p></div></div><div class="mt-auto pt-3"><button disabled>Sin stock</button></div></div></div>`;

const PAGER = `<nav><a href="/vinos?page=2">2</a><a href="/vinos?page=3">3</a><a href="/vinos?page=162">162</a></nav>`;

const [a, b, ...rest] = parseCards(REAL_CARD + PROMO_CARD + PAGER, STORE);

check("dos cards, ni una más", rest.length === 0 && !!a && !!b, `cards=${2 + rest.length}`);
check(
  "card real: nombre, bodega, SKU y URL absoluta",
  a.name === "Uco Deus Naranjo 750" && a.brand === "Uco Deus" && a.externalSku === "BE80478" &&
    a.externalUrl === "https://ligier.com.ar/productos/uco-deus-naranjo-750-be80478",
  `${a.name} · ${a.brand} · ${a.externalSku}`,
);
check("card real: precio de lista, no el 'c/u llevando 6'", a.priceArs === 28900, `price=${a.priceArs}`);
check(
  "card real: imagen original sin el proxy de Next",
  a.imageUrl === "https://lgr.vinotecaligier.com/productos/BE80478.jpg?v=1792074014",
  a.imageUrl,
);
check("card real: varietal/país/volumen como descripción", a.description === "Naranjo · Argentina · 750 ml", a.description);
check("card real: en stock", a.inStock === true, `inStock=${a.inStock}`);
check("promo: toma el vigente, no el tachado", b.priceArs === 171000, `price=${b.priceArs}`);
check("promo: entidades decodificadas", b.name === "Catena Zapata Nicolás & Cía 750", b.name);
check("promo: 'Sin stock' → inStock=false", b.inStock === false, `inStock=${b.inStock}`);
check("paginación: última página", parseLastPage(PAGER, "/vinos") === 162, `last=${parseLastPage(PAGER, "/vinos")}`);
check("página sin cards → []", parseCards("<html><body>Catálogo</body></html>", STORE).length === 0, "0 cards");

console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
