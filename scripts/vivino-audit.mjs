#!/usr/bin/env node
/**
 * vivino-audit.mjs — Vivino como TERCERA capa de evidencia para el
 * matching. No agrupa nada: audita y propone.
 *
 * IDEA: Vivino tiene un ID estable por vino (la URL `/w/NNNNN`). Si dos
 * fichas nuestras resuelven al MISMO ID, son candidatas a falso split;
 * si las ofertas de UNA ficha resuelven a IDs distintos, es candidata a
 * quimera. Es la misma lógica que ya usa el EAN, con otra fuente.
 *
 * ORDEN DE AUTORIDAD (Vivino va último, y con razón):
 *   catálogo curado > EAN gateado > Vivino ≥0.85 > heurísticas de nombre
 *
 * POR QUÉ NO ES AUTORIDAD — medido con datos reales, no supuesto:
 *   · No cubre vino barato de súper: los dos nombres del Colón Selecto
 *     (la ficha #1 de tráfico del sitio) no matchean con nada.
 *   · Su propio catálogo conflaciona: "RUTINI GEWURZTRAMINER" devuelve
 *     el Chardonnay de Rutini, con 0,76 de confianza.
 *   · "Alamos Malbec Reserva" devolvió un Rioja español de Tempranillo
 *     (Torre de Oña) con 0,74.
 *   En cambio, arriba de 0,85 acertó 7 de 7 en la muestra inicial.
 *
 * DE AHÍ EL GATE: un veredicto sólo cuenta si AMBOS lados del par vienen
 * con confianza ≥ MIN_CONFIDENCE. Con eso, sobre pares que comparten EAN
 * pero los gates del pipeline bloquearon, encontró un falso split real:
 *
 *   "Rutini Chardonnay"  y  "Rutini Colección Chardonnay"
 *      → los dos a /w/16507, confianza 1,0 y 1,0 → es el MISMO vino,
 *        el gate de tier/parcela estaba partiendo de más.
 *
 * Costo: US$0,00183 por nombre resuelto (tier BRONZE). El catálogo
 * entero ≈ US$71; sólo los multi-tienda ≈ US$9. La cache hace que
 * re-correr sea gratis.
 *
 * Uso:
 *   APIFY_TOKEN=... node scripts/vivino-audit.mjs --limit 200
 *   APIFY_TOKEN=... node scripts/vivino-audit.mjs --limit 200 --write
 *
 * Sin --write es dry-run e imprime el informe. Con --write persiste la
 * cache (data/vivino-cache.json) y el informe (data/vivino-audit.json).
 * La cache se lee SIEMPRE, así que re-correr no re-cobra lo ya resuelto.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const WRITE = args.includes("--write");
const LIMIT = parseInt(argVal("--limit", "200"), 10);
const MIN_CONFIDENCE = parseFloat(argVal("--min-confidence", "0.85"));

const ACTOR = "pulse_hub/vivino-wine-search-api";
const CACHE_PATH = resolve(ROOT, "data/vivino-cache.json");
const OUT_PATH = resolve(ROOT, "data/vivino-audit.json");

const cache = existsSync(CACHE_PATH)
  ? JSON.parse(readFileSync(CACHE_PATH, "utf8"))
  : {};

/** ID estable del vino en Vivino: el `NNNNN` de la URL `/w/NNNNN`. */
function vivinoId(url) {
  const m = String(url ?? "").match(/\/w\/(\d+)|\/wines\/(\d+)/);
  return m ? (m[1] ?? m[2]) : null;
}

async function resolveNames(names) {
  const pending = names.filter((n) => !(n in cache));
  if (pending.length === 0) return;
  if (!process.env.APIFY_TOKEN) {
    throw new Error(
      `Faltan ${pending.length} nombres en cache y no hay APIFY_TOKEN.`,
    );
  }
  // Batches para no armar un input gigante ni perder todo si falla.
  for (let i = 0; i < pending.length; i += 50) {
    const batch = pending.slice(i, i + 50);
    const res = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR.replace("/", "~")}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: batch }),
      },
    );
    if (!res.ok) throw new Error(`Apify ${res.status}: ${await res.text()}`);
    const items = await res.json();
    // Lo NO devuelto es "sin match" y se cachea igual, para no volver a pagarlo.
    for (const n of batch) cache[n] = null;
    for (const it of items) {
      if (it?.query == null) continue;
      cache[it.query] = {
        id: vivinoId(it.url),
        name: it.name ?? null,
        winery: it.winery ?? null,
        confidence: typeof it.match_confidence === "number" ? it.match_confidence : 0,
        score: it.score ?? null,
        reviews: it.reviews ?? null,
      };
    }
    console.log(`  resueltos ${Math.min(i + 50, pending.length)}/${pending.length}`);
  }
}

