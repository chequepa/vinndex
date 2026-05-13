import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PATH = resolve(process.cwd(), "data/vs-pairs.json");

export type VsPair = {
  slug: string; // "a-vs-b"
  slugA: string;
  slugB: string;
  varietal: string;
  totalStoreCount: number;
};

export type VsPairsFile = {
  generatedAt: string;
  snapshotGeneratedAt: string | null;
  pairCount: number;
  totalCandidates: number;
  pairs: VsPair[];
};

let cached: VsPairsFile | null | undefined;

/**
 * Lee data/vs-pairs.json — generado por scripts/generate-vs-pairs.mjs
 * en el daily-scrape. Memoiza para que generateStaticParams + cada
 * page no relean el archivo decenas de veces durante el build.
 */
export async function readVsPairs(): Promise<VsPairsFile | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await readFile(PATH, "utf8");
    cached = JSON.parse(raw) as VsPairsFile;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export async function findVsPair(slug: string): Promise<VsPair | null> {
  const f = await readVsPairs();
  return f?.pairs.find((p) => p.slug === slug) ?? null;
}
