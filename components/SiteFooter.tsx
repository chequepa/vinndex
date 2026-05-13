import Link from "next/link";

/**
 * Site-wide footer. Includes the 4 columns of links used in the home
 * page + the copyright + drinking-responsibly disclaimer. Imported by
 * every top-level page so users always have a way to reach /sobre,
 * /contacto, /sumate, /opt-out from anywhere.
 */
export function SiteFooter() {
  return (
    <footer className="bg-ink text-snow/70 px-6 py-12 mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div>
            <h3 className="display text-snow font-semibold mb-4">Catálogo</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/buscar?varietal=malbec" className="hover:text-snow">
                  Malbec
                </Link>
              </li>
              <li>
                <Link
                  href="/buscar?varietal=cabernet-sauvignon"
                  className="hover:text-snow"
                >
                  Cabernet Sauvignon
                </Link>
              </li>
              <li>
                <Link
                  href="/buscar?varietal=chardonnay"
                  className="hover:text-snow"
                >
                  Chardonnay
                </Link>
              </li>
              <li>
                <Link href="/buscar?varietal=bonarda" className="hover:text-snow">
                  Bonarda
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="display text-snow font-semibold mb-4">Regiones</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/region/mendoza" className="hover:text-snow">
                  Mendoza
                </Link>
              </li>
              <li>
                <Link href="/region/valle-de-uco" className="hover:text-snow">
                  Valle de Uco
                </Link>
              </li>
              <li>
                <Link href="/region/lujan-de-cuyo" className="hover:text-snow">
                  Luján de Cuyo
                </Link>
              </li>
              <li>
                <Link href="/region/salta" className="hover:text-snow">
                  Salta
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="display text-snow font-semibold mb-4">Más</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/buscar?tipo=espumante" className="hover:text-snow">
                  Espumantes
                </Link>
              </li>
              <li>
                <Link href="/buscar?tipo=blanco" className="hover:text-snow">
                  Vinos blancos
                </Link>
              </li>
              <li>
                <Link href="/buscar?tipo=rosado" className="hover:text-snow">
                  Rosados
                </Link>
              </li>
              <li>
                <Link href="/region/patagonia" className="hover:text-snow">
                  Patagonia
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="display text-snow font-semibold mb-4">Vinndex</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/favoritos" className="hover:text-snow">
                  Mis vinos
                </Link>
              </li>
              <li>
                <Link href="/sobre" className="hover:text-snow">
                  Sobre el proyecto
                </Link>
              </li>
              <li>
                <Link href="/como-funciona" className="hover:text-snow">
                  Cómo funciona
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-snow">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/ranking" className="hover:text-snow">
                  Rankings
                </Link>
              </li>
              <li>
                <Link href="/bodegas" className="hover:text-snow">
                  Bodegas
                </Link>
              </li>
              <li>
                <Link href="/data" className="hover:text-snow">
                  Datos del mercado
                </Link>
              </li>
              <li>
                <Link href="/developers" className="hover:text-snow">
                  API para devs
                </Link>
              </li>
              <li>
                <Link href="/preguntas" className="hover:text-snow">
                  Preguntas frecuentes
                </Link>
              </li>
              <li>
                <Link href="/sumate" className="hover:text-snow">
                  Sos vinoteca? Sumate
                </Link>
              </li>
              <li>
                <Link href="/opt-out" className="hover:text-snow">
                  Pedir opt-out
                </Link>
              </li>
              <li>
                <Link href="/contacto" className="hover:text-snow">
                  Contacto
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-snow/10 pt-6 text-xs text-snow/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <p>© 2026 Vinndex · Hecho en Argentina</p>
          <p>
            Beber con moderación · Prohibida la venta de bebidas alcohólicas a
            menores de 18 años
          </p>
        </div>
      </div>
    </footer>
  );
}
