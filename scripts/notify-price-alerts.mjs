#!/usr/bin/env node
/**
 * Notificador de alertas de precio — corre una vez por día, después del
 * scrape (paso final de .github/workflows/daily-scrape.yml).
 *
 * Recorre `alerts:active` en Redis (modelo en lib/alerts.ts), compara cada
 * alerta contra el snapshot recién publicado y manda UN mail por persona
 * con todos sus vinos que bajaron.
 *
 * Cuándo avisa (por alerta):
 *   · con precio objetivo: el mejor precio de hoy ≤ objetivo, y además
 *     más bajo que el último aviso (no repetimos el mismo precio todos
 *     los días);
 *   · sin objetivo: el mejor precio de hoy está ≥ 5% abajo del precio de
 *     referencia — el del último aviso, o el de cuando se creó la alerta.
 * Después de avisar, la referencia pasa a ser el precio avisado: la
 * próxima vez tiene que bajar OTRO 5%.
 *
 * "Mejor precio" = misma base que la ficha: botella comparable de 750 ml,
 * en stock, de una vinoteca vigente, sin precio sospechoso ni colección.
 * Si la ficha se fusionó con otra, se sigue el redirect (group-merges).
 *
 * Env: ALERTS_ENABLED=1 (encendido explícito, mismo flag que el sitio),
 *      UPSTASH_REDIS_REST_URL/TOKEN (o KV_REST_API_URL/TOKEN),
 *      ALERTS_SECRET, RESEND_API_KEY, ALERTS_FROM_EMAIL (opcional).
 * Sin alguna de las obligatorias, sale con 0 y no hace nada.
 *
 * Uso: node scripts/notify-price-alerts.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry-run");

const DROP_WITHOUT_TARGET = 0.05;
const MIN_VALID_PRICE = 1000;
const SITE = (process.env.SITE_URL ?? "https://vinndex.com.ar").replace(/\/$/, "");
const RESEND = process.env.RESEND_API_URL ?? "https://api.resend.com/emails";
const FROM =
  process.env.ALERTS_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL || "Vinndex <hola@vinndex.com.ar>";

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
const SECRET = process.env.ALERTS_SECRET ?? "";
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";

// ── Mismas firmas que lib/alerts.ts (si cambian allá, cambian acá) ──
function emailHash(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}
function signToken(action, subject) {
  return createHmac("sha256", SECRET).update(`${action}:${subject}`).digest("base64url").slice(0, 32);
}
const unsubscribeUrl = (id) => `${SITE}/alertas/baja?id=${id}&t=${signToken("unsub", id)}`;
const unsubscribeAllUrl = (email) => {
  const h = emailHash(email);
  return `${SITE}/alertas/baja?h=${h}&t=${signToken("unsub-all", h)}`;
};
const oneClickUrl = (id) => `${SITE}/api/alertas/baja?one-click=1&id=${id}&t=${signToken("unsub", id)}`;

async function redis(cmds) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmds.map((c) => c.map(String))),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(`redis: ${r.error}`);
    return r.result;
  });
}

function formatArs(n) {
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** slug → { price, storeSlug, storeName, url, stores, name } con la base de la ficha. */
function loadPrices() {
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshot.json"), "utf8"));
  const stores = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stores.json"), "utf8"));
  const storeNames = new Map(stores.map((s) => [s.slug, s.name]));
  let merges = {};
  try {
    merges = JSON.parse(fs.readFileSync(path.join(ROOT, "data/group-merges.json"), "utf8"));
  } catch {
    /* sin mapa de fusiones: los slugs viejos simplemente no resuelven */
  }
  const bySlug = new Map();
  for (const g of snap.productGroups ?? []) {
    let best = null;
    const storeSet = new Set();
    for (const o of g.offers ?? []) {
      if (!o.inStock || !storeNames.has(o.storeSlug)) continue;
      if (typeof o.priceArs !== "number" || o.priceArs < MIN_VALID_PRICE) continue;
      if (o.priceSuspect || o.isCollector || o.stale) continue;
      if (o.comparable === false) continue;
      storeSet.add(o.storeSlug);
      if (!best || o.priceArs < best.priceArs) best = o;
    }
    if (!best) continue;
    bySlug.set(g.groupSlug, {
      price: best.priceArs,
      storeSlug: best.storeSlug,
      storeName: storeNames.get(best.storeSlug) ?? best.storeSlug,
      stores: storeSet.size,
    });
  }
  const resolve = (slug) => {
    let s = slug;
    for (let i = 0; i < 6; i++) {
      if (bySlug.has(s)) return s;
      s = merges[s];
      if (!s) return null;
    }
    return null;
  };
  return { bySlug, resolve };
}

