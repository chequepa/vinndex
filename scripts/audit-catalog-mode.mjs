#!/usr/bin/env node
// Audit stores to detect catalog-mode / consultation-only vinotecas.
// Reports OUT confirmed, DUDOSAS, and VALID totals.

import fs from 'node:fs/promises';
import path from 'node:path';

const STORES_PATH = path.resolve('data/stores.json');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': USER_AGENT,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
};

const TIMEOUT_MS = 15000;
const BATCH = 5;

async function fetchOnce(url, json) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, status: res.status, url: res.url };
    const finalUrl = res.url;
    if (json) {
      const data = await res.json();
      return { ok: true, status: res.status, data, url: finalUrl };
    }
    const text = await res.text();
    return { ok: true, status: res.status, text, url: finalUrl };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, { json = false } = {}) {
  let res = await fetchOnce(url, json);
  if (!res.ok && (res.status === 403 || res.status === 503 || res.status === 429)) {
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    res = await fetchOnce(url, json);
  }
  return res;
}

// ---------- Generic catalog-mode heuristics ----------

// Returns object: { hidden: boolean, reason?: string }
// Only flag a CSS rule as hiding the add-to-cart if the rule body has display:none
// AND every selector in the rule references the add-to-cart button (not placeholder/loader).
function detectAddToCartHidden(html, buttonSelectors) {
  const styleBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (m) => m[1],
  );
  const combinedStyle = styleBlocks.join('\n');

  // Allowlist of suffixes that mean "loader/placeholder/ghost, not the real button"
  const placeholderSuffix =
    /-placeholder\b|-ghost\b|-skeleton\b|-loader\b|-loading\b|-spinner\b/i;

  // Walk all CSS rules: split on '}' and inspect each rule
  const rules = combinedStyle.split('}');
  for (const raw of rules) {
    const idx = raw.indexOf('{');
    if (idx === -1) continue;
    const selectorPart = raw.slice(0, idx);
    const body = raw.slice(idx + 1);
    if (!/display\s*:\s*none/i.test(body)) continue;
    // Split selectors by comma
    const selectors = selectorPart.split(',').map((s) => s.trim());

    for (const target of buttonSelectors) {
      // Match if at least one selector references target AND none of them are placeholder-only
      const escTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sel = selectors.find((s) => new RegExp(escTarget, 'i').test(s));
      if (!sel) continue;
      // Check if this exact selector also has a placeholder suffix glued to it
      if (placeholderSuffix.test(sel)) continue; // ignore placeholder-targeted rules
      // Check the entire selector — if the *only* class references in this selector
      // are placeholder variants, skip
      const classRefs = sel.match(/\.[a-zA-Z0-9_-]+/g) || [];
      const nonPlaceholderClasses = classRefs.filter(
        (c) => !placeholderSuffix.test(c),
      );
      // If after removing placeholder classes, no add-to-cart class remains, skip
      const targetClass = target.startsWith('.') ? target.slice(1) : null;
      if (targetClass) {
        const refsTargetExact = nonPlaceholderClasses.some(
          (c) => c.slice(1) === targetClass,
        );
        if (!refsTargetExact) continue;
      }
      return { hidden: true, reason: `CSS hides ${target} (display:none)` };
    }
  }
  return { hidden: false };
}

