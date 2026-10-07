/**
 * Casos dorados del sommelier (scripts/lib-sommelier.mjs). Sin red: todo lo
 * que decide qué se fusiona es puro.
 *
 * Lo sagrado: Claude NUNCA junta dos fichas contra un gate de tipo, color,
 * dulzor o varietal, ni contra la guarda de precio; sólo se aplica lo que
 * las DOS pasadas dicen; una bodega con bajo acuerdo entre pasadas no se
 * aplica; y la clave de nombre no cambia (si cambia, los veredictos pagados
 * quedan huérfanos).
 *
 * Correr: node scripts/test-sommelier.mjs
 */
import {
  nameKey,
  parseBodegaOutput,
  unitConsensus,
  buildIndex,
  compactPass,
  applySommelier,
  sommelierGate,
  MIN_AGREEMENT,
} from "./lib-sommelier.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✅  ${name}${detail ? `  →  ${detail}` : ""}`); }
  else { fail++; console.log(`  ❌ FALLA  ${name}${detail ? `  →  ${detail}` : ""}`); }
}

console.log("\n=== CLAVE DE NOMBRE (congelada) ===");
const keyCases = [
  ["LAS PERDICES A COLORADA ANCELL", "las perdices a colorada ancell"],
  ["Vino Las Perdices Reserva Pinot Noir 750ml", "vino las perdices reserva pinot noir 750ml"],
  ["Saint Felicien – Malbec 2023", "saint felicien malbec"],
  ["Las Perdices Exploración «Gualtallary»", "las perdices exploracion gualtallary"],
  ["Rutini Antología XXXVIII", "rutini antologia xxxviii"],
  ["Latitud 33° Malbec", "latitud 33 malbec"],
  ["Catena Zapata Malbec Argentino 1990", "catena zapata malbec argentino"],
  ["Vino 2456 Gran Reserva", "vino 2456 gran reserva"],
  ["D.V. Catena Malbec&amp;Malbec", "d v catena malbec malbec"],
];
for (const [raw, want] of keyCases) {
  const got = nameKey(raw);
  check(`nameKey("${raw}")`, got === want, `"${got}"`);
}

console.log("\n=== LECTURA DE LA RESPUESTA ===");
const labeled = [
  ["ala colorada ancellotta", "las perdices ala colorada ancellotta"],
  ["las perdices a colorada ancell"],
  ["aceite de oliva cortijo"],
  ["sunal exploracion criolla angastaco"],
  ["las perdices exploracion", "las perdices exploracion malbec gualtallary"],
];
const out = {
  vinos: [
    { id: "v1", nombre: "Ala Colorada Ancellotta", bodega: "Las Perdices", linea: "Ala Colorada", varietal: "Ancellotta", color: "tinto", dulzor: null },
    { id: "v2", nombre: "Exploración Gualtallary Malbec", bodega: "Las Perdices", linea: "Exploración", varietal: "Malbec", color: "tinto", dulzor: null },
  ],
  fichas: [
    { f: "F1", tipo: "vino", vino: "v1", bodega_real: null, excepciones: [] },
    { f: "F2", tipo: "vino", vino: "v1", bodega_real: null, excepciones: [] },
    { f: "F3", tipo: "no_vino", vino: null, bodega_real: null, excepciones: [] },
    { f: "F4", tipo: "otra_bodega", vino: null, bodega_real: "Agustín Lanús", excepciones: [] },
    { f: "F5", tipo: "dudoso", vino: null, bodega_real: null, excepciones: [{ n: "F5.2", vino: "v2" }] },
    { f: "F9", tipo: "vino", vino: "v1", bodega_real: null, excepciones: [] }, // ficha inexistente: se ignora
    { f: "F1", tipo: "vino", vino: "v2", bodega_real: null, excepciones: [] }, // repetida: gana la primera
  ],
};
const parsed = parseBodegaOutput(out, labeled);
check("dos fichas al mismo vino → mismo id", parsed.map["las perdices a colorada ancell"] === "v1" && parsed.map["ala colorada ancellotta"] === "v1");
check("no_vino → x", parsed.map["aceite de oliva cortijo"] === "x");
check("otra_bodega → x + bodega real", parsed.map["sunal exploracion criolla angastaco"] === "x" && parsed.otra["sunal exploracion criolla angastaco"] === "Agustín Lanús");
check("dudoso → sin decisión, salvo la excepción explícita", parsed.map["las perdices exploracion"] === undefined && parsed.map["las perdices exploracion malbec gualtallary"] === "v2");
check("ficha inexistente y ficha repetida se ignoran", parsed.stats.fichas === 5, `${parsed.stats.fichas} fichas`);
const bad = parseBodegaOutput({ vinos: [], fichas: [{ f: "F1", tipo: "vino", vino: "v7", bodega_real: null, excepciones: [] }] }, labeled);
check("id de vino inventado → sin decisión", Object.keys(bad.map).length === 0 && bad.stats.idsInvalidos === 1);

