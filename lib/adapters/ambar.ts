import type { ScrapedProduct, ScrapeResult, StoreConfig } from "./types";

/**
 * Ambar Selecto (ambarselecto.com.ar) — sitio custom SPA con catálogo
 * embebido en una sola fila JSON de Supabase (tabla `ambar_config`, id=1).
 *
 * En lugar de scrapear HTML hacemos un solo fetch al REST de Supabase
 * con la `publishable` anon key (es pública, viene en el HTML, y está
 * pensada para uso en navegador). Retornamos productos cuyo `topCat`
 * sea vino o espumante — filtramos whiskies / cervezas porque Vinndex
 * compara sólo vino.
 */

const FETCH_TIMEOUT_MS = 15_000;

// Estos vienen del index.html del sitio (línea SUPABASE_URL / SUPABASE_KEY).
// La key es publishable y está pensada para clientes web; igual la cacheamos
// hardcodeada acá para no depender de re-extraerla en cada scrape.
const AMBAR_SUPABASE_URL = "https://wucexmkqbgkdjrbjkzss.supabase.co";
const AMBAR_SUPABASE_KEY =
  "sb_publishable_ekR24wfFHNG6jtRaR9S6_A_tyQ0rpxv";

type AmbarWine = {
  id: number;
  nombre: string;
  bodega?: string | null;
  linea?: string | null;
  varietal?: string | null;
  imagen?: string | null;
  precio?: number | null;
  oferta?: boolean;
  descPct?: number | null;
  topCat?: string | null;
  cajaTam?: number | null;
  descripcion?: string | null;
};

async function fetchJson(url: string, headers: HeadersInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalize(
  w: AmbarWine,
  storeSlug: string,
  baseUrl: string,
): ScrapedProduct | null {
  if (!w.nombre || typeof w.id !== "number") return null;

  // Sólo vino + espumante. Whisky / cerveza no entran a Vinndex.
  const isWine = w.topCat === "vinos" || w.topCat === "espumantes";
  if (!isWine) return null;

  // El sitio no tiene deep-linking propio (SPA state-only). Usamos
  // `?id=N` como permalink convencional — si en algún momento agregan
  // hash routing, las URLs viejas siguen funcionando.
  const externalUrl = `${baseUrl.replace(/\/+$/, "")}/?id=${w.id}`;

  // Si hay descuento aplicado, mostramos el precio final. Estructura
  // del sitio: oferta=true + descPct=N% sobre `precio`.
  let priceArs: number | null = null;
  if (typeof w.precio === "number" && w.precio > 0) {
    const pct = typeof w.descPct === "number" ? w.descPct : 0;
    priceArs =
      w.oferta && pct > 0 ? Math.round(w.precio * (1 - pct / 100)) : w.precio;
  }

  return {
    storeSlug,
    externalUrl,
    // No exponen GTIN; usamos el id interno como SKU. Si en algún
    // momento Ambar carga EANs en el schema lo cambiamos a 1 línea.
    externalSku: `ambar-${w.id}`,
    name: w.nombre.trim(),
    brand: w.bodega?.trim() || null,
    imageUrl: w.imagen?.trim() || null,
    priceArs,
    currency: "ARS",
    // El sitio no maneja stock — todo está disponible o lo sacan del
    // catálogo. Asumimos inStock para todo lo que listean.
    inStock: priceArs != null,
    description: w.descripcion?.trim() || null,
  };
}

export async function scrapeAmbar(
  config: StoreConfig,
): Promise<ScrapeResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors: string[] = [];
  const products: ScrapedProduct[] = [];

  try {
    const url = `${AMBAR_SUPABASE_URL}/rest/v1/ambar_config?id=eq.1&select=data,updated_at`;
    const rows = (await fetchJson(url, {
      apikey: AMBAR_SUPABASE_KEY,
      Authorization: `Bearer ${AMBAR_SUPABASE_KEY}`,
      Accept: "application/json",
    })) as { data?: { wines?: AmbarWine[] } }[];

    const wines = rows?.[0]?.data?.wines ?? [];
    for (const w of wines) {
      const p = normalize(w, config.slug, config.baseUrl);
      if (p) products.push(p);
    }
  } catch (err) {
    errors.push(`ambar fetch failed: ${(err as Error).message}`);
  }

  return {
    storeSlug: config.slug,
    startedAt,
    durationMs: Date.now() - t0,
    // Un solo round-trip a Supabase trae todo el catálogo — "1 page".
    pagesFetched: 1,
    productCount: products.length,
    products,
    errors,
  };
}
