import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { snapshot } from "@/lib/snapshot";

type FooterLink = { href: string; label: string };

/**
 * Columnas por intención, no por "lo que sobró". Antes la última columna
 * ("Vinndex") tenía 15 links y las otras tres 4 cada una.
 */
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Catálogo",
    links: [
      { href: "/varietal/malbec", label: "Malbec" },
      { href: "/varietal/cabernet-sauvignon", label: "Cabernet Sauvignon" },
      { href: "/varietal/chardonnay", label: "Chardonnay" },
      { href: "/varietal/bonarda", label: "Bonarda" },
      { href: "/buscar?tipo=espumante", label: "Espumantes" },
      { href: "/buscar?tipo=blanco", label: "Vinos blancos" },
      { href: "/buscar?tipo=rosado", label: "Rosados" },
    ],
  },
  {
    title: "Regiones",
    links: [
      { href: "/region/mendoza", label: "Mendoza" },
      { href: "/region/valle-de-uco", label: "Valle de Uco" },
      { href: "/region/lujan-de-cuyo", label: "Luján de Cuyo" },
      { href: "/region/salta", label: "Salta" },
      { href: "/region/patagonia", label: "Patagonia" },
      { href: "/bodegas", label: "Todas las bodegas" },
    ],
  },
  {
    title: "Precios",
    links: [
      { href: "/ofertas", label: "Ofertas del día" },
      { href: "/ranking", label: "Rankings" },
      { href: "/vinotecas", label: "Vinotecas más baratas" },
      { href: "/indice", label: "Índice de precios" },
      { href: "/data", label: "Datos del mercado" },
      { href: "/developers", label: "API para devs" },
    ],
  },
  {
    title: "Vinndex",
    links: [
      { href: "/favoritos", label: "Mis vinos" },
      { href: "/sobre", label: "Sobre el proyecto" },
      { href: "/como-funciona", label: "Cómo funciona" },
      { href: "/blog", label: "Blog" },
      { href: "/preguntas", label: "Preguntas frecuentes" },
      { href: "/contacto", label: "Contacto" },
      { href: "/opt-out", label: "Pedir opt-out" },
    ],
  },
];

