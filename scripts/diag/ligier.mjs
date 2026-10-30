// TEMPORAL: markup de las cards del listado de Ligier (Next.js).
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const H = { "user-agent": UA, accept: "text/html,*/*", "accept-language": "es-AR,es;q=0.9" };
const get = async (u) => { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(25000) }); return { r, t: await r.text() }; };
for (const u of ["https://ligier.com.ar/vinos", "https://ligier.com.ar/espumantes", "https://ligier.com.ar/vinos?page=2"]) {
  const { r, t } = await get(u);
  const links = [...t.matchAll(/href="(\/productos\/[^"?#]+)"/g)].map((m) => m[1]);
  const pag = [...new Set([...t.matchAll(/href="([^"]*page=\d+[^"]*)"/g)].map((m) => m[1]))];
  console.log(`\n### ${u} -> ${r.status} ${t.length}B cards=${new Set(links).size} pag=${pag.join(" ")}`);
  if (u.endsWith("/vinos")) {
    const i = t.indexOf(`href="${links[0]}"`);
    console.log("CARD HTML:\n" + t.slice(i - 300, i + 3200));
    const sku = links[0].split("-").pop().toUpperCase();
    let k = 0, j = -1;
    while ((j = t.indexOf(sku, j + 1)) !== -1 && k++ < 6) console.log(`\nCTX ${sku} @${j}:`, t.slice(j - 600, j + 600));
  }
}
