import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findProductBySlug,
  formatArs,
  storeName,
  snapshot,
  productSlug,
} from "@/lib/snapshot";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = findProductBySlug(slug);
  if (!product) return { title: "Vino no encontrado — Vinndex" };
  return {
    title: `${product.name} — ${storeName(product.storeSlug)} | Vinndex`,
    description:
      product.description ??
      `Compará el precio de ${product.name} en Vinndex.`,
  };
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3 L11 3 L11 11 M11 3 L3 11" strokeLinecap="round" />
    </svg>
  );
}

export default async function Vino({ params }: Params) {
  const { slug } = await params;
  const product = findProductBySlug(slug);
  if (!product) notFound();

  const related = snapshot.products
    .filter(
      (p) =>
        p.externalUrl !== product.externalUrl &&
        (p.brand === product.brand ||
          p.storeSlug === product.storeSlug) &&
        p.brand !== null,
    )
    .slice(0, 4);

  const store = storeName(product.storeSlug);

  return (
    <div className="bg-white min-h-screen">
      {/* NAV */}
      <header className="sticky top-0 z-30 bg-white border-b border-ink/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 shrink-0 cursor-wine"
          >
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
            <span className="display text-xl font-semibold text-ink hidden sm:block">
              Vinndex
            </span>
          </a>

          <form action="/buscar" className="flex-1 max-w-2xl">
            <div className="relative flex items-center bg-snow rounded-full border border-ink/10 p-1 pl-4">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-graphite shrink-0"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                name="q"
                placeholder="Buscar otro vino..."
                className="w-full bg-transparent border-0 outline-none px-3 py-2 text-ink"
              />
              <button className="cursor-wine bg-cobalt text-snow font-semibold px-5 py-2 rounded-full text-sm">
                Buscar
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* HERO */}
      <section className="relative ficha-hero text-snow overflow-hidden grain">
        <svg
          className="absolute bottom-0 left-0 w-full opacity-40"
          viewBox="0 0 1440 240"
          preserveAspectRatio="none"
          style={{ height: "130px" }}
        >
          <path
            d="M0 160 L140 80 L260 120 L380 60 L520 110 L680 50 L840 100 L1000 60 L1140 110 L1280 70 L1440 120 L1440 240 L0 240 Z"
            fill="#0F1E4D"
          />
          <path
            d="M380 60 L400 85 L362 85 Z M680 50 L700 78 L660 78 Z M1000 60 L1022 88 L978 88 Z"
            fill="#F5EDE0"
            opacity="0.45"
          />
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
          <div className="flex items-center gap-2 text-xs text-snow/70 uppercase tracking-wider mb-5">
            <a href="/" className="hover:text-snow">
              Inicio
            </a>
            <span>/</span>
            <a href="/buscar" className="hover:text-snow">
              Catálogo
            </a>
            <span>/</span>
            <span className="truncate">{product.name}</span>
          </div>

          <div className="grid lg:grid-cols-[280px_1fr] gap-10 items-start">
            <div className="flex justify-center lg:justify-start">
              <div className="relative">
                <div className="absolute inset-0 bg-snow/15 blur-2xl rounded-full" />
                <div className="relative w-56 h-80 rounded-xl overflow-hidden bg-snow/10 border border-snow/20">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-snow/50">
                      sin imagen
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2 text-sm flex-wrap">
                {product.brand && (
                  <span className="px-2.5 py-1 rounded-full bg-snow/15 backdrop-blur border border-snow/25 text-xs font-semibold uppercase tracking-wide">
                    {product.brand}
                  </span>
                )}
                <span className="text-snow/70">·</span>
                <span className="text-snow/80">{store}</span>
                {product.inStock ? (
                  <>
                    <span className="text-snow/70">·</span>
                    <span className="text-mustard text-xs font-semibold uppercase tracking-wide">
                      En stock
                    </span>
                  </>
                ) : null}
              </div>

              <h1 className="display text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] mb-3">
                {product.name}
              </h1>

              {product.description && (
                <p className="text-snow/80 text-lg mb-8 max-w-2xl leading-relaxed">
                  {product.description}
                </p>
              )}

              <div className="inline-flex items-baseline gap-6 bg-snow/10 backdrop-blur border border-snow/20 rounded-2xl px-6 py-5 mb-8">
                <div>
                  <div className="text-xs text-snow/70 uppercase tracking-wider mb-1">
                    Precio
                  </div>
                  <div className="display text-4xl md:text-5xl font-semibold leading-none text-mustard">
                    {formatArs(product.priceArs)}
                  </div>
                  <div className="text-xs text-snow/70 mt-1.5">
                    en {store} · sin envío
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={product.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="cursor-wine bg-snow text-malbec font-semibold px-8 py-3.5 rounded-full hover:bg-mustard transition-colors inline-flex items-center gap-2"
                >
                  Ir a {store} <ExternalIcon />
                </a>
                <a
                  href="/buscar"
                  className="cursor-wine border border-snow/40 text-snow font-semibold px-8 py-3.5 rounded-full hover:bg-snow/10 transition-colors"
                >
                  Ver más vinos
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-14">
        <div className="bg-mustard/10 border-l-4 border-mustard rounded-r-xl p-5 mb-10">
          <p className="text-sm text-ink leading-relaxed">
            <strong>Este vino aparece en 1 de las 14 vinotecas</strong>{" "}
            sincronizadas hoy. Cuando sumemos matching entre tiendas (mes 2),
            vas a ver todas las vinotecas que lo venden con precio total
            comparado — que es el corazón del producto.
          </p>
        </div>

        {related.length > 0 && (
          <section>
            <h2 className="display text-2xl font-semibold text-ink mb-6">
              {product.brand
                ? `Otros de ${product.brand}`
                : `Otros de ${store}`}
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {related.map((r) => (
                <a
                  key={r.externalUrl}
                  href={`/vino/${productSlug(r)}`}
                  className="bg-white rounded-2xl p-5 border border-ink/10 hover:shadow-lg transition-shadow flex flex-col"
                >
                  <div className="w-full aspect-[3/4] bg-snow rounded-lg overflow-hidden mb-3 border border-ink/10">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt={r.name}
                        loading="lazy"
                        className="w-full h-full object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="display text-base font-semibold line-clamp-2 min-h-[2.5em]">
                    {r.name}
                  </div>
                  <div className="text-xs text-graphite mt-0.5">
                    {storeName(r.storeSlug)}
                  </div>
                  <div className="display text-xl font-semibold text-cobalt mt-3">
                    {formatArs(r.priceArs)}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="bg-ink text-snow/70 px-6 py-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>
            © 2026 Vinndex ·{" "}
            <a href="/" className="hover:text-snow">
              Inicio
            </a>
          </p>
          <p>Precios relevados una vez por día · Beber con moderación</p>
        </div>
      </footer>
    </div>
  );
}
