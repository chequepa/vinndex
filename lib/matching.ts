import type { ScrapedProduct } from "./adapters/types";

/**
 * Deterministic product matching: turn a product name into a canonical
 * key so the same wine from different stores collapses into one group.
 *
 * We keep format/volume hints (caja x6, 1.5L magnum, etc) in the key on
 * purpose — a 750ml bottle and a 6-pack of the same wine ARE priced
 * differently and shouldn't be compared as the same SKU.
 */

export type CanonicalKey = {
  base: string;
  vintage: number | null;
  format: string | null;
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function extractVintage(name: string): number | null {
  const m = name.match(/\b(19\d{2}|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
}

/** Detect format hints (caja/box/magnum/pack) so we don't collapse them. */
export function extractFormat(name: string): string | null {
  const lower = name.toLowerCase();
  const mPack = lower.match(/\b(caja|pack|box|estuche)\b/);
  const mXN = lower.match(/\bx\s*(\d+)\b/);
  const mMagnum = lower.match(/\bmagnum\b/);
  const mHalf = lower.match(/\b(media|half)\b/);
  const mVolL = lower.match(/\b(\d+(?:[.,]\d+)?)\s*l\b/);
  const mVolMl = lower.match(/\b(\d{3,4})\s*ml\b/);

  const parts: string[] = [];
  if (mPack) parts.push(mPack[1]);
  if (mXN) parts.push(`x${mXN[1]}`);
  if (mMagnum) parts.push("magnum");
  if (mHalf) parts.push("half");
  if (mVolL) parts.push(`${mVolL[1].replace(",", ".")}l`);
  // ignore 750ml as it's the default
  if (mVolMl && mVolMl[1] !== "750") parts.push(`${mVolMl[1]}ml`);

  return parts.length > 0 ? parts.sort().join("-") : null;
}

/** Normalize a name into its base (brand + varietal + qualifier) portion. */
export function canonicalize(
  name: string,
  brand: string | null,
): CanonicalKey {
  const vintage = extractVintage(name);
  const format = extractFormat(name);

  let s = stripAccents(name).toLowerCase().trim();

  s = s.replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ");
  s = s.replace(/\d+\s*ml\b/g, " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*l\b/g, " ");
  s = s.replace(/\bx\s*\d+\b/g, " ");
  s = s.replace(
    /\b(caja|pack|box|estuche|magnum|media|half|vino|cosecha|750)\b/g,
    " ",
  );
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Prepend normalized brand if present and not already at start — helps
  // distinguish e.g. "reserva" from different bodegas.
  if (brand) {
    const nb = stripAccents(brand)
      .toLowerCase()
      .replace(/^bodega\s+/, "")
      .replace(/^bodegas\s+/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (nb && !s.startsWith(nb)) {
      s = `${nb} ${s}`;
      s = s.replace(/\s+/g, " ").trim();
    }
  }

  return { base: s, vintage, format };
}

export function keyToString(k: CanonicalKey): string {
  return `${k.base}|${k.vintage ?? ""}|${k.format ?? ""}`;
}

export function groupSlug(k: CanonicalKey): string {
  const base = k.base.replace(/\s+/g, "-").slice(0, 60);
  const vint = k.vintage ? `-${k.vintage}` : "";
  const fmt = k.format ? `-${k.format.replace(/[^a-z0-9]+/g, "-")}` : "";
  return (base + vint + fmt).replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export type ProductGroup = {
  groupSlug: string;
  canonicalName: string;
  brand: string | null;
  vintage: number | null;
  format: string | null;
  imageUrl: string | null;
  storeCount: number;
  offerCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  varietals?: string[];
  region?: string | null;
  type?: string | null;
  offers: ProductOffer[];
};

export type ProductOffer = {
  storeSlug: string;
  externalUrl: string;
  externalSku: string | null;
  name: string;
  priceArs: number | null;
  inStock: boolean;
  imageUrl: string | null;
};

/** Turn a list of scraped products into deduped groups. */
export function buildGroups(products: ScrapedProduct[]): ProductGroup[] {
  const byKey = new Map<string, { key: CanonicalKey; items: ScrapedProduct[] }>();

  for (const p of products) {
    const k = canonicalize(p.name, p.brand);
    if (!k.base) continue;
    const ks = keyToString(k);
    const existing = byKey.get(ks);
    if (existing) {
      existing.items.push(p);
    } else {
      byKey.set(ks, { key: k, items: [p] });
    }
  }

  // Collision handling: multiple groups could slug-collide. Disambiguate
  // by appending a short hash suffix when needed.
  const usedSlugs = new Map<string, number>();
  const groups: ProductGroup[] = [];

  for (const { key, items } of byKey.values()) {
    const uniqueStores = new Set(items.map((i) => i.storeSlug));

    let slug = groupSlug(key);
    if (!slug) slug = "wine";
    const count = usedSlugs.get(slug) ?? 0;
    if (count > 0) slug = `${slug}-${count + 1}`;
    usedSlugs.set(groupSlug(key), count + 1);

    const prices = items
      .map((i) => i.priceArs)
      .filter((p): p is number => p !== null && p > 0);

    // Pick canonical name: the shortest (most normalized) name that has a
    // matching vintage. Or just the first.
    const canonicalName =
      items
        .slice()
        .sort((a, b) => a.name.length - b.name.length)[0]?.name ??
      items[0].name;
    const brand =
      items.find((i) => i.brand)?.brand?.replace(/^Bodega(s)?\s+/i, "") ?? null;
    const imageUrl = items.find((i) => i.imageUrl)?.imageUrl ?? null;

    const offers: ProductOffer[] = items
      .map((i) => ({
        storeSlug: i.storeSlug,
        externalUrl: i.externalUrl,
        externalSku: i.externalSku,
        name: i.name,
        priceArs: i.priceArs,
        inStock: i.inStock,
        imageUrl: i.imageUrl,
      }))
      .sort((a, b) => {
        const pa = a.priceArs ?? Number.POSITIVE_INFINITY;
        const pb = b.priceArs ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      });

    groups.push({
      groupSlug: slug,
      canonicalName,
      brand,
      vintage: key.vintage,
      format: key.format,
      imageUrl,
      storeCount: uniqueStores.size,
      offerCount: items.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      offers,
    });
  }

  return groups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    const pa = a.minPrice ?? Number.POSITIVE_INFINITY;
    const pb = b.minPrice ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });
}
