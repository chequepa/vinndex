/**
 * Compra combinada: "quiero 6 de este, 6 de este otro y 12 de aquel —
 * ¿dónde me conviene comprar todo?"
 *
 * La ficha responde "dónde está más barato ESTE vino". Quien compra por
 * caja varios vinos distintos tiene otra pregunta: cada vinoteca extra es
 * otro envío, otro checkout y otro mínimo de envío gratis. Lo barato
 * vino por vino puede salir más caro que juntar todo en una.
 *
 * Este módulo arma la MATRIZ (vino × vinoteca → costo de la cantidad
 * pedida). Las combinaciones (todo en una, repartido, de a dos) y el costo
 * de envío los resuelve el cliente en components/BasketPlanner.tsx, porque
 * el envío lo edita la persona y re-ordenar es instantáneo.
 *
 * Qué precio se usa por vinoteca (misma base que la ficha):
 *   · botella suelta comparable de 750 ml, en stock, sin precio
 *     sospechoso ni de colección (`isPriceBasisOffer`);
 *   · y, si la cantidad lo permite, CAJAS cerradas (x6 / x12 de 750 ml,
 *     sin estuche): muchas vinotecas venden la caja más barata por
 *     botella. Se combinan: 8 botellas = 1 caja x6 + 2 sueltas, si la
 *     tienda tiene las dos cosas. Una caja cuyo precio por botella es
 *     menos de la mitad del de la botella suelta más barata del mercado se
 *     descarta (casi siempre es un error de carga o una caja de otra cosa).
 */
import type { ProductGroup, ProductOffer } from "./matching";
import {
  findGroup,
  resolveMergedSlug,
  isPriceBasisOffer,
  storeName,
  displayBrand,
} from "./snapshot";
import { displayWineName } from "./displayWineName";

export const MAX_BASKET_ITEMS = 12;
export const MAX_QTY = 120;

export type BasketRequestItem = { slug: string; qty: number };

import type { BasketCell, BasketItem, BasketMatrix } from "./basketPlan";
export type { BasketCell, BasketItem, BasketMatrix } from "./basketPlan";

const CASE_NAME_EXCLUDE = /\b(estuche|est\.|madera|regalo|gift|surtid|mix|degustaci)/i;

function cleanQty(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(MAX_QTY, Math.round(q)));
}

/** Parsea `slug*6,slug2*12` (el formato del link compartible). */
export function parseBasketParam(raw: string | undefined | null): BasketRequestItem[] {
  if (!raw) return [];
  const out: BasketRequestItem[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const [slugRaw, qtyRaw] = part.split("*");
    const slug = (slugRaw ?? "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,200}$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, qty: cleanQty(Number(qtyRaw ?? 6)) });
    if (out.length >= MAX_BASKET_ITEMS) break;
  }
  return out;
}

function isCaseOffer(o: ProductOffer): boolean {
  if (!o.inStock || o.priceArs == null || o.priceArs <= 0) return false;
  if (o.priceSuspect || o.stale || o.isCollector) return false;
  if (o.estuche || o.copa || o.lata) return false;
  if ((o.volumeMl ?? 750) !== 750) return false;
  if (o.pack !== 6 && o.pack !== 12) return false;
  return !CASE_NAME_EXCLUDE.test(o.name ?? "");
}

function cellsFor(g: ProductGroup, qty: number): Record<string, BasketCell> {
  const bottle = new Map<string, ProductOffer>();
  const cases = new Map<string, ProductOffer[]>();
  for (const o of g.offers) {
    if (o.inStock && o.priceArs != null && o.priceArs > 0 && isPriceBasisOffer(o)) {
      const prev = bottle.get(o.storeSlug);
      if (!prev || o.priceArs < (prev.priceArs as number)) bottle.set(o.storeSlug, o);
    } else if (isCaseOffer(o)) {
      const arr = cases.get(o.storeSlug) ?? [];
      arr.push(o);
      cases.set(o.storeSlug, arr);
    }
  }
  // Piso de cordura para cajas: la mitad de la botella suelta más barata.
  const bottlePrices = [...bottle.values()].map((o) => o.priceArs as number);
  const floor = bottlePrices.length ? Math.min(...bottlePrices) * 0.5 : 0;

  const out: Record<string, BasketCell> = {};
  const storeSlugs = new Set([...bottle.keys(), ...cases.keys()]);
  for (const s of storeSlugs) {
    const b = bottle.get(s);
    const bp = b ? (b.priceArs as number) : null;
    let best: BasketCell | null = bp != null
      ? { total: bp * qty, unit: bp, cases: 0, caseSize: null, url: b!.externalUrl }
      : null;
    for (const c of cases.get(s) ?? []) {
      const size = c.pack as number;
      const cp = c.priceArs as number;
      if (cp / size < floor) continue;
      const maxCases = Math.floor(qty / size);
      for (let k = maxCases; k >= 1; k--) {
        const rest = qty - k * size;
        if (rest > 0 && bp == null) continue; // sin botella suelta no se completa
        const total = k * cp + rest * (bp ?? 0);
        if (!best || total < best.total) {
          best = { total, unit: total / qty, cases: k, caseSize: size, url: c.externalUrl };
        }
      }
    }
    if (best) out[s] = { ...best, total: Math.round(best.total), unit: Math.round(best.unit) };
  }
  return out;
}

export function buildBasketMatrix(req: BasketRequestItem[]): BasketMatrix {
  const items: BasketItem[] = [];
  const missing: string[] = [];
  const storeSet = new Set<string>();
  for (const r of req.slice(0, MAX_BASKET_ITEMS)) {
    const slug = findGroup(r.slug) ? r.slug : resolveMergedSlug(r.slug);
    const g = slug ? findGroup(slug) : undefined;
    if (!g || !slug) {
      missing.push(r.slug);
      continue;
    }
    if (items.some((i) => i.slug === slug)) continue;
    const qty = cleanQty(r.qty);
    const byStore = cellsFor(g, qty);
    Object.keys(byStore).forEach((s) => storeSet.add(s));
    items.push({
      slug,
      requestedSlug: r.slug,
      name: displayWineName(g.canonicalName),
      brand: displayBrand(g.brand),
      imageUrl: g.imageUrl ?? null,
      qty,
      byStore,
    });
  }
  const stores = [...storeSet]
    .map((slug) => ({ slug, name: storeName(slug) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { items, missing, stores };
}

