# Mercado Libre: token OAuth

`scripts/enrich-ml-catalog.mjs` usa la API de ML (`/products/{id}`) con un
user token. Lo saca de `scripts/lib-ml-auth.mjs`.

## Por qué se rompía

Los refresh tokens de ML son **de un solo uso**: cada
`grant_type=refresh_token` devuelve un `refresh_token` nuevo e invalida el
anterior (y vencen a los 6 meses sin uso). El script usaba siempre el secret
`ML_REFRESH_TOKEN` y descartaba el nuevo, así que el secret quedaba muerto
después del primer run: desde ahí, `refresh failed: HTTP 400` todos los días.

## Cómo funciona ahora

- El refresh token vigente vive en Upstash, clave `ml:oauth:refresh_token`
  (misma base que las alertas; el step del workflow ya recibe
  `UPSTASH_REDIS_REST_URL/TOKEN`).
- Cada run prueba primero el de Upstash y, si falla, el secret
  `ML_REFRESH_TOKEN`. El que funcione se rota y el nuevo se guarda en
  Upstash **antes** de seguir.
- El secret pasa a ser sólo la semilla: no hace falta tocarlo salvo para
  re-autorizar.

Se descartó `gh secret set` desde el workflow: necesita un PAT con permiso
de escritura sobre los secrets del repo, que puede pisar *todos* los
secrets. Upstash ya está en el workflow y sólo expone este token.

## Re-autorizar la app

Cuando el log del Daily scrape diga `ml-auth: ningún refresh token sirvió`:

1. En https://developers.mercadolibre.com.ar/devcenter, en la app de
   Vinndex, confirmar que el scope **offline_access** está habilitado (sin él
   ML no devuelve refresh token) y anotar la Redirect URI configurada.
2. En una máquina con `.env.local` que tenga `ML_APP_ID`, `ML_CLIENT_SECRET`
   y `ML_REDIRECT_URI` (la de la app, exacta):

   ```bash
   node scripts/ml-reauth.mjs
   ```

3. Abrir la URL que imprime, logueado con la cuenta de ML, y aceptar. ML
   redirige a la Redirect URI con `?code=TG-...` (el code vence en minutos).
4. Canjearlo:

   ```bash
   node scripts/ml-reauth.mjs TG-xxxxxxxx
   ```

   Con `UPSTASH_REDIS_REST_URL/TOKEN` en `.env.local` lo guarda directo en
   Upstash. Si no, imprime el `gh secret set ML_REFRESH_TOKEN ...` para
   cargarlo como semilla; el primer run lo usa y lo deja rotando en Upstash.

No correr `enrich-ml-catalog.mjs` en local con el mismo Upstash a la vez que
el workflow: los dos rotarían el mismo token y uno de los dos quedaría con
uno quemado (se recupera re-autorizando).
