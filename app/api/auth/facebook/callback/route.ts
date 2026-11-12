import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import {
  REDIRECT_COOKIE,
  STATE_COOKIE,
  buildFacebookRedirectUri,
  exchangeFacebookCode,
  upsertUserFromFacebook,
  verifyOAuthState,
} from "@/lib/facebook-oauth";

function requestOrigin(request: NextRequest): string {
  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "") ||
    "https";
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host;
  return `${proto}://${host}`;
}

function clearOAuthCookies(res: NextResponse): void {
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
}

function redirectToLogin(
  origin: string,
  errorMessage: string
): NextResponse {
  const url = new URL("/signin", origin);
  url.searchParams.set("error", errorMessage);
  const res = NextResponse.redirect(url);
  clearOAuthCookies(res);
  return res;
}

/**
 * GET /api/auth/facebook/callback
 * Meta OAuth redirect — upsert User, set session cookie, enter dashboard.
 *
 * Valid OAuth Redirect URIs in Meta:
 *   https://distro-auu6.vercel.app/api/auth/facebook/callback
 *   http://localhost:3000/api/auth/facebook/callback
 */
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);

  try {
    const { searchParams } = request.nextUrl;
    const oauthError = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    if (oauthError) {
      console.error(
        "[auth/facebook/callback] oauth error:",
        oauthError,
        errorDescription
      );
      return redirectToLogin(
        origin,
        errorDescription || oauthError || "Facebook Login was cancelled"
      );
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;
    const storedRedirect =
      request.cookies.get(REDIRECT_COOKIE)?.value ||
      buildFacebookRedirectUri(origin);

    if (!code) {
      return redirectToLogin(origin, "Missing Facebook authorization code");
    }
    if (!verifyOAuthState(state) || !cookieState || cookieState !== state) {
      return redirectToLogin(
        origin,
        "Invalid Facebook Login state — please try again"
      );
    }

    await ensureAuthSchema();
    const { profile } = await exchangeFacebookCode(code, storedRedirect);
    const user = await upsertUserFromFacebook(profile);

    const dest = new URL("/dashboard", origin);
    const res = NextResponse.redirect(dest);
    setSessionCookie(res, user.id);
    clearOAuthCookies(res);
    return res;
  } catch (error) {
    console.error("[auth/facebook/callback]", error);
    const message =
      error instanceof Error ? error.message : "Facebook Login failed";
    return redirectToLogin(origin, message);
  }
}
