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
| Jev sobre pares SIN código de barras: misma bodega, varietal, color, dulzor, parajes y ediciones, línea de uno contenida en la del otro y sin gate (~1.550 candidatos); ≥0,97 fusiona (27/09: la franja 0,95–0,97 tuvo ~8 % de fusiones dudosas), destilados y bundles fuera, un "distinto" explícito veta cualquier cadena que junte esas fichas, y si >60 % sale "mismo" no se fusiona nada | `build-groups-v2.mjs` (jev por nombre) | "Wapisa Malbec" / "Wapisa Malbec de la Patagonia" sin tocar "Lagarde Malbec" / "Lagarde Guarda Malbec" |
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

## Reglas agregadas el 2026-09-30 (precio como evidencia de identidad)

Auditando las dispersiones de precio del snapshot publicado aparecieron
quimeras nuevas que ninguna regla de texto podía ver: "Caro" ($190.000)
adentro de "Petit Caro" ($47.000), "Saint Felicien Tributo a Fernando
Maza" adentro de "Saint Felicien Malbec", "Pulenta Estate Gran Merlot"
adentro de "Estate Merlot", "Cobos Malbec" ($500.000) adentro de "Felino
Malbec", "Santa Julia Dulce Natural 269 ml" compitiendo como botella de
750 (y publicada como "baja del 52%" en /ofertas).

| Regla | Dónde | Qué arregla |
|---|---|---|
| Tokens de identidad sólo de las FRASES presentes (`identityPhraseTokens`): "petit" se descarta si aparece "petit verdot", no siempre; "alta" sólo con "alta gama"; "cabernet sauvignon" es una frase | `stage4-token-merge.mjs` (`lineTokens`) | Petit Caro ≠ Caro; Alta Vista conserva "alta" |
| Volumen explícito en ml/cc de cualquier tamaño (269, 700, 620) es formato, no botella de 750 | `volMl` | la botellita de 269 ml deja de ser "oferta" |
| "box" es pack; "viña" no es línea; "750c" es volumen | `PACK_WORD_RE`, `CONTENT_STOPWORDS`, `contentTokens` | Box Gran Medalla no compite; Viña Cobos = Cobos |
| Guarda de precio en TODA fusión (EAN, Jev por barcode, Jev por nombre, fold): medianas comparables a >1,6× no se juntan, aunque el texto o Jev digan que sí | `build-groups-v2.mjs` (`pricesCompatible`) | Gran Merlot no entra en Estate Merlot por un EAN reusado |
| Partidor por precio incoherente: dentro de un grupo, una firma de línea minoritaria (≥2 ofertas) con mediana a ≥1,6× (o ≤1/1,6) del resto se va a su propio grupo, con clave estable `::sub-<firma>` | `build-groups-v2.mjs` | Tributo sale de Saint Felicien; Cobos sale de Felino; Don Nicanor de Nieto Senetiner; Alamos Selección de Alamos |

Medido sobre el corpus del 30/09: 14 grupos partidos, 18 fusiones
bloqueadas por precio, fichas con dispersión ≥3× entre vinotecas 106 → 71.
La guarda sólo opina con ≥3 precios comparables de cada lado; con menos,
no bloquea (no inventa evidencia).

## Reglas agregadas el 2026-10-01 ("dulce" es dulzor, no color)

La ficha `colon-dulce` tenía adentro "Vino Tinto Dulce Colón", "Vino Blanco
Dulce Colón" y "Champaña Colón Dulce": tres vinos, una página, un solo
min/max. La causa no era Colón: `colorOf()` trataba "dulce" (y "tardío",
"cosecha tardía", "late harvest") como un COLOR más, con prioridad sobre
tinto/blanco/espumante. Toda oferta que dijera "dulce" perdía su color
real y caía con las demás "dulces" de la bodega (961 ofertas con "dulce" +
color explícito, 368 fichas afectadas; lo mismo con Dilema, Santa Julia
Dulce Natural, Federico de Alvear, Callia, Estancia Mendoza).

