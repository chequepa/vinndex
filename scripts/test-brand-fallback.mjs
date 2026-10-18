#!/usr/bin/env node
/**
 * Casos dorados de lib/brandFallback.ts: adónde va una /bodega/{slug}
 * que ya no tiene página. Correr: node scripts/test-brand-fallback.mjs
 */
import { resolveBrandFallback } from "../lib/brandFallback.ts";

// ficha = [groupSlug, bodega, vinotecas = 1, esVino = true]
function deps(fichas, pageSlugs) {
  const byBrand = new Map();
  const names = [];
  for (const [groupSlug, brand, stores = 1, wine = true] of fichas) {
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push({ groupSlug, wine });
    names.push([groupSlug, brand, stores]);
  }
  return {
    byBrand,
    pageSlugs: new Set(pageSlugs),
    names,
    groupSlugOf: (g) => g.groupSlug,
    isWine: (g) => g.wine,
  };
}

const CATENA = [
  ["angelica-zapata-malbec-alta", "catena-zapata"],
  ["angelica-zapata-chardonnay-alta", "catena-zapata"],
  ["angelica-zapata-cabernet-sauvignon", "catena-zapata"],
  ["catena-alta-malbec", "catena-zapata"],
];

const cases = [
  {
    name: "bodega con página no cae en el fallback",
    slug: "catena-zapata",
    deps: deps(CATENA, ["catena-zapata"]),
    want: null,
  },
  {
    name: "2 fichas → página chica (Naviero)",
    slug: "naviero",
    deps: deps([["naviero-rose", "naviero"], ["naviero-malbec", "naviero"]], []),
    want: { kind: "small", n: 2 },
  },
  {
    name: "2 fichas sin tipo ni varietal (licor) → 404",
    slug: "hesperidina",
    deps: deps([["hesperidina-2", "hesperidina", 3, false], ["bitter-hesperidina", "hesperidina", 2, false]], []),
    want: null,
  },
  {
    name: "pesa por vinotecas: Gran Enemigo es El Enemigo aunque haya fichas sueltas de Catena",
    slug: "gran-enemigo",
    deps: deps(
      [
        ["gran-enemigo-gualtallary", "el-enemigo", 36],
        ["gran-enemigo-chacayes", "el-enemigo", 27],
        ["gran-enemigo-chardonnay", "catena-zapata", 1],
        ["caja-x6-catena-zapata-gran-enemigo", "catena-zapata", 1],
        ["gran-enemigo-el-cepillo-chardonnay", "catena-zapata", 1],
      ],
      ["el-enemigo", "catena-zapata"],
    ),
    want: { kind: "brand", to: "el-enemigo" },
  },
  {
    name: "1 ficha → al vino",
    slug: "toia",
    deps: deps([["toia-gran-malbec", "toia"]], []),
    want: { kind: "wine", to: "toia-gran-malbec" },
  },
  {
    name: "línea que fue bodega → bodega madre (Angélica Zapata)",
    slug: "angelica-zapata",
    deps: deps(CATENA, ["catena-zapata"]),
    want: { kind: "brand", to: "catena-zapata" },
  },
  {
    name: "línea con <3 fichas no alcanza",
    slug: "angelica-zapata",
    deps: deps(CATENA.slice(1, 3), ["catena-zapata"]),
    want: null,
  },
  {
    name: "línea repartida entre bodegas (<80%) → 404",
    slug: "gran-reserva",
    deps: deps(
      [
        ["piattelli-gran-reserva-malbec", "piattelli"],
        ["trapiche-gran-reserva-malbec", "trapiche"],
        ["norton-gran-reserva-malbec", "norton"],
        ["piattelli-gran-reserva-cabernet", "piattelli"],
      ],
      ["piattelli", "trapiche", "norton"],
    ),
    want: null,
  },
  {
    name: "la bodega madre sin página → 404",
    slug: "angelica-zapata",
    deps: deps(CATENA, []),
    want: null,
  },
  {
    name: "frase entera, no sub-palabra: 'sole' no es 'soledad'",
    slug: "sole",
    deps: deps(
      [
        ["soledad-malbec", "x"],
        ["soledad-rose", "x"],
        ["soledad-blanco", "x"],
      ],
      ["x"],
    ),
    want: null,
  },
  {
    name: "slug muy corto (<4) no busca líneas",
    slug: "don",
    deps: deps(
      [
        ["don-david-malbec", "el-esteco"],
        ["don-david-torrontes", "el-esteco"],
        ["don-david-cabernet", "el-esteco"],
      ],
      ["el-esteco"],
    ),
    want: null,
  },
];

let fail = 0;
for (const c of cases) {
  const r = resolveBrandFallback(c.slug, c.deps);
  let ok;
  if (c.want === null) ok = r === null;
  else if (c.want.kind === "small") ok = r?.kind === "small" && r.groups.length === c.want.n;
  else if (c.want.kind === "wine") ok = r?.kind === "wine" && r.groupSlug === c.want.to;
  else ok = r?.kind === "brand" && r.slug === c.want.to;
  if (!ok) fail++;
  console.log(`  ${ok ? "✅" : "❌"}  ${c.name}${ok ? "" : `  → ${JSON.stringify(r)}`}`);
}
if (fail) {
  console.error(`\n❌ ${fail} de ${cases.length} casos fallan.`);
  process.exit(1);
}
console.log(`\n✅ Los ${cases.length} casos del fallback de /bodega/ pasan.`);