function findInlineHiddenWrapper(html, buttonRegex) {
  // Iterate ALL matches. Catalog-mode only if EVERY match is inside a display:none wrapper.
  const globalRe = new RegExp(buttonRegex.source, 'gi');
  let m;
  let totalMatches = 0;
  let hiddenMatches = 0;
  while ((m = globalRe.exec(html))) {
    totalMatches++;
    const before = html.slice(Math.max(0, m.index - 600), m.index);
    if (/style=("|')[^"']*display\s*:\s*none[^"']*("|')/i.test(before)) {
      hiddenMatches++;
    }
    if (totalMatches > 30) break; // bound
  }
  // Only flag if there were matches AND all of them are hidden
  return totalMatches > 0 && hiddenMatches === totalMatches;
}

function hasConsultaWhatsappCta(html) {
  // Strong indicator: "Consultar disponibilidad" near product info, or only WhatsApp CTAs
  const txt = html.toLowerCase();
  const hasConsultar =
    /consultar\s+disponibilidad|consult[áa]\s+disponibilidad|consultar\s+por\s+whats|consulta\s+por\s+whats/i.test(
      html,
    );
  // Strong "solo retiro en local" / "solo presencial"
  const onlyPickup = /solo\s+retiro\s+en\s+local|solo\s+presencial|venta\s+solo\s+presencial/i.test(
    html,
  );
  return { hasConsultar, onlyPickup };
}

// ---------- WooCommerce ----------

async function auditWoocommerce(store) {
  const base = store.baseUrl.replace(/\/$/, '');
  // 1. Try Store API
  const apiUrl = `${base}/wp-json/wc/store/v1/products?per_page=1`;
  let permalink = null;
  const apiRes = await fetchText(apiUrl, { json: true });
  if (apiRes.ok && Array.isArray(apiRes.data) && apiRes.data.length > 0) {
    permalink = apiRes.data[0].permalink;
  } else {
    // Fallback: try old /products/ archive
    const altRes = await fetchText(`${base}/?s=vino&post_type=product`);
    if (altRes.ok && altRes.text) {
      const m = altRes.text.match(
        /<a[^>]+href="([^"]+\/product\/[^"]+)"[^>]*>/i,
      );
      if (m) permalink = m[1];
    }
  }
  if (!permalink) {
    return {
      status: 'DUDOSA',
      reason: 'no product permalink (API empty / blocked)',
    };
  }

  const prodRes = await fetchText(permalink);
  if (!prodRes.ok || !prodRes.text) {
    return {
      status: 'DUDOSA',
      reason: `product fetch failed (${prodRes.status || prodRes.error})`,
    };
  }
  const html = prodRes.text;

  // Look for add to cart button presence (broaden: WC themes vary a lot)
  const btnRegex =
    /<button[^>]*\bsingle_add_to_cart_button\b|<button[^>]*\bname\s*=\s*"add-to-cart"|<input[^>]*\bname\s*=\s*"add-to-cart"|<form[^>]*\bclass="[^"]*\bcart\b[^"]*"|<a[^>]*\badd_to_cart_button\b|<a[^>]*\bdata-product_id\b[^>]*ajax_add_to_cart/i;
  const hasButton = btnRegex.test(html);

  // CSS hide detection
  const cssCheck = detectAddToCartHidden(html, [
    '.single_add_to_cart_button',
    '.cart .single_add_to_cart_button',
    "button[name='add-to-cart']",
    'button[name="add-to-cart"]',
  ]);

  const inlineHidden = hasButton && findInlineHiddenWrapper(html, btnRegex);

  // Price visibility
  const priceMatch = html.match(
    /<span[^>]*woocommerce-Price-amount[^>]*>([\s\S]*?)<\/span>/i,
  );
  const hasPriceText = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  const { hasConsultar, onlyPickup } = hasConsultaWhatsappCta(html);

  if (cssCheck.hidden) {
    return { status: 'OUT', reason: cssCheck.reason };
  }
  if (inlineHidden) {
    return { status: 'OUT', reason: 'add-to-cart inside display:none wrapper' };
  }
  if (!hasButton) {
    if (hasConsultar || onlyPickup) {
      return {
        status: 'OUT',
        reason: hasConsultar ? 'no btn, "Consultar" CTA' : 'no btn, "solo presencial"',
      };
    }
    return { status: 'DUDOSA', reason: 'no add-to-cart button found' };
  }
  // Button present
  if (!hasPriceText) {
    return {
      status: 'SOSPECHOSA',
      reason: 'btn present but no visible price',
    };
  }
  return { status: 'VALID' };
}

// ---------- Tiendanube ----------

async function auditTiendanube(store) {
  const base = store.baseUrl.replace(/\/$/, '');
  const catalogUrl = `${base}${store.catalogPath || '/ar/productos/'}`;
  const listRes = await fetchText(catalogUrl);
  if (!listRes.ok || !listRes.text) {
    return {
      status: 'DUDOSA',
      reason: `catalog fetch failed (${listRes.status || listRes.error})`,
    };
  }
  // Find first product link. TN product URLs are typically /productos/<slug>/ or /<slug>/.
  const html = listRes.text;
  let productUrl = null;
  // Primary: anchors with js-item-name class (TN standard); href can be absolute or relative
  const itemRe = /<a[^>]*\bjs-item-name\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>|<a[^>]*\bhref\s*=\s*"([^"]+)"[^>]*\bjs-item-name\b/gi;
  const itemMatch = itemRe.exec(html);
  if (itemMatch) {
    const raw = itemMatch[1] || itemMatch[2];
    productUrl = raw.startsWith('http') ? raw : base + raw;
  }
  if (!productUrl) {
    const ds = html.match(
      /<a[^>]+data-store="product-item-name[^"]*"[^>]*href="([^"]+)"/i,
    );
    if (ds) productUrl = ds[1].startsWith('http') ? ds[1] : base + ds[1];
  }
  if (!productUrl) {
    // Fallback: any href to /productos/<slug>/ (NOT /productos/page/N/ or /productos/categoria/...)
    const generic = html.match(
      /href="(https?:\/\/[^"]*\/productos\/[^"/]+\/?)"/i,
    );
    if (generic && !/\/productos\/(page|categoria|categorias)\//i.test(generic[1])) {
      productUrl = generic[1];
    }
  }
  if (!productUrl) {
    const relGeneric = html.match(/href="(\/productos\/[^"/]+\/?)"/i);
    if (relGeneric && !/\/productos\/(page|categoria)\//i.test(relGeneric[1])) {
      productUrl = base + relGeneric[1];
    }
  }
  if (!productUrl) {
    return { status: 'DUDOSA', reason: 'no product link in catalog' };
  }
  const prodRes = await fetchText(productUrl);
  if (!prodRes.ok || !prodRes.text) {
    return {
      status: 'DUDOSA',
      reason: `product fetch failed (${prodRes.status || prodRes.error})`,
    };
  }
  const phtml = prodRes.text;

  const btnRegex =
    /js-prod-submit-form|js-addtocart|js-product-form|js-form-add-to-cart|js-addtocart-form|js-button-add-to-cart|name="agregar"|class="[^"]*\bbtn-add-to-cart\b|<input[^>]+name="add_to_cart"|action="\/comprar\/"|data-store="product-buy-button"/i;
  const hasButton = btnRegex.test(phtml);

  const cssCheck = detectAddToCartHidden(phtml, [
    '.js-button-add-to-cart',
    '.btn-add-to-cart',
    '.js-addtocart-form',
    '.js-form-add-to-cart',
    '.js-addtocart',
    '.js-prod-submit-form',
    "[data-store='product-buy-button']",
    '[data-store="product-buy-button"]',
  ]);

  const inlineHidden = hasButton && findInlineHiddenWrapper(phtml, btnRegex);

  const { hasConsultar, onlyPickup } = hasConsultaWhatsappCta(phtml);

  // Price (TN): look for data-store="product-price" / item-price / or $X.XXX in body
  let priceText = '';
  const priceMatch =
    phtml.match(/data-store="product-price[^"]*"[^>]*>([\s\S]*?)<\//i) ||
    phtml.match(/data-store="price-value"[^>]*>([\s\S]*?)<\//i) ||
    phtml.match(/class="[^"]*\bitem-price\b[^"]*"[^>]*>([\s\S]*?)<\//i);
  if (priceMatch) priceText = priceMatch[1].replace(/<[^>]+>/g, '').trim();
  if (!priceText && /\$\s*[\d.,]+/.test(phtml)) priceText = 'inferred';

  if (cssCheck.hidden)
    return { status: 'OUT', reason: cssCheck.reason };
  if (inlineHidden)
    return { status: 'OUT', reason: 'add-to-cart inside display:none wrapper' };

  if (!hasButton) {
    if (hasConsultar || onlyPickup) {
      return {
        status: 'OUT',
        reason: hasConsultar
          ? 'no btn + "Consultar disponibilidad"'
          : 'no btn + "solo presencial"',
      };
    }
    // TN almost always has the cart form, so absence is dudosa
    return { status: 'DUDOSA', reason: 'no add-to-cart form found' };
  }
  if (!priceText) {
    return { status: 'SOSPECHOSA', reason: 'btn present but no visible price' };
  }
  return { status: 'VALID' };
}

// ---------- Shopify ----------

async function auditShopify(store) {
  const base = store.baseUrl.replace(/\/$/, '');
  const listRes = await fetchText(`${base}/products.json?limit=1`, {
    json: true,
  });
  if (!listRes.ok || !listRes.data?.products?.length) {
    return {
      status: 'DUDOSA',
      reason: `products.json failed (${listRes.status || listRes.error})`,
    };
  }
  const handle = listRes.data.products[0].handle;
  const prodRes = await fetchText(`${base}/products/${handle}`);
  if (!prodRes.ok || !prodRes.text) {
    return {
      status: 'DUDOSA',
      reason: `product fetch failed (${prodRes.status || prodRes.error})`,
    };
  }
  const phtml = prodRes.text;

  const btnRegex =
    /<button[^>]*\bname\s*=\s*"add"|product-form__cart-submit|data-add-to-cart|class="[^"]*\bproduct-form__submit\b|\bbtn-product-form\b/i;
  const hasButton = btnRegex.test(phtml);

  const cssCheck = detectAddToCartHidden(phtml, [
    '.product-form__cart-submit',
    "button[name='add']",
    'button[name="add"]',
    '.product-form__submit',
  ]);

  const inlineHidden = hasButton && findInlineHiddenWrapper(phtml, btnRegex);

  const { hasConsultar, onlyPickup } = hasConsultaWhatsappCta(phtml);

  // Sold-out check
  const soldOutOnly = /(?:sold\s*out|agotado)[^a-z0-9]/i.test(phtml);

  if (cssCheck.hidden)
    return { status: 'OUT', reason: cssCheck.reason };
  if (inlineHidden)
    return { status: 'OUT', reason: 'add button inside display:none wrapper' };

  if (!hasButton) {
    if (hasConsultar || onlyPickup) {
      return {
        status: 'OUT',
        reason: hasConsultar ? 'no btn + "Consultar"' : 'no btn + "solo presencial"',
      };
    }
    return { status: 'DUDOSA', reason: 'no add-to-cart button found' };
  }
  // Price (Shopify): look for class="price" / data-price
  const priceMatch =
    phtml.match(/class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\//i) ||
    phtml.match(/data-price="([^"]+)"/i);
  const priceText = priceMatch ? String(priceMatch[1] || '').replace(/<[^>]+>/g, '').trim() : '';
  if (!priceText && !/\$\s*\d/.test(phtml)) {
    return { status: 'SOSPECHOSA', reason: 'btn present but no visible price' };
  }
  return { status: 'VALID' };
}

