#!/usr/bin/env node
/**
 * Filtro de vinotecas candidatas — de un dominio suelto a una línea de
 * `data/stores.json`, o a un descarte con motivo.
 * ======================================================================
 *
 * POR QUÉ EXISTE. El historial de altas de este repo deja una lección
 * escrita en el commit 89c39cc: **"descubrir no es el cuello; backend
 * scrapeable sí"**. Los barridos de Instagram dieron ~50 candidatas
 * brutas y sólo 6 tiendas limpias. Y las que se colaron sin verificar
 * hubo que sacarlas después, de a tandas:
 *
 *   · 9 vinotecas en catalog-mode (843f9dd): WooCommerce con el botón de
 *     comprar oculto por CSS. Sin compra online no sirven para un
 *     comparador, pero el scraper les lee productos igual.
 *   · 2 que no cotizaban en pesos (#130): una tienda española en euros y
 *     otra en dólares, publicadas como "$9". 391 ofertas con la moneda
 *     equivocada y 224 fichas indexadas de vino europeo.
 *   · 6 muertas (#156): DNS caído, dominio parkeado, Shopify impaga y un
 *     dominio caducado que levantó un sitio de apuestas.
 *
 * `detect-platform.mjs` resuelve UN paso (qué plataforma usa). Este
 * script corre el resto del filtro, que es donde se cae casi todo:
 *
 *   1. DEDUP      — ¿ya está en stores.json, o ya la evaluamos antes?
 *   2. PLATAFORMA — fingerprint (reusa detect-platform.mjs).
 *   3. BACKEND    — ¿el adapter REALMENTE devuelve productos? Es el gate
 *                   que mató a lebouchon.com.ar (Woo con la Store API v1
 *                   deshabilitada: `rest_no_route`).
 *   4. MONEDA     — ¿los precios son pesos argentinos? Una mediana por
 *                   debajo del piso del propio pipeline ($1.000) o un
 *                   currency code que no es ARS es la firma del #130.
 *   5. CARRITO    — ¿se puede comprar? Catalog-mode = descarte.
 *   6. VINO       — ¿el catálogo es de vino, o es un almacén con 3
 *                   etiquetas?
 *
 * Sólo lo que pasa los seis sale como línea lista para `stores.json`.
 *
 * Todo lo evaluado queda en `data/store-candidates.json` con su motivo y
 * su fecha, para que la corrida semanal no vuelva a gastar tiempo en las
 * mismas 40 rechazadas todas las semanas. Un descarte puede caducar
 * (`--recheck`): una tienda que hoy está en catalog-mode puede prender
 * el carrito el mes que viene.
 *
 * Uso:
 *   node scripts/vet-store-candidates.mjs vinoteca.com.ar otra.com
 *   node scripts/vet-store-candidates.mjs --file candidatas.txt
 *   node scripts/vet-store-candidates.mjs --file c.txt --write   # graba el ledger
 *   node scripts/vet-store-candidates.mjs --recheck 90           # reevalúa descartes viejos
 *
 * Sin `--write` es dry-run: imprime el veredicto y no toca nada. NUNCA
 * agrega solo a stores.json — eso queda para el PR, con la línea a la
 * vista.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { detectPlatform, normalizeBase, slugFromHost, probe } from "./detect-platform.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STORES_PATH = resolve(ROOT, "data/stores.json");
const LEDGER_PATH = resolve(ROOT, "data/store-candidates.json");

/** Piso de precio del pipeline. Por debajo, o no es ARS o no es vino. */
const PISO_ARS = 1000;
/** Mínimo de productos de vino para que la tienda aporte algo. */
const MIN_VINOS = 10;
/** Cuántos productos se muestrean para medir moneda y relevancia. */
const MUESTRA = 50;

const VINO_RE =
  /\b(vino|vinos|malbec|cabernet|bonarda|syrah|merlot|chardonnay|torront[eé]s|tannat|pinot|sauvignon|blend|espumante|champ[aá][gn]|espumoso|rosado|ros[eé]|tinto|blanco|bodega|reserva)\b/i;
