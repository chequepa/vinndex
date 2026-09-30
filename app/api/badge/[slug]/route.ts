import { storeIndex } from "@/lib/storeIndex";

/**
 * GET /api/badge/{slug}.svg
 *
 * Badge embebible para que cada vinoteca pueda decir "mejor precio en N
 * vinos según Vinndex" en su propio sitio (y linkear a /vinoteca/[slug],
 * que es la palanca de backlinks). 220×48, colores de DESIGN.md (ink,
 * snow, mustard), sin fuentes externas: un <img> en un sitio ajeno no
 * puede cargar webfonts nuestras, así que Georgia + system-ui.
 *
 * Los números salen de lib/storeIndex.ts (misma fuente que el hub y la
 * página de la vinoteca). Slug desconocido o tienda sin ofertas → 404.
 *
 * Next 16: `params` es Promise · hay que await.
 */

const WIDTH = 220;
const HEIGHT = 48;
const MAX_NAME_CHARS = 18;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: raw } = await ctx.params;
  const slug = raw.endsWith(".svg") ? raw.slice(0, -".svg".length) : raw;
  const s = storeIndex(slug);
  if (!s) {
    return new Response("Not Found", { status: 404 });
  }

  const nf = new Intl.NumberFormat("es-AR");
  const claim =
    s.bestPriceCount > 0
      ? `Mejor precio en ${nf.format(s.bestPriceCount)} ${s.bestPriceCount === 1 ? "vino" : "vinos"}`
      : "Precios comparados en Vinndex";
  const name = escapeXml(truncate(s.name, MAX_NAME_CHARS));
  const title = escapeXml(`${s.name} en Vinndex: ${claim}`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="t">
  <title id="t">${title}</title>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="10" fill="#0f1729"/>
  <g transform="translate(10 9) scale(0.95)">
    <path d="M4 26 L12 14 L18 20 L22 12 L28 26 Z" fill="#f5ede0" stroke="#f5ede0" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="24" cy="8" r="3" fill="#e8b547"/>
  </g>
  <text x="46" y="21" font-family="Georgia, 'Times New Roman', serif" font-weight="600" font-size="14" fill="#f5ede0">Vinndex<tspan font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="400" font-size="10" fill="#f5ede0" fill-opacity="0.72"> · ${name}</tspan></text>
  <text x="46" y="37" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="600" font-size="11" fill="#e8b547">${escapeXml(claim)}</text>
</svg>
`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
