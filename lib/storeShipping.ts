/**
 * Envío gratis publicado por cada vinoteca (data/store-shipping.json).
 *
 * La compra combinada NO le pide a la persona que estime envíos (versión
 * 1, descartada: era trabajo que no le corresponde). El total que mostramos
 * es sin envío y lo decimos; cuando la tienda publica un mínimo para envío
 * gratis, avisamos si la compra lo alcanza. El sitio todavía no sabe la
 * zona de la persona (docs/cobertura-nacional.md), así que se asume AMBA:
 * primero el mínimo de AMBA, después el que no dice zona, después el
 * nacional. Los datos los mantiene scripts/survey-shipping.mjs.
 */
import shippingJson from "@/data/store-shipping.json";

export type StoreShipping = {
  /** "general" = la tienda publica el mínimo sin decir para qué zona. Los
   * mínimos para ciudades del interior no se guardan mientras el sitio sea
   * CABA/GBA (docs/cobertura-nacional.md). */
  gratisDesde: { amba?: number; nacional?: number; general?: number };
  /** Frase textual y URL de donde salió (scripts/survey-shipping.mjs). */
  evidencia?: { zona: string; frase: string; url: string }[];
  fuente: string;
  fecha: string;
  verificado: boolean;
};

const DATA = (shippingJson as { stores: Record<string, StoreShipping> }).stores;

export function shippingFor(storeSlug: string): StoreShipping | null {
  return DATA[storeSlug] ?? null;
}
