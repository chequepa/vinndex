#!/usr/bin/env node
/**
 * Stage 1.5 — merge por coincidencia de imagen.
 *
 * Corre entre `build-groups.mjs` (Stage 1) y `stage2-embeddings.mjs`
 * (Stage 2). Captura el caso "mismo packshot del fabricante reutilizado
 * por varias vinotecas, pero con nombres divergentes que el matcher
 * textual no terminó de colapsar".
 *
 * Estrategia:
 *   - Normalizar `imageUrl` (acdn-us ↔ dcdn-us de Tiendanube, sufijos
 *     `-480-0` de thumbnail, query strings). Misma lógica que el script
 *     de diagnóstico `find-image-duplicates.mjs`.
 *   - Filtrar placeholders conocidos (no-photo.webp, screenshots de WP,
 *     gift cards).
 *   - Bucket por URL normalizada.
 *   - Para cada cluster con ≥2 grupos, gate de compatibilidad:
 *       · mismo brand (case-insensitive, post-aliases)
 *       · al menos UNA varietal compartida (o ambos sin varietal)
 *       · mismo type (Tinto/Blanco/Espumante/etc) o ambos null
 *       · mismo format (null = 750ml default) o ambos null
 *   - Si pasa, merge. Si no pasa, lo dejamos para Stage 2/3.
 *
 * Por qué corre acá y no en Stage 2:
 *   - Es determinístico y barato (no consulta APIs externas).
 *   - Reducir grupos antes de embeddings ahorra ~$0.02 + 30s en
 *     OpenAI calls (text-embedding-3-small a 13k grupos).
 *   - Reducir grupos antes de Stage 3 ahorra calls al LLM gpt-4o-mini.
 *
 * Lecciones tomadas del PR #92 (find-image-duplicates):
 *   - El URL-match TIENE falsos positivos por bodegas que reutilizan
 *     foto entre varietales (Lagarde Malbec ↔ Lagarde Cab Sauv,
 *     Casillero del Diablo Malbec ↔ Cab Sauv). El gate de varietal
 *     los descarta.
 *   - Hay clusters de placeholder genérico del Jumbo (14 grupos con
 *     marcas distintas comparten el mismo JPG). El gate de brand los
 *     descarta automáticamente (brands distintas → no merge).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SNAPSHOT = resolve(REPO_ROOT, "data/snapshot.json");

// Sync con find-image-duplicates.mjs.
const PLACEHOLDER_PATTERNS = [
  /\/no-?photo\b/i,
  /\/no-?image\b/i,
  /\/placeholder/i,
  /\/default[-_]?(big|image|photo|thumb)?\.(jpg|jpeg|png|webp|gif)$/i,
  /\/blank\.(jpg|jpeg|png|webp|gif)$/i,
  /\/woocommerce-placeholder/i,
  /\/captura-de-pantalla/i,
  /\/screenshot[-_]/i,
  /\/(gift[-_]?card|gcv-|tarjeta[-_]?regalo)/i,
];
function isPlaceholderUrl(u) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(u));
}

function normalizeImageUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (isPlaceholderUrl(u)) return null;
  let s = u.trim();
  try {
    const url = new URL(s);
    url.search = "";
    url.hash = "";
    // Tiendanube tiene a/b CDN records — acdn-us ↔ dcdn-us sirven el
    // mismo archivo, normalizamos a un host estable.
    url.hostname = url.hostname.replace(/^[ad]cdn-us\./, "cdn-us.");
    // Sufijo `-WIDTH-INDEX` que algunos CDNs agregan para variantes de
    // tamaño — la imagen base es la misma.
    url.pathname = url.pathname.replace(/-\d+-\d+(\.[a-z]+)$/, "$1");
    s = url.toString();
  } catch {
    // URL inválida → la dejamos pasar tal cual; igual no hará bucket.
  }
  return s;
}

function brandKey(g) {
  return (g.brand ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function varietalsSet(g) {
  return new Set((g.varietals ?? []).map((v) => v.toLowerCase()));
}

// Stopwords para la comparación de canonicalName por tokens — palabras
// genéricas de vocabulario vinícola que no discriminan productos.
const NAME_STOPWORDS = new Set([
  "vino", "vinos", "tinto", "blanco", "rosado", "rose", "espumante",
  "champagne", "champana", "brut", "dulce", "seco", "reserva", "reserve",
  "gran", "premium", "clasico", "750", "cc", "ml", "1500", "3000", "x",
  "de", "del", "la", "el", "los", "las", "y", "con", "sin", "bodega",
  "estuche", "pack", "caja", "magnum", "media", "half",
  // Varietales — ya validados por el otro gate
  "malbec", "cabernet", "sauvignon", "chardonnay", "bonarda", "syrah",
  "pinot", "noir", "merlot", "torrontes", "torrontés", "tempranillo",
  "blanc", "blanca", "blancas", "franc", "petit", "verdot",
]);

function nameTokens(name) {
  return new Set(
    String(name ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !NAME_STOPWORDS.has(t)),
  );
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True si los dos grupos son compatibles para merge por imagen. */
function compatible(a, b) {
  // Brand: AMBOS tienen que tenerlo y debe coincidir. Antes éramos
  // permisivos con "uno vacío" pero terminamos mergeando accesorios
  // sin marca (las cavas CRUX en 3 idiomas) — fuera de scope.
  const ba = brandKey(a);
  const bb = brandKey(b);
  if (!ba || !bb || ba !== bb) return false;

  // Varietals: si CUALQUIERA tiene varietal explícito, AMBOS deben
  // compartir al menos una. Esto previene el caso "Puerto Campo
  // Albariño" (varietals=[] porque el extractor no captó Albariño)
  // mergeando con "Puerto Campo Semillón" (varietals=[Semillón]) sólo
  // porque la bodega usa la misma foto para varietales distintos.
  const va = varietalsSet(a);
  const vb = varietalsSet(b);
  if (va.size > 0 || vb.size > 0) {
    let hit = false;
    for (const v of va) if (vb.has(v)) { hit = true; break; }
    if (!hit) return false;
  }

  // Type: si ambos lo tienen, debe coincidir (Tinto vs Blanco ≠ same).
  if (a.type && b.type && a.type !== b.type) return false;

  // Format: si ambos lo tienen, debe coincidir. Si uno es null
  // (= 750ml default) y otro tiene format de volumen (1500ml), bloquear
  // — mismo razonamiento que el guard de compatibleToMerge en Stage 2.
  const fmtIsVol = (f) => /^\d+(?:ml|l)$/.test(f ?? "");
  if (a.format && b.format && a.format !== b.format) return false;
  if (fmtIsVol(a.format) !== fmtIsVol(b.format) && (fmtIsVol(a.format) || fmtIsVol(b.format))) return false;

  // Gate final: los canonicalName tokens deben solaparse ≥70%. Sin esto,
  // "Zorzal El Barba Malbec Magnum" se fusiona con "Zorzal El Barba
  // Malbec Doble Magnum" — mismo brand, mismo varietal, mismo format
  // (porque extractFormat colapsa "Magnum" y "Doble Magnum" a "magnum"),
  // pero claramente son volúmenes distintos. El Jaccard sobre tokens
  // distintivos del nombre los separa porque "Doble" no está en el otro.
  const ta = nameTokens(a.canonicalName);
  const tb = nameTokens(b.canonicalName);
  if (jaccard(ta, tb) < 0.7) return false;

  return true;
}

