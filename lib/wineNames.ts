/**
 * Nombres de un vino para SEO: <title>, <h1>, JSON-LD, OG.
 *
 * `canonicalName` sale del pipeline tal como lo escribió alguna tienda y
 * tiene dos problemas para un buscador:
 *
 * 1. **Le falta la bodega** en 9.421 fichas: El Enemigo Malbec se llama
 *    "Malbec", Rutini Colección Malbec se llama "Colección Malbec". El
 *    <title> ya le anteponía la marca, pero el <h1> y el `name` del
 *    Product en JSON-LD decían "Malbec" a secas — para Google la ficha
 *    del El Enemigo era un producto llamado "Malbec".
 * 2. **Ruido de góndola** en ~6.700: "Vino tinto Malbec La Fusta 750 ml".
 *    Nadie busca "vino tinto ... 750 ml"; el volumen además se come
 *    caracteres del título que Google corta en ~60.
 *
 * No se toca `canonicalName` (es identidad, la escribe el pipeline); esto
 * es sólo presentación.
 */
import type { ProductGroup } from "./matching";
import { displayWineName } from "./displayWineName";
import { displayBrand } from "./snapshot";

// Palabras de una marca que no alcanzan para decir "la marca ya está en
// el nombre" ("El" de El Enemigo, "Bodega" de Bodega Norton).
const WEAK_BRAND_TOKENS = new Set([
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "y",
  "bodega",
  "bodegas",
  "familia",
  "finca",
  "vinos",
  "vina",
  "wines",
  "estate",
  "family",
]);

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Saca el ruido de góndola del nombre ("Vino tinto", "750 ml", "x 750 cc"). */
// Palabras que no identifican un vino por sí solas: si después de sacar
// "Vino tinto" sólo quedan éstas (más la bodega), el color ERA la identidad.
const GENERIC_NAME_TOKENS = new Set([
  "dulce", "seco", "suave", "natural", "fino", "comun", "tardio", "tardia", "cosecha",
  "x", "botella", "bot", "en", "de", "del", "la", "el", "los", "las", "ml", "cc", "lt",
  "vino", "tinto", "blanco", "rosado", "rose", "espumante", "champana",
]);

/**
 * `brand`, si se pasa, cuenta como no-identidad: "Vino Tinto Dulce Santa
 * Julia" se queda con "Tinto" porque sin él sólo quedan "Dulce" y la bodega.
 */
export function stripShelfNoise(name: string, brand?: string | null): string {
  // "Vino tinto Malbec…", "Vino blanco…", "Vinos rosado…": el color se saca
  // porque la ficha ya lo muestra como tipo — SALVO que sea lo único que
  // distingue al vino (01/10: al separar "Vino Tinto Dulce Colón" de "Vino
  // Blanco Dulce Colón", las dos fichas se titulaban "Dulce Colon").
  let base = name;
  const colorPrefix = base.match(/^\s*vinos?\s+(tinto|blanco|rosado|ros[eé]|dulce|naranja)\s+(.*)$/i);
  if (colorPrefix) {
    const brandTokens = new Set(fold(brand ?? "").split(/[^a-z0-9]+/).filter(Boolean));
    const identity = fold(colorPrefix[2])
      .replace(/\b\d{3,4}\s*(ml|cc)\b/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !/^\d+$/.test(t) && !GENERIC_NAME_TOKENS.has(t) && !brandTokens.has(t));
    base = identity.length >= 1 ? colorPrefix[2] : `${colorPrefix[1]} ${colorPrefix[2]}`;
  }
  const cleaned = base
    // "Vino Cabernet Sauvignon…" — pero no "Vino de la Cruz".
    .replace(/^\s*vinos?\s+(?!(de|del|la|el|los|las)\b)/i, "")
    // "750 ml", "x 750 cc", "750cc", "750 Ml.", "Botella 700 Cc", "Bot 750 Cc"
    .replace(
      /\s*\b(en\s+)?(bot(ella)?\.?\s*)?(x\s*)?\d{3,4}\s*(ml|cc|c\.c\.)(?![a-z])\.?/gi,
      " ",
    )
    // "Malbec X 750" (sin unidad)
    .replace(/\s+x\s*(375|500|750|1500)\b/gi, " ")
    // "en botella" (Carrefour/Día: "Vino … en botella 750 ml")
    .replace(/\s+en\s+botella\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.,·-]+$/g, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : name.trim();
}

