import { ImageResponse } from "next/og";
import { findGroup, formatArs, storeName } from "@/lib/snapshot";

export const runtime = "nodejs";
export const alt = "Vinndex · comparador de precios de vinos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dynamic Open Graph image for each wine fiche. Next.js auto-serves this
 * at /vino/[slug]/opengraph-image.png. WhatsApp/Twitter/LinkedIn fetch it
 * when someone shares the link → preview shows the wine name + min price
 * + vinotecas count instead of a bare link. Much higher share-through rate.
 */
export default async function VinoOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = findGroup(slug);

  const isMissing = !g;
  const allOut = g && !g.offers?.some((o) => o.inStock);
  const bestStore = g?.offers?.find((o) => o.inStock);

  const titleText = g?.canonicalName ?? "Vinndex";
  const brandText = g?.brand ?? "Comparador de precios";
  const priceText =
    isMissing || allOut
      ? "Sin stock"
      : g.minPrice != null
        ? formatArs(g.minPrice)
        : "—";
  const storesText = g
    ? allOut
      ? `relevado en ${g.totalStoreCount ?? g.storeCount} vinotecas`
      : `en ${g.storeCount} vinoteca${g.storeCount === 1 ? "" : "s"}`
    : "";
  const savingsPct =
    g && g.minPrice && g.maxPrice && g.maxPrice > g.minPrice
      ? Math.round(((g.maxPrice - g.minPrice) / g.maxPrice) * 100)
      : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          color: "white",
          background:
            "linear-gradient(135deg, #0F1729 0%, #1E3FBF 55%, #6B1E2E 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: -0.5,
            color: "#E8B547",
          }}
        >
          Vinndex
        </div>

        {/* Body */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 60,
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 20,
              letterSpacing: 2,
              opacity: 0.65,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            {brandText}
          </div>
          <div
            style={{
              fontSize: titleText.length > 40 ? 56 : 72,
              fontWeight: 700,
              lineHeight: 1.04,
              maxWidth: 1000,
              letterSpacing: -1,
            }}
          >
            {titleText}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 16, opacity: 0.6, letterSpacing: 2 }}>
              {allOut ? "ESTADO" : "DESDE"}
            </div>
            <div
              style={{
                fontSize: 68,
                fontWeight: 800,
                color: "#E8B547",
                lineHeight: 1,
              }}
            >
              {priceText}
            </div>
            {!allOut && bestStore && (
              <div style={{ fontSize: 18, opacity: 0.7, marginTop: 4 }}>
                {`en ${storeName(bestStore.storeSlug)}`}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              textAlign: "right",
            }}
          >
            {savingsPct && !allOut ? (
              <>
                <div
                  style={{ fontSize: 16, opacity: 0.6, letterSpacing: 2 }}
                >
                  AHORRO HASTA
                </div>
                <div
                  style={{
                    fontSize: 56,
                    fontWeight: 800,
                    color: "#fff",
                    lineHeight: 1,
                  }}
                >
                  {savingsPct}%
                </div>
                <div
                  style={{ fontSize: 18, opacity: 0.7, marginTop: 4 }}
                >
                  {storesText}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 28, opacity: 0.85, fontWeight: 600 }}>
                {storesText}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
