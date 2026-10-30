#!/usr/bin/env node
// TEMPORAL: pide cada URL con fetch (undici, como los scrapers) y vuelca
// status, headers relevantes, marcadores y el comienzo del cuerpo.
// Uso: VARIANT=html|json node scripts/diag/probe.mjs URL...
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEADERS = {
  json: { "user-agent": UA, accept: "application/json,text/plain,*/*", "accept-language": "es-AR,es;q=0.9,en;q=0.8" },
  html: {
    "user-agent": UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "es-AR,es;q=0.9,en;q=0.8",
    "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "none",
    "upgrade-insecure-requests": "1",
  },
}[process.env.VARIANT || "json"];
const MARKERS = ["cf-chl", "Just a moment", "captcha", "verifyChallenge", "_bm_skipml", "product-item-info", "product-item-link",
  "poly-card", "poly-component__title", "ui-search-layout", "imunify", "sucuri", "wordfence", "Access denied", "account-verification",
  "Magento", "woocommerce", "tiendanube", "vtex", "shopify", "application/ld+json", "<urlset", "<sitemapindex", "__PRELOADED_STATE__"];

for (const url of process.argv.slice(2)) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`\n### ${url}\n-> ${res.status} final=${res.url} ${Date.now() - t0}ms ${buf.length}B magic=${buf.subarray(0, 4).toString("hex")}`);
    for (const k of ["server", "content-type", "content-encoding", "cf-ray", "cf-mitigated", "x-sucuri-id", "x-powered-by", "x-magento-cache-debug", "x-wp-total", "location"])
      if (res.headers.get(k)) console.log(`   ${k}: ${res.headers.get(k).slice(0, 150)}`);
    const text = buf.toString("utf8");
    console.log(`   head: ${text.replace(/\s+/g, " ").slice(0, 400)}`);
    console.log(`   markers: ${MARKERS.filter((m) => text.includes(m)).join(", ") || "-"}`);
    try { const j = JSON.parse(text); console.log(`   json: ${Array.isArray(j) ? `array len=${j.length}` : `keys=${Object.keys(j).slice(0, 10)}`}`); } catch {}
  } catch (e) {
    console.log(`\n### ${url}\n-> ERROR ${e.message} cause=${e.cause?.code ?? e.cause?.message ?? ""} ${Date.now() - t0}ms`);
  }
}