| Regla | Dónde | Qué arregla |
|---|---|---|
| "dulce"/"tardío"/"cosecha tardía"/"late harvest" salen de `COLOR_RE`; el color es tinto/blanco/rosado/naranjo/espumante o nulo | `stage4-token-merge.mjs` (`SWEET_STILL_RE`) | un tinto dulce es TINTO |
| El dulzor de un vino tranquilo es `"dulce"` o nulo (los espumantes siguen con brut/extrabrut/demisec/nature/dulce) | `lib-offer-identity.mjs` (`parseOffer`) | la clave de fallback separa tinto dulce, blanco dulce y champaña dulce |
| Gate de dulzor en tranquilos: un lado dulce y el otro no → conflicto (antes lo frenaba el color de casualidad) | `identityConflict` | Norton Cosecha Tardía ≠ Norton Blanco; Cordero Rosé ≠ Cordero Blanco Dulce |
| El tipo "Dulce" del sitio (facet) sale del DULZOR del grupo, no del color | `build-groups-v2.mjs` (`type`) | un tinto dulce sigue apareciendo en "Dulces" |
| "lata"/"latas" es FORMATO (`parseOffer.lata`), no línea ni botella: no comparable aunque no diga los ml, badge "Lata" en la ficha | `lib-offer-identity.mjs` (`LATA_RE`, `isComparable`, `variantKey`), `lib-identity.mjs` (stopword), `build-groups-v2.mjs`, `lib/snapshot.ts` | 506 ofertas en lata (183 sin volumen) dejan de competir como botella de 750; "Tinto Dulce Lata" deja de ser una línea |
| Migración del catálogo: entradas minadas con `color: "dulce"` pasan a `color: null, dulzor: "dulce"` sin tocar el id | `build-wine-catalog.mjs` (merge incremental) | 90 entradas (Santa Julia Dulce Natural, El Esteco Tardío, Rutini Encabezado...) siguen matcheando |

Medido sobre el corpus del 30/09 (catálogo reconstruido con la regla
nueva): fichas dulces que mezclaban ≥2 colores explícitos 27 → 5;
fichas tipo Dulce 724 → 895 (los tintos y rosados dulces que antes
quedaban como Tinto/Rosado). El caso dorado Colón Select Frutos Rojos
(overlay manual) pasa a declarar `dulzor: "dulce"` y junta sus 4 ofertas en
una ficha (antes 3 + 1). Harness: +9 casos (tinto dulce ≠ blanco dulce,
champaña dulce ≠ tinto dulce, tardía ≠ seco, rosé ≠ blanco dulce, y
"Dilema Dulce" = "Vino Blanco Dilema Dulce" sigue compatible; lata = misma
clave, no comparable).

### Títulos: el color y el dulzor que faltaban (2026-10-01, PRs #195 y siguiente)

Al separar las fichas dulces por color apareció el síntoma siguiente: dos
páginas de la misma bodega con el MISMO título. Medido sobre el snapshot
del 01/10 (fichas con ≥2 vinotecas): 72 pares de títulos repetidos dentro
de una bodega. Dos causas, dos reglas:

| Regla | Dónde | Qué arregla |
|---|---|---|
| El frontend sacaba el prefijo "Vino tinto/blanco" siempre; ahora lo conserva si lo que queda son sólo palabras genéricas (dulce, seco, natural, tardío…) y la bodega | `lib/wineNames.ts` (`stripShelfNoise(name, brand)`) | "Tinto Dulce Colon" ≠ "Blanco Dulce Colon" (antes las dos eran "Dulce Colon") |
| El título de una ficha del catálogo era línea + expresión + varietal; si el color no es tinto y el varietal no lo implica, se agrega ("Killka Malbec Blanco", "Dilema Rosé"); si hay dulzor y el nombre no lo dice, se agrega ("Trumpeter Extra Brut", "Callia Tardío Dulce" no, porque "tardío" ya lo dice) | `build-groups-v2.mjs` (bloque "Distinguidores que faltaban") | Trumpeter ×3, Codorníu María ×3, Santa Isabel Champaña ×3, Alaris blanco/tinto dulce, Quimera tinto/blanco |

