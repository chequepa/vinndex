/**
 * Alertas de precio por mail: "avisame cuando este vino baje".
 *
 * DÓNDE SE GUARDAN (y por qué no donde se guarda el resto): el sitio no
 * tiene base de datos — todo sale del snapshot committeado — y en Railway
 * el filesystem se borra en cada deploy. Los reportes y votos van a
 * GitHub Issues, pero un mail es un dato personal: no puede quedar en un
 * issue. Se usa un Redis por REST (Upstash; el mismo contrato que Vercel
 * KV), con `fetch` y sin dependencias nuevas:
 *
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   (o KV_REST_API_URL / KV_REST_API_TOKEN)
 *
 * Sin esas variables, sin ALERTS_SECRET o sin ALERTS_ENABLED=1, la feature
 * está apagada: la ficha no muestra el botón, el copy no la menciona y el
 * endpoint responde 503 (ver alertsEnabled()).
 *
 * MODELO (las mismas claves las lee scripts/notify-price-alerts.mjs):
 *   alert:{id}              JSON de la alerta (AlertRecord)
 *   alerts:active           SET de ids activos (lo recorre el notificador)
 *   alerts:email:{h}        SET de ids de un mail (h = sha256 del mail)
 *   alerts:verified:{h}     "1" si el mail ya confirmó alguna alerta
 *
 * DOBLE OPT-IN: la primera alerta de un mail queda `pending` (expira en 7
 * días) hasta que se clickea el link del mail. Así nadie puede anotar el
 * mail de otro. Un mail ya verificado activa alertas nuevas sin repetir
 * la confirmación; cada mail que mandamos trae baja en un click.
 *
 * Los links de confirmar/baja van firmados con HMAC(ALERTS_SECRET): no
 * hace falta guardar tokens.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type AlertRecord = {
  id: string;
  email: string;
  slug: string;
  wineName: string;
  /** Precio objetivo opcional. null = avisar ante cualquier baja ≥ 5%. */
  target: number | null;
  /** Mejor precio cuando se creó la alerta. */
  basePrice: number | null;
  status: "pending" | "active";
  createdAt: string;
  confirmedAt: string | null;
  lastNotifiedPrice: number | null;
  lastNotifiedAt: string | null;
};

export const MAX_ALERTS_PER_EMAIL = 25;
const PENDING_TTL_S = 7 * 24 * 3600;

function redisEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function alertsConfigured(): boolean {
  return redisEnv() !== null && (process.env.ALERTS_SECRET ?? "").length >= 16;
}

/**
 * ¿Se muestran las alertas en el sitio? Además de la configuración, exige
 * un encendido explícito (ALERTS_ENABLED=1): el mailing lo arma el dueño
 * antes de que aparezca en público, y tener RESEND_API_KEY cargada (que
 * ya existe para el formulario de contacto) no debe prenderlo solo.
 * Apagado: no hay botón en la ficha, ni copy que lo mencione, y la API
 * responde 503.
 */
export function alertsEnabled(): boolean {
  return (
    process.env.ALERTS_ENABLED === "1" &&
    alertsConfigured() &&
    Boolean(process.env.RESEND_API_KEY)
  );
}

type RedisCmd = (string | number)[];

