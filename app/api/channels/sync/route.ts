import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, getAuthenticatedUserId } from "@/lib/auth";
import { encryptSession } from "@/lib/crypto";
import { ensureDemoWorkspace } from "@/lib/demo-workspace";
import { prisma } from "@/lib/prisma";

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  memberCount: z.number().int().nonnegative().optional(),
  url: z.string().url().optional().or(z.literal("")),
});

const cookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
});

const syncChannelsSchema = z.object({
  fbUserId: z.string().min(1),
  fbUserName: z.string().min(1),
  groups: z.array(groupSchema).min(1, "At least one group is required"),
  /** Optional Facebook session cookies / tokens to encrypt at rest */
  cookies: z.array(cookieSchema).optional(),
  sessionCredentials: z.string().min(1).optional(),
});

const DEFAULT_TAGS = JSON.stringify(["פייסבוק", "אישי"]);
const PLATFORM = "FACEBOOK";

function assertDistroApiKey(request: NextRequest): NextResponse | null {
  const expected = process.env.DISTRO_API_KEY;
  if (!expected) {
    console.error("[channels/sync] DISTRO_API_KEY is not configured");
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 }
    );
  }

  const provided = request.headers.get("x-distro-key");
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Resolve the active ListPilot user for extension sync.
 * Prefers the session cookie; in non-production may fall back to demo workspace.
 */
async function resolveUserId(): Promise<string> {
  const existing = await getAuthenticatedUserId();
  if (existing) return existing;

  if (process.env.NODE_ENV !== "production") {
    const demo = await ensureDemoWorkspace();
    return demo.userId;
  }

  throw new AuthError("Unauthorized");
}

/**
 * POST /api/channels/sync
 *
 * Requires header `x-distro-key: $DISTRO_API_KEY`.
 * Upserts ConnectedAccount + Channel rows; encrypts session credentials
 * into ConnectedAccount.accessToken before persisting to Turso/SQLite.
 */
export async function POST(request: NextRequest) {
  const authError = assertDistroApiKey(request);
  if (authError) return authError;

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

    const { fbUserId, fbUserName, groups, cookies, sessionCredentials } =
      parsed.data;
    const now = new Date();

    const plaintextCredentials =
      sessionCredentials ??
      (cookies && cookies.length > 0
        ? JSON.stringify({
            fbUserId,
            fbUserName,
            cookies,
            source: "chrome-extension",
            lastGroupSyncAt: now.toISOString(),
          })
        : JSON.stringify({
            fbUserId,
            fbUserName,
            source: "chrome-extension",
            lastGroupSyncAt: now.toISOString(),
          }));

    const accessToken = encryptSession(plaintextCredentials);

    let account = await prisma.connectedAccount.findFirst({
      where: {
        userId,
        platformName: PLATFORM,
        identifier: fbUserId,
      },
    });

    if (account) {
      account = await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessToken,
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
          accessToken,
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
