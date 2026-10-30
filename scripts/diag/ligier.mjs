// TEMPORAL: estructura del sitio nuevo de Ligier (Next.js en ligier.com.ar).
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const H = { "user-agent": UA, accept: "text/html,*/*", "accept-language": "es-AR,es;q=0.9" };
const get = async (u) => { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(25000) }); return { r, t: await r.text() }; };
const ld = (t) => [...t.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

for (const u of ["https://ligier.com.ar/productos?q=vino", "https://ligier.com.ar/productos", "https://ligier.com.ar/productos?page=2", "https://ligier.com.ar/productos?pagina=2"]) {
  const { r, t } = await get(u);
  console.log(`\n### ${u} -> ${r.status} ${t.length}B final=${r.url}`);
  const blocks = ld(t);
  console.log(`ld+json blocks: ${blocks.length}`);
  for (const b of blocks) console.log("  LD:", b.slice(0, 1500));
  const hrefs = [...new Set([...t.matchAll(/href="(\/[^"#?]{2,120})"/g)].map((m) => m[1]))];
  console.log("hrefs:", hrefs.slice(0, 80).join(" "));
  const pag = [...new Set([...t.matchAll(/href="([^"]*(?:page|pagina|p)=\d+[^"]*)"/g)].map((m) => m[1]))];
  console.log("paginación:", pag.slice(0, 20).join(" "));
  const tot = t.match(/(\d[\d.]*)\s*(?:productos|resultados)/i); console.log("total?:", tot?.[0]);
  // primer card: 2500 chars alrededor del primer precio
  const i = t.indexOf("$"); console.log("CARD:", t.slice(Math.max(0, i - 1800), i + 700).replace(/\s+/g, " "));
  if (u.endsWith("q=vino")) {
    const m = t.match(/self\.__next_f\.push\(\[1,"([\s\S]{0,3000})/); console.log("RSC:", m?.[1]?.slice(0, 3000));
  }
}
const { t: si } = await get("https://ligier.com.ar/sitemap-index.xml");
const maps = [...si.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log("\nsitemaps:", maps.join(" "));
for (const m of maps) {
  const { t } = await get(m);
  const locs = [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  console.log(`  ${m}: ${locs.length} urls, ej: ${locs.slice(0, 4).join(" ")} … ${locs.slice(-2).join(" ")}`);
}
// una ficha de producto
const { t: p } = await get("https://ligier.com.ar/productos?q=malbec");
const prod = p.match(/href="(\/producto[s]?\/[^"?#]+)"/)?.[1];
if (prod) {
  const { r, t } = await get("https://ligier.com.ar" + prod);
  console.log(`\n### ficha ${prod} -> ${r.status}`);
  for (const b of ld(t)) console.log("  LD:", b.slice(0, 2500));
}
