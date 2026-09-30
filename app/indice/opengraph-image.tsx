import { ImageResponse } from "next/og";
import {
  priceIndex,
  formatPct,
  verbFor,
  windowLabel,
  formatDateShort,
  monthName,
} from "@/lib/priceIndex";

export const runtime = "nodejs";
export const alt = "Índice Vinndex de precios del vino en Argentina";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG image de /indice: el headline con el número grande, igual que el
 * hero. Mismo gradient y misma jerarquía que app/opengraph-image.tsx
 * (eyebrow mustard · titular · pie mustard) para que en el feed se lea
 * como Vinndex. Sin fuentes externas, como la raíz: el default de
 * next/og alcanza y no suma un fetch al render.
 */
export default async function IndiceOgImage() {
  const idx = priceIndex;
  const first = idx.points[0];
  const last = idx.points[idx.points.length - 1];
  const d90 = idx.headline.d90 ?? idx.headline.sinceStart;
  const d30 = idx.headline.d30;
  const verb = verbFor(d90.pct);
  const win = windowLabel(d90, 90);
  // El default de next/og no siempre trae el signo menos tipográfico.
  const big = formatPct(d90.pct).replace("−", "-");
  const line30 = formatPct(d30?.pct).replace("−", "-");
  const sinceLine = formatPct(idx.headline.sinceStart.pct).replace("−", "-");

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#E8B547", letterSpacing: -0.5 }}>
            Vinndex
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#F5EDE0", opacity: 0.85, letterSpacing: 3 }}>
            ÍNDICE DE PRECIOS DEL VINO
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600, color: "#F5EDE0", letterSpacing: -1 }}>
            {verb === "no se movió" ? "El vino no se movió" : `El vino ${verb}`}
          </div>
          {verb !== "no se movió" && (
            <div
              style={{
                display: "flex",
                fontSize: 230,
                fontWeight: 800,
                letterSpacing: -10,
                lineHeight: 0.95,
                marginLeft: -8,
              }}
            >
              {big}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600, color: "#F5EDE0", letterSpacing: -1 }}>
            {`en los últimos ${win}`}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 28, color: "#E8B547", fontWeight: 700 }}>
            {`30 días: ${line30} · desde ${monthName(first.date)}: ${sinceLine}`}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#F5EDE0", opacity: 0.8 }}>
            {`${idx.coverage.stores} vinotecas · base 100 = ${formatDateShort(first.date)} · al ${formatDateShort(last.date)}`}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
