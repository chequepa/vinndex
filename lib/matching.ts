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

// Catálogos argentinos usan ml, cc, cm3 y cm³ indistintamente para volumen
// en mililitros ("Saint Felicien Malbec 375 Cc", "Norton 750cm3", etc.).
// Las tres son la misma unidad — normalizamos a "ml" en el output del format.
const VOL_ML_SUFFIX = /(ml|cc|cm3|cm³)/;

// Volúmenes canónicos en mililitros para presentaciones de vino. Sólo
// estos valores los aceptamos sin sufijo "ml/cc" — así "Saint Felicien
// Malbec X 375" se reconoce como 375ml, pero "Norton 1895" (línea, no
// volumen) no genera falso positivo porque 1895 no está en la lista.
// 750 NO va acá porque es el default y queremos que se trate distinto.
const BARE_VOLUMES_ML = ["187", "250", "375", "500", "1000", "1500", "3000", "5000"];
const BARE_VOL_RE = new RegExp(
  `\\b(?:x\\s*)?(${BARE_VOLUMES_ML.join("|")})(?=\\s|$|[^a-z0-9.,])`,
);

/** Detect format hints (caja/box/magnum/pack) so we don't collapse them. */
export function extractFormat(name: string): string | null {
  const lower = name.toLowerCase();
  const mPack = lower.match(/\b(caja|pack|box|estuche)\b/);
  const mXN = lower.match(/\bx\s*(\d+)\b/);
  const mMagnum = lower.match(/\bmagnum\b/);
  const mHalf = lower.match(/\b(media|half)\b/);
  const mVolL = lower.match(/\b(\d+(?:[.,]\d+)?)\s*l\b/);
  // 187/250/375/500/750/1000/1500/3000/5000 ml|cc|cm3|cm³ — tolera espacio
  // entre número y unidad ("375 Cc") o pegado ("750cc"). Lookahead en vez
  // de \b al final porque "cm³" termina en char Unicode (no word-char) y
  // \b no matchea esa transición.
  const mVolMl = lower.match(
    new RegExp(
      `\\b(\\d{3,4})\\s*${VOL_ML_SUFFIX.source}(?=\\s|$|[^a-z0-9])`,
    ),
  );
  // Volumen sin sufijo — sólo whitelist (ver BARE_VOLUMES_ML). Si ya
  // se encontró un volumen con sufijo arriba lo respetamos; este branch
  // sólo gana cuando NO hubo sufijo (caso típico: "Salentein Reserve
  // Malbec 375" — antes caía como format=null en el mismo grupo que
  // el 750ml).
  const mVolBare = !mVolMl ? lower.match(BARE_VOL_RE) : null;

  // Si mXN matchea pero su N es un volumen canónico, NO es un pack
  // ("Saint Felicien X 375" → 375ml, no `x375`). Sólo lo emitimos
  // como pack si el N no está en la whitelist y no chocaría con
  // mVolBare.
  const xnIsBareVolume =
    !!mXN && BARE_VOLUMES_ML.includes(mXN[1]) && !mVolMl;

  const parts: string[] = [];
  if (mPack) parts.push(mPack[1]);
  if (mXN && !xnIsBareVolume) parts.push(`x${mXN[1]}`);
  if (mMagnum) parts.push("magnum");
  if (mHalf) parts.push("half");
  if (mVolL) parts.push(`${mVolL[1].replace(",", ".")}l`);
  // 750ml es default; tampoco emitimos format para variantes equivalentes
  // (cc, cm3) ni reportamos magnitudes < 750 a través del slot vol.
  if (mVolMl && mVolMl[1] !== "750") parts.push(`${mVolMl[1]}ml`);
  if (mVolBare) parts.push(`${mVolBare[1]}ml`);

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
  // Borramos el slot de volumen *coherente con extractFormat* — si capturamos
  // 375cc como format, también lo sacamos del base, sino quedan tokens "375"
  // y "cc" sueltos contaminando la canonical key. Lookahead en vez de \b al
  // final por la misma razón (cm³ termina en char Unicode).
  s = s.replace(/\b\d+\s*(ml|cc|cm3|cm³)(?=\s|$|[^a-z0-9])/g, " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*l\b/g, " ");
  // Borramos del base los volúmenes whitelist sin sufijo — coherente
  // con extractFormat. Sino "Salentein Reserve Malbec 375" deja "375"
  // como token suelto y termina en distinto grupo que "Salentein Reserve
  // Malbec 750ml" (cuyo 750ml se borra como volumen).
  s = s.replace(
    new RegExp(
      `\\b(?:x\\s*)?(${BARE_VOLUMES_ML.join("|")})(?=\\s|$|[^a-z0-9.,])`,
      "g",
    ),
    " ",
  );
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
  totalStoreCount?: number;
  totalOfferCount?: number;
  inStockOfferCount?: number;
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
  /**
   * Marca ofertas con vintage explícito ≥ 5 años atrás como "de
   * colección" — la UI las ordena al final y las muestra con badge
   * en lugar de mezclarlas con el precio actual. El cálculo de min/max
   * del grupo las excluye (a menos que TODAS las ofertas sean de
   * colección, en cuyo caso son la única señal de precio disponible).
   * Set por build-groups.mjs en base a COLLECTOR_CUTOFF_YEAR.
   */
  isCollector?: boolean;
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
