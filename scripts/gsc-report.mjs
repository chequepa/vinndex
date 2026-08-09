#!/usr/bin/env node
/**
 * gsc-report.mjs — lee Google Search Console y saca el reporte de tráfico.
 *
 * POR QUÉ EXISTE. El cron semanal viene reportando a ciegas del lado de
 * SEO desde el 02/08: Search Console necesita login interactivo de Google
 * y el cron corre sin sesión. Los números de tráfico del log están
 * congelados en el 29/07. Sin esto, la mitad SEO de cada corrida es una
 * opinión.
 *
 * SIN DEPENDENCIAS. El repo tiene 7 dependencias y ninguna es de Google;
 * meter `googleapis` (~50 MB, cientos de transitivas) para tres llamadas
 * HTTP no se justifica. El JWT RS256 lo firma node:crypto.
 *
 * ── SETUP (una vez, ~5 minutos) ──────────────────────────────────────
 *
 * 1. En Google Cloud Console, proyecto nuevo o existente:
 *      · APIs & Services → Enable APIs → "Google Search Console API"
 *      · IAM → Service Accounts → Create → sin roles (no hacen falta)
 *      · en la cuenta creada: Keys → Add key → JSON → se baja un archivo
 *
 * 2. En Search Console (https://search.google.com/search-console):
 *      Settings → Users and permissions → Add user
 *      · email: el `client_email` del JSON
 *      · permiso: Full (Restricted no alcanza para searchAnalytics)
 *
 * 3. Para correrlo:
 *      · local  → guardá el JSON y exportá GOOGLE_SERVICE_ACCOUNT_FILE
 *                 con la ruta, o pegá el contenido en .env.local como
 *                 GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 *      · CI     → secret GOOGLE_SERVICE_ACCOUNT_JSON con el JSON entero
 *
 * Uso:
 *   node scripts/gsc-report.mjs                 # digest de texto
 *   node scripts/gsc-report.mjs --json          # salida estructurada
 *   node scripts/gsc-report.mjs --days 90       # ventana (default 28)
 *   node scripts/gsc-report.mjs --ctr-floor 2   # umbral de oportunidad
 */

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const DAYS = Number(argVal("--days", "28"));
const CTR_FLOOR = Number(argVal("--ctr-floor", "2")); // en %
const SITE_URL = argVal("--site", "https://vinndex.com.ar/");

function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* sin .env.local seguimos (CI usa secrets) */ }
}
loadEnv();

function loadCredentials() {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let raw = null;
  if (file) {
    try {
      raw = readFileSync(file, "utf8");
    } catch (e) {
      fail(`no pude leer GOOGLE_SERVICE_ACCOUNT_FILE (${file}): ${e.message}`);
    }
  } else if (inline) {
    raw = inline;
  } else {
    fail(
      "falta la credencial. Exportá GOOGLE_SERVICE_ACCOUNT_JSON (el JSON entero)\n" +
        "  o GOOGLE_SERVICE_ACCOUNT_FILE (ruta al archivo). El setup está\n" +
        "  documentado arriba de todo en scripts/gsc-report.mjs.",
    );
  }
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    fail(`la credencial no es JSON válido: ${e.message}`);
  }
  if (!creds.client_email || !creds.private_key) {
    fail("la credencial no tiene client_email / private_key — ¿bajaste el JSON de tipo 'service account'?");
  }
  return creds;
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** JWT firmado RS256 → token de acceso OAuth2. */
async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: creds.token_uri ?? "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = signer
    .sign(creds.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(creds.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    fail(
      `Google rechazó la credencial (${res.status}): ${body.error_description ?? body.error ?? "sin detalle"}\n` +
        "  Si dice 'invalid_grant', revisá que el reloj de la máquina esté en hora.\n" +
        "  Si dice 'access_denied', falta habilitar la Search Console API en el proyecto.",
    );
  }
  return body.access_token;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function query(token, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 403) {
      fail(
        `Search Console dice 403: ${msg}\n` +
          `  Falta agregar el service account como usuario de ${SITE_URL} en\n` +
          "  Settings → Users and permissions, con permiso Full.",
      );
    }
    fail(`Search Console: ${msg}`);
  }
  return json.rows ?? [];
}

function totals(rows) {
  const t = rows.reduce(
    (a, r) => ({
      clicks: a.clicks + (r.clicks ?? 0),
      impressions: a.impressions + (r.impressions ?? 0),
      posSum: a.posSum + (r.position ?? 0) * (r.impressions ?? 0),
    }),
    { clicks: 0, impressions: 0, posSum: 0 },
  );
  return {
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    position: t.impressions ? t.posSum / t.impressions : 0,
  };
}

