/**
 * lib-catalog-manual.mjs — el overlay curado a mano sobre el catálogo.
 *
 * `data/catalog-manual.json` es el único archivo de data/ que se edita a
 * mano. Es la fuente de MÁXIMA autoridad del sistema de identidad: gana
 * sobre el minado por tokens y sobre el LLM.
 *
 * POR QUÉ UN ARCHIVO APARTE. `data/wine-catalog.json` ya conserva las
 * correcciones humanas (el builder mergea por id y lo previo gana), así
 * que técnicamente se podía editar ahí. Pero eso es una edición humana
 * viviendo adentro de un archivo que la máquina reescribe todas las
 * madrugadas: sin registro de quién puso qué ni por qué, y cualquier
 * rebuild desde cero, conflicto de merge o reset la borra en silencio.
 * Acá cada entrada lleva su `nota` y nadie la pisa.
 *
 * SE APLICA COMO LENTE DE LECTURA, no como estado horneado: lo llaman
 * tanto build-wine-catalog.mjs (para que el archivo publicado refleje lo
 * curado) como build-groups-v2.mjs (para que la agrupación salga bien
 * AUNQUE el paso del catálogo se haya salteado — corre con
 * continue-on-error y sin OPENAI_API_KEY se saltea entero). Aplicarlo
 * dos veces es idempotente.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANUAL_PATH = resolve(__dirname, "..", "data/catalog-manual.json");

/**
 * Aplica el overlay sobre un array de vinos, in place.
 *
 * Dos operaciones, las dos por `id`:
 *   · `wines[]` — si el id existe, lo pisa campo a campo (los campos que
 *     no declarás se conservan, así se corrige una bodega mal atribuida
 *     sin reescribir la entrada entera); si no existe, lo agrega.
 *   · `vetos[]` — ids que no deben existir, para líneas que el LLM
 *     inventó.
 *
 * @returns {{added:number,patched:number,removed:number,total:number}}
 */
export function applyManualOverlay(wines, { path = MANUAL_PATH } = {}) {
  const stats = { added: 0, patched: 0, removed: 0, total: 0 };
  if (!existsSync(path)) return stats;

  let manual;
  try {
    manual = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    // Un overlay ilegible es un error de quien lo editó, y seguir sin él
    // publicaría el catálogo mal justo en las fichas que alguien se tomó
    // el trabajo de curar. Romper acá es lo correcto: los pasos que lo
    // llaman son bloqueantes y el sitio se queda con lo de ayer.
    throw new Error(`data/catalog-manual.json ilegible: ${e.message}`);
  }

  const byId = new Map(wines.map((w, i) => [w.id, i]));

  for (const entry of manual.wines ?? []) {
    if (!entry?.id) continue;
    stats.total++;
    // `nota` es documentación para humanos; no se publica al catálogo.
    const { nota, ...fields } = entry;
    void nota;
    const at = byId.get(entry.id);
    if (at === undefined) {
      wines.push({
        varietal: null,
        color: null,
        dulzor: null,
        lineAliases: [],
        parajesNoDistinguen: [],
        tiersNoDistinguen: [],
        offerCount: 0,
        storeCount: 0,
        ...fields,
        manual: true,
      });
      byId.set(entry.id, wines.length - 1);
      stats.added++;
    } else {
      wines[at] = { ...wines[at], ...fields, manual: true };
      stats.patched++;
    }
  }

  const vetos = new Set(manual.vetos ?? []);
  if (vetos.size > 0) {
    for (let i = wines.length - 1; i >= 0; i--) {
      if (vetos.has(wines[i].id)) {
        wines.splice(i, 1);
        stats.removed++;
        stats.total++;
      }
    }
  }

  return stats;
}

// ── Correcciones del sommelier (data/sommelier/catalog-fixes.json) ──
// Lo escribe scripts/sommelier.mjs con el consenso de las dos pasadas de
// Claude sobre los alias y los nombres de línea del catálogo minado (13/10:
// "nieto senetiner" era alias de Don Nicanor Malbec, "atamisque" de
// Catalpa, "noemia" de A Lisa: la oferta con bodega + varietal a secas
// caía en otra línea). Es un archivo de máquina, así que se aplica ANTES
// del overlay manual: lo curado a mano siempre gana.
//
// En sombra hasta que alguien revisa una muestra: sólo se aplica con
// `apply: true` en el archivo o SOMMELIER_CATALOG_APPLY=1.
const FIXES_PATH = resolve(__dirname, "..", "data/sommelier/catalog-fixes.json");

/**
 * Entradas: { id, quitarAliases?: string[], linea?: string }. Quitar
 * todos los alias deja la línea como único alias: una lista vacía
 * significa "línea vacía" para el índice del catálogo, justo el error
 * que se está corrigiendo.
 * @returns {{patched:number,total:number,apply:boolean}}
 */
export function applyCatalogFixes(wines, { path = FIXES_PATH, apply } = {}) {
  const stats = { patched: 0, total: 0, apply: false };
  if (!existsSync(path)) return stats;
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // Archivo de máquina: ilegible = sin correcciones, no un error de nadie.
    return stats;
  }
  stats.total = doc.wines?.length ?? 0;
  stats.apply = apply ?? (doc.apply === true || process.env.SOMMELIER_CATALOG_APPLY === "1");
  if (!stats.apply) return stats;
  const byId = new Map(wines.map((w, i) => [w.id, i]));
  for (const fx of doc.wines ?? []) {
    const at = byId.get(fx?.id);
    if (at === undefined) continue;
    const w = { ...wines[at] };
    let changed = false;
    if (typeof fx.linea === "string" && fx.linea.trim() && fx.linea !== w.linea) {
      w.linea = fx.linea.trim();
      changed = true;
    }
    if (fx.quitarAliases?.length) {
      const drop = new Set(fx.quitarAliases);
      // Sin alias el índice usa [""] (build-groups-v2): también se puede quitar.
      const cur = w.lineAliases?.length ? w.lineAliases : [""];
      const kept = cur.filter((a) => !drop.has(a));
      if (kept.length !== cur.length) {
        w.lineAliases = kept.length ? kept : [w.linea.toLowerCase()];
        changed = true;
      }
    }
    if (changed) {
      w.sommelierFix = true;
      wines[at] = w;
      stats.patched++;
    }
  }
  return stats;
}
