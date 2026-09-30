#!/usr/bin/env node
/**
 * build-store-activity.mjs — reconstruye data/store-activity.json desde el
 * historial de git (un snapshot por semana desde el cutover de identidad
 * v2) y lo deja al día con el snapshot vigente. Se corre UNA vez a mano;
 * después lo mantiene merge-snapshots.mjs en cada corrida.
 *
 * Uso: node scripts/build-store-activity.mjs --backfill [--since 2026-07-03]
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { priceMapByStore, snapshotItems, updateActivity, staleStores, ACTIVITY_DOC } from "./lib-store-activity.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "data/store-activity.json");
const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SINCE = argVal("--since", "2026-07-03");

if (!args.includes("--backfill")) {
  console.error("Uso: node scripts/build-store-activity.mjs --backfill [--since YYYY-MM-DD]");
  process.exit(1);
}

// Un commit por semana ISO (el último de cada semana) del snapshot.
const log = execSync(`git log --format='%h %ad' --date=short --since=${SINCE} -- data/snapshot.json`, { cwd: ROOT, encoding: "utf8" })
  .trim().split("\n").filter(Boolean).map((l) => { const [sha, date] = l.split(" "); return { sha, date }; }).reverse();
const weekOf = (d) => { const dt = new Date(`${d}T00:00:00Z`); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };
const byWeek = new Map();
for (const c of log) byWeek.set(weekOf(c.date), c); // el último de la semana gana
const samples = [...byWeek.values()];
console.log(`backfill: ${samples.length} snapshots semanales desde ${SINCE} + el vigente`);

const activity = { _doc: ACTIVITY_DOC, updatedAt: null, stores: {} };
let prevMap = null;
for (const s of samples) {
  const raw = execSync(`git show ${s.sha}:data/snapshot.json`, { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });
  const cur = priceMapByStore(snapshotItems(JSON.parse(raw)));
  if (prevMap) updateActivity(activity, prevMap, cur, s.date);
  else {
    for (const [slug, m] of cur) activity.stores[slug] = { firstSeen: s.date, lastPriceChange: null, lastCheck: s.date, offers: m.size };
    activity.updatedAt = s.date;
  }
  prevMap = cur;
  process.stdout.write(`  ${s.date} (${s.sha}) · ${cur.size} tiendas\n`);
}
// snapshot vigente
if (existsSync(resolve(ROOT, "data/snapshot.json"))) {
  const snap = JSON.parse(readFileSync(resolve(ROOT, "data/snapshot.json"), "utf8"));
  const today = String(snap.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const cur = priceMapByStore(snapshotItems(snap));
  if (prevMap) updateActivity(activity, prevMap, cur, today);
  console.log(`  ${today} (vigente) · ${cur.size} tiendas`);
}
writeFileSync(OUT, JSON.stringify(activity, null, 1) + "\n");
const stale = staleStores(activity, activity.updatedAt);
console.log(`→ ${OUT} · ${Object.keys(activity.stores).length} vinotecas · ${stale.size} sin movimiento de precios en 60 días:`);
for (const [slug, last] of [...stale.entries()].sort()) console.log(`    ${slug} (último cambio ${last}, ${activity.stores[slug].offers} ofertas)`);
