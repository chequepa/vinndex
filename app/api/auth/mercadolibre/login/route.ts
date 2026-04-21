import { NextResponse } from "next/server";

/**
 * Start the ML OAuth 3-legged flow. Juan visits this and gets redirected to ML.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const appId = process.env.ML_APP_ID;
  if (!appId) {
    return new NextResponse("ML_APP_ID not set", { status: 500 });
  }
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/mercadolibre/callback`;
  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return NextResponse.redirect(authUrl);
}
