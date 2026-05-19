#!/usr/bin/env node
/**
 * Detector de plataforma e-commerce para sumar vinotecas.
 *
 * El cuello para crecer en cobertura NO es técnico (los adapters dedicados
 * ya existen y son buenos porque usan la API nativa de cada plataforma).
 * El cuello es descubrir qué plataforma usa una tienda nueva. Esto lo
 * automatiza: dado un dominio, fingerprintea la plataforma con sondas
 * HTTP y emite la línea lista para `data/stores.json`, ruteada al
 * adapter dedicado correcto.
 *
 * (Un adapter "universal JSON-LD" se descartó: el JSON-LD del HTML es
 * SEO pobre — sin precio ni EAN. Validado en PoC.)
 *
 * Uso:
 *   node scripts/detect-platform.mjs https://vino.com.ar https://otra.com
 *   node scripts/detect-platform.mjs --file candidatos.txt   # 1 URL/línea
 *   node scripts/detect-platform.mjs --add https://vino.com   # agrega a stores.json
 *
 * Sin --add es dry-run (solo imprime). Idempotente: detecta si el
 * dominio ya está en stores.json.
 *
 * Cobertura del auto-completado:
 *   - woocommerce, shopify  -> línea 100% lista (solo baseUrl)
 *   - tiendanube            -> línea lista (catalogPath default /ar/productos/)
 *   - vtex, prestashop      -> detecta, pero requiere 1 dato manual
 *                              (categoryPaths / categoryPath = IDs internos)
 *   - magento               -> detecta, searchPath default /search/vino
 *   - unknown               -> reporta, no soportada
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const STORES_PATH = resolve(REPO_ROOT, "data/stores.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEADERS = { "user-agent": UA, accept: "*/*", "accept-language": "es-AR,es;q=0.9" };
const TIMEOUT_MS = 15000;

