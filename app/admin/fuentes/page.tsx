import type { Metadata } from "next";
import { snapshot, snapshotStats } from "@/lib/snapshot";
import { STORES } from "@/lib/stores";
import type { StorePlatform } from "@/lib/adapters/types";

export const metadata: Metadata = {
  title: "Auditoría de fuentes — Vinndex",
};

/** Static metadata per platform (label, color, difficulty tier). */
const PLATFORM_META: Record<
  StorePlatform,
  {
    label: string;
    color: string;
    className: string;
    difficulty: "easy" | "med" | "hard";
    notes: string;
  }
> = {
  tiendanube: {
    label: "Tiendanube",
    color: "#2FB344",
    className: "plat-tn",
    difficulty: "easy",
    notes: "JSON-LD en páginas paginadas",
  },
  woocommerce: {
    label: "WooCommerce",
    color: "#7F54B3",
    className: "plat-wc",
    difficulty: "easy",
    notes: "/wp-json/wc/store/v1/products",
  },
  vtex: {
    label: "VTEX",
    color: "#FF3366",
    className: "plat-vtex",
    difficulty: "easy",
    notes: "catalog_system/pub/products/search",
  },
  shopify: {
    label: "Shopify",
    color: "#96BF48",
    className: "plat-shopify",
    difficulty: "easy",
    notes: "/products.json público",
  },
  magento: {
    label: "Magento",
    color: "#34313F",
    className: "plat-magento",
    difficulty: "med",
    notes: "HTML parse de catalogsearch",
  },
  prestashop: {
    label: "PrestaShop",
    color: "#1F2937",
    className: "plat-ps",
    difficulty: "med",
    notes: "HTML parse de categorías",
  },
  mercadolibre: {
    label: "Mercado Libre",
    color: "#FFE600",
    className: "plat-ml",
    difficulty: "med",
    notes: "Listing HTML + /products/{id} OAuth",
  },
  bigcommerce: {
    label: "BigCommerce",
    color: "#34313F",
    className: "plat-bc",
    difficulty: "easy",
    notes: "Catalog API",
  },
};

function DifficultyPill({ d }: { d: "easy" | "med" | "hard" }) {
  const cls =
    d === "easy" ? "dif-pill dif-easy" : d === "med" ? "dif-pill dif-med" : "dif-pill dif-hard";
  const label = d === "easy" ? "Fácil" : d === "med" ? "Media" : "Difícil";
  return <span className={cls}>{label}</span>;
}

