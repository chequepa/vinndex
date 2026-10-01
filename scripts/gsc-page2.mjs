#!/usr/bin/env node
/**
 * gsc-page2.mjs — "el oro de la página 2" y las páginas que rankean por
 * accidente, desde Search Console.
 *
 *   node scripts/gsc-page2.mjs [--days 90] [--min-impr 30] [--json]
 *
 * Dos listas, por página (dimensiones query × page de la Search Analytics
 * API):
 *   1. PÁGINA 2: consultas en posición 8–20 con ≥ --min-impr impresiones.
 *      Un salto de 15 a 5 vale más que diez páginas nuevas: acá se toca el
 *      title/h1/description y el contenido de ESA página.
 *   2. RANKEA POR ACCIDENTE: la consulta trae palabras que el <title> de
 *      la página que rankea no tiene. O el title está mal, o falta una
 *      página mejor para esa consulta.
 *
 * Misma credencial que gsc-report.mjs (GOOGLE_SERVICE_ACCOUNT_JSON o
 * GOOGLE_SERVICE_ACCOUNT_FILE, scope readonly).
 */
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DAYS = Number(argVal("--days", "90"));
const MIN_IMPR = Number(argVal("--min-impr", "30"));
const JSON_MODE = args.includes("--json");
const SITE_URL = argVal("--site", "https://vinndex.com.ar/");

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* CI usa secrets */ }
}
loadEnv();
const fail = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };
function creds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_FILE
    ? readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8")
    : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) fail("falta GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SERVICE_ACCOUNT_FILE (setup en scripts/gsc-report.mjs)");
  return JSON.parse(raw);
}
const b64url = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function token(c) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: c.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(c.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${sig}` }) });
  if (!res.ok) fail(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}
const ymd = (d) => d.toISOString().slice(0, 10);
const strip = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["de", "del", "la", "el", "los", "las", "en", "y", "a", "un", "una", "vino", "vinos", "precio", "precios", "comprar", "argentina", "online"]);
const terms = (q) => strip(q).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));

async function main() {
  const tk = await token(creds());
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - DAYS);
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${tk}`, "content-type": "application/json" },
    body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: ["query", "page"], rowLimit: 5000 }),
  });
  const json = await res.json();
  if (!res.ok) fail(`Search Console: ${json.error?.message ?? res.status}`);
  const rows = (json.rows ?? []).map((r) => ({ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

  const page2 = rows.filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= MIN_IMPR).sort((a, b) => b.impressions - a.impressions);

  // Títulos reales de las páginas involucradas (hasta 60 páginas, en paralelo de a 8).
  const pages = [...new Set(page2.map((r) => r.page))].slice(0, 60);
  const titles = new Map();
  for (let i = 0; i < pages.length; i += 8) {
    await Promise.all(pages.slice(i, i + 8).map(async (p) => {
      try {
        const html = await (await fetch(p, { headers: { "user-agent": "vinndex-gsc-page2" } })).text();
        const t = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
        const h1 = html.replace(/<!-- -->/g, "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
        titles.set(p, { title: t, h1 });
      } catch { titles.set(p, { title: "", h1: "" }); }
    }));
  }
  const accidental = page2.filter((r) => {
    const t = titles.get(r.page); if (!t) return false;
    const hay = strip(`${t.title} ${t.h1}`);
    const missing = terms(r.query).filter((w) => !hay.includes(w));
    r.missing = missing;
    return missing.length > 0;
  });

  if (JSON_MODE) { console.log(JSON.stringify({ days: DAYS, page2, accidental }, null, 1)); return; }
  console.log(`=== Página 2 · ${ymd(start)} → ${ymd(end)} · consultas en posición 8–20 con ≥${MIN_IMPR} impresiones: ${page2.length} ===\n`);
  const byPage = new Map();
  for (const r of page2) { if (!byPage.has(r.page)) byPage.set(r.page, []); byPage.get(r.page).push(r); }
  const ranked = [...byPage.entries()].map(([p, rs]) => ({ p, rs, impr: rs.reduce((n, r) => n + r.impressions, 0) })).sort((a, b) => b.impr - a.impr);
  for (const { p, rs, impr } of ranked.slice(0, 40)) {
    const t = titles.get(p);
    console.log(`${String(impr).padStart(6)} impr · ${p.replace(SITE_URL, "/")}\n       title: ${t?.title ?? "?"}`);
    for (const r of rs.slice(0, 6)) console.log(`       ${String(r.impressions).padStart(5)} impr · pos ${r.position.toFixed(1)} · CTR ${(100 * r.ctr).toFixed(1)}% · "${r.query}"${r.missing?.length ? `  ← faltan en el título: ${r.missing.join(", ")}` : ""}`);
  }
  console.log(`\n=== Rankea por accidente (la consulta trae palabras que el título no tiene): ${accidental.length} ===`);
  for (const r of accidental.slice(0, 30)) console.log(`  ${String(r.impressions).padStart(5)} impr · pos ${r.position.toFixed(1)} · "${r.query}" → ${r.page.replace(SITE_URL, "/")} (faltan: ${r.missing.join(", ")})`);
}
main().catch((e) => fail(e.message));
