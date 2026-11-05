import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, getAuthenticatedUserId } from "@/lib/auth";
import { ensureDemoWorkspace } from "@/lib/demo-workspace";
import { prisma } from "@/lib/prisma";

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  memberCount: z.number().int().nonnegative().optional(),
  url: z.string().url().optional().or(z.literal("")),
});

const syncChannelsSchema = z.object({
  fbUserId: z.string().min(1),
  fbUserName: z.string().min(1),
  groups: z.array(groupSchema).min(1, "At least one group is required"),
});

const DEFAULT_TAGS = JSON.stringify(["פייסבוק", "אישי"]);
const PLATFORM = "FACEBOOK";

/**
 * Resolve the active ListPilot user for extension sync.
 * Prefers the session cookie; in development falls back to the demo workspace.
 */
async function resolveUserId(): Promise<string> {
  const existing = await getAuthenticatedUserId();
  if (existing) return existing;

  const allowDev =
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_DEV_LOGIN === "true";

  if (allowDev) {
    const demo = await ensureDemoWorkspace();
    return demo.userId;
  }

  throw new AuthError("Unauthorized");
}

/**
 * POST /api/channels/sync
 *
 * Receives Facebook groups from the Chrome extension and upserts
 * ConnectedAccount + Channel rows for the active user.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = syncChannelsSchema.safeParse(body);
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

    const { fbUserId, fbUserName, groups } = parsed.data;
    const now = new Date();

    // Find or create ConnectedAccount for this Facebook user
    let account = await prisma.connectedAccount.findFirst({
      where: {
        userId,
        platformName: PLATFORM,
        identifier: fbUserId,
      },
    });

    const sessionPayload = JSON.stringify({
      fbUserId,
      fbUserName,
      source: "chrome-extension",
      lastGroupSyncAt: now.toISOString(),
    });

    if (account) {
      account = await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          sessionPayload,
          status: "ACTIVE",
          lastSyncedAt: now,
          platformName: PLATFORM,
        },
      });
    } else {
      account = await prisma.connectedAccount.create({
        data: {
          userId,
          platformName: PLATFORM,
          identifier: fbUserId,
          sessionPayload,
          status: "ACTIVE",
          lastSyncedAt: now,
        },
      });
    }

    let syncedCount = 0;

    for (const group of groups) {
      const memberCount = group.memberCount ?? 0;
      const existing = await prisma.channel.findFirst({
        where: {
          accountId: account.id,
          externalId: group.id,
        },
      });

      if (existing) {
        await prisma.channel.update({
          where: { id: existing.id },
          data: {
            name: group.name,
            memberCount,
            categoryTags: DEFAULT_TAGS,
            isActive: true,
          },
        });
      } else {
        await prisma.channel.create({
          data: {
            accountId: account.id,
            externalId: group.id,
            name: group.name,
            memberCount,
            categoryTags: DEFAULT_TAGS,
            isActive: true,
          },
        });
      }

      syncedCount += 1;
    }

    return NextResponse.json({
      success: true,
      syncedCount,
      accountId: account.id,
      platform: PLATFORM,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[channels/sync]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
