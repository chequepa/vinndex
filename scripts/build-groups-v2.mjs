#!/usr/bin/env node
/**
 * build-groups-v2.mjs — Identidad v2, paso 2: agrupar ofertas por VINO.
 *
 * Reemplaza la cadena Stage 0→6.5 (clave por bolsa-de-tokens + 7 capas de
 * merge/split que se corrigen entre sí) por UN paso determinístico:
 *
 *   oferta → parseOffer() → asignación contra data/wine-catalog.json →
 *   página por vino, variantes por formato adentro.
 *
 * Reglas:
 *   · VINO = bodega + línea + varietal + color/dulzor + expresión
 *     (parcela/edición sólo si el catálogo dice que distinguen).
 *   · La comparación de precios de la ficha usa SOLO ofertas comparables:
 *     botella suelta de 750ml, sin estuche/copa, con stock, no-collector.
 *     El resto (375, magnum, cajas, estuches) queda en `variants`.
 *   · Slugs: se PRESERVA el slug v1 dominante de cada vino (SEO) — un
 *     vino nuevo o separado de una quimera recibe slug nuevo; los slugs
 *     v1 absorbidos van al mapa de redirects.
 *
 * Modo shadow: NO toca data/snapshot.json. Escribe:
 *   --out    → snapshot v2 (default data/snapshot-v2.json)
 *   --report → métricas + casos de estudio (default data/identity-v2-report.json)
 *
 * Uso:
 *   node scripts/build-groups-v2.mjs [--offers data/offers.json]
 *        [--out data/snapshot-v2.json] [--report data/identity-v2-report.json]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseOffer,
  fallbackWineKey,
  variantKey,
  isComparable,
  stripAccents,
} from "./lib-offer-identity.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const OFFERS_PATH = argVal("--offers", resolve(ROOT, "data/offers.json"));
const OUT_PATH = argVal("--out", resolve(ROOT, "data/snapshot-v2.json"));
const REPORT_PATH = argVal("--report", resolve(ROOT, "data/identity-v2-report.json"));
const CATALOG_PATH = resolve(ROOT, "data/wine-catalog.json");

function norm(s) {
  return stripAccents(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}
function slugify(s) {
  return norm(s).replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

// ── Catálogo → índices de asignación ──
function buildCatalogIndex(catalog) {
  const exact = new Map();   // bodega|linea-alias|varietal|color|dulzor → wine
  const byLine = new Map();  // bodega|linea-alias → [wines]
  for (const w of catalog.wines ?? []) {
    const b = norm(w.bodega);
    for (const alias of w.lineAliases?.length ? w.lineAliases : [""]) {
      const lineKey = alias.split(" ").filter(Boolean).sort().join(" ");
      exact.set(`${b}|${lineKey}|${w.varietal ?? ""}|${w.color ?? ""}|${w.dulzor ?? ""}`, w);
      const lk = `${b}|${lineKey}`;
      if (!byLine.has(lk)) byLine.set(lk, []);
      if (!byLine.get(lk).includes(w)) byLine.get(lk).push(w);
    }
  }
  return { exact, byLine };
}

/** Asigna una oferta parseada a un vino del catálogo, o null. */
function assign(p, idx) {
  if (!p.bodega) return null;
  const b = norm(p.bodega);
  const lineKey = p.lineTokens.join(" "); // ya vienen sorted
  const w = idx.exact.get(`${b}|${lineKey}|${p.varietal ?? ""}|${p.color ?? ""}|${p.dulzor ?? ""}`);
  if (w) return w;
  // Herencia de varietal: oferta sin varietal en el nombre + línea con
  // UN solo vino en catálogo → es ese ("Zuccardi Concreto" → Concreto
  // Malbec). Con 2+ varietales de la línea es ambiguo → no asignamos.
  if (!p.varietal) {
    const cands = idx.byLine.get(`${b}|${lineKey}`) ?? [];
    if (cands.length === 1) return cands[0];
    // mismo color al menos
    const sameColor = cands.filter((w2) => !p.color || !w2.color || w2.color === p.color);
    if (sameColor.length === 1) return sameColor[0];
  }
  return null;
}

/** Clave de grupo final (vino + expresión residual). */
function wineKeyOf(p, w) {
  if (!w) return `fb|${fallbackWineKey(p)}`;
  const dropP = new Set((w.parajesNoDistinguen ?? []).map(norm));
  const dropT = new Set((w.tiersNoDistinguen ?? []).map(norm));
  const residual = p.discriminadores.filter((d) => !dropP.has(norm(d)) && !dropT.has(norm(d)));
  // "paraje altamira" y "altamira" son el mismo discriminador — si el
  // catálogo dropea la frase, dropea también sus tokens sueltos.
  const dropTokens = new Set([...dropP].flatMap((d) => d.split(" ")));
  const residual2 = residual.filter((d) => !d.split(" ").every((t) => dropTokens.has(t)));
  const expr = [...residual2, ...p.ediciones].sort().join(" ");
  return expr ? `${w.id}::${slugify(expr)}` : w.id;
}