/**
 * Varietales mal escritos por la tienda, corregidos SÓLO para mostrar.
 *
 * "La Vieja Chiflada Malec" rankea en posición 7 con 327 impresiones y
 * CTR 0,9%: el título que Google muestra dice "Malec". Diccionario curado
 * de typos indiscutibles, no distancia de edición abierta: medido el
 * 20/09, una regla ciega contra varietales confunde `perro`/`pedro`,
 * `blancs`, `petite`, `rosato`. Quedan afuera a propósito `ancellota`
 * (grafía usada en etiquetas argentinas), `sirah` (Petite Sirah) y
 * `noire` (marcas como "Lujuria Noire").
 *
 * No toca identidad ni slugs: el agrupamiento tiene su propio corrector
 * (scripts/lib-typos.mjs) y las URLs no cambian jamás.
 */
const VARIETAL_TYPOS: Record<string, string> = {
  malec: "malbec",
  mabec: "malbec",
  chardonay: "chardonnay",
  chardonnnay: "chardonnay",
  suavignon: "sauvignon",
  savignon: "sauvignon",
  sauvigon: "sauvignon",
  sauvingon: "sauvignon",
  viogner: "viognier",
  sangiovesse: "sangiovese",
  caberent: "cabernet",
};

function matchCase(src: string, fixed: string): string {
  if (src === src.toUpperCase()) return fixed.toUpperCase();
  if (src[0] === src[0].toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
  return fixed;
}

export function fixVarietalTypos(name: string): string {
  return name.replace(/(?<![\p{L}\p{N}])(don\s+)?([a-z]+)(?![\p{L}\p{N}])/giu, (m, don: string | undefined, w: string) => {
    const fixed = VARIETAL_TYPOS[w.toLowerCase()];
    // "Don Malec" puede ser nombre propio: no se toca.
    if (!fixed || don) return m;
    return matchCase(w, fixed);
  });
}

/** ¿El nombre ya menciona la bodega? Alcanza con una palabra fuerte. */
function nameHasBrand(name: string, brand: string): boolean {
  const n = ` ${fold(name).replace(/[^a-z0-9]+/g, " ")} `;
  const b = fold(brand).replace(/[^a-z0-9]+/g, " ").trim();
  if (!b) return true;
  if (n.includes(` ${b} `)) return true;
  const strong = b.split(" ").filter((t) => t.length >= 3 && !WEAK_BRAND_TOKENS.has(t));
  if (strong.length === 0) return n.includes(` ${b} `);
  const words = n.trim().split(" ");
  // Plural/singular de la misma palabra ("Turbios" / "TURBIO") cuenta.
  return strong.some((t) =>
    words.some(
      (w) =>
        w === t ||
        (Math.min(w.length, t.length) >= 5 &&
          (w.startsWith(t) || t.startsWith(w))),
    ),
  );
}

/**
 * Nombre completo del vino para <h1>, <title>, JSON-LD y OG:
 * "El Enemigo Malbec", "Rutini Colección Malbec", "Malbec La Fusta".
 * Sin cosecha (la agrega quien la necesite).
 */
export function wineFullName(
  g: Pick<ProductGroup, "canonicalName" | "brand">,
): string {
  const name = fixVarietalTypos(stripShelfNoise(displayWineName(g.canonicalName), g.brand));
  if (!g.brand) return name;
  const brand = displayBrand(g.brand);
  if (!brand || nameHasBrand(name, g.brand)) return name;
  return `${brand} ${name}`;
}
