import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

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
 * encrypts them at rest with AES-256-GCM, and upserts a ConnectedAccount.
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

    // Derive a stable identifier from a well-known cookie (e.g. c_user) or fallback
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

    const sessionPayload = encrypt(JSON.stringify(sessionCookies));
    const now = new Date();

    // No composite unique in schema — find-then-update/create
    const existing = await prisma.connectedAccount.findFirst({
      where: { userId, platformName, identifier },
      select: { id: true },
    });

    const account = existing
      ? await prisma.connectedAccount.update({
          where: { id: existing.id },
          data: {
            sessionPayload,
            status: "ACTIVE",
            lastSyncedAt: now,
          },
          select: { id: true },
        })
      : await prisma.connectedAccount.create({
          data: {
            userId,
            platformName,
            identifier,
            sessionPayload,
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