// ---------- Magento (Ligier) ----------

async function auditMagento(store) {
  const base = store.baseUrl.replace(/\/$/, '');
  const searchUrl = `${base}${store.searchPath || '/search/vino'}`;
  const res = await fetchText(searchUrl);
  if (!res.ok || !res.text) {
    return {
      status: 'DUDOSA',
      reason: `search fetch failed (${res.status || res.error})`,
    };
  }
  // Find first product link
  const html = res.text;
  let productUrl = null;
  const m =
    html.match(/<a[^>]+class="[^"]*\bproduct[\s_-]?item[\s_-]?link\b[^"]*"[^>]+href="([^"]+)"/i) ||
    html.match(/<a[^>]+href="(https?:[^"]+\.html)"[^>]*class="[^"]*product/i) ||
    html.match(/<a[^>]+href="(https?:[^"]+\.html)"[^>]*>[\s\S]{0,80}vino/i);
  if (m) productUrl = m[1].startsWith('http') ? m[1] : base + m[1];
  if (!productUrl) {
    return { status: 'DUDOSA', reason: 'no product link in search' };
  }
  const prodRes = await fetchText(productUrl);
  if (!prodRes.ok || !prodRes.text) {
    return { status: 'DUDOSA', reason: 'product fetch failed' };
  }
  const phtml = prodRes.text;
  const btnRegex = /<button[^>]*\bid\s*=\s*"product-addtocart-button|class="[^"]*\btocart\b/i;
  const hasButton = btnRegex.test(phtml);
  const cssCheck = detectAddToCartHidden(phtml, [
    '#product-addtocart-button',
    '.action.tocart',
    '.tocart',
  ]);
  if (cssCheck.hidden) return { status: 'OUT', reason: cssCheck.reason };
  if (!hasButton) return { status: 'DUDOSA', reason: 'no tocart button' };
  return { status: 'VALID' };
}

