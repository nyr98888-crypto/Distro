import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from "@/lib/auth";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import {
  REDIRECT_COOKIE,
  STATE_COOKIE,
  POST_LOGIN_COOKIE,
  buildFacebookRedirectUri,
  completeFacebookWebLogin,
  exchangeFacebookCode,
  verifyOAuthState,
} from "@/lib/facebook-oauth";
import { db } from "@/lib/db";

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
  res.cookies.set(POST_LOGIN_COOKIE, "", { path: "/", maxAge: 0 });
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

function fail(step: string, error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : String(error || "unknown error");
  console.error(`[auth/facebook/callback] step=${step}`, message);
  return NextResponse.json({ step, error: message }, { status: 500 });
}

/**
 * GET /api/auth/facebook/callback
 * Meta OAuth → Turso User + ConnectedAccount + session cookie → /dashboard/channels.
 * Failures (except Meta cancel) return JSON 500 with { step, error } — never a fake success redirect.
 */
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);

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
  const existingSessionUserId =
    request.cookies.get(SESSION_COOKIE_NAME)?.value || null;

  if (!code) {
    return fail("missing_code", new Error("Missing Facebook authorization code"));
  }
  if (!verifyOAuthState(state) || !cookieState || cookieState !== state) {
    return fail(
      "invalid_state",
      new Error("Invalid Facebook Login state — please try again")
    );
  }

  let step = "ensure_schema";
  try {
    await ensureAuthSchema();

    step = "exchange_code";
    const { profile, accessToken } = await exchangeFacebookCode(
      code,
      storedRedirect
    );
    if (!profile?.id) {
      throw new Error("Facebook profile missing id");
    }
    if (!accessToken) {
      throw new Error("Facebook access token missing after exchange");
    }

    // Prefer linking to the already-authenticated Distro user so Connect Facebook
    // never writes ConnectedAccount under a different userId than the session cookie.
    let linkToUserId: string | null = null;
    if (existingSessionUserId) {
      step = "resolve_session_user";
      const sessionUser = await db.user.findUnique({
        where: { id: existingSessionUserId },
        select: { id: true },
      });
      linkToUserId = sessionUser?.id ?? null;
    }

    step = "upsert_user_and_account";
    const login = await completeFacebookWebLogin({
      profile,
      accessToken,
      linkToUserId,
    });

    if (!login.userId || !login.accountId) {
      throw new Error("Turso upsert returned empty userId/accountId");
    }

    step = "verify_account";
    const saved = await db.connectedAccount.findFirst({
      where: { id: login.accountId, userId: login.userId },
      select: { id: true, identifier: true, displayName: true },
    });
    if (!saved) {
      throw new Error(
        `ConnectedAccount ${login.accountId} not found after upsert for user ${login.userId}`
      );
    }

    console.info(
      "[auth/facebook/callback] success",
      JSON.stringify({
        userId: login.userId,
        accountId: login.accountId,
        facebookId: saved.identifier,
        displayName: saved.displayName || null,
        linkedExistingSession: Boolean(linkToUserId),
        groupCount: login.groupCount,
      })
    );

    step = "set_session_redirect";
    const dest = new URL("/dashboard/channels", origin);
    const res = NextResponse.redirect(dest);
    setSessionCookie(res, login.userId);
    clearOAuthCookies(res);
    return res;
  } catch (error) {
    return fail(step, error);
  }
}
