import { ImageResponse } from "next/og";
import { snapshotStats } from "@/lib/snapshot";

export const runtime = "nodejs";
export const alt = "Vinndex · Comparador de precios de vinos en Argentina";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function HomeOgImage() {
  const stats = snapshotStats();
  const storesStr = `${stats.storeCount} vinotecas`;
  const comparablesStr = `${stats.multiStoreGroupCount.toLocaleString("es-AR")} vinos comparables`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          color: "white",
          background:
            "linear-gradient(135deg, #0F1729 0%, #1E3FBF 55%, #6B1E2E 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 700,
            color: "#E8B547",
            letterSpacing: -0.5,
          }}
        >
          Vinndex
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          <div style={{ display: "flex" }}>Compará precios</div>
          <div style={{ display: "flex" }}>de vinos en Argentina.</div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#E8B547",
            fontWeight: 700,
          }}
        >
          {`${storesStr} · ${comparablesStr}`}
        </div>
      </div>
    ),
    { ...size },
  );
}
