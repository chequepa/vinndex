import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // La API pública v1 y las bajas de precio quedan ABIERTAS a los
        // bots: los asistentes de IA (ChatGPT, Perplexity, Claude) citan
        // fuentes que pueden leer, y /llms.txt les explica cómo usarla.
        // El resto de /api (scrape, pageview, contact, groups) y /admin
        // siguen cerrados.
        allow: ["/", "/api/v1/", "/api/price-drops"],
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: "https://vinndex.com.ar/sitemap.xml",
    host: "https://vinndex.com.ar",
  };
}
