import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { ensureDemoWorkspace } from "@/lib/demo-workspace";

/**
 * POST /api/auth/dev-login
 * Ensures demo User + ConnectedAccount + sample channels exist,
 * then sets the session cookie.
 *
 * Available in non-production, or when ALLOW_DEV_LOGIN=true.
 */
export async function POST(request: NextRequest) {
  const allowDevLogin =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_LOGIN === "true";

  if (!allowDevLogin) {
    return NextResponse.json(
      { success: false, error: "Dev login is disabled in production" },
      { status: 403 }
    );
  }

  try {
    const workspace = await ensureDemoWorkspace();

    const redirectTo =
      request.nextUrl.searchParams.get("redirect") ?? "/dashboard/channels";

    const res = NextResponse.json({
      success: true,
      userId: workspace.userId,
      accountId: workspace.accountId,
      channelCount: workspace.channelCount,
      redirectTo,
    });

    setSessionCookie(res, workspace.userId);

    return res;
  } catch (error) {
    console.error("[auth/dev-login]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Dev login failed",
      },
      { status: 500 }
    );
  }
}
