"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { BottleFallback } from "./BottleFallback";

type Props = Omit<ImageProps, "src" | "alt" | "onError"> & {
  src: string | null | undefined;
  /** Nombre del vino · alt del `<img>` y semilla del fallback. */
  name: string;
  brand?: string | null;
};

/**
 * Foto de botella con fallback. Las imágenes vienen hotlinkeadas del CDN
 * de cada vinoteca y se caen seguido (producto discontinuado, CDN que
 * rota URLs, 404 del optimizador): sin esto el browser pintaba el ícono
 * de imagen rota con el alt text desbordando la caja. Si no hay URL o
 * la carga falla, mostramos la botella ilustrada de `BottleFallback`,
 * la misma que ya usábamos para los vinos sin foto.
 */
/**
 * Las fotos de Tiendanube (~73% del catálogo) ya vienen del CDN de la
 * plataforma en 480 px y webp (`-480-0.webp`), que es el tamaño al que las
 * mostramos. Pasarlas por el optimizador de Next sólo costaba en Railway:
 * bajar la imagen, recodificarla con sharp (RAM y CPU, y el cache en disco
 * se pierde en cada deploy) y reenviarla (egress). Ésas se piden directo al
 * CDN; el resto (VTEX, Shopify, WordPress, que suelen venir en tamaño
 * original) sigue pasando por el optimizador.
 */
function servedByStoreCdn(src: string): boolean {
  try {
    const { hostname, pathname } = new URL(src);
    return hostname.endsWith(".mitiendanube.com") && /-480-0\.\w+$/.test(pathname);
  } catch {
    return false;
  }
}

export function WineImage({ src, name, brand, className, unoptimized, ...rest }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return <BottleFallback name={name} brand={brand} />;
  }
  return (
    <Image
      {...rest}
      unoptimized={unoptimized ?? servedByStoreCdn(src)}
      src={src}
      alt={name}
      className={className ?? "object-contain"}
      onError={() => setFailedSrc(src)}
    />
  );
}
