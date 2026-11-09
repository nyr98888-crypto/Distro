import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyHandoffToken } from "@/lib/extension-handoff";

/** Session cookie set by auth / extension sync. */
export const SESSION_COOKIE_NAME = "distro_user_id";
/** Legacy cookie name — still accepted so existing sessions keep working. */
const LEGACY_SESSION_COOKIE_NAME = "listpilot_user_id";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Lightweight session helper for API routes.
 * Accepts the dashboard cookie or an Authorization Bearer extension token.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  let userId =
    cookieStore.get(SESSION_COOKIE_NAME)?.value ||
    cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value ||
    null;

  if (!userId) {
    const headerStore = await headers();
    const auth = headerStore.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (match?.[1]) {
      userId = verifyHandoffToken(match[1].trim());
    }
  }

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function requireAuth(): Promise<string> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new AuthError("Unauthorized");
  }
  return userId;
}

export function setSessionCookie(res: NextResponse, userId: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}
