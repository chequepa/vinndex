#!/usr/bin/env node
/**
 * Healthcheck del snapshot recién regenerado por el daily-scrape.
 *
 * Compara `data/snapshot.json` (versión actual, post-pipeline) contra
 * `git show HEAD:data/snapshot.json` (versión anterior commiteada) y
 * detecta regresiones serias:
 *
 *   1. Stores con `errors.length > 0`
 *   2. Stores que pasaron de `productCount >= 50` a `productCount === 0`
 *      (scraper roto contra el endpoint)
 *   3. Stores con caída ≥ 50% en `productCount`
 *   4. Total productCount cae ≥ 20% vs el commit anterior
 *
 * Exit code 0 si todo OK, 1 si hay alertas. El workflow usa el exit
 * code para crear/actualizar un GitHub Issue automáticamente.
 *
 * Uso:
 *   node scripts/scrape-healthcheck.mjs              # solo report a stdout
 *   node scripts/scrape-healthcheck.mjs --json       # report estructurado
 *   node scripts/scrape-healthcheck.mjs --strict     # exit 1 también si
 *                                                     # algún store tiene errors
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
const STRICT = args.includes("--strict");

function readCurrentSnapshot() {
  try {
    return JSON.parse(readFileSync("data/snapshot.json", "utf8"));
  } catch (err) {
    console.error("No pude leer data/snapshot.json:", err.message);
    process.exit(2);
  }
}

function readPreviousSnapshot() {
  try {
    // `git show HEAD:data/snapshot.json` devuelve el contenido del
    // archivo en el commit actual del repo (que es el snapshot
    // ANTES de este scrape — el nuevo aún no se commiteó). maxBuffer
    // alto porque el snapshot pesa ~25 MB y el default de execSync
    // es 1 MB → ENOBUFS si no lo subimos.
    const raw = execSync("git show HEAD:data/snapshot.json", {
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw);
  } catch {
    // Si el archivo no estaba en HEAD (primer scrape, repo nuevo), no
    // hay baseline — devolvemos null y el healthcheck no compara
    // contra histórico, sólo detecta errores absolutos.
    return null;
  }
}

const current = readCurrentSnapshot();
const previous = readPreviousSnapshot();

const issues = [];

// 1. Errores explícitos en algún store. STRICT=true hace que esto
//    rompa el exit code; default sólo lo reporta.
const storesWithErrors = (current.stores ?? []).filter(
  (s) => Array.isArray(s.errors) && s.errors.length > 0,
);
if (storesWithErrors.length > 0) {
  issues.push({
    severity: STRICT ? "error" : "warn",
    kind: "store_errors",
    title: `${storesWithErrors.length} tiendas con errores en el scrape`,
    items: storesWithErrors.map((s) => ({
      slug: s.storeSlug,
      name: s.storeName,
      productCount: s.productCount,
      errors: s.errors,
    })),
  });
}

// 1b. Silent zero: store con 0 productos y SIN errores reportados. El
//     check #2 (store_zero) sólo dispara en la transición ≥50→0, así que
//     una tienda rota hace varios días pasa desapercibida (su baseline en
//     HEAD ya es 0). Este caso cubre exactamente Enoteca Privada (302 →
//     /password, el scraper ve vacío y no tira error) y ML con token
//     expirado. Una tienda configurada que devuelve 0 sin un solo error
//     siempre es sospechosa.
const silentZero = (current.stores ?? []).filter(
  (s) =>
    (s.productCount ?? 0) === 0 &&
    Array.isArray(s.errors) &&
    s.errors.length === 0,
);
if (silentZero.length > 0) {
  issues.push({
    severity: "warn",
    kind: "store_silent_zero",
    title: `${silentZero.length} tiendas con 0 productos y SIN errores (scraper roto en silencio)`,
    items: silentZero.map((s) => ({
      slug: s.storeSlug,
      name: s.storeName,
      productCount: 0,
    })),
  });
}

// 2-3. Diff per-store contra el snapshot anterior.
if (previous) {
  const prevMap = new Map(
    (previous.stores ?? []).map((s) => [s.storeSlug, s]),
  );

  for (const s of current.stores ?? []) {
    const prev = prevMap.get(s.storeSlug);
    if (!prev) continue; // tienda nueva, sin baseline

    // Scraper roto: tenía productos, ahora 0.
    if (
      prev.productCount >= 50 &&
      (s.productCount ?? 0) === 0
    ) {
      issues.push({
        severity: "error",
        kind: "store_zero",
        title: `${s.storeName ?? s.storeSlug} devolvió 0 productos (antes: ${prev.productCount})`,
        items: [
          {
            slug: s.storeSlug,
            name: s.storeName,
            productCount: 0,
            previousProductCount: prev.productCount,
          },
        ],
      });
      continue;
    }

    // Caída ≥ 50% — algo cambió en el endpoint, scraper degrada.
    const prevCount = prev.productCount ?? 0;
    const nowCount = s.productCount ?? 0;
    if (prevCount >= 30 && nowCount > 0 && nowCount / prevCount <= 0.5) {
      issues.push({
        severity: "warn",
        kind: "store_drop",
        title: `${s.storeName ?? s.storeSlug} cayó ${Math.round(
          (1 - nowCount / prevCount) * 100,
        )}% (${prevCount} → ${nowCount})`,
        items: [
          {
            slug: s.storeSlug,
            name: s.storeName,
            productCount: nowCount,
            previousProductCount: prevCount,
          },
        ],
      });
    }
  }

  // 4. Total productCount con caída fuerte.
  const totalNow = current.productCount ?? 0;
  const totalPrev = previous.productCount ?? 0;
  if (totalPrev >= 1000 && totalNow / totalPrev <= 0.8) {
    issues.push({
      severity: "error",
      kind: "total_drop",
      title: `productCount total cayó ${Math.round(
        (1 - totalNow / totalPrev) * 100,
      )}% (${totalPrev} → ${totalNow})`,
      items: [],
    });
  }
}

const hasErrors = issues.some((i) => i.severity === "error");
const exitCode = hasErrors ? 1 : 0;

if (JSON_MODE) {
  const payload = {
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt: current.generatedAt ?? null,
    previousSnapshotGeneratedAt: previous?.generatedAt ?? null,
    storeCount: current.storeCount ?? 0,
    productCount: current.productCount ?? 0,
    previousProductCount: previous?.productCount ?? null,
    ok: !hasErrors,
    issueCount: issues.length,
    errorCount: issues.filter((i) => i.severity === "error").length,
    warnCount: issues.filter((i) => i.severity === "warn").length,
    issues,
  };
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`=== Healthcheck del snapshot ===`);
  console.log(`Stores: ${current.storeCount}`);
  console.log(`Productos: ${current.productCount}`);
  if (previous) {
    console.log(
      `Δ productos: ${current.productCount - previous.productCount} (prev: ${previous.productCount})`,
    );
  } else {
    console.log("Sin baseline (primer run del repo)");
  }
  if (issues.length === 0) {
    console.log("\n✅ Sin issues — todo OK");
  } else {
    console.log(
      `\n⚠ ${issues.filter((i) => i.severity === "error").length} errores · ${issues.filter((i) => i.severity === "warn").length} warnings\n`,
    );
    for (const i of issues) {
      const icon = i.severity === "error" ? "🔴" : "🟡";
      console.log(`${icon} [${i.kind}] ${i.title}`);
      for (const it of i.items.slice(0, 5)) {
        const extra = it.errors ? `  errors: ${it.errors.join("; ")}` : "";
        console.log(`     • ${it.slug ?? "(global)"}${extra}`);
      }
    }
  }
}

process.exit(exitCode);