function pct(now, before) {
  if (!before) return null;
  return ((now - before) / before) * 100;
}
function arrow(v) {
  if (v === null) return "";
  const s = v >= 0 ? "+" : "";
  return ` (${s}${v.toFixed(0)}% vs. período anterior)`;
}

async function main() {
  const creds = loadCredentials();
  const token = await getAccessToken(creds);

  // GSC tiene ~2 días de lag; arrancar hoy devuelve ceros al final.
  const end = new Date(Date.now() - 2 * 86400_000);
  const start = new Date(end.getTime() - (DAYS - 1) * 86400_000);
  const prevEnd = new Date(start.getTime() - 86400_000);
  const prevStart = new Date(prevEnd.getTime() - (DAYS - 1) * 86400_000);

  const [cur, prev, queries, pages] = await Promise.all([
    query(token, { startDate: ymd(start), endDate: ymd(end), dimensions: ["date"], rowLimit: 1000 }),
    query(token, { startDate: ymd(prevStart), endDate: ymd(prevEnd), dimensions: ["date"], rowLimit: 1000 }),
    query(token, { startDate: ymd(start), endDate: ymd(end), dimensions: ["query"], rowLimit: 500 }),
    query(token, { startDate: ymd(start), endDate: ymd(end), dimensions: ["page"], rowLimit: 1000 }),
  ]);

  const now = totals(cur);
  const before = totals(prev);

  // La palanca #1 del proyecto es CTR, no páginas nuevas: páginas que YA
  // tienen impresiones y posición decente pero se llevan pocos clics.
  // Ahí el trabajo es el title y la description, no más contenido.
  const opportunities = pages
    .map((r) => ({
      page: r.keys[0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: (r.ctr ?? 0) * 100,
      position: r.position ?? 0,
    }))
    .filter((p) => p.impressions >= 100 && p.position <= 20 && p.ctr < CTR_FLOOR)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  const report = {
    generatedAt: new Date().toISOString(),
    site: SITE_URL,
    window: { days: DAYS, start: ymd(start), end: ymd(end) },
    totals: now,
    previous: before,
    delta: {
      clicks: pct(now.clicks, before.clicks),
      impressions: pct(now.impressions, before.impressions),
      ctr: pct(now.ctr, before.ctr),
      position: pct(now.position, before.position),
    },
    topQueries: queries.slice(0, 25).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: (r.ctr ?? 0) * 100,
      position: r.position ?? 0,
    })),
    topPages: pages
      .map((r) => ({
        page: r.keys[0],
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: (r.ctr ?? 0) * 100,
        position: r.position ?? 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 25),
    ctrOpportunities: opportunities,
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const n = (x) => x.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  console.log(`\n=== Search Console · ${ymd(start)} → ${ymd(end)} (${DAYS} días) ===\n`);
  console.log(`  Clics         ${n(now.clicks)}${arrow(report.delta.clicks)}`);
  console.log(`  Impresiones   ${n(now.impressions)}${arrow(report.delta.impressions)}`);
  console.log(`  CTR           ${now.ctr.toFixed(2)}%${arrow(report.delta.ctr)}`);
  console.log(`  Posición      ${now.position.toFixed(1)}${arrow(report.delta.position)}`);

  console.log(`\n--- top 10 búsquedas ---`);
  for (const q of report.topQueries.slice(0, 10)) {
    console.log(
      `  ${String(q.clicks).padStart(4)} clics · ${String(q.impressions).padStart(6)} impr · CTR ${q.ctr.toFixed(1).padStart(5)}% · pos ${q.position.toFixed(1).padStart(4)}  ${q.query}`,
    );
  }

  console.log(`\n--- top 10 páginas ---`);
  for (const p of report.topPages.slice(0, 10)) {
    console.log(
      `  ${String(p.clicks).padStart(4)} clics · ${String(p.impressions).padStart(6)} impr · CTR ${p.ctr.toFixed(1).padStart(5)}%  ${p.page.replace(SITE_URL.replace(/\/$/, ""), "")}`,
    );
  }

  console.log(
    `\n--- OPORTUNIDAD DE CTR: ya rankean, no se las clickean (${opportunities.length}) ---`,
  );
  console.log(`    (≥100 impresiones, posición ≤20, CTR <${CTR_FLOOR}% — acá el trabajo es el title y la description)`);
  for (const p of opportunities.slice(0, 12)) {
    console.log(
      `  ${String(p.impressions).padStart(6)} impr · CTR ${p.ctr.toFixed(1).padStart(5)}% · pos ${p.position.toFixed(1).padStart(4)}  ${p.page.replace(SITE_URL.replace(/\/$/, ""), "")}`,
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
