/**
 * Casos dorados del colapso de redirects (scripts/lib-redirects.mjs).
 *
 * El caso que motivó el archivo es el ping-pong del 13/09/2026: una ficha
 * que alterna entre dos slugs perdía el redirect porque el mapa acumulado
 * y el nuevo formaban un ciclo. Los slugs de los casos son los reales.
 *
 * Correr: node scripts/test-lib-redirects.mjs
 */
import { collapseRedirects } from "./lib-redirects.mjs";

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

console.log("\n=== PING-PONG (el bug del 13/09) ===");
{
  const viejo = "escorihuela-gascon-sauvignon-blanc-750-ml";
  const nuevo = "escorihuela-gascon-sauvignon-blanc-2";
  // acumulado de ayer (nuevo → viejo) pisado por el de hoy (viejo → nuevo)
  const all = { [nuevo]: viejo, [viejo]: nuevo };
  const r = collapseRedirects(all, new Set([nuevo]));
  check(
    "la URL de ayer redirige a la ficha viva de hoy",
    r[viejo] === nuevo,
    `${viejo} → ${r[viejo]}`,
  );
  check(
    "la ficha viva no queda como origen",
    !(nuevo in r),
    `claves: ${Object.keys(r).join(", ")}`,
  );
}
{
  // y al día siguiente vuelve a saltar
  const a = "vino-malbec-750-ml-finjamos-demencia";
  const b = "finjamos-demencia-malbec";
  const r = collapseRedirects({ [a]: b, [b]: a }, new Set([a]));
  check("funciona en las dos direcciones", r[b] === a && !(a in r), `${b} → ${r[b]}`);
}

console.log("\n=== LO QUE YA ANDABA ===");
{
  const r = collapseRedirects({ a: "b", b: "c" }, new Set(["c"]));
  check("colapsa cadenas", r.a === "c" && r.b === "c", `a → ${r.a}, b → ${r.b}`);
}
{
  const r = collapseRedirects({ a: "b", b: "a" }, new Set());
  check("un ciclo sin página viva se descarta", Object.keys(r).length === 0, "sin entradas");
}
{
  const r = collapseRedirects({ a: "b" }, new Set());
  check(
    "destino sin stock hoy se conserva (el runtime decide)",
    r.a === "b",
    `a → ${r.a}`,
  );
}
{
  const r = collapseRedirects({ a: "a" }, new Set());
  check("sin auto-referencias", !("a" in r), "descartada");
}
{
  // cadena que pasa por una página que volvió a estar viva: corta ahí
  const r = collapseRedirects({ a: "b", b: "c" }, new Set(["b", "c"]));
  check(
    "una página viva en el medio es el destino",
    r.a === "b" && !("b" in r),
    `a → ${r.a}`,
  );
}

console.log();
if (fail === 0) {
  console.log(`✅ Todos los casos dorados del colapso pasan (${pass}).`);
} else {
  console.log(`❌ ${fail} caso(s) fallan de ${pass + fail}.`);
  process.exit(1);
}
