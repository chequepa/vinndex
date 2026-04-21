import { NextResponse } from "next/server";
import { headers } from "next/headers";

/**
 * Start the ML OAuth 3-legged flow. Juan visits this and gets redirected to ML.
 */
export const dynamic = "force-dynamic";

/**
 * Railway proxies requests internally, so req.url reports localhost:8080.
 * Use forwarded headers (or a hardcoded fallback) to build the public origin
 * that ML will redirect back to. Must match the URI registered in the ML app.
 */
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

export async function GET(req: Request) {
  const appId = process.env.ML_APP_ID;
  if (!appId) {
    return new NextResponse("ML_APP_ID not set", { status: 500 });
  }
  const origin = await publicOrigin(req);
  const redirectUri = `${origin}/api/auth/mercadolibre/callback`;
  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return NextResponse.redirect(authUrl);
}
