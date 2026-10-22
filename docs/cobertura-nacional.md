# Cobertura nacional: de AMBA a las ciudades grandes

Estado al 11/10/2026: el sitio compara precios sin saber a dónde envía cada
vinoteca. En la práctica es un comparador de AMBA. Casi todas las tiendas
están en CABA/GBA o son bodegas y tiendas que envían a todo el país, y el
copy asume CABA. El 22/10/2026 salieron del catálogo las tres vinotecas
locales del interior que había (Casa de Vinos Mendoza, Sol y Vino Mendoza y
Campos, de Rosario); esperan en `data/store-candidates-regional.txt`. Para alguien de
Córdoba, el "mejor precio" puede ser de una tienda que no le envía.

## Lo que encontramos (relevamiento por buscador, sin abrir sitios)

- **Las grandes ya venden al interior, con escalones de envío gratis por
  zona**: Enotek (AMBA desde $60k; Córdoba, Rosario y Funes desde $120k;
  "interior zona 1" desde $225k), Vinoteca Campos (Rosario desde $100k,
  resto por Andreani), Espaciovino (CABA $80k, resto $150k), Norton
  (nacional desde $110k). Andreani es el operador más citado. Tiendanube
  cotiza el envío por código postal ("Envío Nube").
- **Las regionales suelen entregar sólo en su ciudad**: Al Vino Vino y
  Rosario Vinos Exclusivos (Rosario), WineBox (La Plata), Salta Vinos
  (Salta), Almacén Beber Bien (Bariloche/Comodoro), La Masía
  (Neuquén/Roca). Para estas tiendas la zona no cambia el costo: decide si
  se puede comprar o no.
- **Las otras ciudades ya tienen escalones propios en las tiendas
  grandes**. Córdoba y Rosario tienen la mayor oferta local con carrito
  (Roger, CLIN, Los Fenicios; Rosario Vinos, La Vinoteca Rosario, Vinos
  Notables, Grado 14).

## Orden propuesto

1. **Córdoba y Rosario.** Las tiendas nacionales ya les dan un escalón
   propio, y tienen 4–9 tiendas locales candidatas cada una (ya están en
   `data/store-candidates-queue.txt`).
2. **La Plata y Mar del Plata.** Están cerca de AMBA y algunas tiendas de
   CABA ya les envían. Hay 3–5 tiendas locales en cada una.
3. **Mendoza.** Las tiendas de ahí envían a todo el país, así que el
   comprador mendocino ya está cubierto. Falta sumarlo como zona con envío
   barato local.
4. **Tucumán, Salta, Neuquén y Bahía Blanca.** Hay poca oferta local con
   carrito. Se cubren sobre todo con el envío "interior" de las tiendas
   nacionales.

## Qué hay que construir (en este orden)

1. **Dato de cobertura por vinoteca.** En `data/stores.json` va un campo
   opcional por tienda:

   ```json
   "envios": { "zonas": ["amba", "cordoba", "rosario"], "nacional": true, "fuente": "página de envíos, 2026-10" }
   ```

   Sin dato = "no sabemos". Nunca se interpreta como "no envía". El dato se
   carga de la página de envíos de cada tienda. Son ~110 tiendas: un
   barrido a mano con una planilla lleva un día. Las Tiendanube exponen el
   cotizador por CP, así que se podría automatizar más adelante.
2. **"Tu zona" en el sitio.** Un selector con AMBA (default), Córdoba,
   Rosario, La Plata, Mar del Plata, Mendoza y "Resto del país". Se guarda
   en localStorage, igual que favoritos. En la tabla de precios de la
   ficha, las tiendas que no envían a tu zona bajan al final con la
   etiqueta "no envía a Córdoba". Las que no tienen dato quedan como
   están, con un "consultá envío". **No se oculta nada:** el orden sigue
   siendo el precio (principio 2 de PRODUCT.md), la zona sólo agrega
   contexto.
3. **Páginas por ciudad** (`/vinotecas/cordoba`, `/ofertas/rosario`). Son
   buenas para SEO local ("vinoteca online Córdoba"). Tienen sentido
   recién cuando una ciudad tiene 3+ tiendas locales y cobertura cargada.
   Si no, son thin content.
4. **Precio con envío.** Es la promesa original del README ("precio total
   con envío a tu zona"). Necesita la tarifa por zona y monto, no sólo
   "envía o no". Es el paso más caro. Va último y se hace sólo si los
   datos de 1–2 muestran que el envío cambia el ranking seguido.

## Lo que NO hay que hacer

- Mostrar un filtro de zona antes de tener el dato de cobertura. Un filtro
  que esconde tiendas por falta de datos rompe la confianza en el orden
  por precio.
- Sumar tiendas regionales sin marcar su zona. Una tienda de Rosario que
  sólo entrega en Rosario va a salir "más barata" para alguien de Palermo
  que no le puede comprar. **Antes de mergear las primeras altas
  regionales del vet semanal, hay que tener el campo `envios` (paso 1),
  aunque sea a mano para esas tiendas.**
