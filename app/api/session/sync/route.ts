import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { encryptSession } from "@/lib/crypto";
import { db } from "@/lib/db";

const cookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().min(1),
  path: z.string().min(1),
});

const syncSessionSchema = z.object({
  cookies: z.array(cookieSchema).min(1, "At least one cookie is required"),
  platformName: z.string().min(1).default("facebook"),
  identifier: z.string().min(1).optional(),
});

/**
 * POST /api/session/sync
 *
 * Accepts browser session cookies from an authenticated client,
 * encrypts them at rest with AES-256-GCM into ConnectedAccount.accessToken.
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

    const parsed = syncSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { cookies: sessionCookies, platformName } = parsed.data;

    const identifier =
      parsed.data.identifier ??
      sessionCookies.find((c) => c.name === "c_user")?.value ??
      sessionCookies.find((c) => c.name === "user_id")?.value ??
      sessionCookies[0].value;

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: "Unable to determine account identifier" },
        { status: 400 }
      );
    }

    const accessToken = encryptSession(JSON.stringify(sessionCookies));
    const now = new Date();

    const existing = await db.connectedAccount.findFirst({
      where: { userId, platformName, identifier },
      select: { id: true },
    });

    const account = existing
      ? await db.connectedAccount.update({
          where: { id: existing.id },
          data: {
            accessToken,
            status: "ACTIVE",
            lastSyncedAt: now,
          },
          select: { id: true },
        })
      : await db.connectedAccount.create({
          data: {
            userId,
            platformName,
            identifier,
            accessToken,
            status: "ACTIVE",
            lastSyncedAt: now,
          },
          select: { id: true },
        });

    return NextResponse.json({
      success: true,
      accountId: account.id,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.error("[session/sync]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
