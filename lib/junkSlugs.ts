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
