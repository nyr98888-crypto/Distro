import { NextRequest, NextResponse } from "next/server";
import { ensureDemoWorkspace } from "@/lib/demo-workspace";

const COOKIE_NAME = "listpilot_user_id";

/**
 * POST /api/auth/dev-login
 * Ensures demo User + ConnectedAccount + sample channels exist,
 * then sets the session cookie. Allowed in development, or when
 * ALLOW_DEV_LOGIN=true.
 */
export async function POST(request: NextRequest) {
  const allow =
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_DEV_LOGIN === "true";

  if (!allow) {
    return NextResponse.json(
      { success: false, error: "Dev login is disabled" },
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

    res.cookies.set(COOKIE_NAME, workspace.userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // 30 days — local demo convenience
      maxAge: 60 * 60 * 24 * 30,
    });

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
