import type { ProductGroup } from "@/lib/matching";
import { formatArs } from "@/lib/snapshot";
import { wineFullName } from "@/lib/wineNames";

/**
 * Lista compacta de links a fichas /vino (nombre + precio), sin imágenes.
 *
 * Existe por SEO: es el vehículo del enlazado interno de
 * lib/internalLinks.ts (anillos por bodega y por precio, índice completo
 * de cada bodega). Texto plano y liviano a propósito — cientos de links
 * en /bodega/catena-zapata no pueden costar cientos de <Image>.
 *
 * Server component: no manda nada al cliente además del HTML.
 */
export function WineLinkList({
  title,
  intro,
  wines,
  more,
  columns = 2,
}: {
  title: string;
  intro?: string;
  wines: ProductGroup[];
  more?: { href: string; label: string };
  columns?: 2 | 3;
}) {
  if (wines.length === 0) return null;
  return (
    <section className="mt-14 pt-10 border-t border-ink/10">
      <h2 className="display text-2xl font-semibold text-ink mb-1">{title}</h2>
      {intro && <p className="text-graphite text-sm mb-5">{intro}</p>}
      {/* Estilos en el <ul> con variantes de hijo y no en cada <li>: la
          lista de una bodega grande tiene 400+ ítems y cada clase se
          repite dos veces (HTML + payload RSC). */}
      <ul
        className={`grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 ${
          columns === 3 ? "lg:grid-cols-3" : ""
        } [&>li]:min-w-0 [&_a]:flex [&_a]:items-baseline [&_a]:justify-between [&_a]:gap-3 [&_a]:py-2 [&_a]:border-b [&_a]:border-ink/5 [&_a:hover]:text-cobalt [&_span]:min-w-0 [&_span]:truncate [&_span]:text-ink [&_small]:text-sm [&_small]:text-graphite [&_small]:tabular-nums [&_small]:shrink-0`}
      >
        {wines.map((g) => (
          <li key={g.groupSlug}>
            <a href={`/vino/${g.groupSlug}`}>
              <span>
                {wineFullName(g)}
                {g.vintage ? ` ${g.vintage}` : ""}
              </span>
              {g.minPrice != null && <small>{formatArs(g.minPrice)}</small>}
            </a>
          </li>
        ))}
      </ul>
      {more && (
        <p className="mt-4 text-sm">
          <a href={more.href} className="text-cobalt font-semibold hover:underline">
            {more.label}
          </a>
        </p>
      )}
    </section>
  );
}
