import { NextResponse } from "next/server";

/**
 * Reportes de usuarios sobre una ficha de vino.
 *
 * POR QUÉ EXISTE: el matching es el problema difícil del producto y hasta
 * ahora sólo lo miraba el pipeline. Pero ya entra gente al sitio, y un
 * humano mirando una ficha detecta en dos segundos lo que a un
 * agrupador determinístico le cuesta meses: "acá hay dos vinos
 * mezclados", "esta ficha ya existe", "ese precio no es el de la
 * tienda".
 *
 * DÓNDE SE GUARDA (y por qué acá): en Railway el filesystem es efímero
 * — se borra en cada deploy, que es exactamente cómo se perdieron los
 * pageviews del tracker propio. Un archivo no sirve. Mail tampoco: no se
 * agrega ni se consulta. Se usan **GitHub Issues**:
 *   · duran para siempre y son gratis,
 *   · agrupan solos — UN issue por ficha, cada reporte es un comentario,
 *     así que "issue con 6 comentarios" = 6 personas marcando lo mismo,
 *   · el cron semanal los lee con `gh issue list --label reporte-ficha`,
 *     o sea la alerta sale sin construir nada.
 *
 * Sin GITHUB_TOKEN el endpoint responde 503 y la UI lo dice sin drama
 * (mismo patrón que /api/contact sin RESEND_API_KEY).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = process.env.GITHUB_REPO ?? "chequepa/vinndex";
const LABEL = "reporte-ficha";

// Rate limit in-memory por IP. Un reporte es de baja frecuencia: 10 cada
// 10 minutos cubre a alguien reportando varias fichas de una sentada y
// corta el abuso. Mismo enfoque que /api/contact (una sola instancia en
// Railway; si escalamos, va a Redis).
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 10;
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

/**
 * Las tres razones NO son genéricas: son los tres modos de falla que el
 * pipeline pelea, así que cada reporte cae directo en una categoría
 * accionable.
 */
const REASONS = {
  mezclados: "Hay más de un vino mezclado en la ficha",
  duplicada: "Este vino ya está en otra ficha",
  precio: "El precio no coincide con el de la vinoteca",
} as const;
type Reason = keyof typeof REASONS;

function isReason(v: unknown): v is Reason {
  return typeof v === "string" && v in REASONS;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

async function gh(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function POST(req: Request) {
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  if (isRateLimited(getClientIp(req))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Honeypot: los bots completan todo lo que ven.
  if (str(b.website, 100)) return NextResponse.json({ ok: true });

  const slug = str(b.slug, 120);
  const reason = b.reason;
  if (!slug || !isReason(reason)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // Texto libre acotado: da contexto sin volverse un canal de spam.
  const detail = str(b.detail, 280);
  const wineName = str(b.wineName, 160);

  const title = `[ficha] ${slug}`;
  const url = `https://vinndex.com.ar/vino/${slug}`;
  const comment =
    `**${REASONS[reason]}**\n\n` +
    (detail ? `> ${detail}\n\n` : "") +
    `<sub>${new Date().toISOString()} · reporte de usuario</sub>`;

  try {
    // Un issue por ficha. Buscamos el existente LISTANDO, no con
    // /search/issues: el índice de búsqueda de GitHub tarda en ver un
    // issue recién creado, así que dos personas reportando el mismo vino
    // con pocos segundos de diferencia abrían dos issues (medido: el
    // segundo reporte creaba #135 en vez de comentar #134). El listado
    // sale de la base y es consistente al instante.
    let existing: number | null = null;
    for (let page = 1; page <= 10 && existing === null; page++) {
      const res = await gh(
        `/repos/${REPO}/issues?labels=${LABEL}&state=open&per_page=100&page=${page}`,
      );
      if (!res.ok) break;
      const items = (await res.json()) as { number: number; title: string }[];
      if (!Array.isArray(items) || items.length === 0) break;
      existing = items.find((i) => i.title === title)?.number ?? null;
      if (items.length < 100) break;
    }

    if (existing !== null) {
      await gh(`/repos/${REPO}/issues/${existing}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment }),
      });
      return NextResponse.json({ ok: true, issue: existing });
    }

    const created = await gh(`/repos/${REPO}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title,
        labels: [LABEL],
        body:
          `Reportes de usuarios sobre [${wineName || slug}](${url}).\n\n` +
          `Cada comentario es un reporte nuevo — si se acumulan, la ficha ` +
          `necesita atención.\n\n---\n\n${comment}`,
      }),
    });
    if (!created.ok) {
      return NextResponse.json({ error: "github_error" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, issue: (await created.json())?.number });
  } catch {
    return NextResponse.json({ error: "github_error" }, { status: 502 });
  }
}
