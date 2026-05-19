#!/usr/bin/env node
/**
 * Backfill de región por bodega usando gpt-4o-mini.
 *
 * La región casi nunca está en el nombre del producto (es atributo de la
 * bodega). El dict manual `data/bodega-regions.json` cubre ~55 bodegas
 * (≈19% del catálogo). Este script escala ese dict preguntándole al LLM
 * la región de las bodegas que faltan.
 *
 * Salvaguardas (principio: dato falso es PEOR que dato ausente):
 *   1. Lista CERRADA de regiones — el LLM elige de un enum o "desconocida".
 *   2. Golden-set validation — mezclamos las bodegas del dict manual
 *      (ground truth conocido) con las candidatas SIN marcarlas. Medimos
 *      la precisión del LLM contra el ground truth. Si baja del umbral,
 *      ABORTA sin escribir nada.
 *   3. Confidence gate — sólo persistimos respuestas con confidence
 *      "alta". Media/baja se descartan.
 *   4. Dry-run por default. Persiste sólo con --write.
 *
 * Uso:
 *   node scripts/backfill-bodega-regions.mjs            # dry-run
 *   node scripts/backfill-bodega-regions.mjs --write    # persiste
 *   node scripts/backfill-bodega-regions.mjs --min=8    # umbral grupos
 *
 * Idempotente: skipea bodegas ya presentes en el dict (manual o LLM).
 *
 * OJO: la normalización de brand está DUPLICADA de build-groups.mjs
 * (mismo bug clásico documentado en el README de convenciones). Si
 * cambia `normalizeBrandAlias` allá, replicar acá.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(resolve(REPO_ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}
loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY missing. Set in .env.local or CI secret.");
  process.exit(1);
}

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const MIN_GROUPS = Number(
  (args.find((a) => a.startsWith("--min=")) ?? "--min=5").split("=")[1],
);
const MODEL = "gpt-4o-mini";
const BATCH_SIZE = 25;
const GOLDEN_MIN_ACCURACY = 0.9; // si la precisión en el golden set baja de esto, abortamos

// Lista cerrada a nivel PROVINCIA. El golden set demostró que el LLM
// acierta la provincia ~97% pero sólo ~67% la subregión de Mendoza
// (tiende a decir "Mendoza" donde la curación manual dice "Valle de
// Uco"/"Luján de Cuyo"/"Maipú" — correcto pero menos específico). Así
// que le pedimos sólo la provincia. Las subregiones quedan reservadas
// para el dict manual curado.
const VALID_REGIONS = [
  "Mendoza",
  "San Juan",
  "Salta",
  "Patagonia",
  "La Rioja",
  "Catamarca",
];
const VALID_SET = new Set(VALID_REGIONS);

// El dict manual tiene subregiones de Mendoza curadas a mano. Para
// validar al LLM —que responde a nivel provincia— las colapsamos a
// "Mendoza": acertar la provincia NO es un error, sólo lo es errar de
// provincia (ej. decir Mendoza cuando es San Juan).
const MENDOZA_SUBREGIONS = new Set([
  "Mendoza",
  "Valle de Uco",
  "Luján de Cuyo",
  "Maipú",
]);
function toProvince(region) {
  return MENDOZA_SUBREGIONS.has(region) ? "Mendoza" : region;
}

// --- Normalización de brand (DUPLICADA de build-groups.mjs) ---
const BRAND_ALIASES = [
  ["zucardi", "zuccardi"],
  ["familia zuccardi", "zuccardi"],
  ["familia zucardi", "zuccardi"],
  ["cheval des andes", "cheval"],
  ["bodega catena zapata", "catena"],
  ["catena zapata", "catena"],
  ["bodega norton", "norton"],
  ["bodegas norton", "norton"],
  ["bodega trapiche", "trapiche"],
  ["bodega salentein", "salentein"],
  ["bodegas salentein", "salentein"],
  ["luigi bosca", "luigibosca"],
  ["el esteco", "elesteco"],
  ["finca las moras", "lasmoras"],
  ["las moras", "lasmoras"],
  ["don david", "dondavid"],
  ["kaiken", "kaiken"],
  ["chandon", "chandon"],
  ["baron b", "baronb"],
];
function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalizeBrandAlias(brand) {
  if (!brand) return null;
  let s = stripAccents(brand)
    .toLowerCase()
    .replace(/^bodega(s)?\s+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [from, to] of BRAND_ALIASES) {
    if (s === from) {
      s = to;
      break;
    }
  }
  return s || null;
}

const SYSTEM_PROMPT = `Sos un experto en el mercado vitivinícola argentino. Te doy una lista de bodegas (productores de vino). Para cada una, indicá la PROVINCIA argentina donde está su bodega/viñedos principales.

REGLAS ESTRICTAS:
- "region" debe ser EXACTAMENTE uno de estos valores: ${VALID_REGIONS.join(", ")}, o "desconocida".
- Es a nivel PROVINCIA. No subdividas Mendoza: si la bodega es de Luján de Cuyo, Valle de Uco, Maipú o cualquier zona mendocina, respondé "Mendoza".
- Río Negro y Neuquén → "Patagonia".
- Si NO es una bodega argentina de vino (ej: licores, vodka, whisky, champagne/vino importado, copas/cristalería, una vinoteca/retailer, una marca genérica), respondé region "desconocida".
- Si es una bodega argentina pero no estás seguro de la provincia, respondé "desconocida". NO adivines.
- "confidence": "alta" sólo si estás muy seguro de la provincia; "media" o "baja" si tenés dudas.

Respondé EXCLUSIVAMENTE con JSON válido: {"results":[{"i":0,"region":"...","confidence":"alta|media|baja"}, ...]} con un objeto por bodega en el orden recibido.`;

async function askLLM(names) {
  const list = names.map((n, i) => `${i}. ${n}`).join("\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Bodegas:\n${list}` },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`LLM non-JSON: ${content.slice(0, 200)}`);
  }
  const results = parsed.results;
  if (!Array.isArray(results)) {
    throw new Error(`LLM bad shape: ${content.slice(0, 200)}`);
  }
  // Indexamos por `i` para tolerar reordenamientos del modelo.
  const byIdx = new Map();
  for (const r of results) {
    if (typeof r?.i === "number") byIdx.set(r.i, r);
  }
  return names.map((_, i) => {
    const r = byIdx.get(i) ?? {};
    const region = VALID_SET.has(r.region) ? r.region : "desconocida";
    const confidence = ["alta", "media", "baja"].includes(r.confidence)
      ? r.confidence
      : "baja";
    return { region, confidence };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const snap = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "data/snapshot.json"), "utf8"),
  );
  const dictPath = resolve(REPO_ROOT, "data/bodega-regions.json");
  const dictFile = JSON.parse(readFileSync(dictPath, "utf8"));
  const dict = dictFile.regions ?? {};
  const groups = snap.productGroups ?? [];

  // Candidatas: bodegas sin región, no en el dict, con volumen.
  const cand = new Map();
  for (const g of groups) {
    if (g.region || !g.brand) continue;
    const k = normalizeBrandAlias(g.brand);
    if (!k || dict[k]) continue;
    if (!cand.has(k)) cand.set(k, { key: k, sample: g.brand, n: 0 });
    cand.get(k).n++;
  }
  const candidates = [...cand.values()]
    .filter((c) => c.n >= MIN_GROUPS)
    .sort((a, b) => b.n - a.n);

  // Golden set: entradas del dict manual cuya PROVINCIA es válida
  // (incluye las curadas con subregión de Mendoza — colapsan a Mendoza).
  const golden = Object.entries(dict)
    .filter(([, v]) => VALID_SET.has(toProvince(v)))
    .map(([key, region]) => ({ key, sample: key, region, golden: true }));

  console.log(
    `Candidatas (≥${MIN_GROUPS} grupos): ${candidates.length} · golden: ${golden.length} · modelo: ${MODEL}`,
  );

  // Mezclamos golden + candidatas SIN marcar (el LLM no sabe cuáles son
  // golden). Shuffle determinístico por key para reproducibilidad.
  const all = [...golden, ...candidates].sort((a, b) =>
    a.key < b.key ? -1 : 1,
  );

  const answers = new Map();
  for (let b = 0; b < all.length; b += BATCH_SIZE) {
    const batch = all.slice(b, b + BATCH_SIZE);
    const names = batch.map((x) => x.sample);
    let res;
    try {
      res = await askLLM(names);
    } catch (e) {
      console.error(`Batch ${b} falló: ${e.message}. Reintento en 5s…`);
      await sleep(5000);
      res = await askLLM(names);
    }
    batch.forEach((x, i) => answers.set(x.key, res[i]));
    process.stdout.write(
      `\r  procesadas ${Math.min(b + BATCH_SIZE, all.length)}/${all.length}`,
    );
    await sleep(400);
  }
  console.log("");

  // --- Golden set validation ---
  let goldenHit = 0;
  let goldenAnswered = 0;
  const goldenMisses = [];
  for (const g of golden) {
    const a = answers.get(g.key);
    if (!a || a.region === "desconocida") continue;
    goldenAnswered++;
    if (toProvince(a.region) === toProvince(g.region)) goldenHit++;
    else
      goldenMisses.push(
        `${g.key}: esperado ${g.region} (${toProvince(g.region)}), LLM ${a.region}`,
      );
  }
  const goldenAcc = goldenAnswered > 0 ? goldenHit / goldenAnswered : 0;
  console.log(
    `\n=== Golden set ===\n` +
      `Resueltas por LLM: ${goldenAnswered}/${golden.length}\n` +
      `Precisión: ${(goldenAcc * 100).toFixed(1)}% (${goldenHit}/${goldenAnswered})`,
  );
  if (goldenMisses.length > 0) {
    console.log("Discrepancias en golden:");
    for (const m of goldenMisses.slice(0, 15)) console.log(`  • ${m}`);
  }

  if (goldenAcc < GOLDEN_MIN_ACCURACY) {
    console.error(
      `\n🔴 Precisión del golden set ${(goldenAcc * 100).toFixed(1)}% < ` +
        `umbral ${GOLDEN_MIN_ACCURACY * 100}%. El LLM no es confiable para ` +
        `este dominio — ABORTO sin escribir.`,
    );
    process.exit(1);
  }

  // --- Aceptar candidatas: sólo confidence alta + región válida ---
  const accepted = {};
  const byRegion = {};
  let lowConf = 0;
  let unknown = 0;
  for (const c of candidates) {
    const a = answers.get(c.key);
    if (!a || a.region === "desconocida") {
      unknown++;
      continue;
    }
    if (a.confidence !== "alta") {
      lowConf++;
      continue;
    }
    accepted[c.key] = a.region;
    byRegion[a.region] = (byRegion[a.region] ?? 0) + 1;
  }

  const acceptedCount = Object.keys(accepted).length;
  const groupsCovered = candidates
    .filter((c) => accepted[c.key])
    .reduce((s, c) => s + c.n, 0);

  console.log(
    `\n=== Resultado candidatas ===\n` +
      `Aceptadas (confidence alta): ${acceptedCount}\n` +
      `Descartadas — desconocida: ${unknown} · confidence baja/media: ${lowConf}\n` +
      `Grupos sin región que ganarían región: ~${groupsCovered}`,
  );
  console.log("Desglose por región:");
  for (const [r, n] of Object.entries(byRegion).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r}: +${n} bodegas`);
  }

  if (!WRITE) {
    console.log(
      `\n(dry-run) Nada escrito. Corré con --write para persistir a ` +
        `data/bodega-regions.json`,
    );
    return;
  }

  // Merge: mantenemos `regions` único (el consumidor no distingue origen)
  // pero registramos las keys generadas por LLM para trazabilidad/re-curado.
  const prevLlm = new Set(dictFile._llmGenerated ?? []);
  for (const [k, v] of Object.entries(accepted)) {
    dict[k] = v;
    prevLlm.add(k);
  }
  dictFile.regions = dict;
  dictFile._llmGenerated = [...prevLlm].sort();
  dictFile._llmGeneratedAt = new Date().toISOString();
  writeFileSync(dictPath, JSON.stringify(dictFile, null, 2) + "\n");
  console.log(
    `\n✅ Escrito: +${acceptedCount} bodegas a data/bodega-regions.json ` +
      `(total ${Object.keys(dict).length})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
