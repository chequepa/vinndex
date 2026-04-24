"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useFavorites, FavoriteButton } from "@/components/Favorites";
import { BottleFallback } from "@/components/BottleFallback";

type Group = {
  groupSlug: string;
  canonicalName: string;
  brand: string | null;
  vintage: number | null;
  type: string | null;
  region: string | null;
  varietals: string[];
  imageUrl: string | null;
  minPrice: number | null;
  minPriceFormatted: string | null;
  storeCount: number;
  inStockOfferCount: number;
  bestStoreName: string | null;
};

export function FavoritesList() {
  const favs = useFavorites();
  const [fetched, setFetched] = useState<Map<string, Group>>(new Map());
  const [fetchKey, setFetchKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const desiredKey = favs.join(",");
  const loaded = fetchKey === desiredKey;

  useEffect(() => {
    if (favs.length === 0) return;
    if (loaded) return;
    let cancelled = false;
    fetch(`/api/groups/batch?slugs=${encodeURIComponent(desiredKey)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { groups: Group[] }) => {
        if (cancelled) return;
        const map = new Map(data.groups.map((g) => [g.groupSlug, g]));
        setFetched(map);
        setFetchKey(desiredKey);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [favs, desiredKey, loaded]);

  // Groups in favorites order, filtering out any that were removed from
  // the catalog since the user favorited them.
  const groups: Group[] = favs
    .map((s) => fetched.get(s))
    .filter((x): x is Group => x !== undefined);

  const loading = favs.length > 0 && !loaded && !error;

  if (loading) {
    return (
      <div className="text-graphite text-sm animate-pulse">
        Cargando tus vinos…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red2/30 bg-red2/5 p-6 text-red2">
        No pudimos cargar tus favoritos. {error}
      </div>
    );
  }

  if (groups.length === 0) {
    return <EmptyState />;
  }

  const missing = favs.length - groups.length;

  return (
    <>
      <p className="text-sm text-graphite mb-5">
        {groups.length} {groups.length === 1 ? "vino guardado" : "vinos guardados"}
        {missing > 0 && (
          <span>
            {" · "}
            {missing} ya no {missing === 1 ? "está en el catálogo" : "están en el catálogo"}
          </span>
        )}
      </p>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {groups.map((g) => (
          <li key={g.groupSlug} className="postcard p-5 relative">
            <FavoriteButton
              slug={g.groupSlug}
              size={18}
              className="absolute top-3 right-3 w-9 h-9 bg-snow hover:bg-snow/80 text-mustard"
            />
            <a href={`/vino/${g.groupSlug}`} className="block">
              <div className="wine-thumb mx-auto mb-4 !w-20 !h-32">
                {g.imageUrl ? (
                  <Image
                    src={g.imageUrl}
                    alt={g.canonicalName}
                    width={80}
                    height={128}
                    className="w-full h-full object-contain"
                    unoptimized
                  />
                ) : (
                  <BottleFallback brand={g.brand} name={g.canonicalName} />
                )}
              </div>
              {g.brand && (
                <p className="text-xs uppercase tracking-wider text-graphite mb-1 truncate">
                  {g.brand}
                </p>
              )}
              <h2 className="display text-lg font-semibold text-ink leading-tight mb-2 line-clamp-2">
                {g.canonicalName}
                {g.vintage && (
                  <span className="text-graphite font-normal"> · {g.vintage}</span>
                )}
              </h2>
              <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-ink/5">
                {g.minPriceFormatted ? (
                  <>
                    <span className="display text-xl font-semibold text-ink">
                      {g.minPriceFormatted}
                    </span>
                    <span className="text-xs text-graphite">
                      {g.storeCount} {g.storeCount === 1 ? "vinoteca" : "vinotecas"}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-graphite italic">
                    Sin stock · {g.storeCount}{" "}
                    {g.storeCount === 1 ? "vinoteca" : "vinotecas"}
                  </span>
                )}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-ink/10 bg-snow/50 p-10 text-center">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mx-auto mb-4 text-graphite"
        aria-hidden="true"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      <h2 className="display text-2xl font-semibold text-ink mb-2">
        Todavía no guardaste ningún vino
      </h2>
      <p className="text-graphite max-w-md mx-auto mb-6">
        Tocá la estrella en cualquier ficha y se guarda acá. No te pedimos
        cuenta ni email — queda en tu dispositivo.
      </p>
      <a
        href="/buscar?multi=1"
        className="cursor-wine inline-flex bg-cobalt hover:bg-ink text-snow font-semibold px-6 py-3 rounded-full transition-colors"
      >
        Explorar vinos comparables
      </a>
    </div>
  );
}
