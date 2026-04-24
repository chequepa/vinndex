import type { Metadata } from "next";
import Script from "next/script";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// Cloudflare Web Analytics (free, no cookies, no PII). Active when
// NEXT_PUBLIC_CF_ANALYTICS_TOKEN is set in the environment — get one at
// https://dash.cloudflare.com → Analytics → Web Analytics → Add site.
const CF_ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: {
    default: "Vinndex — Comparador de precios de vinos en Argentina",
    template: "%s",
  },
  description:
    "Buscá un vino, encontrá todas las vinotecas online de Argentina que lo venden, ordenadas por precio. Sumamos nuevas tiendas cada semana.",
  metadataBase: new URL("https://vinndex.com.ar"),
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Vinndex",
    url: "https://vinndex.com.ar",
    title: "Vinndex — Comparador de precios de vinos en Argentina",
    description:
      "Buscá un vino, encontrá todas las vinotecas online que lo venden ordenadas por precio.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vinndex — Comparador de precios de vinos en Argentina",
    description:
      "Buscá un vino, encontrá todas las vinotecas online que lo venden ordenadas por precio.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

// Runs before React hydrates: reads the stored theme (or prefers-color-scheme)
// and adds .dark to <html> so the first paint matches the user's choice
// without a flash of light theme.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-AR"
      className={`${fraunces.variable} ${inter.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-[100dvh]">
        {children}
        {CF_ANALYTICS_TOKEN && (
          <Script
            id="cf-beacon"
            strategy="afterInteractive"
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: CF_ANALYTICS_TOKEN })}
          />
        )}
      </body>
    </html>
  );
}
