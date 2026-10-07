import { NotFoundView } from "@/components/NotFoundView";
import { snapshotStats } from "@/lib/snapshot";

export default function NotFound() {
  const stats = snapshotStats();
  return (
    <NotFoundView
      eyebrow="404 · Este vino no está en el catálogo"
      title="No lo encontramos."
      emphasis="Por ahora."
      lead={
        <p>
          Puede que hoy ninguna vinoteca lo venda online. Tenemos{" "}
          {stats.productCount.toLocaleString("es-AR")} ofertas de{" "}
          {stats.storeCount} vinotecas argentinas: buscá el nombre y te
          mostramos dónde conseguirlo.
        </p>
      }
    />
  );
}
