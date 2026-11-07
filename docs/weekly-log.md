# Bitácora semanal de Vinndex

La escribe el repaso semanal (tarea programada de los viernes, en la nube).
Cada entrada: números para comparar semana a semana, qué se hizo, qué quedó.
El **backlog vivo** está al final de la última entrada: la corrida siguiente
arranca por ahí.

---

## 2026-11-06 (viernes)

Primera entrada. Reemplaza al agente local de los domingos (corría en la Mac de
Juan y no se estaba ejecutando: los PRs del 30/10 quedaron una semana sin
mergear). El log viejo de ese agente vive fuera del repo
(`~/Desktop/Claude/PERSONAL/vinndex-weekly-log.md`); no se migró.

### Números

| | valor |
|---|---|
| tiendas activas (snapshot) | 126 (1 en cero: mercado-libre) |
| productos scrapeados | 84.617 (+9.799 vs. día anterior: Ligier + 17 altas) |
| fichas (grupos) | 30.297 · multi-tienda 6.045 |
| ofertas en fichas | 86.211 |
| data/snapshot.json | 54,8 MB local / 52,3 MB en el push (GitHub avisa > 50 MB; límite duro 100 MB) |
| build | OK, ~60 s, pico ~2,5 GB en un proceso (type-check) |
| RAM del server (`next start`, 2.000 URLs) | 1.450 MB → 720 MB tras #232 |
| Railway (ciclo en curso) | estimado US$17,72: memoria 13,22 · egress 3,33 · CPU 1,18. Un solo servicio. |
| reportes de usuarios (reporte-ficha) | 0 abiertos; el último entró el 19/09 |
| votos (voto-match) | 0 abiertos |
| build-groups-v2 | partidos por precio incoherente: 4 · fusiones bloqueadas por precio: 23 |
| deploys por semana | ~28 (22 eran del sommelier, que la web no lee) |

### Qué se hizo

- Mergeados #228 (17 vinotecas), #229 (token rotativo de ML + diagnóstico de
  scrapers en 0), #230 (5 bajas), #231 (adapter nuevo de Ligier). Probados
  juntos: 13/13 tests, tsc, build.
  - Verificado en el scrape del 06/11: Ligier 3.571 productos; las 17 altas
    con productos (de 10 a 960 cada una).
- #232: el snapshot se lee del disco una vez por proceso en lugar de
  embeberse en dos chunks del servidor. RAM 1,45 → 0,72 GB, mismo HTML en 154
  URLs. Es ~75% de la factura de Railway.
- Juan configuró Watch Paths en Railway (`**` y `!data/sommelier/**`) para que
  los commits del sommelier no disparen deploys.
- Juan habilitó "Allow GitHub Actions to create and approve pull requests":
  store-discovery y shipping-survey ya pueden abrir sus PRs.
- Juan re-autorizó la app de Mercado Libre y cargó `ML_REFRESH_TOKEN`.
- `maxPages` sube para las 4 tiendas que el healthcheck marcaba cortadas por
  el tope (bari, rogeralmacendebebidas, vinosadomicilio: 80 → 250;
  romawine: 250 → 400). Las cuatro son casi todo vino (las ofertas en
  fichas igualan a los productos). Costo: ~+10 min de scrape (el job tarda
  ~80 de 240).

### Hallazgos

- **Upstash no está en los secrets de GitHub.** `UPSTASH_REDIS_REST_URL` y
  `_TOKEN` llegan vacíos al daily-scrape. Consecuencia: el token rotado de ML
  no se guarda, y el `ML_REFRESH_TOKEN` que Juan cargó hoy se quemó en el run
  del 06/11 (log: "ml-auth: sin UPSTASH_REDIS_REST_URL/TOKEN — el refresh
  token rotado no se guarda"). Hay que cargar los dos secrets y re-autorizar
  ML una vez más.
- **`OPENAI_API_KEY` rechazada** ("Incorrect API key provided", 108 batches
  con 401 en el catálogo incremental del 06/11). Las fichas nuevas no pasan
  por el clasificador LLM del catálogo. El cache igual sumó +41 entradas ese
  día; no está claro si de batches que pasaron o de otra vía. Hay que revisar
  desde cuándo pasa.
- **El listado de ML sigue bloqueado** (redirige a account-verification): no
  tiene arreglo desde IPs de data-center. El camino es la API autenticada
  (ver backlog).
- **Reportes de usuarios en cero desde el 19/09.** Sospecha: `GITHUB_TOKEN`
  de Railway vencido. Juan tiene que probar el botón en una ficha.
- **Las alertas de precio por mail están apagadas** (`vars.ALERTS_ENABLED`
  sin setear, secrets vacíos). Es a propósito según el workflow; queda como
  decisión de producto.
- El daily-scrape programado a las 06:00 UTC arranca de hecho ~14:00 UTC:
  GitHub lo demora unas 8 horas.
- Ramas de bot sin PR: `bot/vinotecas-20261102-4` (19 altas) y
  `bot/envios-20261101-3`. Ahora que Actions puede abrir PRs, las próximas
  corridas los abren solas. Esas dos ramas se pueden borrar cuando entren las
  nuevas.

### Pendiente de Juan

1. GitHub → Settings → Secrets → Actions: crear `UPSTASH_REDIS_REST_URL` y
   `UPSTASH_REDIS_REST_TOKEN` copiando los valores de Railway → Variables.
   Después repetir la autorización de ML
   (`https://vinndex.com.ar/api/auth/mercadolibre/login`) y pegar el código
   nuevo en `ML_REFRESH_TOKEN`.
2. ~~`OPENAI_API_KEY`~~ — resuelto el 07/11: el catálogo pasó a Claude
   (#234) y Juan dio de baja OpenAI. No queda nada que dependa de OpenAI.
3. Probar el botón "¿Ves algo mal en esta ficha?" para saber si `GITHUB_TOKEN`
   anda.

### Backlog vivo

- **snapshot.json pasa de 50 MB** y crece ~4 MB por semana con las altas. A
  100 MB GitHub rechaza el push y se corta todo el pipeline. Opciones:
  sacar `offers[].imageUrl` (9,4 MB) o `externalUrl` redundante, partir el
  archivo, o comprimirlo. Prioridad alta en 3-4 semanas.
- **ML por API autenticada** en lugar del listado HTML: `/products/search`
  del catálogo y `/products/{id}/items` para precios. Necesita el token
  funcionando (pendiente 1).
- De Barricas volvió con 2.204 productos (#229 la daba por bloqueada por
  Cloudflare): verificar que siga la semana que viene.
- SEO: `gsc-report.mjs` necesita `GOOGLE_SERVICE_ACCOUNT_JSON`, que hoy sólo
  está en la Mac de Juan. Sin eso el repaso trabaja SEO on-page a ciegas.
  Proponerle cargarlo como secret de GitHub o como credencial de la sesión.
- La sesión no llega a vinndex.com.ar (proxy): no se puede verificar prod
  después de mergear. Proponer habilitar el dominio en el entorno.
- Verificar en Railway → Usage que la RAM base baje de ~1,3 GB a ~0,7 GB
  después de #232.
