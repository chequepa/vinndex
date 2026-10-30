/**
 * Casos dorados del refresh token rotativo de Mercado Libre.
 *
 * Sin red: ML y Upstash se stubbean con un fetch falso que simula la regla
 * que rompió todo (cada refresh_token sirve UNA vez y devuelve otro).
 *
 * Correr: node scripts/test-ml-auth.mjs
 */
import { getMlAccessToken, ML_TOKEN_KEY } from "./lib-ml-auth.mjs";

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✅  ${name}  →  ${detail}`);
  } else {
    fail++;
    console.log(`  ❌ FALLA  ${name}  →  ${detail}`);
  }
}

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/**
 * ML falso: `valid` es el set de refresh tokens vivos. Cada uso exitoso
 * quema el token y emite `rt-N`. Upstash falso: un Map.
 */
function world({ valid = [], stored = null, redisDown = false } = {}) {
  const live = new Set(valid);
  const kv = new Map(stored ? [[ML_TOKEN_KEY, stored]] : []);
  let n = 0;
  const calls = { ml: [] };
  const fetch = async (url, init) => {
    if (url === "https://api.mercadolibre.com/oauth/token") {
      const rt = new URLSearchParams(init.body).get("refresh_token");
      calls.ml.push(rt);
      if (!live.has(rt)) return json(400, { error: "invalid_grant", message: "Error validating grant." });
      live.delete(rt);
      const next = `rt-${++n}`;
      live.add(next);
      return json(200, { access_token: `at-${n}`, refresh_token: next });
    }
    if (url === "https://redis.test") {
      if (redisDown) return json(500, {});
      const [cmd, key, val] = JSON.parse(init.body);
      if (cmd === "GET") return json(200, { result: kv.get(key) ?? null });
      if (cmd === "SET") return kv.set(key, val), json(200, { result: "OK" });
    }
    throw new Error(`fetch inesperado: ${url}`);
  };
  return { fetch, kv, live, calls };
}

const baseEnv = { ML_APP_ID: "app", ML_CLIENT_SECRET: "sec" };
const redisEnv = { UPSTASH_REDIS_REST_URL: "https://redis.test/", UPSTASH_REDIS_REST_TOKEN: "t" };
const quiet = () => {};

// 1. El bug original: tres runs seguidos con el mismo secret.
{
  const w = world({ valid: ["seed"] });
  const env = { ...baseEnv, ...redisEnv, ML_REFRESH_TOKEN: "seed" };
  const got = [];
  for (let i = 0; i < 3; i++) got.push(await getMlAccessToken({ env, fetch: w.fetch, log: quiet }));
  check(
    "tres runs con el mismo secret siguen andando",
    got.every(Boolean),
    `tokens=${got.join(",")} · guardado=${w.kv.get(ML_TOKEN_KEY)}`,
  );
  check(
    "a partir del segundo run se usa el token de Upstash, no el secret",
    w.calls.ml[1] === "rt-1" && w.calls.ml[2] === "rt-2",
    `refresh tokens usados=${w.calls.ml.join(",")}`,
  );
}

// 2. Re-autorización: Upstash tiene uno muerto, el secret es nuevo.
{
  const w = world({ valid: ["nuevo"], stored: "muerto" });
  const env = { ...baseEnv, ...redisEnv, ML_REFRESH_TOKEN: "nuevo" };
  const at = await getMlAccessToken({ env, fetch: w.fetch, log: quiet });
  check(
    "token muerto en Upstash cae al secret re-autorizado y lo rota",
    at === "at-1" && w.kv.get(ML_TOKEN_KEY) === "rt-1",
    `at=${at} · guardado=${w.kv.get(ML_TOKEN_KEY)} · probados=${w.calls.ml.join(",")}`,
  );
}

// 3. Nada sirve: null y un log que dice qué hacer.
{
  const w = world({ valid: [], stored: "muerto" });
  const logs = [];
  const at = await getMlAccessToken({
    env: { ...baseEnv, ...redisEnv, ML_REFRESH_TOKEN: "tambien-muerto" },
    fetch: w.fetch,
    log: (m) => logs.push(m),
  });
  check(
    "sin token válido devuelve null y explica el invalid_grant",
    at === null && logs.some((l) => l.includes("invalid_grant")) && logs.some((l) => l.includes("re-autorizar")),
    `at=${at} · logs=${logs.length}`,
  );
}

// 4. Sin Upstash: anda una vez y avisa que el secret muere.
{
  const w = world({ valid: ["seed"] });
  const logs = [];
  const at = await getMlAccessToken({
    env: { ...baseEnv, ML_REFRESH_TOKEN: "seed" },
    fetch: w.fetch,
    log: (m) => logs.push(m),
  });
  check(
    "sin Upstash funciona pero avisa",
    at === "at-1" && logs.some((l) => l.includes("UPSTASH")),
    `at=${at} · log=${logs[0]?.slice(0, 60)}`,
  );
}

// 5. Upstash caído al escribir: igual devuelve el access token, avisando.
{
  const w = world({ valid: ["seed"], redisDown: true });
  const logs = [];
  const at = await getMlAccessToken({
    env: { ...baseEnv, ...redisEnv, ML_REFRESH_TOKEN: "seed" },
    fetch: w.fetch,
    log: (m) => logs.push(m),
  });
  check(
    "Upstash caído: access token de hoy sí, con alarma por el de mañana",
    at === "at-1" && logs.some((l) => l.includes("no pude guardar")),
    `at=${at} · logs=${logs.length}`,
  );
}

// 6. Sin credenciales de app no se llama a nadie.
{
  const w = world({ valid: ["seed"] });
  const at = await getMlAccessToken({ env: { ML_REFRESH_TOKEN: "seed" }, fetch: w.fetch, log: quiet });
  check("sin ML_APP_ID/SECRET devuelve null sin pegarle a ML", at === null && w.calls.ml.length === 0, `at=${at}`);
}

console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
