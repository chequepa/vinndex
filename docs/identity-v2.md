# Identidad v2 — rediseño del sistema de agrupación de vinos

**Estado: SHADOW** (corre en el daily-scrape sin tocar lo publicado). Cutover pendiente de validar el report diario.

## Por qué se rediseñó

El caso testigo (2026-07-03): [/vino/concreto-malbec-zuccardi](https://vinndex.com.ar/vino/concreto-malbec-zuccardi) mezclaba **Zuccardi Serie A** ($6.180) adentro de la ficha de **Concreto** ($44.500) — dos vinos distintos — más 375ml, magnums, cajas x6, estuches y venta por copa compitiendo en el mismo "mejor precio". Y el mismo Concreto tenía una segunda ficha huérfana ([altamira-concreto-malbec-paraje-zuccardi](https://vinndex.com.ar/vino/altamira-concreto-malbec-paraje-zuccardi)) porque una tienda lo lista con el paraje en el nombre.

### El problema estructural del sistema v1

```
identidad v1 = token-set ordenado del nombre (sin año, sin volumen, sin stopwords)
             + 7 capas de merge/split que se corrigen entre sí:
  Stage 0    EAN union ciega          → sin gates, sin log de pares
  Stage 1    clave por tokens          → parte el mismo vino por marca/paraje/ruido
  Stage 1.5  merge por imagen          → gates razonables, chico
  Stage 2    merge por embeddings ≥.93 → SIN conocimiento de línea (⇒ Serie A ⊕ Concreto)
  Stage 3    LLM par-a-par             → yes aplicados SIN validación, cache stale
  Stage 4    remerge por bucket        → strippeaba la línea (⇒ Medalla ⊕ Alaris ⊕ Don David)
  Stage 5    split de quimeras         → repara una fracción de lo que 2-4 rompieron
  Stage 6    token-merge gateado       → la única capa blindada (harness dorado)
  Stage 6.5  LLM sobre cola gris       → yes validados por gates
```

Tres propiedades imposibles de arreglar con parches:

1. **El formato no es parte de la identidad**: 375ml, magnum, caja x6, estuche y "por copa" caen en el mismo grupo que la botella de 750 desde Stage 1 (el tokenizado borra el volumen). La comparación de precios — el producto central — compara SKUs incomparables.
2. **Las decisiones de merge son par-a-par y sin conocimiento**: "¿estos dos grupos son el mismo vino?" no se puede responder con similitud de texto cuando la respuesta depende de saber que *Serie A y Concreto son líneas distintas de Zuccardi* y que *Concreto solo se embotella en Paraje Altamira* (mientras que Aluvional tiene parajes múltiples que SÍ distinguen). El gate de parcela genérico hace lo correcto con Aluvional y lo incorrecto con Concreto — sin catálogo no hay regla que acierte en ambos.
3. **Los slugs son inestables**: la clave depende de qué merges ganaron ese día; la quimera fue `malbec-serie-zuccardi` el 28/6 y `concreto-malbec-zuccardi` el 2/7. Solo Stages 6/6.5 dejan redirects.

## El diseño v2

**Invertir la pregunta**: en vez de "¿estos dos grupos son iguales?" (O(n²), sin contexto), "¿QUÉ vino es esta oferta?" (O(n), contra un catálogo con conocimiento).

```
oferta → parseOffer() ──────────────→ asignación contra wine-catalog ──→ página por VINO
         determinístico, por oferta   exact match / herencia varietal     variantes adentro
```

### Las tres piezas

**1. `scripts/lib-offer-identity.mjs` — parser por oferta.**
Convierte cada nombre en identidad estructurada usando los extractores del harness dorado (los de `stage4-token-merge.mjs`):

```
VINO     (define la página) : bodega + línea + varietal + color/dulzor + expresión
VARIANTE (dentro de página) : volumenMl (default 750) + pack + estuche/copa + vintage
```

**2. `data/wine-catalog.json` — el catálogo (el activo nuevo).**
Entradas `(bodega, línea, varietal)` con el conocimiento por línea que ningún gate puede inferir:
- `lineAliases`: variantes de nombre que son la misma línea
- `parajesNoDistinguen`: parajes que son parte del nombre completo del único vino (ej. "paraje altamira" en Concreto) — se descartan de la clave
- `tiersNoDistinguen`: ídem para reserva/gran cuando toda la línea los lleva (Don David Reserva)

Minado del corpus + validación con gpt-4o-mini (`scripts/build-wine-catalog.mjs`), cache eterno en `data/catalog-llm-cache.json` (solo candidatos nuevos van al LLM: centavos/día). **Curable a mano y las curaciones sobreviven** — el builder no pisa entradas existentes.

**3. `scripts/build-groups-v2.mjs` — el agrupador.**
- Grupo = vino del catálogo (o clave estructurada de fallback si el catálogo no lo cubre — nunca peor que v1).
- `minPrice`/stats/"ahorrá X%" salen SOLO de ofertas **comparables**: botella suelta 750ml, sin estuche/copa, con stock, no-collector. El resto queda en `variants[]` para la sección "otros formatos" de la ficha.
- **Slugs estables**: cada vino conserva el slug v1 que domina (SEO intacto); los slugs v1 absorbidos van al mapa de redirects (`identity-v2-report.json → redirectMap`), que en el cutover se vuelca a `data/group-merges.json` (la infra 308 existente en `app/vino/[slug]/page.tsx` los sirve sin cambios).

### Qué pasa con las ofertas que el catálogo no cubre

Fallback determinístico: `bodega|línea|varietal|color|dulzor|discriminadores|ediciones`. Es la clave v1 mejorada (sin volumen/pack adentro, con línea explícita). La cola sin bodega resoluble se agrupa por esa clave igual — la cobertura del catálogo crece incremental con cada corrida.

## Plan de cutover

1. **Shadow (ahora)**: el daily-scrape corre v2 al final y commitea `wine-catalog.json` + `identity-v2-report.json`. Comparar durante unos días: grupos, multi-tienda, casos dorados, dispersión de precios.
2. **Cutover**: `build-groups-v2.mjs --out data/snapshot.json` reemplaza a build-groups + stages 0-6.5; se vuelca `redirectMap` a `group-merges.json`; la UI gana la sección "otros formatos" leyendo `variants[]` y el flag `comparable` por oferta.
3. **Retiro**: stages 1.5/2/3/4/5 se borran (−2h de cron, −$LLM de pares); Stage 6/6.5 quedan como red de seguridad inicial sobre los grupos v2 y el harness dorado sigue gateando todo.

## Validación (harness dorado)

`scripts/test-matching.mjs` — corre en CI antes de publicar; corta el build si falla:
- 18 negativos + 5 positivos de gates (v1, intactos)
- 10 casos de `lineRelation` (política de merge: equal=auto, subset=LLM, crossing/disjoint=humano)
- 9 de `secondaryKey` (remerge no borra líneas)
- 7 del parser v2 (claves + comparabilidad: Serie A ≠ Concreto, 375/magnum/caja/estuche fuera de comparables)

## Reglas agregadas el 2026-09-13 (auditoría de producto)

La auditoría del 13/09 midió el sitio publicado: 39.485 fichas para 74.280
ofertas, el 90 % en clave de fallback y **sin bodega** (el `brand` salía sólo
del catálogo), el mismo DV Catena Malbec-Malbec en 7 fichas separadas por
puntuación ("D.V." / "D,V," / "D. V."), las líneas de Rutini partidas en
dos por el discriminador "colección", y títulos heredados de una tienda
cualquiera. Todo se resolvió con reglas generales del pipeline (nada
curado a mano salvo dos entradas del LLM que estaban mal):

| Regla | Dónde | Qué arregla |
|---|---|---|
| `canonicalizeName()`: iniciales de 2 letras → una palabra, elisión "L'", romanos → arábigos | `lib-identity.mjs`, aplicado en `parseOffer`, `contentTokens`, `lineTokens`, `editionNums` | D.V. Catena ≡ DV Catena; L'Esploratore ≡ L´ESPLORATORE; Antología XXXVIII ≡ 38 |
| Ruido de retail fuera de la línea (unidades, lts, botellón, estuche de madera, "x 1u") | `CONTENT_STOPWORDS`, `contentTokens` | "caja x 6 unidades" ya no abre ficha |
| Etiqueta → bodega madre (DV Catena, Saint Felicien, Nicasia, Trumpeter, Apartado, Felino, Gran Enemigo) | `NAME_PREFIX_TO_BRAND` | la etiqueta queda como línea; /bodegas sin bodegas fantasma |
| Marca de scraper sin cola de producto + colapso de bodegas por corpus (`buildBodegaCollapser`) | `lib-offer-identity.mjs` | "Nampe Malbec 750 cc" → Nampe; "Manos Negras Artesano" → Manos Negras + línea Artesano |
| `brand` de los grupos sin catálogo = bodega mayoritaria parseada | `build-groups-v2.mjs` (`pickBrand`) | 35.713 → ~5.300 fichas sin bodega |
| Título de fallback = nombre normalizado más frecuente | `pickCanonicalName` | ya no hereda el título más corto/raro |
| Fold de fallbacks: varietal/color nulo → único hermano; "X Malbec" → "X Blend Malbec" | `build-groups-v2.mjs` | "Rutini Antología 38" ≡ "Antología 38 Blend" |
| Discriminador contenido en la línea del catálogo no distingue; tiers del nombre de la línea son obligatorios para asignar | `wineKeyOf`, `assign` | Colección Cabernet ≡ Rutini Cabernet; "Medalla" ≠ "Gran Medalla" |
| Herencia estricta: dulzor igual, espumante sólo con espumante, color declarado tiene que coincidir | `assign` | Chandon Extra Brut ≠ Chandon Rosé |
| Alias implícito de la línea + unión de aliases al reconstruir el catálogo | `buildCatalogIndex`, `build-wine-catalog.mjs` | el catálogo re-aprende cuando cambia el parser |
| EAN sólo cuenta si lo cargan ≥2 tiendas; representante del grupo = nombre más frecuente | evidencia EAN | un barcode reusado por una tienda no fusiona |
| Slug: el registro cede ante la página dominante (≥2× ofertas) | registro de slugs | el DV Catena flagship no hereda `estuche-…-x3` |
| "vineyard" y "coleccion" dejan de ser tiers; parajes parciales canonicalizados (`PARCEL_ALIASES`) | `parcels.json`, `stage4-token-merge.mjs` | Nicasia Vineyard ≡ Nicasia; Cepillo ≡ El Cepillo |

Medido sobre el corpus publicado del 13/09 (ofertas reconstruidas desde el
snapshot): 39.485 → 36.050 fichas, 5.030 → 5.256 comparables multi-tienda,
fichas sin bodega 35.713 → 5.272. Harness: 85 casos (30 del parser v2).

## Reglas agregadas el 2026-09-26 (auditoría de duplicados)

Medición nueva, independiente del pipeline: **ofertas con el nombre
idéntico** (normalizado sólo por añada, volumen y ruido de retail) que
terminan en fichas distintas. Es el duplicado que no admite discusión.
En el sitio publicado del 26/09 eran **1.781**; el 97 % por la misma causa:
el mismo nombre terminaba con bodegas distintas según qué cargara cada
tienda en el campo marca ("El Enemigo", "Catena Zapata" o nada), y la
bodega es parte de la clave del vino.

| Regla | Dónde | Qué arregla |
|---|---|---|
| Consenso de bodega por nombre: una bodega por firma de nombre; gana la escrita en el nombre y reconocida por el catálogo; nunca decide entre dos bodegas que sólo vienen del campo marca | `build-groups-v2.mjs` (`bodegaInName`) | "Enemigo Malbec" en 3 fichas; "Michelini" vs "Michelini i Mufatto" |
| Etiqueta → bodega madre aprendida del catálogo (la "bodega" es parte del nombre de una línea de una casa más grande del catálogo) | `build-groups-v2.mjs` (`parentsOf`) | Lindaflor, Saurus, Fincas Notables, Mariflor, Alambrado… fuera de la ficha de su bodega |
| Marca placeholder o nombre de la tienda = marca vacía (habilita la inferencia por nombre); una "marca" que es paraje/color/varietal no se infiere | inferencia de marca | "Bianchi" con marca "SIN MARCA"; bodega "Flores" por "Vista Flores" |
| Catálogo: aliases re-tokenizados con el parser actual, el alias implícito entra aunque sea vacío, color efectivo por uva, entradas "SIN MARCA" fuera | `buildCatalogIndex` | "Chandon Extra Brut" no encontraba su entrada; Angélica Chardonnay con color null y blanco |
| Catálogo: entradas del mismo vino con y sin varietal/color se pliegan (un solo varietal y color en la línea; color faltante sólo se asume tinto) | `foldCatalogDuplicates` | Rutini Antología en 3 fichas por edición |
| Errores de tipeo aprendidos del corpus (palabra rara ≤2 tiendas → frecuente, distancia 1-2, con contexto) | `lib-typos.mjs` | "Saint Felicen", "Ruttini", "El Estaco", "Guatallary", "Yacuchaya" |
| Ruido de formato: código de tienda "(77590)", "750mlx1", "Bot-0.75-lt.", "Extra-Brut", "Champaña" como línea | `lib-identity.mjs` | ediciones y líneas fantasma |
| EAN con la añada pegada ("7794450090096-2023") cuenta como evidencia | `lib-ean.mjs` (`eanFromSku`) | 59 fichas fuera de la evidencia de código de barras |
| Jev también juzga dos entradas distintas del catálogo (≥0,95, sin gate) y levanta gates de nivel/paraje, edición o color (≥0,97); siempre con EAN en 2+ tiendas | `lib-jev.mjs` | catálogo con el mismo vino dos veces; "Perdenal", "Cap I", "Norton Ct" |
| Jev sobre pares SIN código de barras: misma bodega, varietal, color, dulzor, parajes y ediciones, línea de uno contenida en la del otro y sin gate (~1.550 candidatos); ≥0,95 fusiona, un "distinto" explícito veta cualquier cadena que junte esas fichas, y si >60 % sale "mismo" no se fusiona nada | `build-groups-v2.mjs` (jev por nombre) | "Wapisa Malbec" / "Wapisa Malbec de la Patagonia" sin tocar "Lagarde Malbec" / "Lagarde Guarda Malbec" |
| Un slug del registro sigue a su contenido: si sus ofertas de ayer hoy están mayormente en otra ficha, la URL queda libre y redirige | registro de slugs | al separar una quimera, la URL quedaba en la mitad chica |
| Las corridas en shadow leen la caché de Jev (sin escribirla) | `lib-jev.mjs` (`persist`) | medir en local lo mismo que producción |

Medido sobre el corpus del 26/09 (ofertas reconstruidas desde el snapshot,
misma corrida con y sin los cambios): nombres idénticos partidos **1.362 →
134**; fichas 35.683 → 34.127; comparables multi-tienda 5.484 → 5.536;
ofertas reconocidas por el catálogo 29 % → 35 %; 3.062 URLs de producción
pasan a 308 hacia su ficha consolidada, **0 quedan en 404**. Muestras de 90
fusiones nuevas revisadas a mano: sin quimeras. Lo que queda (134) son casos
genuinamente ambiguos (dos bodegas que sólo vienen del campo marca) o
líneas sin bodega en ninguna tienda. `CONSENSUS_TRACE=<archivo>` vuelca cada
movimiento del consenso para auditarlo.
