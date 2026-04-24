"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRecentlyViewed } from "@/components/RecentlyViewed";
import { BottleFallback } from "@/components/BottleFallback";

type Group = {
  groupSlug: string;
  canonicalName: string;
  brand: string | null;
  imageUrl: string | null;
  minPrice: number | null;
  minPriceFormatted: string | null;
  storeCount: number;
};

/**
 * Drop-in horizontal scroller for the home page. Renders nothing if
 * the user hasn't viewed anything yet (so zero-state doesn't clutter
 * the layout for first-time visitors).
 *
 * The parent section header is also conditional — it only appears
 * once there's at least 2 items to show (showing 1 recently-viewed
 * card feels incomplete).
 */
export function RecentlyViewedSection({ limit = 6 }: { limit?: number }) {
  const recent = useRecentlyViewed();
  const slugs = recent.slice(0, limit);
  const [fetched, setFetched] = useState<Map<string, Group>>(new Map());
  const [fetchKey, setFetchKey] = useState("");

  const desiredKey = slugs.join(",");
  const loaded = fetchKey === desiredKey;

  useEffect(() => {
    if (slugs.length === 0) return;
    if (loaded) return;
    let cancelled = false;
    fetch(`/api/groups/batch?slugs=${encodeURIComponent(desiredKey)}`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((data: { groups: Group[] }) => {
        if (cancelled) return;
        setFetched(new Map(data.groups.map((g) => [g.groupSlug, g])));
        setFetchKey(desiredKey);
      })
      .catch(() => {
        /* silent — this is a nice-to-have section */
      });
    return () => {
      cancelled = true;
    };
  }, [slugs, desiredKey, loaded]);

  const groups = slugs
    .map((s) => fetched.get(s))
    .filter((x): x is Group => x !== undefined);

  if (groups.length < 2) return null;

  return (
    <section className="bg-white border-b border-ink/5">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-terracota text-xs tracking-[0.2em] uppercase font-semibold mb-1">
              Seguiste viendo
            </p>
            <h2 className="display text-2xl md:text-3xl font-semibold text-ink">
              Volvé a lo último que miraste
            </h2>
          </div>
        </div>
        <ul className="flex gap-4 overflow-x-auto pb-3 -mx-6 px-6 lg:-mx-0 lg:px-0 snap-x snap-mandatory lg:grid lg:grid-cols-6 lg:gap-4">
          {groups.map((g) => (
            <li
              key={g.groupSlug}
              className="shrink-0 w-40 lg:w-auto snap-start"
            >
              <a
                href={`/vino/${g.groupSlug}`}
                className="group block postcard p-3"
              >
                <div className="wine-thumb !w-full !h-32 mb-3">
                  {g.imageUrl ? (
                    <Image
                      src={g.imageUrl}
                      alt={g.canonicalName}
                      width={120}
                      height={128}
                      className="w-full h-full object-contain"
                      unoptimized
                    />
                  ) : (
                    <BottleFallback
                      brand={g.brand}
                      name={g.canonicalName}
                    />
                  )}
                </div>
                {g.brand && (
                  <p className="text-[10px] uppercase tracking-wide text-graphite truncate">
                    {g.brand}
                  </p>
                )}
                <h3 className="display text-sm font-semibold text-ink leading-tight line-clamp-2 group-hover:text-cobalt transition">
                  {g.canonicalName}
                </h3>
                <p className="text-xs text-graphite mt-2">
                  {g.minPriceFormatted ? (
                    <>
                      desde{" "}
                      <span className="font-semibold text-ink">
                        {g.minPriceFormatted}
                      </span>
                    </>
                  ) : (
                    <span className="italic">sin stock</span>
                  )}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