export default function AdminFuentes() {
  const stats = snapshotStats();
  // Map snapshot.stores (productCount per slug) so the table can show
  // live counts alongside the configured stores list.
  const productCountBySlug: Record<string, number> = {};
  for (const s of snapshot.stores) productCountBySlug[s.storeSlug] = s.productCount;

  // Platform breakdown (count stores + sum products).
  const byPlatform: Record<
    string,
    { count: number; products: number; stores: typeof STORES }
  > = {};
  for (const s of STORES) {
    const b = (byPlatform[s.platform] ??= { count: 0, products: 0, stores: [] });
    b.count++;
    b.products += productCountBySlug[s.slug] ?? 0;
    b.stores.push(s);
  }
  const platformsSorted = Object.entries(byPlatform).sort(
    (a, b) => b[1].count - a[1].count,
  );

  // Stores table: sort by platform (same visual grouping) then by slug.
  const platformOrder: Record<string, number> = {
    tiendanube: 1,
    woocommerce: 2,
    shopify: 3,
    vtex: 4,
    magento: 5,
    prestashop: 6,
    mercadolibre: 7,
    bigcommerce: 8,
  };
  const rows = [...STORES].sort((a, b) => {
    const pa = platformOrder[a.platform] ?? 99;
    const pb = platformOrder[b.platform] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.slug.localeCompare(b.slug);
  });

  const totalConfigured = STORES.length;
  const totalInSnapshot = stats.storeCount;
  const missingFromSnapshot = totalConfigured - totalInSnapshot;

  return (
    <>
      {/* NAV */}
      <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 shrink-0 cursor-wine">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path
                d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
                fill="#1E3FBF"
                stroke="#1E3FBF"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="24" cy="8" r="3" fill="#E8B547" />
            </svg>
            <span className="display text-xl font-semibold text-ink">
              Vinndex
            </span>
            <span className="text-xs text-graphite ml-2 hidden sm:inline">
              · Admin / Auditoría
            </span>
          </a>
          <div className="flex gap-2 text-sm">
            <a href="/" className="text-graphite hover:text-ink">
              ← Volver al sitio
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative bg-ink text-snow overflow-hidden grain">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #0F1729 0%, #1E3FBF 50%, #6B1E2E 100%)",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
          <p className="text-mustard text-xs tracking-[0.22em] uppercase font-bold mb-4">
            Auditoría de fuentes · En producción
          </p>
          <h1 className="display text-4xl md:text-6xl lg:text-7xl font-semibold leading-[1.02] mb-6">
            {totalConfigured} vinotecas configuradas.
            <br />
            <span className="italic font-normal">
              {stats.multiStoreGroupCount.toLocaleString("es-AR")} vinos
              comparables
            </span>{" "}
            hoy.
          </h1>
          <p className="text-snow/85 text-lg max-w-3xl leading-relaxed">
            Todo lo que ves acá se genera dinámicamente desde{" "}
            <code className="text-mustard bg-snow/10 px-1.5 py-0.5 rounded">
              data/stores.json
            </code>{" "}
            y el último snapshot del daily CI. La tabla de abajo refleja el
            estado real: qué scrapea, cuántos productos trae y en qué
            plataforma corre.
          </p>
        </div>
      </section>

      {/* STATS */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-2 bg-green2/10 text-green2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green2 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green2" />
            </span>
            En producción
          </span>
          <h2 className="display text-2xl font-semibold text-ink">
            Snapshot del{" "}
            {new Date(stats.generatedAt).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border-2 border-green2/30 rounded-2xl p-5">
            <div className="display text-5xl font-semibold text-green2 leading-none">
              {totalInSnapshot}
            </div>
            <div className="text-sm text-ink font-semibold mt-2">
              vinotecas en el snapshot
            </div>
            <div className="text-xs text-graphite mt-1">
              {totalConfigured} configuradas
              {missingFromSnapshot > 0
                ? ` · ${missingFromSnapshot} sin productos hoy`
                : ""}
            </div>
          </div>
          <div className="bg-white border border-ink/10 rounded-2xl p-5">
            <div className="display text-5xl font-semibold text-cobalt leading-none">
              {stats.productCount.toLocaleString("es-AR")}
            </div>
            <div className="text-sm text-ink font-semibold mt-2">
              ofertas de precio
            </div>
            <div className="text-xs text-graphite mt-1">
              productos individuales por tienda
            </div>
          </div>
          <div className="bg-white border border-ink/10 rounded-2xl p-5">
            <div className="display text-5xl font-semibold text-malbec leading-none">
              {stats.multiStoreGroupCount.toLocaleString("es-AR")}
            </div>
            <div className="text-sm text-ink font-semibold mt-2">
              vinos comparables
            </div>
            <div className="text-xs text-graphite mt-1">
              el mismo vino en 2+ vinotecas
            </div>
          </div>
          <div className="bg-white border border-ink/10 rounded-2xl p-5">
            <div
              className="display text-5xl font-semibold leading-none"
              style={{ color: "#E8B547" }}
            >
              {platformsSorted.length}
            </div>
            <div className="text-sm text-ink font-semibold mt-2">
              adapters activos
            </div>
            <div className="text-xs text-graphite mt-1">
              {platformsSorted.map(([p]) => PLATFORM_META[p as StorePlatform]?.label ?? p).join(" · ")}
            </div>
          </div>
        </div>
      </section>

      {/* POR PLATAFORMA */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 pb-10">
        <div className="bg-white rounded-2xl border border-ink/10 p-6">
          <h3 className="display text-lg font-semibold mb-4">Por plataforma</h3>
          <div className="space-y-3">
            {platformsSorted.map(([p, info]) => {
              const meta = PLATFORM_META[p as StorePlatform];
              const color = meta?.color ?? "#34313F";
              const label = meta?.label ?? p;
              const widthPct = Math.min(
                100,
                (info.products / Math.max(stats.productCount, 1)) * 100,
              );
              return (
                <div key={p} className="plat-bar">
                  <div className="plat-bar-count">
                    <div
                      className="display text-4xl font-semibold"
                      style={{ color }}
                    >
                      {info.count}
                    </div>
                    <div className="text-[10px] text-graphite uppercase tracking-wider">
                      tiendas
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="plat-pill"
                        style={{ background: color, color: "white" }}
                      >
                        {label}
                      </span>
                      <span className="font-semibold text-ink">
                        {info.products.toLocaleString("es-AR")} productos
                      </span>
                    </div>
                    <div className="plat-bar-meter">
                      <div
                        className="plat-bar-fill"
                        style={{
                          width: `${widthPct}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TABLA */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 pb-14 fuentes-table">
        <div className="bg-white rounded-2xl border border-ink/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink/10">
            <h3 className="display text-lg font-semibold">
              Las {totalConfigured} fuentes
            </h3>
            <p className="text-xs text-graphite mt-1">
              Agrupadas por plataforma · productos = última corrida del daily
              CI
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-graphite uppercase tracking-widest bg-snow/60 border-b border-ink/10">
                <th className="pl-5 py-2">#</th>
                <th className="py-2">Tienda</th>
                <th className="py-2">URL</th>
                <th className="py-2">Plataforma</th>
                <th className="py-2 text-right">Productos</th>
                <th className="py-2">Dificultad</th>
                <th className="pr-5 py-2">Notas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, idx) => {
                const meta = PLATFORM_META[s.platform];
                const pc = productCountBySlug[s.slug] ?? 0;
                const host = s.baseUrl
                  .replace(/^https?:\/\//, "")
                  .replace(/\/$/, "");
                return (
                  <tr
                    key={s.slug}
                    className={pc > 0 ? "row-yes" : "row-maybe"}
                  >
                    <td className="pl-5 py-2 text-graphite">{idx + 1}</td>
                    <td className="py-2 font-semibold">{s.name}</td>
                    <td className="py-2 text-graphite">
                      <a
                        href={s.baseUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="hover:text-ink"
                      >
                        {host}
                      </a>
                    </td>
                    <td className="py-2">
                      <span
                        className={`plat-pill ${meta?.className ?? ""}`}
                        style={
                          meta
                            ? { background: `${meta.color}20`, color: meta.color }
                            : undefined
                        }
                      >
                        {meta?.label ?? s.platform}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">
                      {pc > 0 ? pc.toLocaleString("es-AR") : "—"}
                    </td>
                    <td className="py-2">
                      <DifficultyPill d={meta?.difficulty ?? "med"} />
                    </td>
                    <td className="pr-5 py-2 text-graphite text-xs">
                      {meta?.notes ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="bg-ink text-snow/70 px-6 py-10 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>
            © 2026 Vinndex · Admin ·{" "}
            <a href="/" className="hover:text-snow">
              Volver al sitio
            </a>
          </p>
          <p>
            Snapshot:{" "}
            {new Date(stats.generatedAt).toLocaleString("es-AR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </div>
      </footer>
    </>
  );
}
