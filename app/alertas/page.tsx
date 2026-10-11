import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { findGroup } from "@/lib/snapshot";
import { displayWineName } from "@/lib/displayWineName";

/**
 * Destino de los links de las alertas de precio (confirmar / baja). Una
 * página de estado: no se indexa.
 */

export const metadata: Metadata = {
  title: "Alertas de precio · Vinndex",
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ estado?: string; vino?: string }> };

const MESSAGES: Record<string, { title: string; body: string }> = {
  confirmada: {
    title: "Listo, alerta activa.",
    body: "Te escribimos cuando baje. Revisamos los precios todas las mañanas, así que el aviso te llega temprano. Desde ahora, las alertas nuevas que pidas con este mail quedan activas sin volver a confirmar.",
  },
  baja: {
    title: "Alerta dada de baja.",
    body: "No te vamos a escribir más por ese vino. Si tenías otras alertas, siguen activas.",
  },
  "baja-todas": {
    title: "Te dimos de baja de todo.",
    body: "Borramos todas las alertas de tu mail. No te vamos a escribir más.",
  },
  vencida: {
    title: "Esa alerta ya no existe.",
    body: "Las alertas sin confirmar se borran a los 7 días, o la diste de baja. Podés pedirla de nuevo desde la ficha del vino.",
  },
  "link-invalido": {
    title: "El link no es válido.",
    body: "Puede que se haya cortado al copiarlo. Abrilo directo desde el mail.",
  },
  error: {
    title: "Algo falló de nuestro lado.",
    body: "Probá de nuevo en un rato. Si sigue, escribinos desde contacto.",
  },
};

export default async function AlertasPage({ searchParams }: Props) {
  const { estado = "", vino } = await searchParams;
  const msg = MESSAGES[estado] ?? {
    title: "Alertas de precio",
    body: "En cada ficha de vino podés pedir que te avisemos por mail cuando baje de precio, o cuando llegue al precio que vos quieras.",
  };
  const group = vino ? findGroup(vino) : undefined;

  return (
    <div className="bg-white min-h-[100dvh]">
      <SiteHeader />
      <main id="contenido" className="max-w-2xl mx-auto px-4 lg:px-8 py-16 lg:py-24">
        <p className="text-malbec text-[11px] tracking-[0.22em] uppercase font-semibold mb-4">
          Alertas de precio
        </p>
        <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mb-6">
          {msg.title}
        </h1>
        <p className="text-graphite text-lg leading-relaxed">{msg.body}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          {group && (
            <Link
              href={`/vino/${group.groupSlug}`}
              className="inline-flex items-center min-h-11 px-5 rounded-full bg-cobalt text-snow text-sm font-semibold"
            >
              Volver a {displayWineName(group.canonicalName)}
            </Link>
          )}
          <Link
            href="/joyitas"
            className="inline-flex items-center min-h-11 px-5 rounded-full border border-ink/15 text-sm font-medium text-ink hover:border-cobalt hover:text-cobalt"
          >
            Ver las joyitas de hoy
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
