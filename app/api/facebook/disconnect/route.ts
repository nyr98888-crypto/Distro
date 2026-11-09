import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST — clear Distro's cached Facebook connection + deactivate groups
 * so a new FB login can sync a clean list.
 */
export async function POST() {
  try {
    const userId = await requireAuth();
    const accounts = await prisma.connectedAccount.findMany({
      where: {
        userId,
        platformName: { in: ["FACEBOOK", "facebook"] },
      },
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length) {
      await prisma.channel.updateMany({
        where: { accountId: { in: accountIds } },
        data: { isActive: false },
      });
      await prisma.connectedAccount.updateMany({
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
