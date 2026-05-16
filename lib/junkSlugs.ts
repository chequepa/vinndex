/**
 * Some scrapers (notably Magento/PrestaShop) emit product names with
 * facet/attribute leftovers — "atributo", "categoria-*", isolated "sin",
 * pure numeric tokens. Those leak into our canonical names and produce
 * junk wine slugs that we don't want Google to index.
 *
 * The right fix is upstream in the matching pipeline; this is a defensive
 * filter applied at the indexing layer.
 */
export function isJunkSlug(slug: string): boolean {
  if (/^atributo/i.test(slug)) return true;
  if (/-atributo-/i.test(slug)) return true;
  if (/^categoria-/i.test(slug)) return true;
  if (/-categoria-/i.test(slug)) return true;
  if (/^sin-/i.test(slug)) return true;
  if (/^\d+$/.test(slug)) return true;
  return false;
}
