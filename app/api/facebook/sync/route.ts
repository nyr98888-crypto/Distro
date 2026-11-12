import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getActiveAccountId, listChannelsForAccount } from "@/lib/channels";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import {
  encryptAccountSession,
  getActiveConnectedAccount,
  listFacebookAccounts,
  parseStoredSession,
} from "@/lib/facebook-accounts";
import {
  fetchFacebookProfile,
  syncGroupsFromGraph,
} from "@/lib/facebook-oauth";
import { db } from "@/lib/db";

/**
 * POST /api/facebook/sync
 * Server-side Graph sync using the stored long-lived OAuth access token.
 * No Chrome extension required.
 */
export async function POST() {
  try {
    await ensureAuthSchema();
    const userId = await requireAuth();
    const account = await getActiveConnectedAccount(userId);
    if (!account) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No Facebook account linked — sign in with Facebook first",
        },
        { status: 404 }
      );
    }

    const stored = parseStoredSession(String(account.accessToken || ""));
    const oauthToken = stored.oauthAccessToken?.trim() || "";
    if (!oauthToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing Facebook access token — reconnect with Facebook Login",
          needsReauth: true,
        },
        { status: 400 }
      );
    }

    const profile = await fetchFacebookProfile(oauthToken);
    const groupCount = await syncGroupsFromGraph(account.id, oauthToken);

    const nextName =
      (profile?.name || "").trim() ||
      account.displayName ||
      stored.fbUserName ||
      "";
    const nextAvatar =
      profile?.pictureUrl ||
      account.avatarUrl ||
      stored.fbAvatarUrl ||
      (account.identifier
        ? `https://graph.facebook.com/${account.identifier}/picture?type=large`
        : "");

    await db.connectedAccount.update({
      where: { id: account.id },
      data: {
        displayName: nextName,
        avatarUrl: nextAvatar,
        lastSyncedAt: new Date(),
        status: "ACTIVE",
        accessToken: encryptAccountSession({
          fbUserId: String(account.identifier || profile?.id || ""),
          fbUserName: nextName,
          fbAvatarUrl: nextAvatar,
          cookies: stored.cookies || [],
          oauthAccessToken: oauthToken,
          source: stored.source || "facebook-oauth",
        }),
      },
    });

    const accountId = (await getActiveAccountId(userId)) || account.id;
    const channels = accountId ? await listChannelsForAccount(accountId) : [];
    const accounts = await listFacebookAccounts(userId);

    return NextResponse.json({
      success: true,
      groupCount,
      channelCount: channels.length,
      channels,
      profile: {
        name: nextName,
        avatarUrl: nextAvatar,
        facebookId: String(account.identifier || profile?.id || ""),
        accountId: account.id,
        groupCount: channels.filter((c) => c.isActive).length,
      },
      accounts,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[facebook/sync]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Facebook sync failed",
      },
      { status: 500 }
    );
  }
}
