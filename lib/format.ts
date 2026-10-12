/**
 * Formateo sin dependencias, seguro para componentes "use client".
 *
 * Vive aparte de lib/snapshot.ts a propósito: snapshot.ts importa
 * data/snapshot.json (~50 MB) a nivel módulo, y cualquier componente de
 * cliente que importe aunque sea una función de ahí arrastra el JSON
 * entero al bundle del navegador. Pasó: /explorar mandaba un chunk de
 * 50 MB por importar formatArs desde snapshot.ts (detectado el 12/10/2026).
 * scripts/check-client-bundle.mjs falla el build si vuelve a pasar.
 */
export function formatArs(value: number | null): string {
  if (value === null || value <= 0) return "Consultar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
