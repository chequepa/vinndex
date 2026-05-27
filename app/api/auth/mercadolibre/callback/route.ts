import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";

/** Railway proxies to localhost internally; use forwarded headers to build
 * the public origin. Must match the URI registered in ML app settings. */
async function publicOrigin(req: Request): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  if (!host || host.startsWith("localhost")) {
    return "https://vinndex.com.ar";
  }
  return `${proto}://${host}`;
}

/**
 * Mercado Libre OAuth callback.
 *
 * Flow:
 *   1. Juan visits /api/auth/mercadolibre/login · redirects to ML auth page
 *   2. Juan approves
 *   3. ML redirects here with ?code=XXX
 *   4. This exchanges the code for access_token + refresh_token
 *   5. Response shows the refresh_token so Juan can copy to GitHub Secrets
 *
 * ML_APP_ID + ML_CLIENT_SECRET must be set in env (they're already in
 * Railway + .env.local).
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return html(
      `<h1>Autorización cancelada</h1><p>${escapeHtml(error)}</p><a href="/api/auth/mercadolibre/login">Intentar de nuevo</a>`,
    );
  }

  if (!code) {
    return html(
      `<h1>Sin code</h1><p>Falta el parámetro <code>?code=</code>. Llegaste acá sin pasar por el flujo de autorización.</p><a href="/api/auth/mercadolibre/login">Empezar</a>`,
    );
  }

  const appId = process.env.ML_APP_ID;
  const secret = process.env.ML_CLIENT_SECRET;
  if (!appId || !secret) {
    return html(
      `<h1>Config incompleta</h1><p>Falta <code>ML_APP_ID</code> o <code>ML_CLIENT_SECRET</code> en variables de entorno.</p>`,
      500,
    );
  }

  const redirectUri = `${await publicOrigin(req)}/api/auth/mercadolibre/callback`;

  // PKCE: recupera el code_verifier que /login dejó en cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("ml_pkce_verifier")?.value;
  if (!codeVerifier) {
    return html(
      `<h1>Sesión PKCE expirada</h1><p>No encontré el <code>code_verifier</code> en cookies (puede haber expirado si tardaste más de 10 min, o el dominio cambió entre <code>/login</code> y este callback).</p><a href="/api/auth/mercadolibre/login">Empezar de nuevo</a>`,
      400,
    );
  }

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: appId,
        client_secret: secret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
  } catch (err) {
    return html(
      `<h1>Error</h1><pre>${escapeHtml((err as Error).message)}</pre>`,
      500,
    );
  }

  const body = await tokenRes.json();
  if (!tokenRes.ok) {
    return html(
      `<h1>ML rechazó el token exchange</h1><pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>`,
      400,
    );
  }

  const { access_token, refresh_token, expires_in, user_id } = body as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
  };

  // Render a page showing the refresh_token so Juan can copy it to GH Secret
  return html(`
    <h1>✅ Autorización OK</h1>
    <p>Copiá el <code>refresh_token</code> abajo y guardalo como GitHub Secret con nombre <code>ML_REFRESH_TOKEN</code> en
    <a href="https://github.com/chequepa/vinndex/settings/secrets/actions" target="_blank">Settings → Secrets → Actions</a>.
    También pegalo en <code>.env.local</code> local.</p>
    <h2>refresh_token</h2>
    <pre style="word-break:break-all;white-space:pre-wrap;background:#f3f3f3;padding:14px;border-radius:8px;font-family:monospace">${escapeHtml(refresh_token)}</pre>
    <details style="margin-top:20px"><summary>Otros datos (no guardes)</summary>
    <pre>user_id: ${user_id}
access_token (expira en ${expires_in}s, no lo uses directamente · el scraper lo regenera): ${escapeHtml(access_token)}</pre>
    </details>
    <p style="margin-top:30px;color:#666;font-size:14px">El refresh_token dura 6 meses. Cuando expire el daily scrape va a empezar a fallar y vamos a tener que re-autorizar.</p>
  `);
}

function html(body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>ML OAuth · Vinndex</title><style>
      body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.5}
      pre{font-size:13px}
      h1{color:#0F1729}
      a{color:#1E3FBF}
    </style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
