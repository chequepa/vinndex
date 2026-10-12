#!/usr/bin/env node
/**
 * Guarda del bundle del navegador: falla si algún chunk de
 * .next/static/chunks pesa más de MAX_MB.
 *
 * Por qué: lib/snapshot.ts importa data/snapshot.json (~50 MB) y basta con
 * que un componente "use client" importe UNA función de ahí (o de un
 * módulo que lo importe, como lib/compass.ts) para que el JSON entero
 * viaje al celular. /explorar estuvo así hasta el 12/10/2026 — 50 MB de
 * JS — y ningún check lo vio porque Lighthouse no mide /explorar. Los
 * chunks legítimos más grandes rondan los 250 KB.
 *
 * Corre después de `next build` (lighthouse.yml). Uso:
 *   node scripts/check-client-bundle.mjs [--max-mb 2]
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const i = process.argv.indexOf("--max-mb");
const MAX_MB = i >= 0 ? Number(process.argv[i + 1]) : 2;
const DIR = join(process.cwd(), ".next/static/chunks");

if (!existsSync(DIR)) {
  console.error("No existe .next/static/chunks — corré `next build` antes.");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const big = walk(DIR)
  .map((p) => ({ p, mb: statSync(p).size / 1e6 }))
  .filter((f) => f.mb > MAX_MB)
  .sort((a, b) => b.mb - a.mb);

if (big.length) {
  console.error(`❌ Chunks de cliente de más de ${MAX_MB} MB:`);
  for (const f of big) console.error(`   ${f.mb.toFixed(1)} MB  ${f.p}`);
  console.error(
    "\nCasi seguro un componente \"use client\" importa de lib/snapshot.ts (o de un módulo que lo importa) y arrastra data/snapshot.json. Usá lib/format.ts / lib/compassPalette.ts o pasá los datos como props desde el server.",
  );
  process.exit(1);
}
console.log(`✅ Ningún chunk de cliente supera ${MAX_MB} MB.`);