/** Union-find clásico. */
function makeUF(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
  };
  return { find, union };
}

/** Merge in-place: combina los offers del grupo source en target. */
function mergeIntoCanonical(canonical, others) {
  const allOffers = [canonical.offers, ...others.map((g) => g.offers)].flat();
  const seen = new Set();
  const dedupOffers = [];
  for (const o of allOffers) {
    if (seen.has(o.externalUrl)) continue;
    seen.add(o.externalUrl);
    dedupOffers.push(o);
  }
  // Pool varietals (union, top 3).
  const vSet = new Set([...(canonical.varietals ?? [])]);
  for (const o of others) for (const v of o.varietals ?? []) vSet.add(v);

  const inStock = dedupOffers.filter((o) => o.inStock);
  const inStockCommercial = inStock.filter((o) => !o.isCollector);
  const statsBasis = inStockCommercial.length > 0 ? inStockCommercial : inStock;
  const uniqueStores = new Set(statsBasis.map((o) => o.storeSlug));
  const prices = statsBasis
    .map((o) => o.priceArs)
    .filter((p) => typeof p === "number" && p > 0);

  return {
    ...canonical,
    offers: dedupOffers.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      const aColl = a.isCollector ? 1 : 0;
      const bColl = b.isCollector ? 1 : 0;
      if (aColl !== bColl) return aColl - bColl;
      const pa = a.priceArs ?? Number.POSITIVE_INFINITY;
      const pb = b.priceArs ?? Number.POSITIVE_INFINITY;
      return pa - pb;
    }),
    storeCount: uniqueStores.size,
    offerCount: inStock.length,
    totalStoreCount: new Set(dedupOffers.map((o) => o.storeSlug)).size,
    totalOfferCount: dedupOffers.length,
    inStockOfferCount: inStock.length,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    varietals: [...vSet].slice(0, 3),
  };
}