async function probe(url, asText = true) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: ctrl.signal });
    const body = asText && r.ok ? await r.text() : null;
    return { ok: r.ok, status: r.status, ct: r.headers.get("content-type") || "", body };
  } catch (e) {
    return { ok: false, err: e.message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fingerprint validado 6/6 contra plataformas conocidas. El orden importa:
 * las sondas de API (Shopify, Woo) son inequívocas y van primero; el resto
 * cae a markers del HTML del home.
 */
async function detectPlatform(base) {
  const sj = await probe(base + "/products.json?limit=1");
  if (sj.ok && /json/.test(sj.ct) && sj.body && /"products"\s*:/.test(sj.body)) {
    return "shopify";
  }
  const wc = await probe(base + "/wp-json/wc/store/v1/products?per_page=1");
  if (wc.ok && /json/.test(wc.ct)) return "woocommerce";

  const home = await probe(base + "/");
  if (!home.ok) return "unknown";
  const h = (home.body || "").toLowerCase();
  if (/vtex\.com|vteximg|vtexassets|__runtime/.test(h)) return "vtex";
  if (/cdn\.shopify\.com|shopify\.com\/s\/files/.test(h)) return "shopify";
  if (/mitiendanube\.com|tiendanube|nuvemshop/.test(h)) return "tiendanube";
  if (/prestashop|\/modules\/ps_|prestashop-/.test(h)) return "prestashop";
  if (/\/static\/version\d|\/pub\/static\/|data-mage-init|mage\//.test(h)) return "magento";
  if (/\/wp-content\/|wp-json|woocommerce/.test(h)) return "woocommerce";
  const gen = (home.body || "").match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i,
  );
  if (gen) {
    const g = gen[1].toLowerCase();
    if (g.includes("prestashop")) return "prestashop";
    if (g.includes("shopify")) return "shopify";
    if (g.includes("woocommerce") || g.includes("wordpress")) return "woocommerce";
  }
  return "unknown";
}

function normalizeBase(input) {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return null;
  }
}

function slugFromHost(host) {
  return host
    .replace(/^www\./, "")
    .replace(/\.(com|ar|net|org|store|shop)(\.[a-z]{2})?$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

// Plataformas cuya línea queda 100% lista vs las que necesitan dato manual.
const AUTO = {
  woocommerce: (slug, name, base) => ({ slug, name, platform: "woocommerce", baseUrl: base }),
  shopify: (slug, name, base) => ({ slug, name, platform: "shopify", baseUrl: base }),
  tiendanube: (slug, name, base) => ({
    slug,
    name,
    platform: "tiendanube",
    baseUrl: base,
    catalogPath: "/ar/productos/",
  }),
};
const MANUAL = {
  vtex: (slug, name, base) => ({
    slug, name, platform: "vtex", baseUrl: base,
    categoryPaths: ["TODO: mapear IDs de categoría VTEX (ej /2/45/215/)"],
  }),
  prestashop: (slug, name, base) => ({
    slug, name, platform: "prestashop", baseUrl: base,
    categoryPath: "TODO: ruta de categoría vinos (ej /1574-vinos)",
  }),
  magento: (slug, name, base) => ({
    slug, name, platform: "magento", baseUrl: base,
    searchPath: "/search/vino",
  }),
};

async function main() {
  const args = process.argv.slice(2);
  const doAdd = args.includes("--add");
  const fileArg = args.indexOf("--file");
  let inputs = args.filter((a) => !a.startsWith("--"));
  if (fileArg !== -1 && args[fileArg + 1]) {
    inputs = readFileSync(args[fileArg + 1], "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }
  if (!inputs.length) {
    console.error("Uso: node scripts/detect-platform.mjs <url> [<url>...] [--file f] [--add]");
    process.exit(1);
  }

  const stores = JSON.parse(readFileSync(STORES_PATH, "utf8"));
  const existingHosts = new Set(
    stores.map((s) => {
      try {
        return new URL(s.baseUrl).hostname.replace(/^www\./, "");
      } catch {
        return s.baseUrl;
      }
    }),
  );

  const toAdd = [];
  const summary = { ready: 0, manual: 0, unknown: 0, exists: 0 };

  for (const raw of inputs) {
    const base = normalizeBase(raw);
    if (!base) {
      console.log(`✗ ${raw} — URL inválida`);
      continue;
    }
    const host = new URL(base).hostname.replace(/^www\./, "");
    if (existingHosts.has(host)) {
      console.log(`• ${host} — ya está en stores.json`);
      summary.exists++;
      continue;
    }
    let plat;
    try {
      plat = await detectPlatform(base);
    } catch (e) {
      plat = "unknown";
      console.log(`✗ ${host} — error: ${e.message}`);
      continue;
    }
    const slug = slugFromHost(host);
    const name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    if (AUTO[plat]) {
      const entry = AUTO[plat](slug, name, base);
      console.log(`✅ ${host} — ${plat} (lista): ${JSON.stringify(entry)}`);
      toAdd.push(entry);
      summary.ready++;
    } else if (MANUAL[plat]) {
      const entry = MANUAL[plat](slug, name, base);
      console.log(`⚠️  ${host} — ${plat} (requiere 1 dato manual): ${JSON.stringify(entry)}`);
      summary.manual++;
    } else {
      console.log(`❓ ${host} — plataforma no soportada (custom/desconocida)`);
      summary.unknown++;
    }
  }

  console.log(
    `\nResumen: ${summary.ready} listas · ${summary.manual} requieren dato manual · ` +
      `${summary.unknown} no soportadas · ${summary.exists} ya existían`,
  );

  if (doAdd && toAdd.length) {
    // Backup + APPEND TEXTUAL (no regeneración). stores.json usa un objeto
    // por línea con espacios `{ "k": "v" }` y líneas en blanco separadoras
    // puestas a mano. Re-serializar con JSON.stringify reformatea todo o
    // pierde los separadores → diff de cientos de líneas de ruido. En vez
    // de eso insertamos las entries nuevas justo antes del `]` de cierre,
    // sin tocar el resto: el diff es exactamente las tiendas nuevas.
    writeFileSync(STORES_PATH + ".bak", readFileSync(STORES_PATH));
    const fmtEntry = (e) =>
      "  { " +
      Object.entries(e)
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(", ") +
      " }";
    const raw = readFileSync(STORES_PATH, "utf8");
    const closeIdx = raw.lastIndexOf("]");
    let head = raw.slice(0, closeIdx).replace(/\s*$/, "");
    if (!head.endsWith(",")) head += ","; // la ex-última entry necesita coma
    const out = head + "\n" + toAdd.map(fmtEntry).join(",\n") + "\n]\n";
    writeFileSync(STORES_PATH, out);
    console.log(
      `\n✅ Agregadas ${toAdd.length} tiendas a data/stores.json (backup en .bak). ` +
        `Revisá slug/name antes de commitear.`,
    );
  } else if (toAdd.length) {
    console.log(`\n(dry-run) ${toAdd.length} listas para agregar. Corré con --add para persistir.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
