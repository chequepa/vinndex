#!/usr/bin/env node
// Casos de las salvaguardas de scripts/bodega-notes.mjs (sin red).
import assert from "node:assert/strict";
import { validate, lastJsonObject, brandPageSlug } from "./bodega-notes.mjs";

const txt = "Rutini Wines es una bodega fundada en 1885 por Felipe Rutini en Mendoza. Hoy elabora sus vinos en Tupungato, en el Valle de Uco, y es conocida por líneas como Trumpeter.";
const seen = new Set(["https://www.rutini.com/historia/", "https://inv.gob.ar/x"]);

// Fuente vista (con www y barra final distintos) → ok; fuente inventada → descartada.
let v = validate({ encontrada: true, texto: txt, provincia: "Mendoza", fundacion: 1885, fuentes: ["https://rutini.com/historia", "https://inventada.com/a"] }, seen);
assert.equal(v.ok, true);
assert.deepEqual(v.note.fuentes, ["https://www.rutini.com/historia/"]);
assert.equal(v.note.fundacion, 1885);

// Sin ninguna fuente vista → no se guarda.
v = validate({ encontrada: true, texto: txt, fuentes: ["https://inventada.com/a"] }, seen);
assert.equal(v.ok, false);

// No encontrada, texto corto o largo → no se guarda.
assert.equal(validate({ encontrada: false }, seen).ok, false);
assert.equal(validate({ encontrada: true, texto: "corto", fuentes: ["https://inv.gob.ar/x"] }, seen).ok, false);
assert.equal(validate({ encontrada: true, texto: "x".repeat(901), fuentes: ["https://inv.gob.ar/x"] }, seen).ok, false);

// Año imposible o "null" como string → null.
v = validate({ encontrada: true, texto: txt, provincia: "null", fundacion: 3000, fuentes: ["https://inv.gob.ar/x"] }, seen);
assert.equal(v.note.fundacion, null);
assert.equal(v.note.provincia, null);

// JSON al final de un texto con llaves previas.
assert.deepEqual(lastJsonObject('Busqué {algo}. {"encontrada": false}'), { encontrada: false });
assert.equal(lastJsonObject("sin json"), null);

// Mismo slug que brandPageSlug() de lib/snapshot.ts.
assert.equal(brandPageSlug("Bodega Norton"), "norton");
assert.equal(brandPageSlug("Bodegas Salentein"), "salentein");
assert.equal(brandPageSlug("Catena Zapata"), "catena-zapata");
assert.equal(brandPageSlug("Ñandú Pérez"), "nandu-perez");

console.log("test-bodega-notes: ok");
