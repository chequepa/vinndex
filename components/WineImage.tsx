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
export function WineImage({ src, name, brand, className, ...rest }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return <BottleFallback name={name} brand={brand} />;
  }
  return (
    <Image
      {...rest}
      src={src}
      alt={name}
      className={className ?? "object-contain"}
      onError={() => setFailedSrc(src)}
    />
  );
}