/** "7 de octubre, 06:12" en hora argentina (el server corre en UTC). */
function formatUpdatedAt(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const time = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${date}, ${time}`;
}

/**
 * Footer de todo el sitio: la noche después del atardecer del hero.
 *
 * - Arriba asoma la misma cresta de montañas del hero, en el color del
 *   footer, con un par de estrellas: el sitio empieza al atardecer y
 *   termina de noche.
 * - Bloque de marca + la última actualización de precios (dato real del
 *   snapshot, con un punto "en vivo") + CTA para vinotecas.
 * - Cuatro columnas por intención.
 * - El wordmark gigante al pie, recortado por el borde: la firma.
 *
 * Lo importa cada página top-level (home y /buscar incluidas) así el
 * usuario siempre llega a /sobre, /contacto, /sumate, /opt-out.
 */
export function SiteFooter() {
  // `snapshot` directo y no snapshotStats(): ésta recorre todas las
  // ofertas y el footer se renderiza en cada página.
  const updatedAt = formatUpdatedAt(snapshot.generatedAt);

  return (
    <footer className="footer-night relative text-snow/70 mt-28">
      {/* Cresta: vive por encima del footer (bottom-full) y usa el mismo
          fill que su fondo, así no se ve ninguna costura. */}
      <svg
        aria-hidden="true"
        className="absolute bottom-full left-0 w-full h-12 md:h-20 pointer-events-none"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
      >
        <path
          className="footer-ridge"
          d="M0 120 L0 86 L120 50 L220 74 L340 30 L470 70 L590 40 L700 66 L830 18 L950 60 L1080 34 L1200 70 L1320 44 L1440 64 L1440 120 Z"
        />
      </svg>

      <div className="relative max-w-7xl mx-auto px-6 pt-10 md:pt-14">
        {/* Estrellas: decoración, sobre el cielo del footer. */}
        <svg
          aria-hidden="true"
          className="absolute right-6 top-6 w-40 h-16 pointer-events-none opacity-70"
          viewBox="0 0 160 64"
        >
          <circle cx="12" cy="40" r="1.4" fill="#F5EDE0" />
          <circle cx="58" cy="12" r="1" fill="#F5EDE0" />
          <circle cx="104" cy="34" r="1.6" fill="#F5EDE0" />
          <circle cx="146" cy="8" r="2.4" fill="#E8B547" />
        </svg>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-16 mb-14">
          <div className="max-w-sm">
            <Link
              href="/"
              aria-label="Vinndex · inicio"
              className="cursor-wine inline-flex items-center gap-2 mb-4"
            >
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path
                  d="M4 26 L12 14 L18 20 L22 12 L28 26 Z"
                  fill="#F5EDE0"
                  stroke="#F5EDE0"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <circle cx="24" cy="8" r="3" fill="#E8B547" />
              </svg>
              <span className="display text-xl font-semibold text-snow">
                Vinndex
              </span>
            </Link>
            <p className="text-sm leading-relaxed">
              Comparador independiente de precios de vinos online en
              Argentina. No vendemos vino, te ayudamos a comprarlo al mejor
              precio.
            </p>
            {updatedAt && (
              <p className="mt-5 inline-flex items-center gap-2.5 text-xs text-snow/75 bg-snow/[0.06] border border-snow/10 rounded-full px-3 py-1.5">
                <span className="live-dot" aria-hidden="true" />
                <span>
                  Precios relevados el{" "}
                  <time dateTime={snapshot.generatedAt} className="tabular-nums">
                    {updatedAt}
                  </time>{" "}
                  · {snapshot.storeCount} vinotecas
                </span>
              </p>
            )}
            <p className="text-xs text-snow/55 mt-3">
              Se relevan una vez por día. Confirmá en la vinoteca antes de
              comprar.
            </p>
            <Link
              href="/sumate"
              className="arrow-nudge press cursor-wine mt-6 inline-flex items-center gap-2 min-h-11 border border-snow/25 hover:border-mustard hover:text-mustard text-snow font-semibold px-5 py-2.5 rounded-full text-sm"
            >
              ¿Tenés una vinoteca? Sumate
              <span data-arrow aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-snow text-xs tracking-[0.2em] uppercase font-semibold mb-4">
                  {col.title}
                </h3>
                <ul className="space-y-2.5 text-sm">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="footer-link cursor-wine">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-snow/10 pt-6 pb-4 text-xs text-snow/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-3">
            {/* En mobile el header no tiene lugar para el toggle de tema;
                acá queda a mano en todas las páginas. */}
            <ThemeToggle className="text-snow/80" />
            <p>© 2026 Vinndex · Hecho en Argentina</p>
          </div>
          <div className="flex items-center gap-4">
            <p>
              Beber con moderación · Prohibida la venta de bebidas
              alcohólicas a menores de 18 años
            </p>
            <a
              href="#contenido"
              className="press cursor-wine shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full border border-snow/20 hover:border-mustard hover:text-mustard text-snow/80"
              aria-label="Volver arriba"
              title="Volver arriba"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Wordmark gigante, recortado por el borde inferior. SVG con
          textLength para que ocupe el ancho exacto sin depender de las
          métricas de la fuente; aria-hidden porque el nombre ya está
          arriba como link. */}
      <div aria-hidden="true" className="overflow-hidden select-none pointer-events-none">
        <svg
          viewBox="0 0 1000 170"
          className="block w-full h-auto"
          preserveAspectRatio="xMidYMax meet"
        >
          <defs>
            <linearGradient id="footerWordmark" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#F5EDE0" stopOpacity="0.14" />
              <stop offset="1" stopColor="#F5EDE0" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <text
            x="500"
            y="190"
            textAnchor="middle"
            textLength="980"
            lengthAdjust="spacingAndGlyphs"
            fontSize="250"
            fontWeight="600"
            letterSpacing="-6"
            fill="url(#footerWordmark)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Vinndex
          </text>
        </svg>
      </div>
    </footer>
  );
}
