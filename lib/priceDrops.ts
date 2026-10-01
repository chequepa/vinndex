import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findGroup } from "./snapshot";

const PATH = resolve(process.cwd(), "data/price-drops.json");

export type PriceDrop = {
  slug: string;
  brand: string | null;
  canonicalName: string;
  currentPrice: number;
  medianPrice7d: number;
  dropPct: number;
  storeCount: number;
  imageUrl: string | null;
  storeSlug: string;
  lastDate: string;
};

export type PriceDropsReport = {
  generatedAt: string;
  snapshotGeneratedAt: string | null;
  threshold: number;
  drops: PriceDrop[];
};

/**
 * Lee data/price-drops.json — output del script
 * scripts/detect-price-drops.mjs.
 *
 * Falla silenciosa devolviendo null si el archivo no existe (deploy
 * recién iniciado, daily-scrape no corrió todavía, o filesystem
 * read-only). El home y /admin/price-drops manejan el caso null.
 */
export async function readPriceDrops(): Promise<PriceDropsReport | null> {
  try {
    const raw = await readFile(PATH, "utf8");
    const report = JSON.parse(raw) as PriceDropsReport;
    // Sólo bajas de fichas que el sitio publica: `findGroup` ya excluye
    // no-vinos y junk (01/10: una Heineken en lata llegó a /ofertas porque
    // el script de drops tiene su propia copia, más vieja, del filtro).
    return { ...report, drops: (report.drops ?? []).filter((d) => findGroup(d.slug)) };
  } catch {
    return null;
  }
}
