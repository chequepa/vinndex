/**
 * Recupera los redirects 308 que el pruning de build-groups-v2.mjs fue
 * borrando día a día.
 *
 * EL PROBLEMA (diagnosticado el 27/08/2026). Hasta hoy el paso de PUBLISH
 * reescribía data/group-merges.json conservando SÓLO las entradas cuyo
 * destino estuviera vivo en el snapshot de ESE día:
 *
 *     if (to !== from && liveSlugs.has(to)) resolved[from] = to;
 *
 * Como la corrida siguiente relee el archivo ya podado, la poda era
 * definitiva. Alcanzaba con que un vino se quedara sin stock una mañana
 * para borrar todos los redirects que apuntaban a él, y no volvían cuando
 * el vino reponía. Un trinquete que sólo perdía:
 *
 *     29/07  13.494 redirects   (después del rebuild-legacy-redirects)
 *     08/08  12.529
 *     21/08  10.228
 *     27/08  10.018            → ~3.500 URLs indexadas de vuelta en 404
 *
 * El arreglo de fondo va en build-groups-v2.mjs (el archivo pasa a ser
 * acumulativo, como wine-slugs.json). Este script es la reparación de una
 * sola vez de lo ya perdido.
 *
 * CÓMO. El propio git guarda todas las versiones del archivo. Unimos todas
 * (lo más nuevo pisa a lo viejo), y sobre el mapa de HOY —que manda, porque
 * sus destinos ya fueron verificados— agregamos las entradas perdidas.
 *
 * GATES, con la doctrina del harness (un redirect falso es peor que uno
 * faltante):
 *   1. Si el slug de origen es hoy una página viva, no se toca: la página
 *      gana siempre sobre el redirect.
 *   2. Una entrada de hoy nunca se pisa.
 *   3. Sólo se recupera si la cadena termina en un grupo que existe HOY.
 *      Así no se inventa nada y no puede haber ciclos: un destino vivo
 *      nunca es a su vez clave del mapa.
 *
 * Los no-vinos y los grupos sin ofertas no necesitan gate acá: no están en
 * `groups` de lib/snapshot.ts, así que findGroup() no los encuentra y
 * resolveMergedSlug() devuelve null → 404, que es lo correcto.
 *
 * Uso:
 *   node scripts/recover-merges-from-history.mjs            # dry-run
 *   node scripts/recover-merges-from-history.mjs --write    # aplica
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MERGES_PATH = resolve(ROOT, "data/group-merges.json");
const SNAPSHOT_PATH = resolve(ROOT, "data/snapshot.json");
const WRITE = process.argv.includes("--write");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Une todas las versiones históricas del mapa; lo más nuevo pisa. */
function unionFromHistory() {
  const commits = execSync(
    'git log --format="%h" -- data/group-merges.json',
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .reverse(); // más viejo primero

  const union = {};
  let versions = 0;
  for (const c of commits) {
    let raw;
    try {
      raw = execSync(`git show ${c}:data/group-merges.json`, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 1 << 28,
      });
    } catch {
      continue; // el archivo no existía en ese commit
    }
    try {
      const m = JSON.parse(raw);
      Object.assign(union, m.merges ?? m);
      versions++;
    } catch {
      /* versión corrupta: se ignora */
    }
  }
  return { union, versions, commits: commits.length };
}

const { union, versions } = unionFromHistory();
const today = readJson(MERGES_PATH);
const snapshot = readJson(SNAPSHOT_PATH);
const live = new Set((snapshot.productGroups ?? []).map((g) => g.groupSlug));

const out = { ...today };
const recovered = [];
for (const from of Object.keys(union)) {
  if (from in out) continue; // gate 2: hoy ya tiene respuesta
  if (live.has(from)) continue; // gate 1: la página viva gana
  // Seguí la cadena hasta el primer destino que exista hoy.
  const seen = new Set([from]);
  let cur = union[from];
  let dest = null;
  while (cur && !seen.has(cur)) {
    if (live.has(cur)) {
      dest = cur;
      break;
    }
    seen.add(cur);
    cur = cur in out ? out[cur] : union[cur];
  }
  if (dest) {
    // gate 3
    out[from] = dest;
    recovered.push([from, dest]);
  }
}

console.log(`Versiones del mapa leídas de git: ${versions}`);
console.log(`Unión histórica:                  ${Object.keys(union).length}`);
console.log(`Mapa de hoy:                      ${Object.keys(today).length}`);
console.log(`Recuperados (destino vivo hoy):   ${recovered.length}`);
console.log(`Total resultante:                 ${Object.keys(out).length}`);

// Verificaciones duras antes de escribir.
const problems = [];
if (!Object.keys(today).every((k) => out[k] === today[k]))
  problems.push("se modificó una entrada existente");
if (Object.keys(out).some((k) => out[k] === k))
  problems.push("hay auto-referencias");
if (Object.keys(out).some((k) => live.has(k)))
  problems.push("hay un origen que es página viva");
if (recovered.some(([, to]) => !live.has(to)))
  problems.push("hay un recuperado con destino que no existe");
if (problems.length) {
  console.error(`\n❌ NO se escribe nada: ${problems.join(" · ")}`);
  process.exit(1);
}
console.log("\n✅ Verificaciones OK (no se pisa nada, sin ciclos, todo destino existe)");

console.log("\nMuestra:");
for (const [from, to] of recovered.slice(0, 10)) {
  console.log(`  /vino/${from}\n    → /vino/${to}`);
}

if (WRITE) {
  writeFileSync(MERGES_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n✍️  Escrito ${MERGES_PATH}`);
} else {
  console.log("\n(dry-run — pasá --write para aplicar)");
}
