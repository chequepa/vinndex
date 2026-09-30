#!/usr/bin/env node
/**
 * gsc-submit-sitemap.mjs — (re)envía el sitemap a Search Console y lista
 * el estado de los sitemaps conocidos.
 *
 * Usa la misma credencial que gsc-report.mjs (service account con acceso a
 * la propiedad; ver el setup documentado allá), pero con el scope de
 * escritura `webmasters` — si la cuenta está como "restringido" en GSC el
 * PUT devuelve 403 y acá se dice claro.
 *
 * Uso:
 *   node scripts/gsc-submit-sitemap.mjs                  # envía /sitemap.xml
 *   node scripts/gsc-submit-sitemap.mjs --list           # sólo lista
 *   node scripts/gsc-submit-sitemap.mjs --path /sitemap.xml --site https://vinndex.com.ar/
 */

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const SITE_URL = argVal("--site", "https://vinndex.com.ar/");
const PATH = argVal("--path", "/sitemap.xml");
const LIST_ONLY = args.includes("--list");

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

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function loadCredentials() {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const raw = file ? readFileSync(file, "utf8") : inline;
  if (!raw) fail("falta GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_FILE (ver scripts/gsc-report.mjs)");
  const creds = JSON.parse(raw);
  if (!creds.client_email || !creds.private_key) fail("la credencial no es una service account");
  return creds;
}

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: "https://www.googleapis.com/auth/webmasters",
      aud: creds.token_uri ?? "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(creds.private_key));
  const res = await fetch(creds.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!res.ok) fail(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  const creds = loadCredentials();
  const token = await getAccessToken(creds);
  const site = encodeURIComponent(SITE_URL);
  const feed = encodeURIComponent(new URL(PATH, SITE_URL).toString());
  const base = `https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps`;
  const headers = { authorization: `Bearer ${token}` };

  if (!LIST_ONLY) {
    const put = await fetch(`${base}/${feed}`, { method: "PUT", headers });
    if (put.status === 204 || put.ok) {
      console.log(`✓ sitemap enviado: ${new URL(PATH, SITE_URL)}`);
    } else {
      console.error(`✖ no se pudo enviar (${put.status}): ${await put.text()}`);
      if (put.status === 403) {
        console.error("  La service account tiene permiso de sólo lectura en Search Console. Para enviar sitemaps hace falta 'Propietario' o 'Completo'.");
      }
    }
  }

  const list = await fetch(base, { headers });
  if (!list.ok) fail(`listar sitemaps: ${list.status} ${await list.text()}`);
  const data = await list.json();
  for (const s of data.sitemap ?? []) {
    const c = (s.contents ?? []).reduce((n, x) => n + Number(x.submitted ?? 0), 0);
    const idx = (s.contents ?? []).reduce((n, x) => n + Number(x.indexed ?? 0), 0);
    console.log(`  ${s.path}  · enviado ${s.lastSubmitted?.slice(0, 10) ?? "?"} · leído ${s.lastDownloaded?.slice(0, 10) ?? "?"} · URLs ${c}${idx ? ` · indexadas ${idx}` : ""}${s.errors ? ` · errores ${s.errors}` : ""}${s.warnings ? ` · avisos ${s.warnings}` : ""}${s.isPending ? " · pendiente" : ""}`);
  }
}

main().catch((e) => fail(e.message));
