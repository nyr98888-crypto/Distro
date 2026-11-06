import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { verifyHandoffToken } from "@/lib/extension-handoff";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/extension-handoff?token=...
 * Browser navigation from the extension after sync — sets the session cookie
 * so the open /signin tab can detect the connection and redirect.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const fallback = new URL("/signin", request.url);

  if (!token) {
    return NextResponse.redirect(fallback);
  }

  const userId = verifyHandoffToken(token);
  if (!userId) {
    return NextResponse.redirect(fallback);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.redirect(fallback);
  }

  const res = NextResponse.redirect(
    new URL("/dashboard/channels", request.url)
  );
  setSessionCookie(res, user.id);
  return res;
}
