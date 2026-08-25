/**
 * Some scrapers (notably Magento/PrestaShop/OpenCart) emit product names
 * with facet/attribute leftovers — "atributo", "categoria-*", isolated
 * "sin", pure numeric tokens, faceted prefixes ("alcohol-X-malbec",
 * "color-Y-tinto"). Esos se cuelan en los canonical names y producen
 * junk wine slugs que no queremos que Google indexe.
 *
 * El audit del 22/05 detectó 103 slugs basura en sitemap con prefijos
 * `alcohol-`, `coleccion-`, `color-`, `tipo-` que escapaban al filtro
 * original. Esta versión amplía la cobertura.
 *
 * El fix correcto es upstream en el pipeline de matching; esto es un
 * filtro defensivo a nivel indexing/sitemap + noindex en /vino/[slug].
 */
const FACET_PREFIXES =
  /^(atributo|categoria|sin|alcohol|coleccion|color|tipo|cuerpo|grado|temperatura|variedad|filtro|estilo|crianza|cepa)-/i;

const FACET_INFIX = /-(atributo|categoria)-/i;

export function isJunkSlug(slug: string): boolean {
  if (FACET_PREFIXES.test(slug)) return true;
  if (FACET_INFIX.test(slug)) return true;
  if (/^\d+$/.test(slug)) return true;
  return false;
}

/**
 * Fichas de producto que NO son vino comparable y no deben gastar crawl
 * budget ni diluir la autoridad temática del dominio (aviso GSC
 * 2026-07-03: "Duplicate, Google chose different canonical"):
 *   · espirituosas / cerveza / bebidas no-vino que las vinotecas también
 *     venden (~4.100 fichas)
 *   · bundles / promos / gift cards (~600)
 *   · venta por copa (~240)
 *   · mercadería de almacén (aceite de oliva, aceto, alfajores, jamón) y
 *     accesorios (sacacorchos, cristalería, decanters) — 851 fichas
 * Las páginas siguen existiendo y navegables — sólo van con noindex y
 * fuera del sitemap. Mismos patrones que usa el pipeline (isExcluded en
 * scripts/stage4-token-merge.mjs), replicados acá porque el frontend no
 * importa de scripts/.
 */
const NON_WINE_RE =
  /\b(whisky|whiskey|whisk|vodka|gin|ginebra|ron|rhum|tequila|mezcal|cognac|brandy|fernet|vermouth|vermut|aperitivo|aperol|campari|licor|grappa|pisco|absenta|cerveza|gancia|aperitif|johnnie|walker|chivas|jack\s*daniels?|ballantines?|wild\s*turkey|jameson|dewars?|grants?|bourbon|escoces|famous\s*grouse|old\s*smuggler|criadores|100\s*pipers|speed|energizante|gaseosa|agua\s+(mineral|saborizada|tonica)|coca\s*cola|sprite|paso\s*de\s*los\s*toros)\b/i;
const BUNDLE_NAME_RE =
  /\b(mix|promo|promocion|regalo|degustaci\w*|vertical|combo|surtido|kit|estuche|cofre|bag\s*in\s*box|gift\s*card|wine\s*card|voucher|tarjeta\s+(de\s+)?regalo)\b/i;
const COPA_NAME_RE = /\bcopa\b/i;

/**
 * Mercadería de almacén y accesorios. Las vinotecas venden aceite de
 * oliva, aceto, alfajores, jamón y cristalería, y esas fichas se colaban
 * enteras: NON_WINE_RE cubre BEBIDAS que no son vino (destilados,
 * cerveza, gaseosa) pero nada de comida ni de barware. Medido sobre el
 * snapshot del 09/08: 851 fichas, 15 de ellas multi-tienda (aceite de
 * oliva Zuccardi en 4 tiendas, aceto Millán en 2, un decanter Riedel).
 */
const ALMACEN_RE =
  /\b(aceite\s+de\s+oliva|aceto|vinagre|aceituna|mermelada|dulce\s+de\s+leche|queso|fiambre|salame|jamon|pate|escabeche|antipasto|peperoncino|arroz|fideos|harina|galletit|bizcoch|alfajor|alfajores|turron|yerba)\b/i;
const BARWARE_RE =
  /\b(sacacorchos|descorchador|frapera|hielera|cristaleria|libbey|riedel|molinillo|posavaso|portabotella|termometro|fernetometro)\b/i;
/**
 * Palabras ambiguas: sólo cuentan si ENCABEZAN el nombre. Un accesorio se
 * lista con el objeto adelante ("Decanter Riedel Merlot", "Tapón para
 * espumante"); un vino las menciona al final, y ahí son parte de la
 * descripción, no del producto. Sin este ancla se perdían vinos reales:
 * "Ayni Malbec 2018 - 97 puntos Decanter", "LAS PERDICES NOIR DE MALBEC
 * (TAPON VIDRIO)", "Las Perdices Ice Exploración Malbec Rosé | Tapón de
 * Vidrio".
 */
const ACCESORIO_HEAD_RE =
  /^(decanter|decantador|tapon|tapones|aireador|vaso|vasos|tabla|copon|copones)\b/i;

