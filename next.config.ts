import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Hostnames permitidos para `next/image` derivados dinámicamente del snapshot.
 *
 * Antes teníamos `{ hostname: "**" }`, lo que convertía a `/_next/image?url=...`
 * en un proxy de imágenes universal — cualquiera podía usar nuestro dominio
 * para optimizar imágenes de terceros (abuso de bandwidth + vector de SSRF).
 * Ahora enumeramos los CDNs reales de las tiendas relevadas. Cuando se agrega
 * una vinoteca nueva, el `daily-scrape` refresca el snapshot y los dominios
 * nuevos se whitelistean automáticamente en el siguiente build.
 *
 * Para CDNs compartidos (vteximg.com.br, mitiendanube.com) emitimos un
 * wildcard estable sobre el segundo nivel; para hosts propios de cada
 * tienda emitimos un match exacto.
 */
function loadAllowedHosts(): { protocol: "https"; hostname: string }[] {
  const SHARED_CDN_SUFFIXES = [
    "vteximg.com.br",
    "mitiendanube.com",
    "shopify.com",
    "shopifycdn.com",
    "wordpress.com",
    "wp.com",
  ];
  const allowList = new Map<string, { protocol: "https"; hostname: string }>();
  // Wildcards estables para CDNs multi-tenant — matchean cualquier tienda
  // nueva sobre la misma plataforma sin requerir rebuild.
  for (const sfx of SHARED_CDN_SUFFIXES) {
    allowList.set(`**.${sfx}`, { protocol: "https", hostname: `**.${sfx}` });
  }
  try {
    const raw = readFileSync(
      resolve(process.cwd(), "data/snapshot.json"),
      "utf8",
    );
    const snap = JSON.parse(raw) as {
      productGroups?: { offers?: { imageUrl?: string | null }[] }[];
    };
    for (const g of snap.productGroups ?? []) {
      for (const o of g.offers ?? []) {
        if (!o.imageUrl) continue;
        try {
          const h = new URL(o.imageUrl).hostname;
          const isShared = SHARED_CDN_SUFFIXES.some(
            (s) => h.endsWith(`.${s}`) || h === s,
          );
          if (!isShared) {
            allowList.set(h, { protocol: "https", hostname: h });
          }
        } catch {
          // URL inválida del scraper — ignoramos acá, el adapter debería
          // loggearla río arriba.
        }
      }
    }
  } catch {
    // Sin snapshot (primer build, CI sin data/) — al menos los wildcards
    // de CDN compartido quedan habilitados, mejor que nada.
  }
  return [...allowList.values()];
}

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  images: {
    // Hostnames derivados del snapshot — ver loadAllowedHosts() arriba.
    // Solo HTTPS, sin http://. Nota: NO usamos `search: ""` porque
    // VTEX/Shopify/Tiendanube envían sus URLs con `?v=` para cache
    // busting y eso rompía `next/image` (500 en /buscar). El whitelist
    // de hostnames sigue activo, que es la defensa principal contra
    // SSRF/abuso de bandwidth.
    remotePatterns: loadAllowedHosts(),
    // 1 día de cache — los precios cambian a diario, las imágenes casi nunca.
    minimumCacheTTL: 86400,
  },
  // Defensa básica a nivel header. SAMEORIGIN bloquea clickjacking del
  // panel /admin/*. nosniff evita MIME sniffing. Referrer + Permissions
  // son higiene general.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

export default withMDX(nextConfig);