export function shouldNotify(alert, price) {
  const last = alert.lastNotifiedPrice;
  if (alert.target != null) {
    if (price > alert.target) return false;
    return last == null || price < last * 0.98;
  }
  const ref = last ?? alert.basePrice;
  if (!ref) return false;
  return price <= ref * (1 - DROP_WITHOUT_TARGET);
}

function buildMail(email, items) {
  const first = items[0];
  const subject =
    items.length === 1
      ? `Bajó: ${first.alert.wineName} a ${formatArs(first.price)}`
      : `Bajaron ${items.length} vinos que seguís`;
  const utm = "utm_source=alerta&utm_medium=email";
  const textLines = ["Buenas noticias: bajó de precio lo que estabas siguiendo.", ""];
  const rows = [];
  for (const { alert, price, slug, info } of items) {
    const prev = alert.lastNotifiedPrice ?? alert.basePrice;
    // Con objetivo se avisa aunque el precio no se haya movido desde el
    // alta (ya estaba abajo del objetivo): ahí no hay "antes".
    const before = prev != null && prev > price ? prev : null;
    const url = `${SITE}/vino/${slug}?${utm}`;
    textLines.push(
      `• ${alert.wineName}: ${formatArs(price)} en ${info.storeName}` +
        (before ? ` (antes ${formatArs(before)})` : "") +
        (alert.target != null ? ` — tu objetivo era ${formatArs(alert.target)}` : ""),
      `  Comparar en ${info.stores} vinotecas: ${url}`,
      `  Dejar de seguir este vino: ${unsubscribeUrl(alert.id)}`,
      "",
    );
    rows.push(`
  <tr><td style="padding:14px 0;border-top:1px solid #eadfcd">
    <p style="font-family:Georgia,serif;font-size:18px;font-weight:600;margin:0 0 4px;color:#0f1729">${escapeHtml(alert.wineName)}</p>
    <p style="margin:0 0 6px;font-size:14px;color:#4a5468">
      <strong style="font-size:20px;color:#1e3fbf">${formatArs(price)}</strong> en ${escapeHtml(info.storeName)}
      ${before ? `<span style="text-decoration:line-through;margin-left:6px">${formatArs(before)}</span>` : ""}
      ${alert.target != null ? `<br/><span style="font-size:12px">Tu objetivo: ${formatArs(alert.target)}</span>` : ""}
    </p>
    <a href="${url}" style="font-size:14px;color:#1e3fbf;font-weight:600">Comparar en ${info.stores} vinotecas →</a>
    <span style="font-size:11px;color:#8a8f9c;margin-left:10px"><a href="${unsubscribeUrl(alert.id)}" style="color:#8a8f9c">dejar de seguir</a></span>
  </td></tr>`);
  }
  textLines.push(`Para no recibir más alertas: ${unsubscribeAllUrl(email)}`, "", `Vinndex · ${SITE}`);
  const html = `
<div style="font-family:Inter,Arial,sans-serif;color:#0f1729;max-width:560px;margin:0 auto;padding:24px">
  <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#6b1e2e;font-weight:600;margin:0 0 12px">Alerta de precio</p>
  <h1 style="font-family:Georgia,serif;font-size:24px;line-height:1.2;margin:0 0 8px">${items.length === 1 ? "Bajó lo que seguías." : `Bajaron ${items.length} vinos que seguís.`}</h1>
  <p style="font-size:14px;color:#4a5468;margin:0 0 8px">Precios relevados hoy a la mañana en vinotecas online. Pueden cambiar durante el día.</p>
  <table style="width:100%;border-collapse:collapse">${rows.join("")}</table>
  <p style="font-size:11px;color:#8a8f9c;margin-top:24px">No vendemos vino ni compartimos tu mail. <a href="${unsubscribeAllUrl(email)}" style="color:#8a8f9c">No quiero más alertas</a>.</p>
</div>`;
  return { subject, text: textLines.join("\n"), html };
}

