import { NextRequest, NextResponse } from "next/server";
import {
  POST_LOGIN_COOKIE,
  REDIRECT_COOKIE,
  STATE_COOKIE,
  STATE_MAX_AGE,
  buildFacebookAuthUrl,
  buildFacebookRedirectUri,
  createOAuthState,
  getFacebookCredentials,
  sanitizePostLoginPath,
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

/**
 * GET /api/auth/facebook
 * Start Facebook Login — redirect to Meta dialog with origin-based redirect_uri.
 * Optional: ?callbackUrl=/dashboard/channels or ?redirect=/dashboard/channels
 */
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  try {
    getFacebookCredentials();
    const state = createOAuthState();
    const redirectUri = buildFacebookRedirectUri(origin);
    const url = buildFacebookAuthUrl(state, redirectUri);
    const postLoginPath = sanitizePostLoginPath(
      request.nextUrl.searchParams.get("callbackUrl") ||
        request.nextUrl.searchParams.get("redirect")
    );

    const res = NextResponse.redirect(url);
    const cookieBase = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: STATE_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    };
    res.cookies.set(STATE_COOKIE, state, cookieBase);
    // Persist the exact redirect_uri used in the dialog so token exchange matches.
    res.cookies.set(REDIRECT_COOKIE, redirectUri, cookieBase);
    res.cookies.set(POST_LOGIN_COOKIE, postLoginPath, cookieBase);
    return res;
  } catch (error) {
    console.error("[auth/facebook]", error);
    const message =
      error instanceof Error
        ? error.message
        : "Facebook Login is not available";
    const loginUrl = new URL("/signin", origin);
    loginUrl.searchParams.set("error", message);
    return NextResponse.redirect(loginUrl);
  }
}
