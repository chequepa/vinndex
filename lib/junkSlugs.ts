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
 * Las páginas siguen existiendo y navegables — sólo van con noindex y
 * fuera del sitemap. Mismos patrones que usa el pipeline (isExcluded en
 * scripts/stage4-token-merge.mjs), replicados acá porque el frontend no
 * importa de scripts/.
 */
const NON_WINE_RE =
  /\b(whisky|whiskey|whisk|vodka|gin|ginebra|ron|rhum|tequila|mezcal|cognac|brandy|fernet|vermouth|vermut|aperitivo|aperol|campari|licor|grappa|pisco|absenta|cerveza|gancia|aperitif|johnnie|walker|chivas|jack\s*daniels?|ballantines?|wild\s*turkey|jameson|dewars?|grants?|bourbon|escoces|famous\s*grouse|old\s*smuggler|criadores|100\s*pipers|speed|energizante|gaseosa|agua\s+(mineral|saborizada|tonica)|coca\s*cola|sprite|paso\s*de\s*los\s*toros)\b/i;
const BUNDLE_NAME_RE =
  /\b(mix|promo|promocion|regalo|degustaci\w*|vertical|combo|surtido|kit|bag\s*in\s*box|gift\s*card|wine\s*card|voucher|tarjeta\s+(de\s+)?regalo)\b/i;
const COPA_NAME_RE = /\bcopa\b/i;

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
  return false;
}
