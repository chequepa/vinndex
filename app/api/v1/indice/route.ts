import { priceIndex } from "@/lib/priceIndex";
import { apiJson, preflightOK } from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return preflightOK();
}

/**
 * GET /api/v1/indice
 *
 * El Índice Vinndex de precios del vino, tal cual lo genera
 * scripts/build-price-index.mjs: serie semanal encadenada (base 100 en el
 * primer punto), segmentos por varietal, banda de precio y top 100, y el
 * headline (30 días, 90 días, desde el inicio). La metodología viaja en
 * `method` para que la cita sea autocontenida.
 *
 * Sin parámetros. Cita sugerida: "Fuente: Índice Vinndex,
 * vinndex.com.ar/indice".
 */
export async function GET() {
  return apiJson({
    ...priceIndex,
    cite: "Fuente: Índice Vinndex, vinndex.com.ar/indice",
    license: "Uso libre citando la fuente",
  });
}
