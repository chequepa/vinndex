#!/usr/bin/env node
/**
 * Re-autoriza la app de Mercado Libre y deja un refresh token nuevo.
 *
 * Hace falta cuando `enrich-ml-catalog.mjs` loguea "ningún refresh token
 * sirvió" (token vencido a los 6 meses, app revocada, Upstash perdido).
 * Paso a paso en docs/mercadolibre-oauth.md.
 *
 *   node scripts/ml-reauth.mjs                 # 1) imprime la URL a abrir
 *   node scripts/ml-reauth.mjs <code>          # 2) canjea el ?code= del redirect
 *
 * Lee ML_APP_ID, ML_CLIENT_SECRET y ML_REDIRECT_URI del entorno o de
 * .env.local. Si además están UPSTASH_REDIS_REST_URL/TOKEN, guarda el
 * refresh token directo en Upstash; si no, lo imprime para cargarlo como
 * secret ML_REFRESH_TOKEN.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { ML_TOKEN_KEY } from "./lib-ml-auth.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(REPO_ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

const { ML_APP_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI } = process.env;
if (!ML_APP_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
  console.error("Faltan ML_APP_ID, ML_CLIENT_SECRET o ML_REDIRECT_URI (entorno o .env.local).");
  process.exit(1);
}

// El verifier PKCE tiene que sobrevivir entre el paso 1 y el 2.
const VERIFIER_PATH = join(tmpdir(), `vinndex-ml-pkce-${ML_APP_ID}`);
const code = process.argv[2];

if (!code) {
  const verifier = randomBytes(32).toString("base64url");
  writeFileSync(VERIFIER_PATH, verifier, { mode: 0o600 });
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://auth.mercadolibre.com.ar/authorization");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: ML_APP_ID,
    redirect_uri: ML_REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  console.log(`Abrí esta URL logueado con la cuenta de ML de Vinndex y aceptá:\n\n  ${url}\n`);
  console.log("Después corré: node scripts/ml-reauth.mjs <valor de ?code= en el redirect>");
  process.exit(0);
}

const body = new URLSearchParams({
  grant_type: "authorization_code",
  client_id: ML_APP_ID,
  client_secret: ML_CLIENT_SECRET,
  code,
  redirect_uri: ML_REDIRECT_URI,
});
if (existsSync(VERIFIER_PATH)) body.set("code_verifier", readFileSync(VERIFIER_PATH, "utf8"));

const res = await fetch("https://api.mercadolibre.com/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
  body,
});
const out = await res.json().catch(() => ({}));
if (!res.ok || !out.refresh_token) {
  console.error(`Canje falló: HTTP ${res.status} ${out.error ?? ""} ${out.message ?? ""}`);
  if (res.ok) console.error("Sin refresh_token: habilitá el scope offline_access en la app de ML.");
  process.exit(1);
}
if (existsSync(VERIFIER_PATH)) unlinkSync(VERIFIER_PATH);

const redisUrl = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
if (redisUrl && redisToken) {
  const r = await fetch(redisUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${redisToken}`, "content-type": "application/json" },
    body: JSON.stringify(["SET", ML_TOKEN_KEY, out.refresh_token]),
  });
  if (r.ok) {
    console.log(`Listo: refresh token guardado en Upstash (${ML_TOKEN_KEY}). El próximo Daily scrape lo usa y lo rota.`);
    process.exit(0);
  }
  console.error(`No pude guardarlo en Upstash (HTTP ${r.status}); cargalo como secret:`);
}
console.log("Cargá el refresh token como secret del repo (lo usa una vez y queda rotando en Upstash):\n");
console.log(`  gh secret set ML_REFRESH_TOKEN --repo chequepa/vinndex --body '${out.refresh_token}'`);