function main() {
  const raw = JSON.parse(readFileSync(OFFERS_PATH, "utf8"));
  let offers = raw.offers ?? raw.products ?? raw;
  // Dedup global por (tienda|url|nombre) — los merges v1 podían duplicar
  // la misma oferta en más de un grupo; acá una oferta = un registro.
  {
    const seen = new Set();
    const deduped = [];
    for (const o of offers) {
      const k = `${o.storeSlug}|${o.externalUrl ?? ""}|${o.name ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(o);
    }
    if (deduped.length < offers.length) {
      console.log(`  dedup: ${offers.length - deduped.length} ofertas repetidas descartadas`);
    }
    offers = deduped;
  }
  const catalog = existsSync(CATALOG_PATH)
    ? JSON.parse(readFileSync(CATALOG_PATH, "utf8"))
    : { wines: [] };
  const idx = buildCatalogIndex(catalog);
  console.log(`v2 grouping — ${offers.length} ofertas · catálogo ${catalog.wines?.length ?? 0} vinos`);

  // v1Slug por oferta: si el offers.json no lo trae (CI), lo mapeamos por
  // externalUrl desde el snapshot v1 publicado — necesario para preservar
  // slugs indexados y emitir redirects.
  if (!offers.some((o) => o.v1Slug)) {
    const snapPath = resolve(ROOT, "data/snapshot.json");
    if (existsSync(snapPath)) {
      try {
        const snap = JSON.parse(readFileSync(snapPath, "utf8"));
        const byUrl = new Map();
        for (const g of snap.productGroups ?? []) {
          for (const o of g.offers ?? []) {
            if (o.externalUrl) byUrl.set(o.externalUrl, g.groupSlug);
          }
        }
        let mapped = 0;
        for (const o of offers) {
          const s = byUrl.get(o.externalUrl);
          if (s) { o.v1Slug = s; mapped++; }
        }
        console.log(`  v1Slug mapeado por URL para ${mapped} ofertas`);
      } catch { /* sin snapshot v1 → todos los slugs se acuñan nuevos */ }
    }
  }

  const COLLECTOR_CUTOFF = new Date().getFullYear() - 5;

  // ── Asignación ──
  const groups = new Map(); // wineKey → { wine|null, offers: [] }
  let assigned = 0;
  for (const o of offers) {
    if (!o.name) continue;
    const p = parseOffer(o.name, o.brand);
    const w = assign(p, idx);
    if (w) assigned++;
    const key = wineKeyOf(p, w);
    let g = groups.get(key);
    if (!g) {
      g = { wine: w ?? null, offers: [] };
      groups.set(key, g);
    }
    g.offers.push({
      storeSlug: o.storeSlug,
      externalUrl: o.externalUrl,
      externalSku: o.externalSku,
      name: o.name,
      priceArs: o.priceArs,
      inStock: o.inStock,
      imageUrl: o.imageUrl,
      vintage: p.vintage ?? undefined,
      volumeMl: p.volumeMl,
      pack: p.pack,
      estuche: p.estuche || undefined,
      copa: p.copa || undefined,
      comparable: isComparable(p) || undefined,
      isCollector:
        p.vintage !== null && p.vintage <= COLLECTOR_CUTOFF ? true : undefined,
      _v1Slug: o.v1Slug, // sólo para el mapping de slugs; se borra al final
    });
  }
  console.log(`  asignadas a catálogo: ${assigned} (${((100 * assigned) / offers.length).toFixed(1)}%) · grupos: ${groups.size}`);

  // ── Slugs: preservar el slug v1 dominante ──
  // dominante(v1Slug) = wineKey con más ofertas de ese v1Slug
  const v1Count = new Map(); // v1Slug → Map(wineKey → n)
  for (const [key, g] of groups) {
    for (const o of g.offers) {
      if (!o._v1Slug) continue;
      if (!v1Count.has(o._v1Slug)) v1Count.set(o._v1Slug, new Map());
      const m = v1Count.get(o._v1Slug);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  const dominantOf = new Map(); // v1Slug → wineKey
  for (const [s, m] of v1Count) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    dominantOf.set(s, best[0]);
  }
  // cada wineKey elige el v1Slug que domina con más ofertas propias
  const slugOf = new Map(); // wineKey → slug
  const claimed = new Set();
  for (const [key, g] of groups) {
    const cands = new Map(); // v1Slug → count en este grupo
    for (const o of g.offers) {
      if (o._v1Slug && dominantOf.get(o._v1Slug) === key) {
        cands.set(o._v1Slug, (cands.get(o._v1Slug) ?? 0) + 1);
      }
    }
    const best = [...cands.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && !claimed.has(best[0])) {
      slugOf.set(key, best[0]);
      claimed.add(best[0]);
    }
  }
  // mint para los que no preservan
  const used = new Set(claimed);
  for (const [key, g] of groups) {
    if (slugOf.has(key)) continue;
    const w = g.wine;
    const base = w
      ? slugify(`${w.linea} ${w.varietal ?? ""} ${w.bodega}`)
      : slugify(
          g.offers
            .slice()
            .sort((a, b) => a.name.length - b.name.length)[0]
            .name.slice(0, 60),
        ) || "vino";
    let s = base, n = 1;
    while (used.has(s)) s = `${base}-${++n}`;
    used.add(s);
    slugOf.set(key, s);
  }
  // redirects: v1Slug → slug v2 del wineKey dominante (si cambia)
  const redirects = {};
  for (const [v1s, key] of dominantOf) {
    const v2s = slugOf.get(key);
    if (v2s && v2s !== v1s) redirects[v1s] = v2s;
  }

  // ── Materializar grupos ──
  const outGroups = [];
  for (const [key, g] of groups) {
    const offersOut = g.offers
      .map(({ _v1Slug, ...rest }) => rest)
      .sort((a, b) => {
        if (!!a.inStock !== !!b.inStock) return a.inStock ? -1 : 1;
        const ac = a.comparable ? 0 : 1;
        const bc = b.comparable ? 0 : 1;
        if (ac !== bc) return ac - bc;
        const acol = a.isCollector ? 1 : 0;
        const bcol = b.isCollector ? 1 : 0;
        if (acol !== bcol) return acol - bcol;
        return (a.priceArs ?? Infinity) - (b.priceArs ?? Infinity);
      });

    const inStock = offersOut.filter((o) => o.inStock);
    let basis = inStock.filter((o) => o.comparable && !o.isCollector);
    if (basis.length === 0) basis = inStock.filter((o) => !o.isCollector);
    if (basis.length === 0) basis = inStock;
    const prices = basis
      .map((o) => o.priceArs)
      .filter((p) => typeof p === "number" && p > 0);

    // variantes por formato (para la sección "otros formatos" de la ficha)
    const variants = new Map();
    for (const o of offersOut) {
      const vk = `${o.volumeMl}|${o.pack}|${o.estuche ? "estuche" : ""}${o.copa ? "copa" : ""}`;
      if (!variants.has(vk)) {
        variants.set(vk, {
          volumeMl: o.volumeMl,
          pack: o.pack,
          estuche: !!o.estuche,
          copa: !!o.copa,
          offerCount: 0,
          minPrice: null,
        });
      }
      const v = variants.get(vk);
      v.offerCount++;
      if (o.inStock && typeof o.priceArs === "number" && o.priceArs > 0) {
        v.minPrice = v.minPrice === null ? o.priceArs : Math.min(v.minPrice, o.priceArs);
      }
    }

    const w = g.wine;
    const canonicalName = w
      ? [w.linea, w.varietal ? w.varietal.split("+").map((v) => v[0].toUpperCase() + v.slice(1)).join(" ") : ""].filter(Boolean).join(" ")
      : offersOut.slice().sort((a, b) => a.name.length - b.name.length)[0].name;

    outGroups.push({
      groupSlug: slugOf.get(key),
      wineKey: key,
      catalogId: w?.id ?? null,
      canonicalName,
      brand: w?.bodega ?? null,
      imageUrl: offersOut.find((o) => o.imageUrl)?.imageUrl ?? null,
      storeCount: new Set(basis.map((o) => o.storeSlug)).size,
      offerCount: basis.length,
      totalStoreCount: new Set(offersOut.map((o) => o.storeSlug)).size,
      totalOfferCount: offersOut.length,
      inStockOfferCount: inStock.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      comparableBasis: basis.length,
      variants: [...variants.values()].sort((a, b) => (a.volumeMl ?? 0) - (b.volumeMl ?? 0)),
      offers: offersOut,
    });
  }

  outGroups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    return (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity);
  });

  const multi = outGroups.filter((g) => g.storeCount >= 2).length;
  const out = {
    generatedAt: new Date().toISOString(),
    generator: "build-groups-v2.mjs",
    groupCount: outGroups.length,
    multiStoreGroupCount: multi,
    catalogWines: catalog.wines?.length ?? 0,
    productGroups: outGroups,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out));

  // ── Report ──
  const report = {
    generatedAt: out.generatedAt,
    offers: offers.length,
    assignedToCatalog: assigned,
    groups: outGroups.length,
    multiStore: multi,
    slugsPreserved: claimed.size,
    redirects: Object.keys(redirects).length,
    redirectMap: redirects,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));

  console.log(`  grupos v2: ${outGroups.length} · multi-tienda: ${multi}`);
  console.log(`  slugs v1 preservados: ${claimed.size} · redirects nuevos: ${Object.keys(redirects).length}`);
  console.log(`  → ${OUT_PATH}\n  → ${REPORT_PATH}`);
}

main();