/** Monedas que NO son pesos argentinos (lección del #130). */
const MONEDA_EXTRANJERA_RE = /\b(EUR|USD|BRL|UYU|CLP|GBP)\b|&euro;|&#8364;|€|US\$/;

function num(x) {
  const n = typeof x === "string" ? Number(x.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function mediana(xs) {
  const a = xs.filter(Number.isFinite).sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}

/**
 * Trae una muestra de productos por la API NATIVA de la plataforma — la
 * misma puerta que usa el adapter del scraper. Si esto no devuelve nada,
 * la tienda no es scrapeable por más linda que sea.
 */
async function muestraProductos(base, platform) {
  if (platform === "shopify") {
    const r = await probe(`${base}/products.json?limit=${MUESTRA}`);
    if (!r.ok || !r.body) return { error: `products.json ${r.status ?? r.err}` };
    let j;
    try { j = JSON.parse(r.body); } catch { return { error: "products.json ilegible" }; }
    const items = (j.products ?? []).map((p) => ({
      name: p.title,
      price: num(p.variants?.[0]?.price),
      // Shopify: available=false en TODAS las variantes es la firma del
      // catálogo de exhibición.
      comprable: (p.variants ?? []).some((v) => v.available),
    }));
    return { items, raw: r.body };
  }
  if (platform === "woocommerce") {
    // Store API v1 es la única puerta que lee el adapter. Si el plugin la
    // tiene deshabilitada devuelve `rest_no_route` y la tienda no entra.
    const r = await probe(`${base}/wp-json/wc/store/v1/products?per_page=${MUESTRA}`);
    if (!r.ok || !r.body) return { error: `Store API v1 ${r.status ?? r.err}` };
    let j;
    try { j = JSON.parse(r.body); } catch { return { error: "Store API v1 ilegible" }; }
    if (j?.code === "rest_no_route") return { error: "Store API v1 deshabilitada (rest_no_route)" };
    if (!Array.isArray(j)) return { error: "Store API v1 no devuelve lista" };
    const items = j.map((p) => ({
      name: p.name,
      // Woo devuelve los precios en centavos según `currency_minor_unit`.
      price: (() => {
        const v = num(p.prices?.price);
        const mu = Number(p.prices?.currency_minor_unit ?? 0);
        return v == null ? null : v / 10 ** mu;
      })(),
      currency: p.prices?.currency_code ?? null,
      // `is_purchasable` es exactamente el catalog-mode del 843f9dd: la
      // tienda con el botón oculto por CSS lo devuelve en false.
      comprable: p.is_purchasable === true,
    }));
    return { items, raw: r.body };
  }
  if (platform === "tiendanube") {
    const r = await probe(`${base}/ar/productos/`);
    if (!r.ok || !r.body) return { error: `/ar/productos/ ${r.status ?? r.err}` };
    const html = r.body;
    // TN no expone API pública sin credenciales; el adapter parsea el
    // listado. Acá alcanza con contar items y leer precios del markup.
    const nombres = [...html.matchAll(/<a[^>]+class="[^"]*js-item-name[^"]*"[^>]*>([^<]+)</gi)].map((m) => m[1].trim());
    const alt = nombres.length ? nombres : [...html.matchAll(/data-store="product-item-name"[^>]*>([^<]+)</gi)].map((m) => m[1].trim());
    const precios = [...html.matchAll(/itemprop="price"[^>]+content="([\d.,]+)"/gi)].map((m) => num(m[1]));
    const items = alt.map((n, i) => ({ name: n, price: precios[i] ?? null, comprable: true }));
    if (!items.length) return { error: "/ar/productos/ sin items parseables" };
    return { items, raw: html.slice(0, 20000) };
  }
  // VTEX / PrestaShop / Magento necesitan IDs de categoría a mano: el
  // detector los marca y el alta no se puede automatizar.
  return { manual: true };
}

/**
 * ¿El botón de comprar está escondido por CSS?
 *
 * Éste es el caso que hay que detectar sí o sí: en catalog-mode la API de
 * WooCommerce sigue diciendo `is_purchasable: true` — el producto ES
 * comprable a nivel datos — y lo que falta es el botón. Vinoteca Masis
 * (843f9dd) es el caso testigo y HOY sigue así.
 *
 * La regla real no tiene la llave pegada al selector, viene en una lista:
 *   `...single_add_to_cart_button, .ppc-button-wrapper, form.cart .quantity,
 *     ... {display: none !important}`
 * Así que se busca cada aparición del selector y se mira si la declaración
 * que la cierra apaga el display.
 */
export function ocultaBotonDeCompra(html) {
  const h = String(html || "").toLowerCase();
  // Marcador del plugin YITH WooCommerce Catalog Mode, que es el que pone
  // esa hoja de estilos (`ywctm-frontend-inline-css` en el caso testigo).
  if (/ywctm|woocommerce[-_]catalog[-_]mode|catalog[-_]mode[-_]frontend/.test(h)) return true;
  let i = -1;
  const sel = "single_add_to_cart_button";
  while ((i = h.indexOf(sel, i + 1)) !== -1) {
    const cierre = h.indexOf("}", i);
    if (cierre === -1) continue;
    const decl = h.slice(i, cierre);
    if (/display\s*:\s*none/.test(decl)) return true;
  }
  return false;
}

/** ¿Se puede comprar? Catalog-mode y "consultar por WhatsApp" quedan afuera. */
async function chequearCarrito(base, platform, items) {
  // El HTML se mira SIEMPRE, incluso en Woo/Shopify: la API no se entera
  // de que el botón está oculto.
  const r = await probe(`${base}/`);
  if (!r.ok) return { ok: false, detalle: `home ${r.status ?? r.err}` };
  const h = (r.body || "").toLowerCase();
  if (ocultaBotonDeCompra(h)) return { ok: false, detalle: "catalog-mode: add-to-cart oculto por CSS" };

  if (items?.length && (platform === "shopify" || platform === "woocommerce")) {
    const comprables = items.filter((i) => i.comprable).length;
    return comprables > 0
      ? { ok: true, detalle: `${comprables}/${items.length} comprables` }
      : { ok: false, detalle: "catalog-mode: ningún producto comprable" };
  }
  const tieneCarrito = /add[-_]to[-_]cart|agregar al carrito|añadir al carrito|js-addtocart|comprar ahora/.test(h);
  const soloWhatsapp = /consultar por whatsapp|consultanos por whatsapp/.test(h) && !tieneCarrito;
  if (soloWhatsapp) return { ok: false, detalle: "sin carrito: sólo consulta por WhatsApp" };
  return { ok: tieneCarrito, detalle: tieneCarrito ? "carrito presente" : "no se encontró carrito en el home" };
}

/** Corre el filtro completo sobre un dominio. */
export async function vetCandidate(input, { storesByHost, storesBySlug }) {
  const base = normalizeBase(input);
  if (!base) return { input, veredicto: "descartada", motivo: "URL ilegible" };
  const host = new URL(base).hostname.replace(/^www\./, "");
  const slug = slugFromHost(host);
  const out = { input, base, host, slug };

  // 1. DEDUP
  if (storesByHost.has(host)) return { ...out, veredicto: "duplicada", motivo: `ya está como ${storesByHost.get(host)}` };
  if (storesBySlug.has(slug)) return { ...out, veredicto: "duplicada", motivo: `slug ocupado por ${slug}` };

  // 2. PLATAFORMA
  const platform = await detectPlatform(base);
  out.platform = platform;
  if (platform === "unknown") return { ...out, veredicto: "descartada", motivo: "plataforma no soportada o sitio caído" };

  // 3. BACKEND
  const m = await muestraProductos(base, platform);
  if (m.manual) {
    return { ...out, veredicto: "manual", motivo: `${platform} necesita IDs de categoría cargados a mano` };
  }
  if (m.error) return { ...out, veredicto: "descartada", motivo: `backend no scrapeable: ${m.error}` };
  const items = m.items ?? [];
  out.productos = items.length;
  if (!items.length) return { ...out, veredicto: "descartada", motivo: "el adapter no devuelve productos" };

  // 4. MONEDA
  const currencies = new Set(items.map((i) => i.currency).filter(Boolean));
  const noArs = [...currencies].filter((c) => c && c !== "ARS");
  if (noArs.length) return { ...out, veredicto: "descartada", motivo: `no cotiza en pesos (${noArs.join("/")})` };
  if (MONEDA_EXTRANJERA_RE.test(m.raw ?? "")) {
    out.aviso = "el HTML/JSON menciona moneda extranjera — mirar a mano antes de dar de alta";
  }
  const med = mediana(items.map((i) => i.price).filter((p) => p != null));
  out.medianaPrecio = med;
  if (med != null && med < PISO_ARS) {
    return { ...out, veredicto: "descartada", motivo: `mediana de precio $${med} por debajo del piso ($${PISO_ARS}): moneda equivocada o no es vino` };
  }

  // 5. CARRITO
  const cart = await chequearCarrito(base, platform, items);
  out.carrito = cart.detalle;
  if (!cart.ok) return { ...out, veredicto: "descartada", motivo: cart.detalle };

  // 6. VINO
  const vinos = items.filter((i) => VINO_RE.test(i.name ?? "")).length;
  out.vinos = vinos;
  const proporcion = vinos / items.length;
  if (vinos < MIN_VINOS && proporcion < 0.3) {
    return { ...out, veredicto: "descartada", motivo: `sólo ${vinos} de ${items.length} de la muestra son vino` };
  }

  // Línea lista para data/stores.json.
  out.linea = {
    slug,
    name: host.replace(/\.(com|ar|net|shop|store)(\.[a-z]{2})?$/i, "").replace(/[.-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim(),
    platform,
    baseUrl: base,
    ...(platform === "tiendanube" ? { catalogPath: "/ar/productos/" } : {}),
  };
  return { ...out, veredicto: "alta", motivo: `${items.length} productos, ${vinos} de vino, ${cart.detalle}` };
}

function cargarLedger() {
  if (!existsSync(LEDGER_PATH)) return { evaluadas: {} };
  try { return JSON.parse(readFileSync(LEDGER_PATH, "utf8")); } catch { return { evaluadas: {} }; }
}

/**
 * El detector de catalog-mode se autoverifica ANTES de juzgar una tienda.
 *
 * No hay CI a nivel PR en este repo, y gatear el publish diario con este
 * test sería del tamaño equivocado: si esto se rompe no se corrompe el
 * sitio, se da de alta una tienda mala en la corrida semanal. Así que la
 * guarda vive donde está el daño: el script no corre si su propio caso
 * testigo no pasa. La batería completa está en test-vet-stores.mjs.
 */
function selfCheck() {
  const testigo = `.single_add_to_cart_button, .ppc-button-wrapper, form.cart .quantity{display: none !important}`;
  const sano = `.single_add_to_cart_button:focus{outline:2px solid #333}`;
  if (!ocultaBotonDeCompra(testigo) || ocultaBotonDeCompra(sano)) {
    console.error(
      "ABORTA: el detector de catalog-mode no pasa su propio caso testigo (Vinoteca Masis, 843f9dd).\n" +
        "Sin eso este script daría de alta tiendas sin compra online. Corré: node scripts/test-vet-stores.mjs",
    );
    process.exit(1);
  }
}

async function main() {
  selfCheck();
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const recheckIdx = args.indexOf("--recheck");
  const recheckDias = recheckIdx >= 0 ? Number(args[recheckIdx + 1]) || 90 : null;
  const fileIdx = args.indexOf("--file");
  // Ojo: los valores de --file y --recheck no son candidatas.
  const valores = new Set([fileIdx >= 0 ? fileIdx + 1 : -1, recheckIdx >= 0 ? recheckIdx + 1 : -1]);
  let inputs = args.filter((a, i) => !a.startsWith("--") && !valores.has(i));
  if (fileIdx >= 0) {
    const f = args[fileIdx + 1];
    inputs = inputs.concat(readFileSync(resolve(process.cwd(), f), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  }

  const stores = JSON.parse(readFileSync(STORES_PATH, "utf8"));
  const arr = Array.isArray(stores) ? stores : stores.stores ?? [];
  const storesByHost = new Map();
  const storesBySlug = new Set();
  for (const s of arr) {
    try { storesByHost.set(new URL(s.baseUrl).hostname.replace(/^www\./, ""), s.slug); } catch { /* ignorar */ }
    storesBySlug.add(s.slug);
  }

  const ledger = cargarLedger();
  const hoy = new Date().toISOString().slice(0, 10);

  // Re-evaluar descartes viejos: una tienda puede prender el carrito o
  // habilitar la Store API meses después.
  if (recheckDias != null) {
    for (const [host, e] of Object.entries(ledger.evaluadas)) {
      if (e.veredicto !== "descartada") continue;
      const dias = Math.round((Date.parse(hoy) - Date.parse(e.fecha)) / 86400000);
      if (dias >= recheckDias) inputs.push(host);
    }
  }

  // No re-evaluar lo ya visto (salvo que venga por --recheck).
  const yaVistas = new Set(Object.keys(ledger.evaluadas));
  const nuevas = [];
  let saltadas = 0;
  for (const i of inputs) {
    const b = normalizeBase(i);
    const h = b ? new URL(b).hostname.replace(/^www\./, "") : i;
    if (yaVistas.has(h) && recheckDias == null) { saltadas++; continue; }
    nuevas.push(i);
  }
  if (!nuevas.length) {
    console.log(`Nada para evaluar (${saltadas} ya estaban en el ledger).`);
    return;
  }
  console.log(`Evaluando ${nuevas.length} candidatas (${saltadas} salteadas por ledger)…\n`);

  const resultados = [];
  for (const i of nuevas) {
    const r = await vetCandidate(i, { storesByHost, storesBySlug });
    resultados.push(r);
    const icono = { alta: "✅", manual: "🔧", duplicada: "➖", descartada: "❌" }[r.veredicto] ?? "?";
    console.log(`${icono} ${r.veredicto.toUpperCase().padEnd(11)} ${(r.host ?? r.input).padEnd(34)} ${r.motivo}`);
    if (r.aviso) console.log(`     ⚠️  ${r.aviso}`);
  }

  const altas = resultados.filter((r) => r.veredicto === "alta");
  const manuales = resultados.filter((r) => r.veredicto === "manual");
  console.log(
    `\nResumen: ${altas.length} para alta · ${manuales.length} manuales · ` +
      `${resultados.filter((r) => r.veredicto === "descartada").length} descartadas · ` +
      `${resultados.filter((r) => r.veredicto === "duplicada").length} duplicadas`,
  );

  if (altas.length) {
    console.log("\nLíneas para data/stores.json (revisar el `name` antes de pegar):");
    console.log(JSON.stringify(altas.map((a) => a.linea), null, 2));
  }
  if (manuales.length) {
    console.log(`\nManuales (hay que cargar los IDs de categoría): ${manuales.map((m) => `${m.host} (${m.platform})`).join(", ")}`);
  }

  if (write) {
    for (const r of resultados) {
      if (!r.host) continue;
      ledger.evaluadas[r.host] = {
        fecha: hoy,
        veredicto: r.veredicto,
        motivo: r.motivo,
        ...(r.platform ? { platform: r.platform } : {}),
        ...(r.productos ? { productos: r.productos } : {}),
      };
    }
    ledger._doc =
      "Vinotecas candidatas ya evaluadas por scripts/vet-store-candidates.mjs, con su veredicto y por qué. " +
      "Existe para que la corrida semanal no gaste tiempo en las mismas rechazadas todas las semanas. " +
      "Un descarte se puede reevaluar con --recheck <días>: una tienda puede prender el carrito más adelante.";
    ledger.actualizado = hoy;
    ledger.total = Object.keys(ledger.evaluadas).length;
    writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
    console.log(`\nLedger actualizado: ${LEDGER_PATH} (${ledger.total} dominios evaluados en total)`);
  } else {
    console.log("\n(dry-run) Corré con --write para grabar el ledger. El alta en stores.json va a mano, en el PR.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
