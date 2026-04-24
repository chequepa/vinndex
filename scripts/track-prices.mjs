#!/usr/bin/env node
/**
 * Append today's min price for every multi-store group into
 * data/price-history.json with a rolling 30-day window.
 *
 * Runs once a day from daily-scrape.yml, right after build-groups. No
 * backend needed — the rolling file is committed to the repo and the
 * ficha reads it server-side.
 *
 * Filter: storeCount >= 2 so single-store wines don't bloat the file
 * (file size budget: ~3k groups × 30 days × ~45 bytes = ~4MB).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "data/snapshot.json");
const HISTORY = path.join(ROOT, "data/price-history.json");

const MAX_DAYS = 30;
const MIN_STORE_COUNT = 2;

function todayIso() {
  // UTC day key — the daily CI runs at 06:00 UTC so there's exactly
  // one run per UTC date.
  return new Date().toISOString().slice(0, 10);
}

function loadHistory() {
  if (!fs.existsSync(HISTORY)) {
    return { lastUpdated: null, history: {} };
  }
  try {
    const raw = fs.readFileSync(HISTORY, "utf8");
    const parsed = JSON.parse(raw);
    return {
      lastUpdated: parsed.lastUpdated ?? null,
      history: parsed.history ?? {},
    };
  } catch (e) {
    console.warn("Corrupt price-history.json, starting fresh:", e.message);
    return { lastUpdated: null, history: {} };
  }
}

function main() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const groups = snapshot.productGroups ?? [];
  console.log(`Loaded ${groups.length} groups from snapshot.`);

  const { history } = loadHistory();
  const today = todayIso();

  let tracked = 0;
  let updated = 0;
  let skippedToday = 0;

  for (const g of groups) {
    if (g.storeCount < MIN_STORE_COUNT) continue;
    if (g.minPrice == null || g.minPrice <= 0) continue;
    tracked++;

    const key = g.groupSlug;
    const series = history[key] ?? [];

    // If we already have today's entry, overwrite it (CI re-runs on same day).
    const lastEntry = series[series.length - 1];
    if (lastEntry && lastEntry.date === today) {
      lastEntry.min = g.minPrice;
      lastEntry.stores = g.storeCount;
      skippedToday++;
    } else {
      series.push({
        date: today,
        min: g.minPrice,
        stores: g.storeCount,
      });
      updated++;
    }

    // Rotate — keep only the last MAX_DAYS entries.
    while (series.length > MAX_DAYS) series.shift();

    history[key] = series;
  }

  // Drop series that haven't been updated in 30 days — the slug probably
  // fell out of the multi-store set.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  let pruned = 0;
  for (const k of Object.keys(history)) {
    const series = history[k];
    if (!series || series.length === 0) {
      delete history[k];
      pruned++;
      continue;
    }
    const last = series[series.length - 1];
    if (last.date < cutoffIso) {
      delete history[k];
      pruned++;
    }
  }

  const out = {
    lastUpdated: today,
    minStoreCount: MIN_STORE_COUNT,
    maxDays: MAX_DAYS,
    history,
  };

  fs.writeFileSync(HISTORY, JSON.stringify(out));
  const bytes = fs.statSync(HISTORY).size;

  console.log(
    `Tracked ${tracked} · Appended ${updated} · Same-day overwrite ${skippedToday} · Pruned ${pruned} stale`,
  );
  console.log(`File size: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Entries: ${Object.keys(history).length} slugs tracked`);
}

main();
