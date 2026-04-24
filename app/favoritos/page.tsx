import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FavoritesList } from "./FavoritesList";

export const metadata: Metadata = {
  title: "Mis vinos — Vinndex",
  description:
    "Los vinos que guardaste. Seguí el precio y volvé cuando quieras comparar.",
  robots: { index: false, follow: true },
};

export default function FavoritosPage() {
  return (
    <div className="bg-white min-h-[100dvh] flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 lg:px-8 py-10">
        <header className="mb-8">
          <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05]">
            Mis vinos
          </h1>
          <p className="text-graphite mt-3 max-w-xl">
            Los vinos que guardaste con la estrella. Se quedan en tu dispositivo —
            no subimos nada a ningún lado.
          </p>
        </header>
        <FavoritesList />
      </main>
      <SiteFooter />
    </div>
  );
}
