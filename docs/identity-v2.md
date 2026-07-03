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
