#!/usr/bin/env node
/**
 * Detector de grupos duplicados por imagen — DIAGNÓSTICO.
 *
 * Reporta grupos distintos que comparten la misma URL de imagen. No
 * modifica el snapshot, no autoriza merges. Sale para inspección
 * manual y/o para alimentar Stage 2 como signal adicional.
 *
 * Lecciones de las iteraciones previas:
 *
 *   1. dHash 64-bit (8x8 grayscale) NO funciona para botellas de vino.
 *      La silueta vertical centrada sobre fondo blanco produce hashes
 *      casi idénticos en imágenes muy distintas — vimos 3300 pares con
 *      distancia ≤8 en sólo 200 grupos, mezclando combos absurdos como
 *      "Aperitivo Cynar" con "Achaval Ferrer Malbec". Cualquier
 *      perceptual hash futuro tiene que ser pHash con DCT 256+ bits y
 *      crop sobre la región de la etiqueta, no sobre la silueta.
 *
 *   2. Aún el match EXACTO por URL tiene falsos positivos: las bodegas
 *      reutilizan la misma foto del catálogo entre varietales de la
 *      misma línea (Tamascal Cabernet vs Ancellota, Clos Abanicos
 *      Malbec vs Cabernet Franc). Lo que SÍ alcanza captura:
 *        - imágenes genéricas reutilizadas (Gift Cards, accesorios) —
 *          filtramos arriba con PLACEHOLDER_PATTERNS
 *        - hotlinks del fabricante (vinoteca A linkea CDN B porque no
 *          subió la imagen propia) — eso son dupes reales
 *        - el mismo producto trilingüe (FR/EN/ES) — caso raro pero real
 *
 *   3. Por lo anterior, este script NO es un matcher autónomo. Su
 *      output es CANDIDATOS — el siguiente paso útil es integrar la
 *      coincidencia de imagen como prior fuerte en Stage 2 (textual
 *      similar + misma imagen → casi seguro merge; textual similar +
 *      imágenes claramente distintas → casi seguro NO merge).
 *
 * Salida: data/image-url-candidates.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SNAPSHOT = resolve(ROOT, "data/snapshot.json");

// URLs de imagen placeholder por plataforma — "no foto", "default", etc.
// Si la imagen de un grupo es uno de éstos, NO la usamos para matching
// porque produce clusters falsos enormes (vimos un caso de 118 grupos
// agrupados por `no-photo.webp` de Tiendanube).
const PLACEHOLDER_PATTERNS = [
  /\/no-?photo\b/i,
  /\/no-?image\b/i,
  /\/placeholder/i,
  /\/default[-_]?(big|image|photo|thumb)?\.(jpg|jpeg|png|webp|gif)$/i,
  /\/blank\.(jpg|jpeg|png|webp|gif)$/i,
  /\/woocommerce-placeholder/i,
  // WP / e-commerce: imágenes "captura de pantalla" usadas como
  // fallback genérico para productos sin foto cargada.
  /\/captura-de-pantalla/i,
  /\/screenshot[-_]/i,
  // Tarjetas de regalo: una sola imagen reutilizada en N denominaciones,
  // no son dupes reales.
  /\/(gift[-_]?card|gcv-|tarjeta[-_]?regalo)/i,
];

function isPlaceholderUrl(u) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(u));
}

function normalizeImageUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (isPlaceholderUrl(u)) return null;
  // Normalizar variantes triviales del mismo CDN — algunas tiendas usan
  // `acdn-us.mitiendanube.com` y otras `dcdn-us.mitiendanube.com` para
  // el mismísimo archivo (es el a/b record de Tiendanube). Y siempre
  // sacamos query strings tipo `?v=123` o `?width=480`.
  let s = u.trim();
  try {
    const url = new URL(s);
    url.search = "";
    url.hash = "";
    // Normalizar acdn-us / dcdn-us → cdn-us (TN tiene ambos)
    url.hostname = url.hostname.replace(/^[ad]cdn-us\./, "cdn-us.");
    // Algunos CDNs sirven thumbs con sufijos -480-0, -640-0, etc.
    // Esos son la misma imagen redimensionada; los normalizamos para
    // que el match no se rompa por la resolución elegida.
    url.pathname = url.pathname.replace(/-\d+-\d+(\.[a-z]+)$/, "$1");
    s = url.toString();
  } catch {
    // URL inválida — devolvemos el original; no hace match con nada
    // y a lo sumo se ignora.
  }
  return s;
}

function main() {
  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const groups = snap.productGroups ?? [];
  console.log(`Analizando ${groups.length} grupos…`);

  // Index: imageUrl normalizado → groupSlug[]
  const byImage = new Map();
  let withImage = 0;
  for (const g of groups) {
    const u = normalizeImageUrl(g.imageUrl);
    if (!u) continue;
    withImage++;
    if (!byImage.has(u)) byImage.set(u, []);
    byImage.get(u).push(g);
  }
  console.log(`Grupos con imageUrl válido: ${withImage}`);
  console.log(`URLs distintas (post-normalización): ${byImage.size}`);

  // Clusters de >=2 grupos compartiendo URL
  const clusters = [...byImage.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .map(([url, arr]) => ({ url, members: arr }))
    .sort((a, b) => b.members.length - a.members.length);

  // Stats
  const totalGroupsInClusters = clusters.reduce(
    (n, c) => n + c.members.length,
    0,
  );
  const totalCollapsableGroups = totalGroupsInClusters - clusters.length;
  console.log(
    `\n=== ${clusters.length} URLs aparecen en >1 grupo (falsos negativos detectables) ===`,
  );
  console.log(
    `  Total grupos involucrados: ${totalGroupsInClusters} → colapsarían en ${clusters.length} (ahorro ${totalCollapsableGroups})`,
  );

  // Reporte top 30 (más miembros primero)
  console.log("\nTop 30 clusters por tamaño:");
  for (const c of clusters.slice(0, 30)) {
    console.log(`\n  ${c.members.length} grupos comparten:`);
    console.log(`    img: ${c.url.slice(0, 100)}`);
    for (const g of c.members) {
      const fmt = g.format ? ` [${g.format}]` : "";
      console.log(
        `    - sc=${String(g.storeCount).padStart(2)} ${(g.brand ?? "∅").padEnd(20)} ${g.canonicalName.slice(0, 55)}${fmt}`,
      );
    }
  }

  // Distribución de tamaños
  const sizeBuckets = {};
  for (const c of clusters) {
    sizeBuckets[c.members.length] = (sizeBuckets[c.members.length] ?? 0) + 1;
  }
  console.log("\n=== Distribución de cluster sizes ===");
  Object.keys(sizeBuckets)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((k) => console.log(`  size ${k}: ${sizeBuckets[k]} clusters`));

  const out = {
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt: snap.generatedAt,
    groupCount: groups.length,
    withImage,
    distinctImageUrls: byImage.size,
    clusters: clusters.map((c) => ({
      imageUrl: c.url,
      groupSlugs: c.members.map((g) => g.groupSlug),
    })),
  };
  const outPath = resolve(ROOT, "data/image-url-candidates.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outPath} — ${clusters.length} clusters`);
}

main();
