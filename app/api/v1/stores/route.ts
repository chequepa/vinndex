import { snapshot } from "@/lib/snapshot";
import { apiJson, preflightOK } from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return preflightOK();
}

/**
 * GET /api/v1/stores
 *
 * Devuelve la lista de vinotecas relevadas con su slug, nombre,
 * última fecha de scrape y productCount.
 *
 * Sin parámetros. Útil para clientes que quieren mapear storeSlug
 * → nombre legible o construir filtros.
 */
export async function GET() {
  const stores = (snapshot.stores ?? []).map((s) => ({
    slug: s.storeSlug,
    name: s.storeName,
    productCount: s.productCount ?? 0,
    lastScrapeAt: s.startedAt ?? null,
    errors: Array.isArray(s.errors) ? s.errors.length : 0,
  }));
  return apiJson({
    count: stores.length,
    snapshotGeneratedAt: snapshot.generatedAt,
    stores: stores.sort((a, b) => b.productCount - a.productCount),
  });
}
