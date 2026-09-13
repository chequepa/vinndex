/**
 * Colapso del mapa de redirects 308 (data/group-merges.json).
 *
 * Por qué vive acá y no inline en build-groups-v2.mjs: tenía un bug que
 * sólo se ve con dos días de datos, y así se puede probar con un stub.
 *
 * EL BUG (encontrado el 13/09/2026). Hay vinos cuya wineKey alterna entre
 * dos valores de un día para otro (la bodega se parsea "escorihuela gascon"
 * un día y "escorihuela gascon sauvignon blanc" el siguiente). Las dos keys
 * quedan en wine-slugs.json con slugs distintos, así que la ficha salta
 * entre dos URLs:
 *
 *   12/09  vivo: …-750-ml    redirect acumulado: -2 → -750-ml
 *   13/09  vivo: -2          redirect nuevo:     -750-ml → -2
 *
 * Mezclados, forman el ciclo -750-ml → -2 → -750-ml. La detección de ciclos
 * descartaba la cadena entera, y la URL que Google tenía indexada quedaba
 * en 404 con 13 vinotecas vendiendo el vino en la otra. El 13/09 fueron 16
 * de las 18 fichas que cambiaron de slug y dieron 404.
 *
 * EL ARREGLO. Una página viva es un final de cadena: el runtime la sirve
 * antes de mirar merges, así que seguir de largo nunca tiene sentido. Con
 * eso el "ciclo" se corta en -2 (vivo) y el redirect sobrevive.
 */

/**
 * @param {Record<string,string>} allMerges — acumulado + nuevos + manuales
 * @param {Set<string>} liveSlugs — slugs publicados en esta corrida
 * @returns {Record<string,string>} origen → destino final, sin orígenes vivos
 */
export function collapseRedirects(allMerges, liveSlugs) {
  // Si volvemos a pisar un slug ya visto la cadena no tiene final y se
  // descarta entera (antes el tope de profundidad devolvía el slug del
  // medio, que dejaba encadenados).
  const finalDest = (slug) => {
    const seen = new Set([slug]);
    let cur = slug;
    while (allMerges[cur]) {
      const next = allMerges[cur];
      if (liveSlugs.has(next)) return next; // la página viva corta la cadena
      if (seen.has(next)) return null; // ciclo
      seen.add(next);
      cur = next;
    }
    return cur;
  };
  const resolved = {};
  for (const from of Object.keys(allMerges)) {
    if (liveSlugs.has(from)) continue; // la página viva gana
    const to = finalDest(from);
    if (to && to !== from) resolved[from] = to;
  }
  return resolved;
}