console.log("\n=== CONSENSO DE DOS PASADAS ===");
const A = { map: { a: "v1", b: "v1", c: "v1", d: "v2", e: "x", f: "x", g: "v3" }, wines: { v1: { nombre: "Uno" }, v2: { nombre: "Dos" }, v3: { nombre: "Tres" } } };
const B = { map: { a: "w9", b: "w9", c: "w8", d: "w8", e: "x", f: "w8" }, wines: { w9: { nombre: "Uno" }, w8: { nombre: "Otro" } } };
const c = unitConsensus("b:t", A, B);
check("a y b juntos en las dos pasadas → misma clase", c.classes.get("a").cls === c.classes.get("b").cls);
check("c: A la junta con a, B no → clase distinta (no se fusiona)", c.classes.get("c").cls !== c.classes.get("a").cls);
check("c y d: B los junta, A no → clase distinta", c.classes.get("c").cls !== c.classes.get("d").cls);
check("x en las dos → fuera", c.out.has("e") && !c.classes.has("e"));
check("x en una sola → sin decisión", !c.out.has("f") && !c.classes.has("f"));
check("nombre que una pasada no decidió → sin decisión", !c.classes.has("g"));
check("acuerdo < 1 cuando las pasadas difieren", c.agreement < 1, c.agreement.toFixed(2));

console.log("\n=== ÍNDICE ===");
const unit = (names, mA, mB, extra = {}) => ({
  kind: "bodega", names, at: "2026-10-07",
  passes: {
    A: { ...compactPass(names, { map: mA, wines: { v1: { nombre: "V1" }, v2: { nombre: "V2" } } }), inputHash: "h" },
    B: { ...compactPass(names, { map: mB, wines: { v1: { nombre: "V1" }, v2: { nombre: "V2" } } }), inputHash: "h" },
  },
  ...extra,
});
const names5 = ["n1", "n2", "n3", "n4", "n5"];
const agree = Object.fromEntries(names5.map((k) => [k, "v1"]));
const idx = buildIndex({
  units: {
    "b:ok": unit(names5, agree, agree),
    "b:lio": unit(["m1", "m2", "m3", "m4", "m5"], { m1: "v1", m2: "v1", m3: "v1", m4: "v1", m5: "v1" }, { m1: "v1", m2: "v2", m3: "v1", m4: "v2", m5: "v1" }),
    "b:media": { kind: "bodega", names: ["z1"], passes: { A: { m: ["v1"], wines: {}, inputHash: "h" } } },
    "b:apagada": unit(["q1", "q2"], { q1: "v1", q2: "v1" }, { q1: "v1", q2: "v1" }),
  },
  disabled: ["b:apagada"],
});
check("unidad con acuerdo total → aplicada", idx.index.has("n1") && idx.units.find((u) => u.unitKey === "b:ok").applied);
check(`unidad con acuerdo < ${MIN_AGREEMENT} → NO aplicada`, !idx.index.has("m1") && !idx.units.find((u) => u.unitKey === "b:lio").applied);
check("unidad con una sola pasada → no cuenta", !idx.index.has("z1"));
check("unidad deshabilitada a mano → no cuenta", !idx.index.has("q1"));

