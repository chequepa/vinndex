import { NextResponse } from "next/server";
import { buildBasketMatrix, parseBasketParam } from "@/lib/basket";
import { rankStores } from "@/lib/basketPlan";
import { shippingFor } from "@/lib/storeShipping";

/**
 * Compra combinada: GET /api/compra?v=slug*6,slug2*12
 *
 * Devuelve los vinos (con nombre y cantidad) y las dos mejores vinotecas
 * donde comprar TODO junto (lib/basketPlan.ts: nunca repartido), con el
 * envío gratis publicado por cada una cuando lo conocemos. Lo llama
 * components/BasketPlanner.tsx cada vez que cambia la lista: la lista vive
 * en el navegador y el cálculo pesado (snapshot) en el server.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const request = parseBasketParam(new URL(req.url).searchParams.get("v"));
  if (request.length === 0) {
    return NextResponse.json({ items: [], missing: [], options: [], nowhere: [] });
  }
  const matrix = buildBasketMatrix(request);
  const names = new Map(matrix.stores.map((s) => [s.slug, s.name]));
  const ranked = rankStores(matrix);
  // Las dos mejores. Si la primera tiene todo, la segunda también tiene
  // que tener todo (una "segunda opción" a la que le falta un vino no es
  // una alternativa real); si nadie tiene todo, se muestran las dos que
  // más cubren.
  const complete = ranked.filter((o) => o.missing.length === 0);
  const top = (complete.length > 0 ? complete : ranked).slice(0, 2);

  return NextResponse.json({
    items: matrix.items.map((i) => ({
      slug: i.slug,
      requestedSlug: i.requestedSlug,
      name: i.name,
      brand: i.brand,
      imageUrl: i.imageUrl,
      qty: i.qty,
      storeCount: Object.keys(i.byStore).length,
    })),
    missing: matrix.missing,
    nowhere: matrix.items.filter((i) => Object.keys(i.byStore).length === 0).map((i) => i.slug),
    completeCount: complete.length,
    options: top.map((o) => ({
      storeSlug: o.storeSlug,
      storeName: names.get(o.storeSlug) ?? o.storeSlug,
      total: o.total,
      missing: o.missing,
      lines: o.lines,
      shipping: shippingFor(o.storeSlug),
    })),
  });
}
