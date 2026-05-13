import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPORT_PATH = resolve(process.cwd(), "data/duplicates-report.json");

type ReportMember = {
  slug: string;
  brand: string | null;
  canonicalName: string;
  storeCount: number;
};

export type HeuristicACluster = {
  key: string;
  totalStoresIfMerged: number;
  members: ReportMember[];
};

export type HeuristicBPair = {
  jaccard: number;
  totalStoresIfMerged: number;
  a: ReportMember;
  b: ReportMember;
};

export type DuplicatesReport = {
  generatedAt: string;
  snapshotGeneratedAt: string | null;
  groupCount: number;
  groupsWithDistinctiveTokens: number;
  heuristicA: {
    description: string;
    total: number;
    items: HeuristicACluster[];
  };
  heuristicB: {
    description: string;
    total: number;
    items: HeuristicBPair[];
  };
};

/**
 * Lee data/duplicates-report.json — output del script
 * scripts/find-duplicates.mjs --out=.
 *
 * Si el archivo no existe (deploy nuevo, daily-scrape no corrió todavía
 * o falló) devuelve null y el dashboard muestra un empty state.
 */
export async function readDuplicatesReport(): Promise<DuplicatesReport | null> {
  try {
    const raw = await readFile(REPORT_PATH, "utf8");
    return JSON.parse(raw) as DuplicatesReport;
  } catch {
    return null;
  }
}
