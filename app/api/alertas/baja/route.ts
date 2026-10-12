import { NextResponse } from "next/server";
import {
  alertsConfigured,
  deleteAlert,
  deleteAllForEmailHash,
  siteUrl,
  verifyToken,
} from "@/lib/alerts";

/**
 * Baja de alertas. Sólo POST: los escáneres de links de los proveedores
 * de mail hacen GET y darían de baja a la gente sin que haga nada. Llega:
 *   · del botón de /alertas/baja (form POST, campos id+t o h+t), o
 *   · del "one-click unsubscribe" del cliente de mail (RFC 8058:
 *     List-Unsubscribe-Post, con id y t en la query).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = new URL(req.url);
  let id = url.searchParams.get("id") ?? "";
  let h = url.searchParams.get("h") ?? "";
  let t = url.searchParams.get("t") ?? "";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (form) {
      id = String(form.get("id") ?? id);
      h = String(form.get("h") ?? h);
      t = String(form.get("t") ?? t);
    }
  }
  const oneClick = url.searchParams.has("one-click");
  const done = (estado: string) =>
    oneClick
      ? NextResponse.json({ ok: estado === "baja" || estado === "baja-todas" })
      : NextResponse.redirect(`${siteUrl()}/alertas?estado=${estado}`, 303);

  if (!alertsConfigured()) return done("error");
  try {
    if (h) {
      if (!verifyToken("unsub-all", h, t)) return done("link-invalido");
      await deleteAllForEmailHash(h);
      return done("baja-todas");
    }
    if (!verifyToken("unsub", id, t)) return done("link-invalido");
    await deleteAlert(id);
    return done("baja");
  } catch {
    return done("error");
  }
}