console.log("\n=== GATES QUE CLAUDE NO LEVANTA ===");
check("Malbec ≠ Cabernet (varietal)", sommelierGate("Trapiche Medalla Malbec", "Trapiche Medalla Cabernet Sauvignon") === "varietal");
check("rosado ≠ tinto (color)", sommelierGate("Trumpeter Malbec Rosé", "Trumpeter Malbec Tinto") === "color");
check("tardío ≠ seco (dulzor)", sommelierGate("Norton Cosecha Tardía", "Norton Blanco") === "dulzor");
check("paraje SÍ se levanta (Exploración Casa Blanca)", sommelierGate("Las Perdices Exploración Sauvignon Blanc", "Las Perdices Exploración Casa Blanca Sauvignon Blanc") === null);
check("abreviatura SÍ (A COLORADA ANCELL)", sommelierGate("Ala Colorada Ancellotta", "LAS PERDICES A COLORADA ANCELL") === null);

console.log("\n=== APLICACIÓN SOBRE GRUPOS ===");
const offer = (name, price = 20000, extra = {}) => ({ name, priceArs: price, inStock: true, comparable: true, ...extra });
const mkIdx = (pairs, out = []) => ({
  index: new Map(pairs.map(([raw, cls, nombre]) => [nameKey(raw), { cls, wine: { nombre: nombre ?? cls } }])),
  out: new Set(out.map(nameKey)),
});
const median = (g) => {
  const p = g.offers.filter((o) => o.comparable).map((o) => o.priceArs).sort((a, b) => a - b);
  return p.length >= 3 ? p[Math.floor(p.length / 2)] : null;
};
const helpers = {
  rawName: (o) => o.name,
  canonOf: (g) => g.offers[0].name,
  pricesCompatible: (a, b) => {
    const ma = median(a), mb = median(b);
    return ma === null || mb === null || (ma / mb <= 1.6 && mb / ma <= 1.6);
  },
};
{
  const groups = new Map([
    ["fb|ls|sangre", { wine: null, offers: [offer("De Sangre Malbec"), offer("De Sangre Malbec"), offer("Luigi Bosca De Sangre Malbec")] }],
    ["fb|ls|sangre-doc", { wine: null, offers: [offer("LUIGI BOSCA SANGRE MALBEC DOC"), offer("LUIGI BOSCA SANGRE MALBEC DOC")] }],
    ["cat|ls-sangre", { wine: { id: "ls-sangre" }, offers: [offer("Vino De Sangre Malbec 750")] }],
  ]);
  const st = applySommelier(groups, mkIdx([
    ["De Sangre Malbec", "C1"], ["Luigi Bosca De Sangre Malbec", "C1"], ["LUIGI BOSCA SANGRE MALBEC DOC", "C1"], ["Vino De Sangre Malbec 750", "C1"],
  ]), helpers);
  check("tres fichas del mismo vino → una", groups.size === 1 && st.fusiones === 2, `${groups.size} grupo(s)`);
  check("sobrevive la ficha del catálogo", groups.has("cat|ls-sangre") && groups.get("cat|ls-sangre").offers.length === 6);
}
{
  const groups = new Map([
    ["caro", { wine: null, offers: [offer("Caro", 180000), offer("Caro", 175000), offer("Caro", 190000)] }],
    ["petit", { wine: null, offers: [offer("Petit Caro", 30000), offer("Petit Caro", 31000), offer("Petit Caro", 29000)] }],
  ]);
  const st = applySommelier(groups, mkIdx([["Caro", "C1"], ["Petit Caro", "C1"]]), helpers);
  check("Caro + Petit Caro aunque Claude diga 'mismo' → precio lo bloquea", groups.size === 2 && st.bloqueadasPrecio === 1);
}
{
  const groups = new Map([
    ["m", { wine: null, offers: [offer("Trapiche Medalla Malbec")] }],
    ["c", { wine: null, offers: [offer("Trapiche Medalla Cabernet Sauvignon")] }],
  ]);
  const st = applySommelier(groups, mkIdx([["Trapiche Medalla Malbec", "C1"], ["Trapiche Medalla Cabernet Sauvignon", "C1"]]), helpers);
  check("Malbec + Cabernet aunque Claude diga 'mismo' → gate de varietal lo bloquea", groups.size === 2 && st.bloqueadasGate === 1);
}
{
  // Quimera: Serie A adentro de Concreto. Claude dice que Serie A es otro vino.
  const groups = new Map([
    ["concreto", { wine: null, offers: [offer("Zuccardi Concreto Malbec", 44000), offer("Zuccardi Concreto Malbec", 45000), offer("Concreto Paraje Altamira", 44500), offer("Zuccardi Serie A Malbec", 6200)] }],
    ["seriea", { wine: null, offers: [offer("Serie A Malbec Zuccardi", 6100), offer("Serie A Malbec Zuccardi", 6300)] }],
  ]);
  const st = applySommelier(groups, mkIdx([
    ["Zuccardi Concreto Malbec", "CON"], ["Concreto Paraje Altamira", "CON"], ["Zuccardi Serie A Malbec", "SA"], ["Serie A Malbec Zuccardi", "SA"],
  ]), helpers);
  check("Serie A sale de Concreto y va a su ficha", groups.get("concreto").offers.length === 3 && groups.get("seriea").offers.length === 3 && st.mudadas === 1);
}
{
  // Vino sin ficha propia: las ofertas de dos grupos van a UNA ficha nueva.
  const groups = new Map([
    ["g1", { wine: null, offers: [offer("Norton Reserva Malbec"), offer("Norton Reserva Malbec"), offer("Norton Lote La Colonia Malbec")] }],
    ["g2", { wine: null, offers: [offer("Norton Malbec"), offer("Norton Malbec"), offer("NORTON LOTE LA COLONIA MALBEC")] }],
  ]);
  applySommelier(groups, mkIdx([
    ["Norton Reserva Malbec", "R"], ["Norton Malbec", "M"], ["Norton Lote La Colonia Malbec", "LC"], ["NORTON LOTE LA COLONIA MALBEC", "LC"],
  ]), helpers);
  const nuevas = [...groups.keys()].filter((k) => k.startsWith("som|"));
  check("vino sin ficha → una sola ficha nueva para las ofertas de dos grupos", nuevas.length === 1 && groups.get(nuevas[0]).offers.length === 2, nuevas.join(","));
}
{
  // Un grupo sin mayoría decidida no se fusiona entero.
  const groups = new Map([
    ["big", { wine: null, offers: [offer("X Malbec"), offer("X Malbec"), offer("X Malbec Raro 1"), offer("X Malbec Raro 2"), offer("X Malbec Raro 3")] }],
    ["other", { wine: null, offers: [offer("X Malbec 750")] }],
  ]);
  const st = applySommelier(groups, mkIdx([["X Malbec 750", "C1"], ["X Malbec Raro 1", "C1"]]), helpers);
  check("grupo con < 50 % decidido no se fusiona entero", groups.has("big") && groups.get("big").offers.length >= 4 && st.fusiones === 0);
}
{
  // Nunca vaciar un grupo.
  const groups = new Map([
    ["solo", { wine: null, offers: [offer("Aceite Cortijo")] }],
  ]);
  applySommelier(groups, mkIdx([], ["Aceite Cortijo"]), helpers);
  check("un grupo nunca queda vacío", groups.get("solo")?.offers.length === 1);
}
{
  // dryRun no toca nada.
  const groups = new Map([
    ["a", { wine: null, offers: [offer("De Sangre Malbec")] }],
    ["b", { wine: null, offers: [offer("LUIGI BOSCA SANGRE MALBEC DOC")] }],
  ]);
  const st = applySommelier(groups, mkIdx([["De Sangre Malbec", "C1"], ["LUIGI BOSCA SANGRE MALBEC DOC", "C1"]]), { ...helpers, dryRun: true });
  check("SOMMELIER_APPLY=0 cuenta pero no fusiona", st.fusiones === 1 && groups.size === 2);
}

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
