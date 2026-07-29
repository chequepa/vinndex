import { NextResponse } from "next/server";

/**
 * Voto de usuario sobre un par candidato: "¿estos dos son el mismo vino?"
 *
 * A diferencia del reporte pasivo (/api/report, que espera a que alguien
 * note un error), acá PREGUNTAMOS sobre pares donde el sistema ya está en
 * duda: dos fichas que comparten código de barras pero que los gates
 * separaron. Alguien se equivoca — la tienda al cargar el EAN o el gate al
 * partir — y un humano lo resuelve mirando dos etiquetas.
 *
 * LOS VOTOS NO SON AUTORIDAD. Son un input más, con peso, junto al
 * catálogo, el EAN y Vivino. Ninguna de esas fuentes fusiona sola. Por eso
 * acá sólo se ACUMULAN votos; el merge lo decide la revisión, mirando
 * también cuánto se contradicen entre sí los que votaron (un par 5-a-4 no
 * es lo mismo que uno 9-a-0, aunque los dos "ganen" por sí).
 *
 * Se guarda igual que los reportes: un issue de GitHub por par, cada voto
 * como comentario. Durable, gratis, y el cron los tallea con `gh`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = process.env.GITHUB_REPO ?? "chequepa/vinndex";
const LABEL = "voto-match";

const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 30; // votar es un clic: se permite más que reportar
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

const VOTES = {
  si: "SÍ — es el mismo vino",
  no: "NO — son vinos distintos",
  nose: "NO SÉ",
} as const;
type Vote = keyof typeof VOTES;

const isVote = (v: unknown): v is Vote =>
  typeof v === "string" && v in VOTES;

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max).trim() : "";

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

  if (str(b.website, 100)) return NextResponse.json({ ok: true }); // honeypot

  const pairId = str(b.pairId, 200);
  const vote = b.vote;
  // `pairId` es "slugA::slugB" — validamos la forma para no aceptar cualquier cosa.
  if (!pairId || !/^[a-z0-9-]+::[a-z0-9-]+$/.test(pairId) || !isVote(vote)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const [slugA, slugB] = pairId.split("::");

  const title = `[par] ${pairId}`;
  const comment =
    `**${VOTES[vote]}**\n\n` +
    `<sub>${new Date().toISOString()} · voto de usuario</sub>`;

  try {
    // Dedup por LISTADO, no por /search/issues: el índice de búsqueda de
    // GitHub tarda en ver un issue recién creado y se duplicarían los
    // pares votados casi al mismo tiempo (mismo bug que ya pasó en
    // /api/report).
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
          `¿Son el mismo vino?\n\n` +
          `- https://vinndex.com.ar/vino/${slugA}\n` +
          `- https://vinndex.com.ar/vino/${slugB}\n\n` +
          `Cada comentario es un voto. **No se fusiona por mayoría**: los ` +
          `votos son un input más junto al catálogo, el EAN y Vivino. Mirá ` +
          `también cuánto se contradicen entre sí.\n\n---\n\n${comment}`,
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
