import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/session
 * Used by the sign-in page to detect when the Chrome extension
 * has completed a channels sync and established a browser session.
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({
        connected: false,
        authenticated: false,
        channelCount: 0,
      });
    }

    const account = await prisma.connectedAccount.findFirst({
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

    return NextResponse.json({
      connected,
      authenticated: true,
      channelCount,
      lastSyncedAt: account?.lastSyncedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[auth/session]", error);
    return NextResponse.json(
      { connected: false, authenticated: false, channelCount: 0 },
      { status: 500 }
    );
  }
}
