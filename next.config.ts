import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  images: {
    // Allow images from any HTTPS host — wine images come from 30+ store
    // CDNs (Tiendanube, Shopify, VTEX, WooCommerce self-hosted, etc.)
    // and the URL list is already controlled server-side by our scraper.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    // 1 day cache — prices change daily, images rarely change.
    minimumCacheTTL: 86400,
  },
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

export default withMDX(nextConfig);
