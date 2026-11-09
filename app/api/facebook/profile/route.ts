import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { listFacebookAccounts } from "@/lib/facebook-accounts";

/** GET — currently active Facebook account (compat for older UI). */
export async function GET() {
  try {
    const userId = await requireAuth();
    const accounts = await listFacebookAccounts(userId);
    const active = accounts.find((a) => a.isActive) || accounts[0] || null;
    if (!active) {
      return NextResponse.json({ success: true, profile: null });
    }
    return NextResponse.json({
      success: true,
      profile: {
        name: active.name,
        avatarUrl: active.avatarUrl,
        facebookId: active.facebookId,
        isConnected: true,
        lastSyncedAt: active.lastSyncedAt,
        groupCount: active.groupCount,
        accountId: active.id,
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
    console.error("[facebook/profile]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
