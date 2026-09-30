import { displayBrand } from "@/lib/snapshot";
import { displayWineName } from "@/lib/displayWineName";

/** "Bodega + nombre" sin repetir la bodega cuando el nombre ya la trae
 * ("Deseado Rosé" de Deseado no es "Deseado Deseado Rosé"). */
export function brandedName(brand: string | null, name: string): string {
  const b = displayBrand(brand);
  const n = displayWineName(name);
  if (!b) return n;
  return n.toLowerCase().startsWith(b.toLowerCase()) ? n : `${b} ${n}`;
}