// ---------- PrestaShop (Frappe) ----------

async function auditPrestashop(store) {
  const base = store.baseUrl.replace(/\/$/, '');
  const catRes = await fetchText(`${base}${store.categoryPath || '/'}`);
  if (!catRes.ok || !catRes.text) {
    return {
      status: 'DUDOSA',
      reason: `category fetch failed (${catRes.status || catRes.error})`,
    };
  }
  const html = catRes.text;
  const m =
    html.match(/<a[^>]+class="[^"]*\bproduct-thumbnail\b[^"]*"[^>]+href="([^"]+)"/i) ||
    html.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*\bthumbnail\b[^"]*\bproduct-thumbnail\b/i) ||
    html.match(/<a[^>]+href="([^"]+\/\d+-[^"]+\.html)"/i);
  if (!m) return { status: 'DUDOSA', reason: 'no product link in category' };
  const productUrl = m[1].startsWith('http') ? m[1] : base + m[1];
  const prodRes = await fetchText(productUrl);
  if (!prodRes.ok || !prodRes.text) {
    return { status: 'DUDOSA', reason: 'product fetch failed' };
  }
  const phtml = prodRes.text;
  const btnRegex = /<button[^>]*\b(add-to-cart|name\s*=\s*"submit")|class="[^"]*\badd[-_]?to[-_]?cart\b/i;
  const hasButton = btnRegex.test(phtml);
  const cssCheck = detectAddToCartHidden(phtml, [
    '.add-to-cart',
    'button.add-to-cart',
    '.btn-add-to-cart',
  ]);
  if (cssCheck.hidden) return { status: 'OUT', reason: cssCheck.reason };
  if (!hasButton) return { status: 'DUDOSA', reason: 'no add-to-cart button' };
  return { status: 'VALID' };
}

