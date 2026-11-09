import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  listFacebookAccounts,
  saveAccountCookies,
  setActiveAccount,
  type FbCookie,
} from "@/lib/facebook-accounts";
import { getActiveAccountId } from "@/lib/channels";

const bodySchema = z.object({
  targetAccountId: z.string().min(1),
  /** Current browser cookies to persist on the outgoing account before swap. */
  currentCookies: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        domain: z.string().optional(),
        path: z.string().optional(),
        secure: z.boolean().optional(),
        httpOnly: z.boolean().optional(),
        expirationDate: z.number().optional(),
        sameSite: z
          .enum(["no_restriction", "lax", "strict", "unspecified"])
          .optional(),
      })
    )
    .optional()
    .default([]),
  currentProfile: z
    .object({
      name: z.string().optional(),
      avatarUrl: z.string().optional(),
    })
    .optional(),
});

/**
 * POST — mark target account active and return its cookies for extension restore.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }

    const currentId = await getActiveAccountId(userId);
    if (
      currentId &&
      parsed.data.currentCookies.length > 0 &&
      currentId !== parsed.data.targetAccountId
    ) {
      await saveAccountCookies(
        userId,
        currentId,
        parsed.data.currentCookies as FbCookie[],
        parsed.data.currentProfile
      );
    }

    const updated = await setActiveAccount(
      userId,
      parsed.data.targetAccountId
    );
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const accounts = await listFacebookAccounts(userId, {
      includeCookiesForId: updated.id,
    });
    const target = accounts.find((a) => a.id === updated.id);

    return NextResponse.json({
      success: true,
      activeAccountId: updated.id,
      cookies: target?.cookies || [],
      account: target
        ? {
            id: target.id,
            facebookId: target.facebookId,
            name: target.name,
            avatarUrl: target.avatarUrl,
            isActive: true,
          }
        : null,
      accounts: accounts.map(({ cookies: _c, ...rest }) => rest),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[facebook/accounts/switch]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
