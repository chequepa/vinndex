import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

/**
 * Start the ML OAuth 3-legged flow with PKCE (required by ML).
 *
 * 1. Generate a random code_verifier (43-128 chars)
 * 2. Hash it (SHA256 + base64url) → code_challenge
 * 3. Save code_verifier in a cookie so the callback route can use it
 * 4. Redirect to ML with code_challenge + code_challenge_method=S256
 */
export const dynamic = "force-dynamic";

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

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function GET(req: Request) {
  const appId = process.env.ML_APP_ID;
  if (!appId) {
    return new NextResponse("ML_APP_ID not set", { status: 500 });
  }

  const codeVerifier = base64url(randomBytes(48));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest(),
  );

  const origin = await publicOrigin(req);
  const redirectUri = `${origin}/api/auth/mercadolibre/callback`;
  const authUrl =
    `https://auth.mercadolibre.com.ar/authorization` +
    `?response_type=code` +
    `&client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  const res = NextResponse.redirect(authUrl);
  // HTTP-only cookie so the callback route can read it. 10 min TTL
  // (auth flow shouldn't take that long).
  res.cookies.set("ml_pkce_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth/mercadolibre",
  });
  return res;
}
