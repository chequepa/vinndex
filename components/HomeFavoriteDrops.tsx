"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useFavorites } from "./Favorites";
import { BottleFallback } from "./BottleFallback";
import { displayWineName } from "@/lib/displayWineName";

type DropInfo = {
  slug: string;
  dropPct: number;
  currentPrice: number;
  medianPrice7d: number;
};

type GroupInfo = {
  groupSlug: string;
  canonicalName: string;
  brand: string | null;
  imageUrl: string | null;
};

/**
 * Sección "Tus favoritos que bajaron de precio" en la home, sólo
 * client-side porque favoritos viven en localStorage. No renderiza
 * nada si:
 *   - el usuario no tiene favoritos (zero-state evita popup ruidoso
 *     en visitantes nuevos)
 *   - ningún favorito está en la lista de price-drops del día
 *
 * Es mínimo intencionalmente · top 3, sin badge de "más drops, ver
 * lista" porque el visit a /favoritos es 1 click más.
 */
export function HomeFavoriteDrops() {
  const favs = useFavorites();
  const [drops, setDrops] = useState<DropInfo[]>([]);
  const [groups, setGroups] = useState<Map<string, GroupInfo>>(new Map());
  const [ready, setReady] = useState(false);

  // Cargar drops (filtra a los que estén en favoritos)
  useEffect(() => {
    if (favs.length === 0) {
      setReady(true);
      return;
    }
    let cancelled = false;
    fetch("/api/price-drops")
      .then((r) => (r.ok ? r.json() : { drops: [] }))
      .then((data: { drops: DropInfo[] }) => {
        if (cancelled) return;
        const favSet = new Set(favs);
        const filtered = data.drops
          .filter((d) => favSet.has(d.slug))
          .slice(0, 3);
        setDrops(filtered);
        if (filtered.length === 0) {
          setReady(true);
          return;
        }
        // Cargar metadata de cada vino que aparece como drop
        const slugsCsv = filtered.map((d) => d.slug).join(",");
        return fetch(`/api/groups/batch?slugs=${encodeURIComponent(slugsCsv)}`)
          .then((r) => (r.ok ? r.json() : { groups: [] }))
          .then((g: { groups: GroupInfo[] }) => {
            if (cancelled) return;
            setGroups(new Map(g.groups.map((x) => [x.groupSlug, x])));
            setReady(true);
          });
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [favs]);

  // Hidden cuando: aún no terminó de cargar, no hay favs, o no hay drops.
  // Cero salto de layout · la sección se renderiza dentro de un fragment
  // que devuelve null y ocupa 0px.
  if (!ready || favs.length === 0 || drops.length === 0) return null;

  return (
    <section className="py-16 lg:py-20 px-6 bg-snow/40 border-y border-ink/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
          <div>
            <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-2">
              Tus favoritos
            </p>
            <h2 className="display text-2xl md:text-3xl lg:text-4xl font-semibold text-ink leading-tight">
              Bajaron de precio
            </h2>
          </div>
          <Link
            href="/favoritos"
            className="text-xs uppercase tracking-wider text-graphite hover:text-ink"
          >
            Ver toda tu lista →
          </Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {drops.map((d) => {
            const g = groups.get(d.slug);
            if (!g) return null;
            return (
              <Link
                key={d.slug}
                href={`/vino/${d.slug}`}
                className="postcard p-5 flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="display text-2xl font-bold text-terracota tabular-nums">
                    −{Math.round(d.dropPct * 100)}%
                  </span>
                  <div className="relative w-14 h-20 rounded overflow-hidden bg-snow border border-ink/10 shrink-0">
                    {g.imageUrl ? (
                      <Image
                        src={g.imageUrl}
                        alt={g.canonicalName}
                        fill
                        sizes="56px"
                        className="object-contain"
                      />
                    ) : (
                      <BottleFallback name={g.canonicalName} brand={g.brand} />
                    )}
                  </div>
                </div>
                <p className="text-[10px] uppercase tracking-wide text-graphite truncate">
                  {g.brand ?? "—"}
                </p>
                <p className="display text-base font-semibold text-ink leading-tight line-clamp-2 min-h-[2.4em]">
                  {displayWineName(g.canonicalName)}
                </p>
                <div className="mt-3 pt-3 border-t border-ink/5">
                  <p className="display text-lg font-semibold text-cobalt tabular-nums">
                    ${d.currentPrice.toLocaleString("es-AR")}
                  </p>
                  <p className="text-xs text-graphite line-through tabular-nums">
                    ${d.medianPrice7d.toLocaleString("es-AR")}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
