/**
 * Invariantes de data/group-merges.json — el mapa de redirects 308 que
 * sostiene el SEO de las URLs viejas.
 *
 * Por qué existe. El 27/08/2026 se descubrió que el publish borraba toda
 * entrada cuyo destino no estuviera vivo ESE día, y como la corrida
 * siguiente releía el archivo podado, la pérdida era definitiva: 13.494
 * redirects el 29/07 → 10.018 el 27/08, ~3.500 URLs indexadas de vuelta
 * en 404 sin que nadie tocara nada. El archivo pasó a ser acumulativo
 * (como wine-slugs.json) y este test es el que avisa si vuelve a encoger.
 *
 * Corre en el daily-scrape DESPUÉS del publish y es bloqueante: si algo
 * de acá falla, el job muere antes del commit y el sitio conserva el
 * snapshot de ayer.
 *
 * Correr local: node scripts/test-redirects.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const merges = JSON.parse(
  readFileSync(resolve(ROOT, "data/group-merges.json"), "utf8"),
);
const snapshot = JSON.parse(
  readFileSync(resolve(ROOT, "data/snapshot.json"), "utf8"),
);
const live = new Set((snapshot.productGroups ?? []).map((g) => g.groupSlug));

// Cuánto puede encoger sin que sea sospechoso. Con el mapa acumulativo un
// encogimiento legítimo es raro y chico: pasa sólo cuando un slug que era
// redirect vuelve a ser página viva. Un 2% (≈275 entradas hoy) es holgado
// para eso y ajustado para cazar una poda masiva.
const MAX_SHRINK = 0.02;

let fail = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ✅  ${name}${detail ? "  →  " + detail : ""}`);
  else {
    fail++;
    console.log(`  ❌ FALLA  ${name}${detail ? "  →  " + detail : ""}`);
  }
}

const keys = Object.keys(merges);
console.log(`\n=== data/group-merges.json · ${keys.length} redirects ===\n`);

// 1. Nada se apunta a sí mismo.
const self = keys.filter((k) => merges[k] === k);
check("sin auto-referencias", self.length === 0, self.slice(0, 3).join(", "));

// 2. Ningún origen es a la vez una página viva: la página gana siempre.
const origenVivo = keys.filter((k) => live.has(k));
check(
  "ningún origen es página viva",
  origenVivo.length === 0,
  origenVivo.slice(0, 3).join(", "),
);

// 3. Sin ciclos: resolveMergedSlug() sigue la cadena y un ciclo la deja
//    girando hasta el tope de saltos, o sea un 404 con trabajo de más.
const enCiclo = [];
for (const k of keys) {
  const seen = new Set([k]);
  let cur = merges[k];
  while (cur && merges[cur]) {
    if (seen.has(cur)) {
      enCiclo.push(k);
      break;
    }
    seen.add(cur);
    cur = merges[cur];
  }
}
check("sin ciclos", enCiclo.length === 0, enCiclo.slice(0, 3).join(", "));

// 4. Cadenas colapsadas: el destino no vuelve a ser clave del mapa.
//    resolveMergedSlug() sigue hasta 5 saltos; el publish escribe destinos
//    finales, así que un encadenado significa que algo no colapsó.
const encadenados = keys.filter((k) => merges[k] in merges);
check(
  "destinos finales (sin encadenar)",
  encadenados.length === 0,
  encadenados.slice(0, 3).join(", "),
);

// 5. LA IMPORTANTE: el mapa no encogió de golpe contra lo committeado.
let prevCount = null;
try {
  const prev = JSON.parse(
    execSync("git show HEAD:data/group-merges.json", {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1 << 28,
    }),
  );
  prevCount = Object.keys(prev.merges ?? prev).length;
} catch {
  /* sin historia (checkout raro o primer commit): no se puede comparar */
}
if (prevCount === null) {
  console.log("  ⏭️   sin versión previa en git — no se compara el tamaño");
} else {
  const delta = keys.length - prevCount;
  const shrink = delta < 0 ? -delta / prevCount : 0;
  check(
    "el mapa no encogió de golpe",
    shrink <= MAX_SHRINK,
    `${prevCount} → ${keys.length} (${delta >= 0 ? "+" : ""}${delta})`,
  );
}

// 6. Cuántos resuelven hoy. No es un test (que un destino esté sin stock
//    hoy es normal y la entrada se conserva a propósito), pero el número
//    sirve para mirar la tendencia en el log del run.
const vivos = keys.filter((k) => live.has(merges[k])).length;
console.log(
  `\n  ℹ️   ${vivos} de ${keys.length} redirigen a un grupo publicado hoy; ` +
    `${keys.length - vivos} quedan dormidos hasta que el vino reponga.`,
);

console.log(fail === 0 ? "\n✅ Redirects OK\n" : `\n❌ ${fail} fallas\n`);
process.exit(fail === 0 ? 0 : 1);
