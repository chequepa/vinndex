import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FavoritesList } from "./FavoritesList";
import { SharedFavoritesView } from "./SharedFavoritesView";
import { findGroup } from "@/lib/snapshot";

type Params = {
  searchParams: Promise<{ slugs?: string }>;
};

export const metadata: Metadata = {
  title: "Mis vinos · Vinndex",
  description:
    "Los vinos que guardaste. Seguí el precio y volvé cuando quieras comparar. También podés compartir tu lista con un link.",
  robots: { index: false, follow: true },
};

export default async function FavoritosPage({ searchParams }: Params) {
  const params = await searchParams;
  const slugsParam = (params.slugs ?? "").trim();

  // Modo "lista compartida": render server-side de los slugs pasados
  // por URL. Útil para compartir wishlist con alguien (?slugs=a,b,c).
  // El usuario igual puede pasar a su lista personal con el botón
  // "Ver mi lista".
  if (slugsParam) {
    const slugs = slugsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const groups = slugs
      .map((s) => findGroup(s))
      .filter((g): g is NonNullable<ReturnType<typeof findGroup>> => !!g);
    return (
      <div className="bg-white min-h-[100dvh] flex flex-col">
        <SiteHeader />
        <main
          id="contenido"
          className="flex-1 max-w-6xl w-full mx-auto px-4 lg:px-8 py-10"
        >
          <header className="mb-8">
            <p className="text-terracota text-sm tracking-[0.2em] uppercase font-semibold mb-2">
              Lista compartida
            </p>
            <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05]">
              {groups.length === 0
                ? "Lista vacía o sin vinos válidos"
                : `${groups.length} ${groups.length === 1 ? "vino" : "vinos"} en esta selección`}
            </h1>
            <p className="text-graphite mt-3 max-w-2xl">
              Alguien te pasó este link. Estos son los vinos que armó como su
              wishlist. Tocá uno para ver precios en todas las vinotecas.
            </p>
            <Link
              href="/favoritos"
              className="inline-flex items-center gap-2 mt-4 text-xs uppercase tracking-wider text-cobalt hover:underline"
            >
              ← Ver mi propia lista de favoritos
            </Link>
          </header>
          <SharedFavoritesView groups={groups} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <SiteHeader />
      <main
        id="contenido"
        className="flex-1 max-w-6xl w-full mx-auto px-4 lg:px-8 py-10"
      >
        <header className="mb-8">
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05]">
            Mis vinos
          </h1>
          <p className="text-graphite mt-3 max-w-xl">
            Los vinos que guardaste con la estrella. Se quedan en tu
            dispositivo, no subimos nada a ningún lado. Podés compartir tu
            lista con un link público o exportarla en JSON.
          </p>
        </header>
        <FavoritesList />
      </main>
      <SiteFooter />
    </div>
  );
}
