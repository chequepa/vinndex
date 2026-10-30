/**
 * Access token de Mercado Libre con refresh token ROTATIVO.
 *
 * Por qué existe: los refresh tokens de ML son de un solo uso. Cada
 * `grant_type=refresh_token` devuelve un `refresh_token` nuevo e invalida
 * el que se mandó. Los scripts usaban siempre el secret ML_REFRESH_TOKEN
 * y tiraban el nuevo, así que el secret moría en el primer run y desde
 * ahí todos los días `refresh failed: HTTP 400` (invalid_grant).
 *
 * Ahora el token vigente vive en Upstash (la misma base que las alertas,
 * cuyos secrets ya están en el workflow) bajo `ML_TOKEN_KEY`:
 *
 *   1. Se prueba primero el de Upstash y después el de ML_REFRESH_TOKEN.
 *      El secret queda como semilla: re-autorizar la app = pisar el secret
 *      (ver docs/mercadolibre-oauth.md); el primer run lo usa y lo rota.
 *   2. Si el refresh anda, el refresh_token nuevo se guarda en Upstash
 *      ANTES de devolver el access token. Si no se puede guardar se avisa
 *      fuerte: el token usado ya no sirve y el próximo run va a fallar.
 *
 * Sin Upstash configurado funciona como antes (un solo uso del secret),
 * pero lo dice en el log en lugar de morir callado al día siguiente.
 */

export const ML_TOKEN_KEY = "ml:oauth:refresh_token";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

function redisConfig(env) {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL ?? "").replace(/\/$/, "");
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN ?? "";
  return url && token ? { url, token } : null;
}

async function redis(cfg, cmd, fetchImpl) {
  const res = await fetchImpl(cfg.url, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
  });
  if (!res.ok) throw new Error(`redis HTTP ${res.status}`);
  const out = await res.json();
  if (out.error) throw new Error(`redis: ${out.error}`);
  return out.result;
}

/** ML responde `{ error, message, status }`; sin eso un 400 no dice nada. */
async function describeFailure(res) {
  let detail = "";
  try {
    const body = await res.json();
    detail = [body.error, body.message].filter(Boolean).join(" — ");
  } catch {
    /* cuerpo no-JSON */
  }
  return `HTTP ${res.status}${detail ? ` (${detail})` : ""}`;
}

/**
 * @param {object}   [o]
 * @param {object}   [o.env]    — default process.env (inyectable para tests)
 * @param {Function} [o.fetch]  — default globalThis.fetch
 * @param {Function} [o.log]    — default console.error
 * @returns {Promise<string|null>} access token, o null si no hay forma.
 */
export async function getMlAccessToken({
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  log = console.error,
} = {}) {
  const appId = env.ML_APP_ID;
  const secret = env.ML_CLIENT_SECRET;
  if (!appId || !secret) return null;

  const cfg = redisConfig(env);
  const candidates = [];
  if (cfg) {
    try {
      const stored = await redis(cfg, ["GET", ML_TOKEN_KEY], fetchImpl);
      if (stored) candidates.push({ source: "upstash", token: stored });
    } catch (err) {
      log(`ml-auth: no pude leer el token de Upstash (${err.message})`);
    }
  } else {
    log(
      "ml-auth: sin UPSTASH_REDIS_REST_URL/TOKEN — el refresh token rotado no se guarda y ML_REFRESH_TOKEN muere en este run.",
    );
  }
  const seed = env.ML_REFRESH_TOKEN?.trim();
  if (seed && !candidates.some((c) => c.token === seed)) {
    candidates.push({ source: "secret ML_REFRESH_TOKEN", token: seed });
  }
  if (candidates.length === 0) return null;

  for (const { source, token } of candidates) {
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: appId,
        client_secret: secret,
        refresh_token: token,
      }),
    });
    if (!res.ok) {
      log(`ml-auth: refresh con ${source} falló: ${await describeFailure(res)}`);
      continue;
    }
    const body = await res.json();
    const rotated = body.refresh_token;
    if (rotated && rotated !== token) {
      if (cfg) {
        try {
          await redis(cfg, ["SET", ML_TOKEN_KEY, rotated], fetchImpl);
        } catch (err) {
          log(
            `ml-auth: ¡no pude guardar el refresh token rotado en Upstash (${err.message})! El próximo run va a necesitar re-autorizar (docs/mercadolibre-oauth.md).`,
          );
        }
      }
    }
    return body.access_token ?? null;
  }

  log(
    "ml-auth: ningún refresh token sirvió. Hay que re-autorizar la app: docs/mercadolibre-oauth.md",
  );
  return null;
}
