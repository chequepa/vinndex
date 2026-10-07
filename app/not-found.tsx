import { NotFoundView } from "@/components/NotFoundView";
import { snapshotStats } from "@/lib/snapshot";

/**
 * 404 global: cualquier URL que no matchea una ruta (y cualquier
 * `notFound()` fuera de /vino, que tiene el suyo). Antes no existía y
 * esas URLs caían en el 404 pelado de Next, sin header, sin buscador y
 * sin un solo link al catálogo.
 */
export default function NotFound() {
  const stats = snapshotStats();
  return (
    <NotFoundView
      eyebrow="Error 404 · Página no encontrada"
      title="Esta botella"
      emphasis="está vacía."
      lead={
        <p>
          La página que buscabas no existe o cambió de lugar. Lo que sí
          tenemos son {stats.productCount.toLocaleString("es-AR")} ofertas de{" "}
          {stats.storeCount} vinotecas argentinas: buscá el vino y te
          mostramos dónde está más barato.
        </p>
      }
    />
  );
}
