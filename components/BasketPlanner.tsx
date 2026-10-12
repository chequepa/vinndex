"use client";

/**
 * /compra — "elegí los vinos que te querés llevar y te decimos en qué
 * vinoteca te conviene comprar todo junto".
 *
 * v2 (12/10/2026), después de probarla con gente:
 *   · La respuesta es UNA vinoteca (y una segunda opción). Nunca "repartí
 *     la compra": juntar todo en un solo pedido es el punto.
 *   · No se le pide a la persona que estime envíos. El total es sin envío
 *     y se dice; si la tienda publica un mínimo de envío gratis, avisamos
 *     si la compra lo alcanza (data/store-shipping.json).
 *   · La lista vive SÓLO en el navegador (components/Basket.tsx). La v1 la
 *     sincronizaba con la URL y "Vaciar" no vaciaba: el link viejo volvía
 *     a cargar la lista. Un link compartido (`?v=`) se adopta una vez al
 *     abrirlo y se limpia de la barra.
 *
 * El cálculo corre en el server (/api/compra); acá no se importa nada de
 * lib/snapshot (ver lib/format.ts).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatArs } from "@/lib/format";
import type { BasketCell } from "@/lib/basketPlan";
import type { StoreShipping } from "@/lib/storeShipping";
import { useFavorites } from "@/components/Favorites";
import {
  basketHref,
  basketParam,
  useBasket,
  writeBasket,
  BoxIcon,
  DEFAULT_QTY,
  type BasketEntry,
} from "@/components/Basket";

type ApiItem = {
  slug: string;
  requestedSlug: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  qty: number;
  storeCount: number;
};
type ApiOption = {
  storeSlug: string;
  storeName: string;
  total: number;
  missing: string[];
  lines: { itemSlug: string; cell: BasketCell }[];
  shipping: StoreShipping | null;
};
type ApiResult = {
  items: ApiItem[];
  missing: string[];
  nowhere: string[];
  completeCount: number;
  options: ApiOption[];
};

/** Lee `?v=` una sola vez (link compartido) y lo saca de la barra. */
function takeSharedParam(): BasketEntry[] | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const v = url.searchParams.get("v");
  if (!v) return null;
  url.searchParams.delete("v");
  window.history.replaceState(null, "", url.pathname + url.search);
  const out: BasketEntry[] = [];
  for (const part of v.split(",")) {
    const [slug, q] = part.split("*");
    if (slug && /^[a-z0-9-]{2,200}$/.test(slug)) {
      out.push({ slug, qty: Math.max(1, Math.min(120, Math.round(Number(q) || DEFAULT_QTY))) });
    }
  }
  return out.length ? out : null;
}