function stripAccentsLower(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** True si el GRUPO es una ficha no-indexable: no-vino, bundle o copa. */
export function isJunkWineGroup(g: {
  groupSlug: string;
  canonicalName: string;
}): boolean {
  if (isJunkSlug(g.groupSlug)) return true;
  const n = stripAccentsLower(g.canonicalName ?? "");
  if (NON_WINE_RE.test(n)) return true;
  if (BUNDLE_NAME_RE.test(n)) return true;
  if (COPA_NAME_RE.test(n)) return true;
  if (ALMACEN_RE.test(n)) return true;
  if (BARWARE_RE.test(n)) return true;
  if (ACCESORIO_HEAD_RE.test(n.trim())) return true;
  return false;
}

/**
 * Gift cards y vouchers. Se separan de `BUNDLE_NAME_RE` porque son la
 * única parte de ese grupo que NO es vino: un estuche o un bag-in-box es
 * vino en otro envase, una gift card es plata.
 */
const GIFTCARD_RE =
  /\b(gift\s*cards?|wine\s*cards?|vouchers?|tarjetas?\s+(de\s+)?regalo)\b/i;

/**
 * "Bourbon barrel" / "bourbon cask" describen la MADURACIÓN, no el
 * producto: `LOS INTOCABLES BOURBON BARREL MALBEC` es un malbec criado en
 * barrica de bourbon, no un whisky. Se saca la frase y se vuelve a testear
 * lo que queda, así el que además dice "Ron" o "Whisky" sigue cayendo.
 */
const BOURBON_MATURATION_RE = /\bbourbon\s+(barrel|cask)\b/gi;

/**
 * True si el grupo NO ES VINO y por lo tanto no pertenece al comparador.
 *
 * Distinto de `isJunkWineGroup`, y la diferencia importa. Aquella responde
 * "¿esta ficha merece que Google la indexe?" y por eso incluye reglas de
 * PARSEO (slugs de faceta) y de FORMATO (estuches, bag-in-box, venta por
 * copa). Un falso positivo ahí cuesta una página sin indexar: barato.
 *
 * Ésta responde "¿esto es vino?" y su respuesta saca el grupo del sitio
 * entero. Un falso positivo acá borra una ficha de comparación real, así
 * que sólo entran las categorías inequívocas:
 *
 *   · destilados, cerveza y gaseosas (las vinotecas también las venden)
 *   · gift cards y vouchers
 *   · mercadería de almacén (aceite de oliva, aceto, alfajores, jamón)
 *   · cristalería y barware (sacacorchos, decanters, fraperas)
 *   · accesorios cuando encabezan el nombre
 *
 * Y quedan AFUERA a propósito, medido sobre el snapshot del 24/08/2026:
 *
 *   · slugs de faceta (499 grupos) — `coleccion-` es el prefijo de la
 *     línea Colección de Rutini, y ahí adentro hay un Cabernet Franc en
 *     16 tiendas; `sin-` agarra "Sin Reglas" y "Sin Fin"; `cepa-` agarra
 *     "Cepa Tradicional". Un slug mal parseado sigue siendo vino.
 *   · estuches, bag-in-box y combos (1.973 grupos, 43 multi-tienda) —
 *     "Las Perdices Reserva Malbec Bag In Box" es vino en otro envase.
 *     El formato ya lo maneja `comparable`/`variants`, no hace falta
 *     borrarlo.
 *   · venta por copa — "SANTA JULIA MALBEC + copa" es una botella con
 *     una copa de regalo.
 *
 * Los tres siguen tratándose como hasta ahora vía `isJunkWineGroup`:
 * navegables pero con `noindex` y fuera del sitemap.
 */
/**
 * Marcas de destilado y licor que las vinotecas venden y que `NON_WINE_RE`
 * no nombra: aquella regex lista CATEGORÍAS ("whisky", "gin", "vodka") y
 * un single malt se publica casi siempre por marca, sin la categoría en el
 * nombre — "Glenfiddich 12 Años", "Jim Beam Honey", "BEEFEATER 24".
 * Medido sobre el snapshot del 24/08/2026: 900 fichas sobrevivían al
 * filtro, 75 de ellas multi-tienda.
 *
 * Son marcas, no palabras comunes, así que el riesgo de falso positivo es
 * bajo. Las dos excepciones que sí lo tenían quedaron ancladas:
 *   · `isle of jura` en vez de `jura` — Jura es además una región vinícola
 *     francesa.
 *   · las cremas y licores van por MARCA (Tres Plumas, Cusenier, Borghetti,
 *     Wild Africa) y no por sabor: "chocolate" y "café" son notas de cata,
 *     y `DADA 8 CHOCOLATE` es un vino de Dadá Art.
 */
const SPIRIT_BRAND_RE =
  /\b(macallan|glenfiddich|glenlivet|singleton|talisker|lagavulin|laphroaig|cardhu|monkey\s*shoulder|knob\s*creek|four\s*roses|woodford|elijah\s*craig|evan\s*williams|buffalo\s*trace|makers?'?\s*mark|benchmark|jim\s*beam|bulleit|grangestone|isle\s+of\s+jura|smirnoff|absolut|belvedere|beefeater|tanqueray|bombay|gordon'?s?|hendrick'?s?|jagermeister|jägermeister|baileys|sambuca|amaretto|cusenier|tres\s*plumas|borghetti|wild\s*africa)\b/i;

/** Sidra: fermentado de manzana o pera, no es vino. */
const SIDRA_RE = /\b(sidra|cider)\b/i;

export function isNonWineGroup(g: { canonicalName: string }): boolean {
  const n = stripAccentsLower(g.canonicalName ?? "");
  if (GIFTCARD_RE.test(n)) return true;
  if (NON_WINE_RE.test(n.replace(BOURBON_MATURATION_RE, " "))) return true;
  if (SPIRIT_BRAND_RE.test(n)) return true;
  if (SIDRA_RE.test(n)) return true;
  if (ALMACEN_RE.test(n)) return true;
  if (BARWARE_RE.test(n)) return true;
  if (ACCESORIO_HEAD_RE.test(n.trim())) return true;
  return false;
}
