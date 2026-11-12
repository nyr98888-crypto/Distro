import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { listFacebookAccounts } from "@/lib/facebook-accounts";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE — remove a saved Facebook account and deactivate its groups. */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const userId = await requireAuth();
    const { id } = await ctx.params;
    const account = await db.connectedAccount.findFirst({
      where: { id, userId },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    await db.channel.updateMany({
      where: { accountId: id },
      data: { isActive: false },
    });
    await db.connectedAccount.update({
      where: { id },
      data: {
        status: "DELETED",
        isActive: false,
        accessToken: "",
      },
    });

    // Promote another account if we removed the active one
    if (account.isActive) {
      const next = await db.connectedAccount.findFirst({
        where: {
          userId,
          status: "ACTIVE",
          id: { not: id },
        },
        orderBy: { lastSyncedAt: "desc" },
      });
      if (next) {
        await db.connectedAccount.update({
          where: { id: next.id },
          data: { isActive: true },
        });
      }
    }

    const accounts = await listFacebookAccounts(userId);
    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[facebook/accounts/DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