Resultado: títulos repetidos 72 → 68 con la regla del frontend (snapshot
publicado del 01/10). La del pipeline, medida sobre el corpus reconstruido
del 30/09 con el mismo catálogo: 61 → 35, con 327 títulos
que cambian (sufijos "Blanco", "Rosé", "Espumante", "Extra Brut", "Brut
Nature", "Demi Sec", "Dulce"). Los repetidos que quedan son casi todos dos
fichas del MISMO vino que el pipeline todavía no une (Colomé 1831, Felino
Blend, Piattelli Gran Reserva), no dos vinos con el mismo nombre. Al lado, la cerveza salió del sitio
(`BEER_RE` en `lib/junkSlugs.ts`: 105 fichas, 0 vinos afectados) y
`/ofertas` filtra sus bajas por `findGroup`, así ningún no-vino vuelve a
aparecer como "baja del día".

## Sommelier: Claude revisa el catálogo bodega por bodega (2026-10-07)

Medición del 07/10 sobre el snapshot publicado: de 16 vinos conocidos
elegidos al azar, **los 16** tenían fichas duplicadas al lado de la principal.
De Sangre Malbec estaba en ~12 fichas (una de 20 tiendas y otra de 12:
"LUIGI BOSCA SANGRE MALBEC DOC"), El Gran Enemigo Cepillo en 3, Colonia Las
Liebres en 4, Ala Colorada Ancellotta en 4 ("LAS PERDICES A COLORADA
ANCELL"). Catena Zapata tenía 503 fichas; Rutini 383; Las Perdices 338. Cada
regla de texto cierra una forma de escribir el nombre y cada tienda inventa
otra: la cola no se termina con reglas. Lo que falta es saber de vinos.

**Qué hace.** `scripts/sommelier.mjs` le muestra a Claude cada bodega con
TODAS sus fichas a la vez —los nombres tal como los escribe cada tienda, con
cuántas ofertas y su precio— y Claude devuelve la lista de vinos reales y qué
vino es cada ficha (o si es de otra bodega, si no es vino, si es un pack
mixto, o qué ofertas están en la ficha equivocada). Antes, dos pasos
baratos: agrupar los nombres de bodega que son la misma (familias:
"Escorihuela" / "Escorihuela Gascón", "DV Catena" → Catena Zapata) y
atribuir bodega a las ~5.900 fichas que no tienen.

**Por qué no fabrica quimeras** (`scripts/lib-sommelier.mjs`):

| Freno | Qué evita |
|---|---|
| Cada bodega se juzga **dos veces**, con las fichas en otro orden y otras etiquetas; sólo se aplica lo que coincide en las dos | un error aislado del modelo |
| Una bodega cuyas dos pasadas coinciden en < 80 % no se aplica (queda en `status` y en el report) | bodegas donde el modelo adivina |
| Nunca contra un gate de **tipo, color, dulzor o varietal** (lo que el nombre dice explícito) | Medalla Malbec ⊕ Medalla Cabernet |
| Nunca contra la **guarda de precio** (medianas a > 1,6×) | Caro ⊕ Petit Caro |
| Corre **antes** del partidor por precio incoherente | lo que se escape, se vuelve a partir |
| Un grupo se fusiona entero sólo si ≥ 50 % de sus ofertas tiene veredicto | fusionar por una oferta suelta |
| `disabled` en `verdicts.json` apaga una bodega a mano; `SOMMELIER_APPLY=0` mide sin tocar | — |

Sí levanta los gates de nivel/paraje y edición: ahí es donde las tiendas
escriben distinto ("Exploración Casa Blanca Sauvignon Blanc" = "Exploración
Sauvignon Blanc") y donde hace falta conocimiento (Serie A ≠ Concreto).

**Veredictos por nombre, no por ficha.** Se guardan por `nameKey` (nombre de
la tienda sin acentos, puntuación ni añada; congelada a propósito, no usa
`canonicalizeName`). Sobreviven a los cambios diarios del agrupador, y una
oferta nueva con un nombre ya visto cae sola en su vino. Una bodega vuelve a
la cola cuando junta ≥ 5 nombres nuevos (o el 10 %).

**Costo y ritmo.** Message Batches API (mitad de precio) con los créditos
mensuales del plan de Claude (Max 5x: $100/mes; Max 20x: $200/mes; vencen
al cerrar el ciclo, así que conviene gastarlos). Vuelta completa estimada:
~$160 para 2.034 bodegas × 2 pasadas (el costo real se registra por pedido
en `data/sommelier/state.json`). El workflow corre cada hora, junta el
batch anterior y manda el siguiente hasta el tope del ciclo
(`SOMMELIER_BUDGET_USD`, default 90); empieza por las bodegas que más
ofertas mueven.

**Prueba con datos reales** (offers reconstruidas del snapshot del 07/10,
veredicto armado a mano con los casos de arriba): De Sangre Malbec pasa de
20 a **25 tiendas en una ficha** (Altamira, Los Miradores y los estuches
mixtos quedan aparte); Ala Colorada Ancellotta de 16 a 19; los veredictos
trampa "Caro = Petit Caro" y "Medalla Malbec = Medalla Cabernet" quedan
bloqueados por precio y por varietal. Casos dorados en
`scripts/test-sommelier.mjs` (bloqueante en los dos workflows).

**Operación:**

```bash
node scripts/sommelier.mjs status                 # avance, gasto del ciclo, batch en vuelo
node scripts/sommelier.mjs run --dry-run          # qué mandaría y cuánto costaría
node scripts/sommelier.mjs probe "Las Perdices"   # una bodega en vivo (sin batch, sin guardar)
```

Archivos: `data/sommelier/verdicts.json` (veredictos, familias,
atribuciones), `state.json` (batch en vuelo, gasto por ciclo, log),
`apply-report.json` (qué fusionó/mudó/bloqueó el último publish, con
ejemplos para auditar).
