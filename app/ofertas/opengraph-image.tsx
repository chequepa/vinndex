import { ImageResponse } from "next/og";
import { readPriceDrops } from "@/lib/priceDrops";
import { formatArs } from "@/lib/snapshot";
import { brandedName } from "@/lib/brandedName";

export const runtime = "nodejs";
export const alt = "Vinos que bajaron de precio hoy · Vinndex";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OfertasOgImage() {
  const report = await readPriceDrops();
  const drops = report?.drops ?? [];
  const top = drops.slice(0, 3);
  const max = drops.length ? Math.max(...drops.map((d) => Math.round(d.dropPct * 100))) : 0;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "white",
          background: "linear-gradient(135deg, #0F1729 0%, #1E3FBF 55%, #6B1E2E 100%)",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#E8B547" }}>
          Vinndex · Ofertas del día
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
            {drops.length
              ? `${drops.length} vinos bajaron hoy, hasta ${max}% menos`
              : "Bajas de precio de vinos, todos los días"}
          </div>
          {top.map((d) => (
            <div key={`${d.slug}-${d.storeSlug}`} style={{ display: "flex", fontSize: 30, color: "#F5EDE0" }}>
              {`${brandedName(d.brand, d.canonicalName)} · ${formatArs(d.currentPrice)} (−${Math.round(d.dropPct * 100)}%)`.slice(0, 70)}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#E8B547", fontWeight: 700 }}>
          vinndex.com.ar/ofertas
        </div>
      </div>
    ),
    { ...size },
  );
}
