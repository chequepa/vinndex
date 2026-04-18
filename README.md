# Vinndex

Comparador de precios de vinos online en Argentina. Buscás un vino, te mostramos todas las vinotecas que lo venden online ordenadas por precio total con envío a tu zona.

## Estado

**Prototipo visual (HTML estático)** — validación de diseño y flujo antes de escribir el producto real.

- `index.html` — home con buscador
- `buscar.html` — resultados de búsqueda
- `vino.html` — ficha de vino con comparación de precios en múltiples vinotecas
- `admin-fuentes.html` — auditoría interna de las 43 vinotecas viables

## Preview local

```bash
python3 -m http.server 3000
```

Después abrí http://localhost:3000 en el navegador.

## Próximos pasos

Ver [BRIEF](../BRIEF_VINODEX.md) para el roadmap completo. Resumen:

1. Scaffolding Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
2. Postgres + pgvector, Redis, Meilisearch, BullMQ — todo en Railway
3. Adapters por plataforma: Tiendanube, VTEX, WooCommerce, BigCommerce, Shopify
4. Pipeline de matching de SKUs con embeddings + LLM adjudicator
5. Scrapeo nocturno de 43 vinotecas + API oficial de Mercado Libre

## Licencia

Privado — todos los derechos reservados.