export function BasketPlanner() {
  const list = useBasket();
  const favorites = useFavorites();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const adopted = useRef(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;
    const shared = takeSharedParam();
    if (shared) writeBasket(shared);
  }, []);

  const param = basketParam(list);
  useEffect(() => {
    if (!param) return;
    const id = ++reqId.current;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/compra?v=${encodeURIComponent(param)}`)
        .then((r) => r.json() as Promise<ApiResult>)
        .then((j) => {
          if (id === reqId.current) setResult(j);
        })
        .catch(() => {
          /* se queda con el último resultado */
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    }, 150);
    return () => clearTimeout(t);
  }, [param]);

  const setQty = (slug: string, qty: number) =>
    writeBasket(list.map((e) => (e.slug === slug ? { ...e, qty } : e)));
  const remove = (slug: string) => writeBasket(list.filter((e) => e.slug !== slug));

  if (list.length === 0) {
    return <EmptyState favorites={favorites} />;
  }

  const items = result?.items ?? [];
  const byItem = new Map(items.map((i) => [i.slug, i]));
  // Mientras llega la primera respuesta, la lista se muestra con lo que hay
  // en el navegador (slug + cantidad).
  const rows = list.map((e) => {
    const it = items.find((i) => i.requestedSlug === e.slug || i.slug === e.slug);
    return { entry: e, item: it };
  });
  const [first, second] = result?.options ?? [];
  const nowhere = (result?.nowhere ?? []).map((s) => byItem.get(s)?.name ?? s);
  const shareUrl = `https://vinndex.com.ar${basketHref(list)}`;

  return (
    <div className="space-y-10">
      {/* 1. Tus vinos */}
      <section aria-labelledby="tus-vinos">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 id="tus-vinos" className="display text-2xl font-semibold text-ink">
            Los vinos que te querés llevar
          </h2>
          <button
            type="button"
            onClick={() => {
              writeBasket([]);
              setResult(null);
            }}
            className="min-h-11 px-3 text-sm text-graphite hover:text-malbec underline"
          >
            Vaciar y empezar de nuevo
          </button>
        </div>
        <ul className="divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
          {rows.map(({ entry, item }) => (
            <li key={entry.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-48">
                {item ? (
                  <>
                    <p className="text-[11px] uppercase tracking-wide text-graphite truncate">
                      {item.brand}
                    </p>
                    <Link href={`/vino/${item.slug}`} className="display text-base font-semibold text-ink leading-tight hover:text-cobalt">
                      {item.name}
                    </Link>
                  </>
                ) : (
                  <span className="block h-10 rounded bg-snow animate-pulse" aria-label="Cargando" />
                )}
              </div>
              <QtyControl qty={entry.qty} onChange={(q) => setQty(entry.slug, q)} />
              <button
                type="button"
                onClick={() => remove(entry.slug)}
                className="min-h-11 px-2 text-sm text-graphite hover:text-malbec"
                aria-label={`Sacar ${item?.name ?? "este vino"}`}
              >
                Sacar
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-graphite">
          Para sumar más vinos, buscalos y tocá{" "}
          <strong className="text-ink">“Sumar a mi compra”</strong>.{" "}
          <Link href="/buscar" className="text-cobalt underline">
            Buscar vinos
          </Link>
        </p>
      </section>

      {/* 2. Dónde comprar todo */}
      <section aria-labelledby="donde" aria-live="polite" className={loading ? "opacity-60 transition-opacity" : ""}>
        {list.length < 2 ? (
          <p className="rounded-2xl bg-snow border border-ink/10 p-5 text-graphite">
            Sumá al menos otro vino y te decimos en qué vinoteca te conviene
            comprar todo junto.
          </p>
        ) : !first ? (
          result && (
            <p className="rounded-2xl bg-snow border border-ink/10 p-5 text-graphite">
              Hoy ninguna vinoteca tiene estos vinos con stock.
            </p>
          )
        ) : (
          <>
            <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-2">
              {first.missing.length === 0 ? "Dónde te conviene comprar todo" : "La que más tiene"}
            </p>
            <h2 id="donde" className="display text-3xl md:text-4xl font-semibold text-ink leading-tight mb-5">
              {first.missing.length === 0 ? (
                <>
                  Comprá todo en{" "}
                  <span className="italic font-normal">{first.storeName}</span>
                </>
              ) : (
                <>Ninguna vinoteca tiene los {list.length} juntos</>
              )}
            </h2>
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] items-start">
              <OptionCard option={first} byItem={byItem} primary />
              {second ? (
                <OptionCard option={second} byItem={byItem} best={first.total} />
              ) : (
                <p className="text-sm text-graphite rounded-2xl border border-ink/10 p-5">
                  {first.missing.length === 0
                    ? `${first.storeName} es la única vinoteca que hoy tiene todos estos vinos.`
                    : "No hay otra vinoteca con más vinos de tu lista."}
                </p>
              )}
            </div>
            {nowhere.length > 0 && (
              <p className="mt-4 text-sm text-terracota">
                Sin stock hoy en ninguna vinoteca: {nowhere.join(", ")}.
              </p>
            )}
            <p className="mt-5 text-xs text-graphite max-w-3xl">
              Precios de hoy, <strong>sin envío</strong>. Si la vinoteca publica
              un mínimo para envío gratis, te avisamos si tu compra lo alcanza.
              Confirmá precio y stock en la vinoteca antes de pagar: no vendemos
              vino ni cobramos comisión.
            </p>
          </>
        )}
      </section>

      {list.length >= 2 && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Mirá dónde conviene comprar estos vinos juntos: ${shareUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center min-h-11 px-5 rounded-full border border-ink/15 text-sm font-medium text-ink hover:border-green2 hover:text-green2"
        >
          Mandar esta lista por WhatsApp
        </a>
      )}
    </div>
  );
}

function OptionCard({
  option,
  byItem,
  primary = false,
  best,
}: {
  option: ApiOption;
  byItem: Map<string, ApiItem>;
  primary?: boolean;
  best?: number;
}) {
  const ship = shippingNote(option);
  const diff = best != null ? option.total - best : 0;
  return (
    <article
      className={`rounded-3xl border p-5 sm:p-6 bg-white ${primary ? "border-cobalt ring-2 ring-cobalt/15" : "border-ink/10"}`}
    >
      {!primary && (
        <p className="text-[11px] uppercase tracking-[0.16em] text-graphite font-semibold mb-1">
          Segunda opción
        </p>
      )}
      <h3 className={`display font-semibold text-ink ${primary ? "text-xl" : "text-lg"}`}>
        {option.storeName}
      </h3>
      <p className={`display font-semibold text-cobalt tabular-nums ${primary ? "text-4xl" : "text-2xl"}`}>
        {formatArs(option.total)}
      </p>
      <p className="text-xs text-graphite mb-4">
        {option.missing.length === 0
          ? `los ${option.lines.length} vinos · sin envío`
          : `${option.lines.length} de ${option.lines.length + option.missing.length} vinos · sin envío`}
        {diff > 0 && ` · ${formatArs(diff)} más que la primera`}
      </p>
      <ul className="space-y-2 mb-4">
        {option.lines.map((l) => {
          const it = byItem.get(l.itemSlug);
          return (
            <li key={l.itemSlug} className="flex items-start justify-between gap-3 text-sm">
              <a
                href={l.cell.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-ink hover:text-cobalt underline decoration-ink/20 min-w-0"
              >
                {it?.qty} × {it?.name}
                {l.cell.cases > 0 && (
                  <span className="block text-[11px] text-graphite no-underline">
                    {l.cell.cases} caja{l.cell.cases === 1 ? "" : "s"} x{l.cell.caseSize}
                  </span>
                )}
              </a>
              <span className="tabular-nums text-graphite shrink-0 text-right">
                {formatArs(l.cell.total)}
                <span className="block text-[11px]">{formatArs(l.cell.unit)} c/u</span>
              </span>
            </li>
          );
        })}
      </ul>
      {option.missing.length > 0 && (
        <p className="text-xs text-terracota mb-3">
          No tiene: {option.missing.map((s) => byItem.get(s)?.name ?? s).join(", ")}
        </p>
      )}
      {ship && <p className={`text-xs mb-3 ${ship.ok ? "text-green2" : "text-graphite"}`}>{ship.text}</p>}
      <p className="text-[11px] text-graphite">
        Tocá cada vino para ir directo a su página en {option.storeName}.
      </p>
    </article>
  );
}

function shippingNote(o: ApiOption): { text: string; ok: boolean } | null {
  const g = o.shipping?.gratisDesde;
  if (!g) return null;
  // El sitio asume AMBA (todavía no sabe tu zona): primero ese mínimo,
  // después el que la tienda publica sin zona, después el nacional.
  const pick: [string, number] | null =
    g.amba != null ? ["a AMBA", g.amba] : g.general != null ? ["", g.general] : g.nacional != null ? ["a todo el país", g.nacional] : null;
  if (!pick) return null;
  const [zone, min] = pick;
  const where = zone ? ` ${zone}` : "";
  return o.total >= min
    ? { text: `✓ Llega al envío gratis${where} (desde ${formatArs(min)}, según la tienda).`, ok: true }
    : { text: `Envío gratis${where} desde ${formatArs(min)} (según la tienda): te faltan ${formatArs(min - o.total)}.`, ok: false };
}

function EmptyState({ favorites }: { favorites: string[] }) {
  return (
    <div className="max-w-2xl">
      <ol className="space-y-4 mb-8">
        {[
          ["Buscá los vinos que te querés llevar", "En el buscador o en cada ficha, tocá “Sumar a mi compra”."],
          ["Elegí cuántas botellas de cada uno", "Arranca en 6 (una caja); lo cambiás acá."],
          ["Te decimos dónde comprar todo junto", "La vinoteca donde te sale más barato el pedido entero, y una segunda opción."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="display text-3xl font-semibold text-malbec/70 tabular-nums w-8 shrink-0">{i + 1}</span>
            <span>
              <span className="block display text-lg font-semibold text-ink">{t}</span>
              <span className="block text-graphite text-sm">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/buscar"
          className="inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-cobalt text-snow text-sm font-semibold"
        >
          Buscar vinos
        </Link>
        {favorites.length >= 2 && (
          <button
            type="button"
            onClick={() => writeBasket(favorites.slice(0, 12).map((slug) => ({ slug, qty: DEFAULT_QTY })))}
            className="inline-flex items-center gap-2 min-h-11 px-5 rounded-full border border-ink/15 text-sm font-medium text-ink hover:border-cobalt hover:text-cobalt"
          >
            <BoxIcon /> Usar mis {Math.min(favorites.length, 12)} favoritos
          </button>
        )}
      </div>
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
      <span className="w-16 text-center tabular-nums">
        <span className="block text-base font-semibold text-ink">{qty}</span>
        <span className="block text-[10px] text-graphite -mt-0.5">
          {qty % 6 === 0 ? `${qty / 6} caja${qty / 6 === 1 ? "" : "s"}` : `botella${qty === 1 ? "" : "s"}`}
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
    </div>
  );
}
