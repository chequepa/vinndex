"use client";

/**
 * Planificador de /compra. Recibe la MATRIZ (vino × vinoteca → costo de la
 * cantidad pedida) ya calculada en el server y resuelve acá las
 * combinaciones, porque el costo de envío lo edita la persona y re-ordenar
 * tiene que ser instantáneo. Cambiar cantidades o sacar un vino sí vuelve
 * al server (router.replace con el nuevo `?v=`).
 *
 * OJO: nada de lib/snapshot acá (ver lib/format.ts).
 */

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatArs } from "@/lib/format";
import { planBasket, type BasketMatrix, type Plan } from "@/lib/basketPlan";
import { useFavorites } from "@/components/Favorites";
import {
  basketHref,
  useBasket,
  writeBasket,
  BoxIcon,
  DEFAULT_QTY,
  type BasketEntry,
} from "@/components/Basket";

type Props = {
  matrix: BasketMatrix | null;
  /** El `?v=` con el que se calculó la matriz. */
  param: string;
  snapshotDate: string;
};

const SHIPPING_KEY = "vx:compra-envio";
const SHIPPING_PRESETS = [0, 5000, 8000, 12000];

// Envío estimado: preferencia del navegador, mismo patrón de store
// externo que Favoritos/Comparar (sin setState en effects, sin mismatch
// de hidratación: el server siempre renderiza 0).
const shippingListeners = new Set<() => void>();
function subscribeShipping(cb: () => void) {
  shippingListeners.add(cb);
  return () => shippingListeners.delete(cb);
}
function readShipping(): number {
  try {
    const n = Number(localStorage.getItem(SHIPPING_KEY));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
function writeShipping(n: number) {
  try {
    localStorage.setItem(SHIPPING_KEY, String(n));
  } catch {
    /* sin storage: no se recuerda */
  }
  shippingListeners.forEach((cb) => cb());
}

export function BasketPlanner({ matrix, param, snapshotDate }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const stored = useBasket();
  const favorites = useFavorites();
  const shipping = useSyncExternalStore(subscribeShipping, readShipping, () => 0);
  const [showAllSingles, setShowAllSingles] = useState(false);

  // Sin `?v=` pero con compra guardada: cargarla. Con `?v=` (link
  // compartido o recién editado) y nada guardado: adoptarla.
  useEffect(() => {
    if (!param && stored.length > 0) {
      router.replace(basketHref(stored));
    } else if (param && stored.length === 0 && matrix && matrix.items.length > 0) {
      writeBasket(matrix.items.map((i) => ({ slug: i.slug, qty: i.qty })));
    }
  }, [param, stored, matrix, router]);

  const entries: BasketEntry[] = useMemo(
    () => (matrix ? matrix.items.map((i) => ({ slug: i.slug, qty: i.qty })) : []),
    [matrix],
  );

  function apply(next: BasketEntry[]) {
    writeBasket(next);
    startTransition(() => router.replace(basketHref(next), { scroll: false }));
  }

  const setShippingPersist = writeShipping;

  const plans = useMemo(
    () => (matrix && matrix.items.length > 0 ? planBasket(matrix, shipping) : null),
    [matrix, shipping],
  );

  const storeName = useMemo(() => {
    const m = new Map((matrix?.stores ?? []).map((s) => [s.slug, s.name]));
    return (slug: string) => m.get(slug) ?? slug;
  }, [matrix]);

  if (!matrix || matrix.items.length === 0) {
    const favCount = favorites.length;
    return (
      <div className="max-w-2xl">
        <h2 className="display text-2xl font-semibold text-ink mb-3">
          Todavía no sumaste vinos
        </h2>
        <p className="text-graphite leading-relaxed mb-6">
          En la ficha de cada vino tocá{" "}
          <strong className="text-ink">“Sumar a una compra de varios vinos”</strong>.
          Cuando tengas dos o más, acá te decimos dónde te conviene comprar
          todo junto.
        </p>
        <div className="flex flex-wrap gap-3">
          {favCount >= 2 && (
            <button
              type="button"
              onClick={() =>
                apply(favorites.slice(0, 12).map((slug) => ({ slug, qty: DEFAULT_QTY })))
              }
              className="inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-cobalt text-snow text-sm font-semibold"
            >
              <BoxIcon /> Armar la compra con mis {Math.min(favCount, 12)} favoritos
            </button>
          )}
          <Link
            href="/buscar"
            className="inline-flex items-center min-h-11 px-5 rounded-full border border-ink/15 text-sm font-medium text-ink hover:border-cobalt hover:text-cobalt"
          >
            Buscar vinos
          </Link>
        </div>
      </div>
    );
  }

  const items = matrix.items;
  const { singles, split, pair, best } = plans!;
  const fullSingles = singles.filter((p) => p.uncovered.length === 0);
  const nowhere = items.filter((i) => Object.keys(i.byStore).length === 0);
  const bottles = items.reduce((a, i) => a + i.qty, 0);

  // ¿Desde qué costo de envío conviene juntar todo en una?
  const breakEven =
    fullSingles[0] && split.uncovered.length === 0 && split.stores.length > 1
      ? (fullSingles[0].winesTotal - split.winesTotal) / (split.stores.length - 1)
      : null;

  const shareUrl = `https://vinndex.com.ar${basketHref(entries)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Armé esta compra de vinos en Vinndex, mirá dónde conviene comprarla: ${shareUrl}`,
  )}`;

  return (
    <div className={`space-y-10 ${pending ? "opacity-60 transition-opacity" : ""}`}>
      {/* Lista de vinos */}
      <section aria-labelledby="tus-vinos">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 id="tus-vinos" className="display text-2xl font-semibold text-ink">
            Tus vinos{" "}
            <span className="text-graphite text-base font-normal">
              {items.length} vinos · {bottles} botellas
            </span>
          </h2>
          <button
            type="button"
            onClick={() => apply([])}
            className="text-sm text-graphite hover:text-malbec underline"
          >
            Vaciar
          </button>
        </div>
        <ul className="space-y-2">
          {items.map((it) => {
            const options = Object.keys(it.byStore).length;
            return (
              <li
                key={it.slug}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-[11px] uppercase tracking-wide text-graphite truncate">
                    {it.brand || "Sin bodega identificada"}
                  </p>
                  <Link
                    href={`/vino/${it.slug}`}
                    className="display text-base font-semibold text-ink leading-tight hover:text-cobalt"
                  >
                    {it.name}
                  </Link>
                  <p className="text-xs text-graphite">
                    {options === 0
                      ? "Hoy no hay ninguna vinoteca con stock para esta cantidad"
                      : `${options} vinoteca${options === 1 ? "" : "s"} pueden venderte ${it.qty}`}
                  </p>
                </div>
                <QtyControl
                  qty={it.qty}
                  onChange={(q) =>
                    apply(entries.map((e) => (e.slug === it.slug ? { ...e, qty: q } : e)))
                  }
                />
                <button
                  type="button"
                  onClick={() => apply(entries.filter((e) => e.slug !== it.slug))}
                  className="min-h-11 px-3 text-sm text-graphite hover:text-malbec"
                  aria-label={`Sacar ${it.name}`}
                >
                  Sacar
                </button>
              </li>
            );
          })}
        </ul>
        {matrix.missing.length > 0 && (
          <p className="mt-3 text-sm text-terracota">
            {matrix.missing.length} vino{matrix.missing.length === 1 ? "" : "s"} del link ya no
            está{matrix.missing.length === 1 ? "" : "n"} en el catálogo.
          </p>
        )}
        {items.length < 2 && (
          <p className="mt-4 text-sm text-graphite">
            Sumá al menos otro vino desde su ficha para comparar dónde comprar todo junto.
          </p>
        )}
      </section>

      {/* Envío */}
      <section aria-labelledby="envio" className="rounded-3xl bg-snow border border-ink/10 p-5">
        <h2 id="envio" className="display text-lg font-semibold text-ink mb-1">
          ¿Cuánto te sale cada envío?
        </h2>
        <p className="text-sm text-graphite mb-3">
          No sabemos el costo de envío de cada vinoteca (depende de tu zona y
          del monto). Poné uno estimado por vinoteca y re-calculamos: es lo
          que decide si conviene juntar o repartir.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {SHIPPING_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={shipping === n}
              onClick={() => setShippingPersist(n)}
              className={
                shipping === n
                  ? "min-h-11 px-4 rounded-full bg-ink text-snow text-sm font-medium"
                  : "min-h-11 px-4 rounded-full bg-white border border-ink/15 text-sm font-medium text-ink hover:border-cobalt"
              }
            >
              {n === 0 ? "Gratis / no lo cuento" : formatArs(n)}
            </button>
          ))}
          <label className="inline-flex items-center gap-2 text-sm text-graphite">
            otro:
            <input
              inputMode="numeric"
              value={SHIPPING_PRESETS.includes(shipping) ? "" : String(shipping)}
              placeholder="$"
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^\d]/g, ""));
                setShippingPersist(Number.isFinite(n) ? n : 0);
              }}
              className="w-28 min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-ink tabular-nums"
            />
          </label>
        </div>
      </section>

      {/* Veredicto */}
      {items.length >= 2 && best && (
        <section aria-labelledby="veredicto">
          <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-2">
            Lo que más te conviene
          </p>
          <h2 id="veredicto" className="display text-3xl md:text-4xl font-semibold text-ink leading-tight">
            {best.stores.length === 1
              ? <>Todo en <span className="italic font-normal">{storeName(best.stores[0])}</span></>
              : <>Repartido en {best.stores.length} vinotecas</>}
            <span className="block text-cobalt tabular-nums mt-1">{formatArs(best.total)}</span>
          </h2>
          <p className="text-graphite mt-3 max-w-3xl">
            {breakEven != null && breakEven > 0 ? (
              <>
                Juntar todo en una vinoteca cuesta {formatArs(fullSingles[0].winesTotal - split.winesTotal)}{" "}
                más en vino que comprar cada uno donde está más barato ({split.stores.length} vinotecas).
                Si cada envío extra te sale más de{" "}
                <strong className="text-ink">{formatArs(Math.round(breakEven))}</strong>, conviene juntar.
              </>
            ) : breakEven != null ? (
              <>Comprar todo en {storeName(fullSingles[0].stores[0])} ya es lo más barato, aun sin contar envío.</>
            ) : fullSingles.length === 0 ? (
              <>Ninguna vinoteca tiene todos tus vinos en esas cantidades: la mejor opción es repartir.</>
            ) : null}
          </p>
          {nowhere.length > 0 && (
            <p className="mt-2 text-sm text-terracota">
              {nowhere.map((n) => n.name).join(", ")}: sin stock hoy para esa cantidad, queda afuera de las cuentas.
            </p>
          )}
        </section>
      )}

      {/* Opciones */}
      {items.length >= 2 && (
        <div className="grid gap-5 lg:grid-cols-3 items-start">
          <PlanCard
            title="Todo en una vinoteca"
            subtitle={
              fullSingles.length > 0
                ? `${fullSingles.length} vinoteca${fullSingles.length === 1 ? "" : "s"} tienen todo`
                : "Ninguna tiene todo: la que más cubre"
            }
            plan={fullSingles[0] ?? singles[0] ?? null}
            items={items}
            storeName={storeName}
            highlight={best === (fullSingles[0] ?? null)}
          >
            {fullSingles.length > 1 && (
              <div className="mt-4 pt-3 border-t border-ink/10">
                <p className="text-[11px] uppercase tracking-[0.16em] text-graphite font-semibold mb-2">
                  Otras que tienen todo
                </p>
                <ul className="space-y-1 text-sm">
                  {fullSingles.slice(1, showAllSingles ? 15 : 4).map((p) => (
                    <li key={p.stores[0]} className="flex justify-between gap-3">
                      <span className="truncate">{storeName(p.stores[0])}</span>
                      <span className="tabular-nums text-graphite">{formatArs(p.total)}</span>
                    </li>
                  ))}
                </ul>
                {fullSingles.length > 4 && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-cobalt underline"
                    onClick={() => setShowAllSingles((v) => !v)}
                  >
                    {showAllSingles ? "Ver menos" : `Ver ${Math.min(fullSingles.length, 15) - 4} más`}
                  </button>
                )}
              </div>
            )}
          </PlanCard>
          <PlanCard
            title="En dos vinotecas"
            subtitle="La mejor pareja que cubre todo"
            plan={pair}
            items={items}
            storeName={storeName}
            highlight={best === pair}
            emptyText="No hay dos vinotecas que juntas tengan todo."
          />
          <PlanCard
            title="Cada vino donde está más barato"
            subtitle={`${split.stores.length} vinoteca${split.stores.length === 1 ? "" : "s"}`}
            plan={split}
            items={items}
            storeName={storeName}
            highlight={best === split}
          />
        </div>
      )}

      <section className="flex flex-wrap items-center gap-3 pt-2">
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center min-h-11 px-5 rounded-full bg-green2 text-snow text-sm font-semibold hover:opacity-90"
        >
          Mandar esta compra por WhatsApp
        </a>
        <span className="text-xs text-graphite">
          Precios relevados el{" "}
          {new Date(snapshotDate).toLocaleDateString("es-AR", {
            day: "numeric",
            month: "long",
            timeZone: "America/Argentina/Buenos_Aires",
          })}
          . Confirmá precio y stock en cada vinoteca antes de pagar. No
          vendemos vino ni cobramos comisión.
        </span>
      </section>
    </div>
  );
}

function QtyControl({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Botellas">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, qty - 1))}
        className="w-11 h-11 rounded-full border border-ink/15 text-lg text-ink hover:border-cobalt"
        aria-label="Una botella menos"
      >
        −
      </button>
      <span className="w-14 text-center tabular-nums">
        <span className="block text-base font-semibold text-ink">{qty}</span>
        <span className="block text-[10px] text-graphite -mt-0.5">
          {qty % 6 === 0 ? `${qty / 6} caja${qty / 6 === 1 ? "" : "s"}` : "botellas"}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(120, qty + 1))}
        className="w-11 h-11 rounded-full border border-ink/15 text-lg text-ink hover:border-cobalt"
        aria-label="Una botella más"
      >
        +
      </button>
      {qty % 6 !== 0 && (
        <button
          type="button"
          onClick={() => onChange(Math.max(6, Math.round(qty / 6) * 6))}
          className="ml-1 min-h-11 px-3 rounded-full text-xs text-cobalt hover:underline"
        >
          caja
        </button>
      )}
    </div>
  );
}

function PlanCard({
  title,
  subtitle,
  plan,
  items,
  storeName,
  highlight,
  emptyText,
  children,
}: {
  title: string;
  subtitle: string;
  plan: Plan | null;
  items: BasketMatrix["items"];
  storeName: (s: string) => string;
  highlight: boolean;
  emptyText?: string;
  children?: React.ReactNode;
}) {
  const byItem = new Map(items.map((i) => [i.slug, i]));
  const grouped = new Map<string, Plan["lines"]>();
  for (const l of plan?.lines ?? []) {
    const arr = grouped.get(l.storeSlug) ?? [];
    arr.push(l);
    grouped.set(l.storeSlug, arr);
  }
  return (
    <article
      className={`rounded-3xl border p-5 bg-white ${
        // En mobile la recomendada va primero; en desktop se respeta el
        // orden una → dos → repartido para que se lea como escala.
        highlight ? "border-cobalt ring-2 ring-cobalt/20 order-first lg:order-none" : "border-ink/10"
      }`}
    >
      {highlight && (
        <p className="text-[10px] uppercase tracking-[0.18em] text-cobalt font-semibold mb-1">
          La más conveniente
        </p>
      )}
      <h3 className="display text-lg font-semibold text-ink">{title}</h3>
      <p className="text-xs text-graphite mb-3">{subtitle}</p>
      {!plan ? (
        <p className="text-sm text-graphite">{emptyText ?? "Sin opciones."}</p>
      ) : (
        <>
          <p className="display text-2xl font-semibold text-cobalt tabular-nums">
            {formatArs(plan.total)}
          </p>
          <p className="text-xs text-graphite mb-4 tabular-nums">
            vino {formatArs(plan.winesTotal)}
            {plan.shippingTotal > 0 && <> + envíos {formatArs(plan.shippingTotal)}</>}
          </p>
          <div className="space-y-4">
            {[...grouped.entries()].map(([store, lines]) => (
              <div key={store}>
                <p className="text-sm font-semibold text-ink mb-1">{storeName(store)}</p>
                <ul className="space-y-1.5">
                  {lines.map((l) => {
                    const it = byItem.get(l.itemSlug)!;
                    return (
                      <li key={l.itemSlug} className="text-xs text-graphite">
                        <a
                          href={l.cell.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-ink hover:text-cobalt underline decoration-ink/20"
                        >
                          {it.qty} × {it.name}
                        </a>
                        <span className="block tabular-nums">
                          {formatArs(l.cell.total)} · {formatArs(l.cell.unit)} c/u
                          {l.cell.cases > 0 && ` · ${l.cell.cases} caja${l.cell.cases === 1 ? "" : "s"} x${l.cell.caseSize}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {plan.uncovered.length > 0 && (
            <p className="mt-3 text-xs text-terracota">
              Le falta: {plan.uncovered.map((s) => byItem.get(s)?.name ?? s).join(", ")}
            </p>
          )}
        </>
      )}
      {children}
    </article>
  );
}
