import Link from "next/link";
import Image from "next/image";
import { BottleFallback } from "@/components/BottleFallback";
import { displayWineName } from "@/lib/displayWineName";
import { formatArs, displayBrand } from "@/lib/snapshot";
import type { ProductGroup } from "@/lib/matching";

/**
 * Render server-side de una lista compartida (`/favoritos?slugs=a,b,c`).
 * No usa localStorage · el dueño armó la URL y nosotros la mostramos.
 * El visitante puede tocar cualquier vino para ver su ficha; si quiere
 * sumar a SU propia lista, usa la estrella de la ficha que vive con
 * useFavorites() en su browser.
 */
export function SharedFavoritesView({ groups }: { groups: ProductGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-3xl border border-ink/10 bg-snow/50 p-10 text-center">
        <p className="text-graphite max-w-md mx-auto mb-4">
          La lista que te pasaron no tiene vinos válidos en el catálogo
          actual. Puede que hayan cambiado los slugs, o que la lista esté
          vacía.
        </p>
        <Link
          href="/favoritos"
          className="cursor-wine inline-flex bg-cobalt hover:bg-ink text-snow font-semibold px-5 py-2.5 rounded-full text-sm transition-colors"
        >
          Ir a mi lista
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {groups.map((g) => (
        <li key={g.groupSlug} className="postcard p-5">
          <Link href={`/vino/${g.groupSlug}`} className="block">
            <div className="wine-thumb mx-auto mb-4 !w-20 !h-32">
              {g.imageUrl ? (
                <Image
                  src={g.imageUrl}
                  alt={g.canonicalName}
                  width={80}
                  height={128}
                  className="w-full h-full object-contain"
                />
              ) : (
                <BottleFallback brand={g.brand} name={g.canonicalName} />
              )}
            </div>
            {g.brand && (
              <p className="text-xs uppercase tracking-wider text-graphite mb-1 truncate">
                {displayBrand(g.brand)}
              </p>
            )}
            <h2 className="display text-lg font-semibold text-ink leading-tight mb-2 line-clamp-2">
              {displayWineName(g.canonicalName)}
              {g.vintage && (
                <span className="text-graphite font-normal"> · {g.vintage}</span>
              )}
            </h2>
            <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-ink/5">
              {g.minPrice ? (
                <>
                  <span className="display text-xl font-semibold text-ink">
                    {formatArs(g.minPrice)}
                  </span>
                  <span className="text-xs text-graphite">
                    {g.storeCount}{" "}
                    {g.storeCount === 1 ? "vinoteca" : "vinotecas"}
                  </span>
                </>
              ) : (
                <span className="text-sm text-graphite italic">
                  Sin stock · {g.storeCount}{" "}
                  {g.storeCount === 1 ? "vinoteca" : "vinotecas"}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
