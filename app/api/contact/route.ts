import { NextResponse } from "next/server";
import { sendContactMail } from "@/lib/contactMail";

/**
 * Endpoint de los forms del sitio. Tres "kinds": contacto, sumate, opt-out.
 * Cada uno arma un asunto/cuerpo distinto pero comparte validación,
 * rate-limit y honeypot anti-spam.
 *
 * Sin RESEND_API_KEY el form queda deshabilitado: respondemos 503 y la UI
 * cae al fallback `mailto:`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Rate limit in-memory por IP. Forms son de baja frecuencia: 5 envíos cada
// 10 minutos por IP cubre uso humano legítimo y corta abuso.
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 5;
const ipBuckets = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
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

type Kind = "contacto" | "sumate" | "opt-out";

function isKind(v: unknown): v is Kind {
  return v === "contacto" || v === "sumate" || v === "opt-out";
}

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildMail(kind: Kind, f: Record<string, string>) {
  if (kind === "sumate") {
    return {
      subject: `[Sumate] ${f.vinoteca || "vinoteca sin nombre"}`,
      bodyLines: [
        "Nueva vinoteca quiere sumarse a Vinndex:",
        "",
        `Vinoteca: ${f.vinoteca}`,
        `URL: ${f.url}`,
        `Plataforma: ${f.plataforma || "(no especificada)"}`,
        `Contacto: ${f.nombre} <${f.email}>`,
        "",
        "Mensaje:",
        f.mensaje || "(sin mensaje)",
      ],
    };
  }
  if (kind === "opt-out") {
    return {
      subject: `[Opt-out] ${f.url || f.vinoteca || f.email}`,
      bodyLines: [
        "Pedido de opt-out:",
        "",
        `Vinoteca / URL: ${f.url || f.vinoteca}`,
        `Solicitante: ${f.nombre} <${f.email}>`,
        "",
        "Motivo:",
        f.mensaje || "(sin motivo)",
      ],
    };
  }
  return {
    subject: `[Contacto] ${f.nombre || f.email}`,
    bodyLines: [
      `De: ${f.nombre} <${f.email}>`,
      "",
      "Mensaje:",
      f.mensaje,
    ],
  };
}

export async function POST(req: Request) {
  if (isRateLimited(getClientIp(req))) {
    return NextResponse.json(
      { error: "Demasiados envíos. Probá de nuevo en un rato." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Honeypot: campo invisible para humanos. Si viene lleno es un bot —
  // respondemos 200 falso para no darle señal de que lo detectamos.
  if (str(body._gotcha)) {
    return NextResponse.json({ ok: true });
  }

  const kind = body.kind;
  if (!isKind(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }

  const f = {
    nombre: str(body.nombre, 120),
    email: str(body.email, 200),
    mensaje: str(body.mensaje, 4000),
    vinoteca: str(body.vinoteca, 200),
    url: str(body.url, 500),
    plataforma: str(body.plataforma, 60),
  };

  if (!EMAIL_RE.test(f.email)) {
    return NextResponse.json(
      { error: "Email inválido" },
      { status: 400 },
    );
  }
  // Campos mínimos por kind.
  if (kind === "contacto" && f.mensaje.length < 5) {
    return NextResponse.json(
      { error: "Escribí un mensaje un poco más largo." },
      { status: 400 },
    );
  }
  if (kind === "sumate" && (!f.vinoteca || !f.url)) {
    return NextResponse.json(
      { error: "Nombre de la vinoteca y URL son obligatorios." },
      { status: 400 },
    );
  }
  if (kind === "opt-out" && !f.url && !f.vinoteca) {
    return NextResponse.json(
      { error: "Indicá qué vinoteca o URL querés dar de baja." },
      { status: 400 },
    );
  }

  const { subject, bodyLines } = buildMail(kind, f);
  const result = await sendContactMail({
    subject,
    bodyLines,
    replyTo: f.email,
  });

  if (!result.ok && result.reason === "unconfigured") {
    return NextResponse.json(
      { error: "unconfigured" },
      { status: 503 },
    );
  }
  if (!result.ok) {
    console.error("[contact] send failed:", result.detail);
    return NextResponse.json(
      { error: "No pudimos enviar el mensaje. Probá de nuevo." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
