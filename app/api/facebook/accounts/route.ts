import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  listFacebookAccounts,
  upsertFacebookAccount,
  type FbCookie,
} from "@/lib/facebook-accounts";

const cookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  expirationDate: z.number().optional(),
  sameSite: z
    .enum(["no_restriction", "lax", "strict", "unspecified"])
    .optional(),
});

const upsertSchema = z.object({
  facebookId: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().optional().default(""),
  cookies: z.array(cookieSchema).optional().default([]),
  makeActive: z.boolean().optional().default(true),
});

/** GET — all Facebook accounts for the Distro user. */
export async function GET() {
  try {
    const userId = await requireAuth();
    const accounts = await listFacebookAccounts(userId);
    return NextResponse.json({
      success: true,
      accounts,
      activeAccountId: accounts.find((a) => a.isActive)?.id ?? null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[facebook/accounts/GET]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** POST — upsert a Facebook account (from extension after login / sync). */
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
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }

    const account = await upsertFacebookAccount({
      userId,
      facebookId: parsed.data.facebookId,
      name: parsed.data.name,
      avatarUrl: parsed.data.avatarUrl,
      cookies: parsed.data.cookies as FbCookie[],
      makeActive: parsed.data.makeActive,
    });

    const accounts = await listFacebookAccounts(userId);
    return NextResponse.json({
      success: true,
      accountId: account.id,
      accounts,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[facebook/accounts/POST]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
