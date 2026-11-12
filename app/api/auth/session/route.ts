import { getAuthenticatedUserId } from "@/lib/auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { listFacebookAccounts } from "@/lib/facebook-accounts";
import { db } from "@/lib/db";
import { safeIso } from "@/lib/safe";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/auth/session
 * Current Distro session + active Facebook profile from Turso (server-side only).
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return corsJson({
        connected: false,
        authenticated: false,
        channelCount: 0,
        user: null,
        profile: null,
      });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        facebookId: true,
      },
    });

    const accounts = await listFacebookAccounts(userId);
    const active = accounts.find((a) => a.isActive) || accounts[0] || null;
    const channelCount = active?.groupCount ?? 0;

    return corsJson({
      connected: Boolean(active),
      authenticated: true,
      channelCount,
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name || active?.name || "",
            facebookId: user.facebookId || active?.facebookId || null,
          }
        : { id: userId },
      profile: active
        ? {
            name: active.name,
            avatarUrl: active.avatarUrl,
            facebookId: active.facebookId,
            accountId: active.id,
            groupCount: active.groupCount,
            lastSyncedAt: safeIso(active.lastSyncedAt, null),
            isConnected: true,
          }
        : null,
      accounts,
    });
  } catch (error) {
    console.error("[auth/session]", error);
    return corsJson(
      {
        connected: false,
        authenticated: false,
        channelCount: 0,
        error: error instanceof Error ? error.message : "session failed",
      },
      { status: 500 }
    );
  }
}
