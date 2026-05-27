import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { CompareFloatingButton } from "@/components/Compare";
import { Analytics } from "@/components/Analytics";

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
    default: "Vinndex · Comparador de precios de vinos en Argentina",
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
    title: "Vinndex · Comparador de precios de vinos en Argentina",
    description:
      "Buscá un vino, encontrá todas las vinotecas online que lo venden ordenadas por precio.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vinndex · Comparador de precios de vinos en Argentina",
    description:
      "Buscá un vino, encontrá todas las vinotecas online que lo venden ordenadas por precio.",
    // Audit 22/05: card era summary_large_image pero sin twitter:image
    // explícito → shares en X salían sin preview. metadataBase resuelve
    // la ruta relativa al endpoint dinámico app/opengraph-image.tsx.
    images: ["/opengraph-image"],
  },
  // Sin `index: true, follow: true` explícito · es el default de Google
  // y emitirlo a nivel root creaba señales conflictivas cuando una page
  // hace notFound() o setea `robots: { index: false }` (terminaban
  // saliendo 2 meta robots tags en el HTML). Audit 22/05.
  // Las directivas googleBot quedan como configuración de snippets.
  robots: {
    googleBot: {
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "LhD6bCskzpq9-bmAlrw0T4TJvhd5La2xKWdYYOXluY8",
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
        <a href="#contenido" className="skip-to-content">
          Saltar al contenido
        </a>
        {children}
        <CompareFloatingButton />
        {/* Server-side pageview tracker · reemplaza el beacon de
            Cloudflare Web Analytics (que cargaba un script de
            terceros con cookies, penalizando best-practices en
            Lighthouse). Sin librerías, sin cookies · solo path +
            referrer + timestamp logueado a stdout. */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