// ---------- Runner ----------

const SKIP_PLATFORMS = new Set(['vtex', 'mercadolibre', 'custom']);

async function auditOne(store) {
  try {
    if (store.platform === 'woocommerce') return await auditWoocommerce(store);
    if (store.platform === 'tiendanube') return await auditTiendanube(store);
    if (store.platform === 'shopify') return await auditShopify(store);
    if (store.platform === 'magento') return await auditMagento(store);
    if (store.platform === 'prestashop') {
      if (store.slug === 'sol-y-vino') return { status: 'SKIP', reason: 'anti-bot' };
      return await auditPrestashop(store);
    }
    return { status: 'SKIP', reason: `platform ${store.platform} trusted` };
  } catch (err) {
    return { status: 'DUDOSA', reason: 'exception: ' + String(err?.message || err) };
  }
}

async function main() {
  const raw = await fs.readFile(STORES_PATH, 'utf-8');
  const stores = JSON.parse(raw);
  const targets = stores.filter((s) => !SKIP_PLATFORMS.has(s.platform));
  // Also skip sol-y-vino per instructions (handled inside)
  const total = targets.length;
  const results = [];
  let done = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const batchRes = await Promise.all(
      batch.map(async (s) => {
        const r = await auditOne(s);
        return { slug: s.slug, platform: s.platform, baseUrl: s.baseUrl, ...r };
      }),
    );
    results.push(...batchRes);
    done += batch.length;
    process.stderr.write(`progress: ${done}/${total}\n`);
  }
  // Print JSON
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
