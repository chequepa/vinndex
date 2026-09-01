#!/usr/bin/env node
/**
 * Merge data/snapshot-tiendanube.json + data/snapshot-woocommerce.json
 * into the canonical data/snapshot.json that the web app reads.
 *
 * Input files can be missing — we just skip them with a warning. This
 * makes it safe to regenerate only one platform at a time.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const INPUTS = [
  { path: "data/snapshot-tiendanube.json", platform: "tiendanube" },
  { path: "data/snapshot-woocommerce.json", platform: "woocommerce" },
  { path: "data/snapshot-vtex.json", platform: "vtex" },
  { path: "data/snapshot-shopify.json", platform: "shopify" },
  { path: "data/snapshot-mercadolibre.json", platform: "mercadolibre" },
  { path: "data/snapshot-magento.json", platform: "magento" },
  { path: "data/snapshot-prestashop.json", platform: "prestashop" },
  { path: "data/snapshot-ambar.json", platform: "custom" },
];

function loadIfExists(path) {
  const abs = resolve(REPO_ROOT, path);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    console.warn(`  skip ${path}: ${err.message}`);
    return null;
  }
}

function main() {
  const parts = [];
  for (const { path, platform } of INPUTS) {
    const data = loadIfExists(path);
    if (!data) {
      console.log(`  missing: ${path}`);
      continue;
    }
    parts.push({ path, platform, data });
    console.log(
      `  loaded ${path}: ${data.storeCount} stores, ${data.productCount} products`,
    );
  }

  if (parts.length === 0) {
    console.error("No input snapshots found. Run scrape-*.mjs first.");
    process.exit(1);
  }

  const stores = parts.flatMap((p) => p.data.stores ?? []);
  const products = parts.flatMap((p) => p.data.products ?? []);

  // Dedup products by externalUrl (should already be unique per store)
  const byUrl = new Map();
  for (const p of products) {
    if (!byUrl.has(p.externalUrl)) byUrl.set(p.externalUrl, p);
  }
  const merged = [...byUrl.values()];

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generator: "merge-snapshots.mjs",
    sources: parts.map((p) => ({
      platform: p.platform,
      path: p.path,
      generatedAt: p.data.generatedAt,
    })),
    storeCount: stores.length,
    productCount: merged.length,
    stores,
    products: merged,
  };

  const outPath = resolve(REPO_ROOT, "data/snapshot.json");

  // ANTES de pisar el snapshot, guardamos el slug con el que cada oferta
  // está publicada HOY (externalUrl → groupSlug). Es la única foto que
  // queda del estado anterior: este writeFileSync lo borra.
  //
  // Por qué importa (bug encontrado el 27/08/2026). build-groups-v2.mjs
  // arma ese mismo mapa leyendo data/snapshot.json... pero corre DESPUÉS
  // de este script, así que lee el snapshot que acabamos de escribir, que
  // tiene products[] y NO productGroups[]. El mapa salía vacío todos los
  // días — "v1Slug mapeado por URL para 0 ofertas" en cada corrida— y con
  // él se caían las dos cosas que dependen de conocer el slug anterior:
  //
  //   1. Preservar el slug cuando cambia la wineKey. El registro
  //      wine-slugs.json cubre las keys que ya existían, pero una key
  //      NUEVA (un override del catálogo, un merge por EAN, un gate que
  //      cambia) no está en el registro y acuñaba un slug nuevo.
  //   2. Escribir el redirect 308 del slug viejo al nuevo. `redirects`
  //      salía siempre vacío: "redirects nuevos: 0" en todas las corridas.
  //
  // Resultado: cada vez que una ficha cambiaba de identidad, su URL moría
  // en 404 sin redirect. Le pasó a la ficha #1 de tráfico del sitio (el
  // Colón Frutos Rojos, issue #147) cuando el override del catálogo la
  // unificó el 25/08: 51 clics en 90 días contra un 404.
  //
  // build-groups-v2.mjs ya sabe leer `v1Slug` de acá — su fallback está
  // guardado detrás de `if (!offers.some((o) => o.v1Slug))`. Sólo faltaba
  // que alguien lo escribiera.
  const prevSlugByUrl = new Map();
  if (existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, "utf8"));
      for (const g of prev.productGroups ?? []) {
        for (const o of g.offers ?? []) {
          if (o.externalUrl) prevSlugByUrl.set(o.externalUrl, g.groupSlug);
        }
      }
    } catch {
      /* snapshot ilegible o primera corrida → se acuñan slugs nuevos */
    }
  }
  console.log(
    `Slugs publicados hoy, para preservarlos: ${prevSlugByUrl.size} URLs`,
  );

  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(
    `\nWrote ${outPath} — ${snapshot.storeCount} stores, ${snapshot.productCount} products`,
  );

  // Export slim para el pipeline de identidad v2 (build-wine-catalog.mjs +
  // build-groups-v2.mjs). Las ofertas crudas CON brand se pierden después
  // (build-groups.mjs dropea products[] del snapshot publicado) — este
  // archivo las preserva para el shadow run. Gitignored (pesa ~15MB).
  const offersOut = resolve(REPO_ROOT, "data/offers.json");
  writeFileSync(
    offersOut,
    JSON.stringify({
      generatedAt: snapshot.generatedAt,
      offers: merged.map((p) => ({
        name: p.name,
        brand: p.brand ?? null,
        storeSlug: p.storeSlug,
        externalUrl: p.externalUrl,
        externalSku: p.externalSku ?? null,
        priceArs: typeof p.priceArs === "string" ? Number(p.priceArs) || null : p.priceArs ?? null,
        inStock: p.inStock === true || p.inStock === "True" || p.inStock === "true",
        imageUrl: p.imageUrl ?? null,
        // Slug con el que esta oferta estaba publicada antes de esta
        // corrida. build-groups-v2.mjs lo usa para conservar la URL y,
        // si igual cambia, para escribir el redirect 308.
        v1Slug: prevSlugByUrl.get(p.externalUrl) ?? null,
      })),
    }),
  );
  console.log(`Wrote ${offersOut} — ${merged.length} offers (identidad v2)`);
}

main();