const snap = JSON.parse(readFileSync(resolve(ROOT, "data/snapshot.json"), "utf8"));

/** Nombre representativo de una ficha: el más corto (menos ruido de tienda). */
const repName = (g) =>
  (g.offers ?? [])
    .map((o) => o.name)
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)[0] ?? g.canonicalName;

// Auditamos donde hay algo en juego: fichas multi-tienda, las de más peso.
const targets = snap.productGroups
  .filter((g) => g.storeCount >= 2 && g.canonicalName)
  .sort((a, b) => b.storeCount - a.storeCount)
  .slice(0, LIMIT);

console.log(`Auditando ${targets.length} fichas multi-tienda (confianza ≥ ${MIN_CONFIDENCE})`);
try {
  await resolveNames(targets.map(repName));
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  console.error(
    "  Conseguí un token en https://console.apify.com/account/integrations",
    "\n  y corré:  APIFY_TOKEN=... node scripts/vivino-audit.mjs --limit",
    LIMIT,
  );
  process.exit(1);
}

// ── Falsos splits: dos fichas distintas al mismo ID de Vivino ──
const byVivino = new Map();
for (const g of targets) {
  const hit = cache[repName(g)];
  if (!hit?.id || hit.confidence < MIN_CONFIDENCE) continue;
  if (!byVivino.has(hit.id)) byVivino.set(hit.id, []);
  byVivino.get(hit.id).push({ slug: g.groupSlug, name: repName(g), conf: hit.confidence });
}

// ESTO ES UNA COLA DE REVISIÓN, NO UN MERGE AUTOMÁTICO. Y la distinción
// no es prudencia genérica: está medida.
//
// Vivino solo no alcanza — su catálogo también fusiona de más:
//   · "Rutini Colección Cabernet Merlot" y "Rutini Coleccion Cabernet
//     Sauvignon" caen las dos en /w/13231968 con confianza 1,0, y son
//     vinos distintos.
//   · "Rutini Colección Gewurztraminer" se cuela en el ID del Chardonnay
//     con 0,867, por encima del gate de confianza.
//
// Y "Vivino propone, los gates disponen" TAMPOCO alcanza — sobre esos
// mismos tres pares acierta uno:
//   · Chardonnay vs Colección Chardonnay (el merge REAL) → los gates lo
//     VETAN por tier/parcela.
//   · Colección Cab Merlot vs Cab Sauvignon (el merge FALSO) → los gates
//     lo PERMITEN.
//
// O sea: ninguna de las dos fuentes, ni combinadas, decide sola con la
// precisión que exige el proyecto ("una quimera es peor que un merge
// faltante"). Lo que sí hacen bien es GENERAR CANDIDATOS. Por eso el
// veredicto de los gates se anota como contexto para quien revisa, no
// como permiso para fusionar.
const { hardConflict } = await import("./stage4-token-merge.mjs");

const suspectedSplits = [...byVivino.entries()]
  .filter(([, gs]) => gs.length > 1)
  .map(([id, gs]) => {
    const pairs = [];
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        const gate = hardConflict(
          { canonicalName: gs[i].name },
          { canonicalName: gs[j].name },
        );
        pairs.push({ a: gs[i].slug, b: gs[j].slug, blockedBy: gate ?? null });
      }
    }
    return {
      vivinoId: id,
      vivino: cache[gs[0].name],
      fichas: gs,
      pairs,
      // Contexto para quien revisa, NO permiso para fusionar.
      gatesSilent: pairs.every((p) => !p.blockedBy),
    };
  });

const resolved = targets.filter((g) => {
  const h = cache[repName(g)];
  return h?.id && h.confidence >= MIN_CONFIDENCE;
}).length;

const report = {
  generatedAt: new Date().toISOString(),
  minConfidence: MIN_CONFIDENCE,
  audited: targets.length,
  resolvedAboveGate: resolved,
  suspectedSplits,
};

console.log(`\n  resueltas por encima del gate: ${resolved}/${targets.length}`);
console.log(`  falsos splits sospechados: ${suspectedSplits.length}`);
for (const s of suspectedSplits.slice(0, 15)) {
  console.log(`   · ${s.vivino?.winery ?? ""} ${s.vivino?.name ?? s.vivinoId}`);
  for (const f of s.fichas) console.log(`       ${f.conf.toFixed(2)}  /vino/${f.slug}`);
}

if (WRITE) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0));
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n✅ cache (${Object.keys(cache).length}) + data/vivino-audit.json`);
} else {
  console.log("\n(dry-run — pasá --write para persistir cache e informe)");
}
