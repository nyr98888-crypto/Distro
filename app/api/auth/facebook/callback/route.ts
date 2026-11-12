import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import {
  describeAuthError,
  ensureAuthSchema,
} from "@/lib/ensure-auth-schema";
import {
  STATE_COOKIE,
  exchangeFacebookCode,
  upsertUserFromFacebook,
  verifyOAuthState,
} from "@/lib/facebook-oauth";
import { createHandoffToken } from "@/lib/extension-handoff";

function redirectToLogin(errorMessage: string): NextResponse {
  const url = new URL("/login", getAppUrl());
  url.searchParams.set("error", errorMessage);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * GET /api/auth/facebook/callback
 * Meta OAuth redirect — upsert User, set Distro session cookie, go to dashboard.
 *
 * Valid OAuth Redirect URI to register in Meta:
 *   {APP_URL}/api/auth/facebook/callback
 * e.g. https://distro-auu6.vercel.app/api/auth/facebook/callback
 *      http://localhost:3000/api/auth/facebook/callback
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    if (error) {
      console.error("[auth/facebook/callback] oauth error:", error, errorDescription);
      return redirectToLogin(
        errorDescription || error || "Facebook Login was cancelled"
      );
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;

    if (!code) {
      return redirectToLogin("Missing Facebook authorization code");
    }
    if (!verifyOAuthState(state) || !cookieState || cookieState !== state) {
      return redirectToLogin("Invalid Facebook Login state — please try again");
    }

    await ensureAuthSchema();
    const { profile } = await exchangeFacebookCode(code);
    const user = await upsertUserFromFacebook(profile);

    const handoffToken = createHandoffToken(user.id);
    const dest = new URL("/dashboard/channels", getAppUrl());
    dest.searchParams.set("ext_token", handoffToken);

    const res = NextResponse.redirect(dest);
    setSessionCookie(res, user.id);
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (error) {
    console.error("[auth/facebook/callback]", error);
    return redirectToLogin(describeAuthError(error));
  }
}
