import { getAuthenticatedUserId } from "@/lib/auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { createHandoffToken } from "@/lib/extension-handoff";
import { db } from "@/lib/db";
import { safeIso } from "@/lib/safe";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/auth/session
 * Used by the sign-in page to detect when the Chrome extension
 * has completed a channels sync and established a browser session.
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return corsJson({
        connected: false,
        authenticated: false,
        channelCount: 0,
      });
    }

    const account = await db.connectedAccount.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { lastSyncedAt: "desc" },
      select: {
        id: true,
        lastSyncedAt: true,
        _count: { select: { channels: true } },
      },
    });

    const channelCount = account?._count.channels ?? 0;
    const connected = Boolean(account && channelCount > 0);

    return corsJson({
      connected,
      authenticated: true,
      channelCount,
      lastSyncedAt: safeIso(account?.lastSyncedAt, null),
      extensionToken: createHandoffToken(userId),
    });
  } catch (error) {
    console.error("[auth/session]", error);
    return corsJson(
      { connected: false, authenticated: false, channelCount: 0 },
      { status: 500 }
    );
  }
}
