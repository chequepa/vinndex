import type { StoreConfig } from "./adapters/types";
import storesJson from "@/data/stores.json";

export const STORES: StoreConfig[] = storesJson as StoreConfig[];

export function getStore(slug: string): StoreConfig | undefined {
  return STORES.find((s) => s.slug === slug);
}

export function storesByPlatform(
  platform: StoreConfig["platform"],
): StoreConfig[] {
  return STORES.filter((s) => s.platform === platform);
}