async function pipeline(cmds: RedisCmd[]): Promise<unknown[]> {
  const env = redisEnv();
  if (!env) throw new Error("redis unconfigured");
  const res = await fetch(`${env.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
    body: JSON.stringify(cmds.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((r) => {
    if (r.error) throw new Error(`redis: ${r.error}`);
    return r.result;
  });
}

export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export type TokenAction = "confirm" | "unsub" | "unsub-all";

export function signToken(action: TokenAction, subject: string): string {
  const secret = process.env.ALERTS_SECRET ?? "";
  return createHmac("sha256", secret).update(`${action}:${subject}`).digest("base64url").slice(0, 32);
}

export function verifyToken(action: TokenAction, subject: string, token: string): boolean {
  if (!token || token.length !== 32) return false;
  const a = Buffer.from(signToken(action, subject));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function getAlert(id: string): Promise<AlertRecord | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const [raw] = await pipeline([["GET", `alert:${id}`]]);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as AlertRecord;
  } catch {
    return null;
  }
}

async function alertsForEmail(h: string): Promise<AlertRecord[]> {
  const [ids] = await pipeline([["SMEMBERS", `alerts:email:${h}`]]);
  const list = Array.isArray(ids) ? (ids as string[]) : [];
  if (list.length === 0) return [];
  const [raws] = await pipeline([["MGET", ...list.map((i) => `alert:${i}`)]]);
  const out: AlertRecord[] = [];
  for (const r of (raws as (string | null)[]) ?? []) {
    if (typeof r !== "string") continue;
    try {
      out.push(JSON.parse(r) as AlertRecord);
    } catch {
      /* registro roto: se ignora */
    }
  }
  return out;
}

export type CreateResult =
  | { kind: "created-pending"; alert: AlertRecord }
  | { kind: "created-active"; alert: AlertRecord }
  | { kind: "updated"; alert: AlertRecord }
  | { kind: "pending-exists"; alert: AlertRecord }
  | { kind: "limit" };

/**
 * Crea (o actualiza) la alerta de un mail sobre una ficha. Una alerta por
 * mail+vino: si ya existe activa, sólo se actualiza el precio objetivo.
 */
export async function createAlert(args: {
  email: string;
  slug: string;
  wineName: string;
  target: number | null;
  basePrice: number | null;
}): Promise<CreateResult> {
  const email = args.email.trim().toLowerCase();
  const h = emailHash(email);
  const existing = await alertsForEmail(h);
  const same = existing.find((a) => a.slug === args.slug);
  if (same) {
    if (same.status === "pending") return { kind: "pending-exists", alert: same };
    const updated: AlertRecord = { ...same, target: args.target };
    await pipeline([["SET", `alert:${same.id}`, JSON.stringify(updated)]]);
    return { kind: "updated", alert: updated };
  }
  if (existing.length >= MAX_ALERTS_PER_EMAIL) return { kind: "limit" };

  const [verified] = await pipeline([["GET", `alerts:verified:${h}`]]);
  const isVerified = verified === "1";
  const now = new Date().toISOString();
  const alert: AlertRecord = {
    id: randomBytes(12).toString("hex"),
    email,
    slug: args.slug,
    wineName: args.wineName,
    target: args.target,
    basePrice: args.basePrice,
    status: isVerified ? "active" : "pending",
    createdAt: now,
    confirmedAt: isVerified ? now : null,
    lastNotifiedPrice: null,
    lastNotifiedAt: null,
  };
  const cmds: RedisCmd[] = [];
  if (isVerified) {
    cmds.push(["SET", `alert:${alert.id}`, JSON.stringify(alert)]);
    cmds.push(["SADD", "alerts:active", alert.id]);
  } else {
    cmds.push(["SET", `alert:${alert.id}`, JSON.stringify(alert), "EX", PENDING_TTL_S]);
  }
  cmds.push(["SADD", `alerts:email:${h}`, alert.id]);
  await pipeline(cmds);
  return { kind: isVerified ? "created-active" : "created-pending", alert };
}

export async function confirmAlert(id: string): Promise<AlertRecord | null> {
  const alert = await getAlert(id);
  if (!alert) return null;
  if (alert.status === "active") return alert;
  const updated: AlertRecord = { ...alert, status: "active", confirmedAt: new Date().toISOString() };
  await pipeline([
    ["SET", `alert:${id}`, JSON.stringify(updated)], // sin EX: deja de expirar
    ["SADD", "alerts:active", id],
    ["SET", `alerts:verified:${emailHash(alert.email)}`, "1"],
  ]);
  return updated;
}

export async function deleteAlert(id: string): Promise<AlertRecord | null> {
  const alert = await getAlert(id);
  if (!alert) return null;
  await pipeline([
    ["DEL", `alert:${id}`],
    ["SREM", "alerts:active", id],
    ["SREM", `alerts:email:${emailHash(alert.email)}`, id],
  ]);
  return alert;
}

/** Baja de todas las alertas de un mail (link "no quiero más mails"). */
export async function deleteAllForEmailHash(h: string): Promise<number> {
  if (!/^[a-f0-9]{32}$/.test(h)) return 0;
  const [ids] = await pipeline([["SMEMBERS", `alerts:email:${h}`]]);
  const list = Array.isArray(ids) ? (ids as string[]) : [];
  const cmds: RedisCmd[] = [["DEL", `alerts:email:${h}`, `alerts:verified:${h}`]];
  for (const id of list) {
    cmds.push(["DEL", `alert:${id}`], ["SREM", "alerts:active", id]);
  }
  await pipeline(cmds);
  return list.length;
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://vinndex.com.ar").replace(/\/$/, "");
}

export function confirmUrl(id: string): string {
  return `${siteUrl()}/api/alertas/confirmar?id=${id}&t=${signToken("confirm", id)}`;
}

export function unsubscribeUrl(id: string): string {
  return `${siteUrl()}/alertas/baja?id=${id}&t=${signToken("unsub", id)}`;
}

export function unsubscribeAllUrl(email: string): string {
  const h = emailHash(email);
  return `${siteUrl()}/alertas/baja?h=${h}&t=${signToken("unsub-all", h)}`;
}
