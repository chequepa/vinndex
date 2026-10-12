import { NextResponse } from "next/server";
import { alertsConfigured, confirmAlert, siteUrl, verifyToken } from "@/lib/alerts";

/**
 * Link del mail de confirmación. GET porque es un link: si un escáner de
 * seguridad del proveedor de mail lo abre antes que la persona, lo peor
 * que pasa es que la alerta queda activa — y cada aviso trae su baja.
 * (La baja, en cambio, pide un click explícito: ver /alertas/baja.)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const t = url.searchParams.get("t") ?? "";
  const back = (estado: string, slug?: string) =>
    NextResponse.redirect(
      `${siteUrl()}/alertas?estado=${estado}${slug ? `&vino=${encodeURIComponent(slug)}` : ""}`,
      303,
    );
  if (!alertsConfigured()) return back("error");
  if (!verifyToken("confirm", id, t)) return back("link-invalido");
  try {
    const alert = await confirmAlert(id);
    if (!alert) return back("vencida");
    return back("confirmada", alert.slug);
  } catch {
    return back("error");
  }
}