async function send(email, mail, firstAlertId) {
  const res = await fetch(RESEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "vinndex-alerts/1.0",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: {
        "List-Unsubscribe": `<${oneClickUrl(firstAlertId)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function main() {
  if (process.env.ALERTS_ENABLED !== "1") {
    console.log("alertas: apagadas (ALERTS_ENABLED != 1) — nada que hacer.");
    return;
  }
  if (!REDIS_URL || !REDIS_TOKEN || SECRET.length < 16 || !RESEND_KEY) {
    console.log("alertas: faltan UPSTASH_REDIS_REST_URL/TOKEN, ALERTS_SECRET o RESEND_API_KEY — nada que hacer.");
    return;
  }
  const { bySlug, resolve } = loadPrices();
  const [ids] = await redis([["SMEMBERS", "alerts:active"]]);
  const list = Array.isArray(ids) ? ids : [];
  console.log(`alertas activas: ${list.length}`);

  const byEmail = new Map();
  let orphan = 0;
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    const [raws] = await redis([["MGET", ...chunk.map((id) => `alert:${id}`)]]);
    for (let j = 0; j < chunk.length; j++) {
      const raw = raws?.[j];
      if (typeof raw !== "string") {
        orphan++;
        continue;
      }
      let alert;
      try {
        alert = JSON.parse(raw);
      } catch {
        continue;
      }
      if (alert.status !== "active") continue;
      const slug = resolve(alert.slug);
      if (!slug) continue; // sin stock hoy o ficha desaparecida: se reintenta mañana
      const info = bySlug.get(slug);
      if (!shouldNotify(alert, info.price)) continue;
      const arr = byEmail.get(alert.email) ?? [];
      arr.push({ alert, price: info.price, slug, info });
      byEmail.set(alert.email, arr);
    }
  }
  if (orphan) {
    // ids en el set sin registro (borrado a mano): limpieza.
    console.log(`ids huérfanos en alerts:active: ${orphan}`);
  }

  let sent = 0;
  let failed = 0;
  for (const [email, items] of byEmail) {
    items.sort((a, b) => a.price / (a.alert.lastNotifiedPrice ?? a.alert.basePrice ?? a.price) - b.price / (b.alert.lastNotifiedPrice ?? b.alert.basePrice ?? b.price));
    const mail = buildMail(email, items);
    if (DRY) {
      console.log(`[dry-run] ${emailHash(email).slice(0, 8)}… ← ${mail.subject}`);
      continue;
    }
    try {
      await send(email, mail, items[0].alert.id);
      const now = new Date().toISOString();
      await redis(
        items.map(({ alert, price, slug }) => [
          "SET",
          `alert:${alert.id}`,
          JSON.stringify({ ...alert, slug, lastNotifiedPrice: price, lastNotifiedAt: now }),
        ]),
      );
      sent++;
    } catch (e) {
      failed++;
      console.error(`envío falló (${emailHash(email).slice(0, 8)}…): ${e.message}`);
    }
    // Resend free tier: 2 req/s.
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`alertas: ${byEmail.size} personas con bajas · ${sent} mails enviados · ${failed} fallidos${DRY ? " (dry-run)" : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
