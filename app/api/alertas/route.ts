import { NextResponse } from "next/server";
import { findGroup, resolveMergedSlug } from "@/lib/snapshot";
import { brandedName } from "@/lib/brandedName";
import { alertsEnabled, createAlert } from "@/lib/alerts";
import { sendConfirmationMail } from "@/lib/alertMail";

/**
 * Alta de una alerta de precio: { email, slug, target?, _gotcha }.
 * Modelo, doble opt-in y almacenamiento en lib/alerts.ts.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mismo rate limit in-memory que /api/contact (una instancia en Railway).
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 15;
const ipBuckets = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ipBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipBuckets.set(ip, recent);
  if (Math.random() < 0.02) {
    for (const [k, v] of ipBuckets) {
      if (v.length === 0 || v[v.length - 1]! < cutoff) ipBuckets.delete(k);
    }
  }
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  if (!alertsEnabled()) {
    return NextResponse.json(
      { error: "Las alertas por mail todavía no están habilitadas." },
      { status: 503 },
    );
  }
  if (isRateLimited(getClientIp(req))) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá de nuevo en un rato." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (typeof body._gotcha === "string" && body._gotcha.trim()) {
    return NextResponse.json({ ok: true, status: "pending" });
  }

  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Revisá el mail." }, { status: 400 });
  }
  const rawSlug = typeof body.slug === "string" ? body.slug.slice(0, 200) : "";
  const slug = findGroup(rawSlug) ? rawSlug : resolveMergedSlug(rawSlug);
  const group = slug ? findGroup(slug) : undefined;
  if (!slug || !group) {
    return NextResponse.json({ error: "No encontramos ese vino." }, { status: 404 });
  }
  let target: number | null = null;
  if (body.target != null && body.target !== "") {
    const n = Math.round(Number(body.target));
    if (!Number.isFinite(n) || n < 1000 || n > 10_000_000) {
      return NextResponse.json({ error: "Revisá el precio objetivo." }, { status: 400 });
    }
    target = n;
  }

  try {
    const result = await createAlert({
      email,
      slug,
      wineName: brandedName(group.brand, group.canonicalName),
      target,
      basePrice: group.minPrice,
    });
    switch (result.kind) {
      case "limit":
        return NextResponse.json(
          { error: "Llegaste al máximo de alertas para ese mail. Dá de baja alguna desde un aviso." },
          { status: 409 },
        );
      case "created-pending": {
        const sent = await sendConfirmationMail(result.alert);
        if (!sent) {
          return NextResponse.json(
            { error: "No pudimos mandar el mail de confirmación. Probá de nuevo en un rato." },
            { status: 502 },
          );
        }
        return NextResponse.json({ ok: true, status: "pending" });
      }
      case "pending-exists":
        // No reenviamos en cada click: el mail ya salió.
        return NextResponse.json({ ok: true, status: "pending" });
      case "created-active":
        return NextResponse.json({ ok: true, status: "active" });
      case "updated":
        return NextResponse.json({ ok: true, status: "updated" });
    }
  } catch (e) {
    console.error("[alertas] error", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No pudimos guardar la alerta. Probá de nuevo en un rato." },
      { status: 502 },
    );
  }
}
