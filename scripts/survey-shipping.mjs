#!/usr/bin/env node
/**
 * Relevamiento de envío gratis por vinoteca → data/store-shipping.json.
 *
 * Para cada tienda de data/stores.json lee el home (la franja de anuncio
 * suele decir "Envío gratis en CABA desde $X"), los links del home que
 * hablan de envíos y las rutas típicas de la página de envíos de su
 * plataforma. Extrae el mínimo para envío gratis por zona con
 * scripts/lib-shipping.mjs y guarda la frase textual y la URL como
 * evidencia.
 *
 * Lo consume /compra: "✓ Llega al envío gratis a AMBA (según la tienda)".
 * Por eso corre en un workflow que abre PR (shipping-survey.yml): el dato
 * es público y la evidencia tiene que poder mirarse antes de publicarlo.
 *
 * Reglas del archivo de salida:
 *   · una tienda sin frase con monto creíble queda SIN dato (no se inventa);
 *   · las entradas con `"manual": true` no se tocan nunca;
 *   · si una tienda tenía dato y hoy no se encontró nada (sitio caído,
 *     anti-bot), se conserva el dato anterior y se anota en el reporte; se
 *     borra recién si falla 3 relevamientos seguidos (`fallosSeguidos`).
 *
 * Uso:
 *   node scripts/survey-shipping.mjs              # todas, escribe el JSON
 *   node scripts/survey-shipping.mjs enotek ligier --dry-run
 *   node scripts/survey-shipping.mjs --report /tmp/envios.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { probe } from "./detect-platform.mjs";
import { htmlToText, extractFreeShipping, summarize, shippingLinks, candidatePaths } from "./lib-shipping.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
// --stores / --out existen para probarlo contra un servidor local.
const STORES = resolve(opt("--stores") ?? resolve(ROOT, "data/stores.json"));
const OUT = resolve(opt("--out") ?? resolve(ROOT, "data/store-shipping.json"));
const CONCURRENCY = 4;
const MAX_FETCHES_PER_STORE = 7;
const DROP_AFTER_FAILS = 3;
/** Marketplaces y supers: el envío depende del vendedor/sucursal, no hay una política. */
const SKIP_PLATFORMS = new Set(["mercadolibre", "vtex"]);
/**
 * El sitio todavía es CABA/GBA (docs/cobertura-nacional.md, en espera): no se
 * relevan las vinotecas del interior ni se guardan mínimos para ciudades del
 * interior ("gratis en Rosario desde…"). Se reactivan con el plan nacional.
 */
const SKIP_STORES = new Set(["casa-de-vinos-mendoza", "vinoteca-campos", "sol-y-vino"]);

const DRY = argv.includes("--dry-run");
const REPORT = opt("--report");
const valued = new Set(["--report", "--stores", "--out"].map((n) => argv.indexOf(n) + 1).filter((i) => i > 0));
const only = new Set(argv.filter((a, i) => !a.startsWith("--") && !valued.has(i)));

async function surveyStore(store) {
  const base = store.baseUrl.replace(/\/+$/, "");
  const visited = new Set();
  const candidates = [];
  let reachable = false;

  const visit = async (url) => {
    if (visited.has(url) || visited.size >= MAX_FETCHES_PER_STORE) return null;
    visited.add(url);
    const r = await probe(url);
    if (!r.ok || !r.body || !/html/i.test(r.ct)) return null;
    reachable = true;
    for (const c of extractFreeShipping(htmlToText(r.body))) candidates.push({ ...c, url });
    return r.body;
  };

  const home = await visit(base + "/");
  const linked = home ? shippingLinks(home, base) : [];
  for (const u of linked) await visit(u);
  for (const p of candidatePaths(store.platform)) {
    if (candidates.length >= 2) break; // ya hay evidencia; no gastar requests
    await visit(base + p);
  }
  return { reachable, candidates, pages: [...visited] };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

function fmt(n) {
  return `$${n.toLocaleString("es-AR")}`;
}

async function main() {
  const stores = JSON.parse(readFileSync(STORES, "utf8")).filter(
    (s) => !SKIP_PLATFORMS.has(s.platform) && !SKIP_STORES.has(s.slug) && (only.size === 0 || only.has(s.slug)),
  );
  const prev = JSON.parse(readFileSync(OUT, "utf8"));
  const data = { ...prev, stores: { ...(prev.stores ?? {}) } };
  const hoy = new Date().toISOString().slice(0, 10);

  console.log(`Relevando envíos de ${stores.length} vinotecas…`);
  const results = await pool(stores, CONCURRENCY, async (s) => {
    const r = await surveyStore(s);
    const { byZona, conflicto } = summarize(r.candidates.filter((c) => c.zona !== "local"));
    const zonas = Object.keys(byZona);
    console.log(
      `${zonas.length ? "✅" : r.reachable ? "·" : "❌"} ${s.slug.padEnd(28)} ` +
        (zonas.length ? zonas.map((z) => `${z} ${fmt(byZona[z].monto)}`).join(" · ") : r.reachable ? "sin dato publicado" : "no respondió") +
        (conflicto ? "  ⚠️ montos distintos" : ""),
    );
    return { store: s, ...r, byZona, conflicto };
  });

  const report = [];
  let found = 0;
  let kept = 0;
  let dropped = 0;
  for (const r of results) {
    const slug = r.store.slug;
    const old = data.stores[slug];
    if (old?.manual) continue;
    const zonas = Object.keys(r.byZona);
    if (zonas.length) {
      found++;
      data.stores[slug] = {
        gratisDesde: Object.fromEntries(zonas.map((z) => [z, r.byZona[z].monto])),
        evidencia: zonas.map((z) => ({ zona: z, frase: r.byZona[z].frase, url: r.byZona[z].url })),
        fuente: "relevamiento automático de la web de la tienda",
        fecha: hoy,
        verificado: false,
        ...(r.conflicto ? { conflicto: true } : {}),
      };
      report.push({ slug, name: r.store.name, zonas: r.byZona, conflicto: r.conflicto, changed: JSON.stringify(old?.gratisDesde) !== JSON.stringify(data.stores[slug].gratisDesde) });
    } else if (old) {
      const fails = (old.fallosSeguidos ?? 0) + 1;
      if (fails >= DROP_AFTER_FAILS) {
        delete data.stores[slug];
        dropped++;
        report.push({ slug, name: r.store.name, dropped: true });
      } else {
        data.stores[slug] = { ...old, fallosSeguidos: fails };
        kept++;
      }
    }
  }
  data.actualizado = hoy;

  console.log(`\n${found} con envío gratis publicado · ${kept} conservadas del relevamiento anterior · ${dropped} borradas tras ${DROP_AFTER_FAILS} fallos · ${results.length - found - kept - dropped} sin dato`);

  if (REPORT) {
    const lines = [
      `| Vinoteca | Envío gratis desde | Evidencia |`,
      `|---|---|---|`,
      ...report
        .filter((r) => r.dropped || r.changed)
        .map((r) =>
          r.dropped
            ? `| ${r.name} | ~~borrada~~ (${DROP_AFTER_FAILS} relevamientos sin dato) | |`
            : `| ${r.name}${r.conflicto ? " ⚠️" : ""} | ${Object.entries(r.zonas).map(([z, c]) => `${z} ${fmt(c.monto)}`).join("<br>")} | ${Object.values(r.zonas).map((c) => `[“${c.frase.replace(/\|/g, "/")}”](${c.url})`).join("<br>")} |`,
        ),
    ];
    writeFileSync(REPORT, lines.join("\n") + "\n");
  }
  if (!DRY) writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
