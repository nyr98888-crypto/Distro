import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import {
  STATE_COOKIE,
  STATE_MAX_AGE,
  buildFacebookAuthUrl,
  createOAuthState,
  getFacebookOAuthConfig,
} from "@/lib/facebook-oauth";

/**
 * GET /api/auth/facebook
 * Start Facebook Login OAuth — redirects to Meta dialog.
 */
export async function GET() {
  try {
    // Validate env early so the user sees a clear error instead of a Meta failure.
    getFacebookOAuthConfig();
    const state = createOAuthState();
    const url = buildFacebookAuthUrl(state);
    const res = NextResponse.redirect(url);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (error) {
    console.error("[auth/facebook]", error);
    const message =
      error instanceof Error
        ? error.message
        : "Facebook Login is not available";
    const loginUrl = new URL("/login", getAppUrl());
    loginUrl.searchParams.set("error", message);
    return NextResponse.redirect(loginUrl);
  }
}
