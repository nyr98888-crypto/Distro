import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST — clear Distro's cached Facebook connection + deactivate groups
 * so a new FB login can sync a clean list.
 */
export async function POST() {
  try {
    const userId = await requireAuth();
    const accounts = await db.connectedAccount.findMany({
      where: {
        userId,
        platformName: { in: ["FACEBOOK", "facebook"] },
      },
      select: { id: true },
    });

    const accountIds = accounts.map((a: any) => a.id);
    if (accountIds.length) {
      await db.channel.updateMany({
        where: { accountId: { in: accountIds } },
        data: { isActive: false },
      });
      await db.connectedAccount.updateMany({
        where: { id: { in: accountIds } },
        data: { status: "DISCONNECTED", accessToken: "" },
      });
    }

    return NextResponse.json({
      success: true,
      disconnectedAccounts: accountIds.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[facebook/disconnect]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
