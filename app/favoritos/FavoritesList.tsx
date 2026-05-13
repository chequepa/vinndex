"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useFavorites, FavoriteButton } from "@/components/Favorites";
import { BottleFallback } from "@/components/BottleFallback";
import { displayWineName } from "@/lib/displayWineName";

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

type DropInfo = {
  slug: string;
  dropPct: number;
  currentPrice: number;
  medianPrice7d: number;
};

export function FavoritesList() {
  const favs = useFavorites();
  const [fetched, setFetched] = useState<Map<string, Group>>(new Map());
  const [fetchKey, setFetchKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [drops, setDrops] = useState<Map<string, DropInfo>>(new Map());
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  const desiredKey = favs.join(",");
  const loaded = fetchKey === desiredKey;

  // Fetch group data
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

  // Fetch price drops (1x on mount). Refetch cuando cambian los favs
  // sólo si los favs nuevos no están en el map actual.
  useEffect(() => {
    if (favs.length === 0) return;
    let cancelled = false;
    fetch("/api/price-drops")
      .then((r) => (r.ok ? r.json() : { drops: [] }))
      .then((data: { drops: DropInfo[] }) => {
        if (cancelled) return;
        setDrops(new Map(data.drops.map((d) => [d.slug, d])));
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, [favs.length]);

  // Groups en el orden de favoritos del usuario, descartando los que
  // ya no están en el catálogo.
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
  const dropsInFavs = groups.filter((g) => drops.has(g.groupSlug)).length;

  function handleShare() {
    const url = new URL(window.location.href);
    url.pathname = "/favoritos";
    url.search = `?slugs=${favs.join(",")}`;
    const shareUrl = url.toString();

    // Web Share API si está disponible (mobile), sino copy-to-clipboard.
    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ url: shareUrl })
    ) {
      navigator
        .share({
          title: "Mis vinos en Vinndex",
          text: `${groups.length} vinos que estoy mirando en Vinndex`,
          url: shareUrl,
        })
        .catch(() => {
          /* user cancelled — silent */
        });
      return;
    }

    navigator.clipboard?.writeText(shareUrl).then(
      () => {
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
      },
      () => {
        // Fallback final: prompt para que el usuario copie a mano.
        window.prompt("Copiá este link para compartir tu lista:", shareUrl);
      },
    );
  }

  function handleExport() {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: "vinndex.com.ar",
      count: groups.length,
      wines: groups.map((g) => ({
        slug: g.groupSlug,
        name: g.canonicalName,
        brand: g.brand,
        vintage: g.vintage,
        varietals: g.varietals,
        region: g.region,
        type: g.type,
        minPrice: g.minPrice,
        storeCount: g.storeCount,
        url: `https://vinndex.com.ar/vino/${g.groupSlug}`,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vinndex-favoritos-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <p className="text-sm text-graphite">
          {groups.length}{" "}
          {groups.length === 1 ? "vino guardado" : "vinos guardados"}
          {dropsInFavs > 0 && (
            <span className="text-terracota font-semibold">
              {" · "}
              {dropsInFavs} bajó de precio
            </span>
          )}
          {missing > 0 && (
            <span>
              {" · "}
              {missing} ya no{" "}
              {missing === 1 ? "está en el catálogo" : "están en el catálogo"}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleShare}
            className="cursor-wine inline-flex items-center gap-1.5 bg-snow hover:bg-snow/80 text-ink text-sm font-semibold px-4 py-2 rounded-full border border-ink/15 transition-colors"
          >
            {shareState === "copied" ? "Link copiado ✓" : "Compartir lista"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="cursor-wine inline-flex items-center gap-1.5 bg-snow hover:bg-snow/80 text-ink text-sm font-semibold px-4 py-2 rounded-full border border-ink/15 transition-colors"
          >
            Exportar JSON
          </button>
        </div>
      </div>

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {groups.map((g) => {
          const drop = drops.get(g.groupSlug);
          return (
            <li key={g.groupSlug} className="postcard p-5 relative">
              {drop && (
                <span className="absolute top-3 left-3 bg-terracota text-snow text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shadow z-10">
                  ↓ {Math.round(drop.dropPct * 100)}%
                </span>
              )}
              <FavoriteButton
                slug={g.groupSlug}
                size={18}
                className="absolute top-3 right-3 w-9 h-9 bg-snow hover:bg-snow/80 text-mustard"
              />
              <Link href={`/vino/${g.groupSlug}`} className="block">
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
                  {displayWineName(g.canonicalName)}
                  {g.vintage && (
                    <span className="text-graphite font-normal">
                      {" "}
                      · {g.vintage}
                    </span>
                  )}
                </h2>
                <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-ink/5">
                  {g.minPriceFormatted ? (
                    <div>
                      <span className="display text-xl font-semibold text-ink">
                        {g.minPriceFormatted}
                      </span>
                      {drop && (
                        <span className="text-xs text-graphite line-through ml-2 tabular-nums">
                          ${drop.medianPrice7d.toLocaleString("es-AR")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-graphite italic">
                      Sin stock
                    </span>
                  )}
                  <span className="text-xs text-graphite shrink-0">
                    {g.storeCount}{" "}
                    {g.storeCount === 1 ? "vinoteca" : "vinotecas"}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
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
      <Link
        href="/buscar?multi=1"
        className="cursor-wine inline-flex bg-cobalt hover:bg-ink text-snow font-semibold px-6 py-3 rounded-full transition-colors"
      >
        Explorar vinos comparables
      </Link>
    </div>
  );
}