function main() {
  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const groups = snap.productGroups ?? [];
  console.log(`Stage 1.5 image-merge sobre ${groups.length} grupos`);

  // Bucket por URL normalizada.
  const byImage = new Map();
  for (let i = 0; i < groups.length; i++) {
    const u = normalizeImageUrl(groups[i].imageUrl);
    if (!u) continue;
    if (!byImage.has(u)) byImage.set(u, []);
    byImage.get(u).push(i);
  }

  const uf = makeUF(groups.length);
  let pairsMerged = 0;
  let placeholderClusters = 0;
  let incompatibleClusters = 0;

  for (const [url, indices] of byImage.entries()) {
    if (indices.length < 2) continue;

    // Heurística defensiva: si el cluster tiene ≥5 grupos con brands
    // distintas, es casi seguro un placeholder del CDN — saltamos.
    if (indices.length >= 5) {
      const brands = new Set(
        indices.map((i) => brandKey(groups[i])).filter(Boolean),
      );
      if (brands.size >= 3) {
        placeholderClusters++;
        console.log(
          `  ⚠ skip placeholder candidate (${indices.length} grupos, ${brands.size} brands): ${url.slice(0, 80)}`,
        );
        continue;
      }
    }

    // Pares compatibles dentro del cluster — unimos sólo los que pasan
    // el gate, no toda la URL.
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = groups[indices[i]];
        const b = groups[indices[j]];
        if (compatible(a, b)) {
          uf.union(indices[i], indices[j]);
          pairsMerged++;
        } else {
          incompatibleClusters++;
        }
      }
    }
  }

  // Aplicar Union-Find clusters → snapshot mergeado.
  const clusters = new Map();
  for (let i = 0; i < groups.length; i++) {
    const root = uf.find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }

  const newGroups = [];
  for (const indices of clusters.values()) {
    if (indices.length === 1) {
      newGroups.push(groups[indices[0]]);
      continue;
    }
    // Canonical = el que más tiendas tiene (más confiable).
    indices.sort((a, b) => {
      const ga = groups[a];
      const gb = groups[b];
      if (ga.storeCount !== gb.storeCount) return gb.storeCount - ga.storeCount;
      return (gb.offerCount ?? 0) - (ga.offerCount ?? 0);
    });
    const canonical = groups[indices[0]];
    const others = indices.slice(1).map((i) => groups[i]);
    newGroups.push(mergeIntoCanonical(canonical, others));
  }

  // Reorder como hace Stage 2.
  newGroups.sort((a, b) => {
    if (a.storeCount !== b.storeCount) return b.storeCount - a.storeCount;
    const pa = a.minPrice ?? Number.POSITIVE_INFINITY;
    const pb = b.minPrice ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  const before = groups.length;
  const after = newGroups.length;
  const multi = newGroups.filter((g) => (g.storeCount ?? 0) >= 2).length;
  console.log(`\n=== Stage 1.5 report ===`);
  console.log(`  Pares mergeados:                ${pairsMerged}`);
  console.log(`  Clusters incompatibles (gate):  ${incompatibleClusters}`);
  console.log(`  Placeholders skipped:           ${placeholderClusters}`);
  console.log(`  Groups: ${before} → ${after} (-${before - after})`);
  console.log(`  Multi-store: ${multi}`);

  snap.productGroups = newGroups;
  snap.groupCount = after;
  snap.multiStoreGroupCount = multi;
  snap.stage1bGeneratedAt = new Date().toISOString();
  snap.stage1bMerges = before - after;

  writeFileSync(SNAPSHOT, JSON.stringify(snap));
  console.log(`\nWrote ${SNAPSHOT}`);
}

main();
