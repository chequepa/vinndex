/**
 * Envío gratis publicado por cada vinoteca (data/store-shipping.json).
 *
 * La compra combinada NO le pide a la persona que estime envíos (versión
 * 1, descartada: era trabajo que no le corresponde). El total que mostramos
 * es sin envío y lo decimos; cuando la tienda publica un mínimo para envío
 * gratis, avisamos si la compra lo alcanza. Sólo AMBA y "nacional": el
 * sitio todavía no sabe la zona de la persona (docs/cobertura-nacional.md).
 */
import shippingJson from "@/data/store-shipping.json";

export type StoreShipping = {
  gratisDesde: { amba?: number; nacional?: number };
  fuente: string;
  fecha: string;
  verificado: boolean;
};

const DATA = (shippingJson as { stores: Record<string, StoreShipping> }).stores;

export function shippingFor(storeSlug: string): StoreShipping | null {
  return DATA[storeSlug] ?? null;
}
