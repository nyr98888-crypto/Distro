import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthError,
  getAuthenticatedUserId,
  setSessionCookie,
} from "@/lib/auth";
import { applyCorsHeaders, corsJson, corsPreflight } from "@/lib/cors";
import { encryptSession } from "@/lib/crypto";
import { createHandoffToken } from "@/lib/extension-handoff";
import { parseStoredSession } from "@/lib/facebook-accounts";
import { hashPassword } from "@/lib/password";
import { db } from "@/lib/db";

const groupSchema = z.object({
  id: z.string().regex(/^\d{5,}$/, "Group id must be numeric"),
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
  fbAvatarUrl: z.string().url().optional().or(z.literal("")),
  groups: z.array(groupSchema).min(1, "At least one group is required"),
  /** Optional Facebook session cookies / tokens to encrypt at rest */
  cookies: z.array(cookieSchema).optional(),
  sessionCredentials: z.string().min(1).optional(),
});

const DEFAULT_TAGS = JSON.stringify(["פייסבוק", "אישי"]);
const PLATFORM = "FACEBOOK";

const GROUP_NAME_NOISE = [
  /\s*פעילות אחרונה[\s\S]*$/i,
  /\s*פוסטים חדשים(?:\s+היום)?[\s\S]*$/i,
  /\s*Last active[\s\S]*$/i,
  /\s*Active now[\s\S]*$/i,
  /\s*New posts?(?:\s+today)?[\s\S]*$/i,
  /\s*[\d.,]+\s*(?:K|k|M|m|אלף|מיליון)?\s*(?:members?|חברים)[\s\S]*$/i,
  /\s*[·•|].*$/,
];

/** Strip FB activity / member metadata so re-sync cleans existing rows. */
function sanitizeGroupName(raw: string): string {
  let name = raw
    .replace(/\u00a0/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  name = name.split(/\n/)[0]?.trim() ?? name;
  for (const re of GROUP_NAME_NOISE) {
    name = name.replace(re, "").trim();
  }
  return name || raw.trim();
}

function assertDistroApiKey(request: NextRequest): NextResponse | null {
  const expected = process.env.DISTRO_API_KEY;
  if (!expected) {
    console.error("[channels/sync] DISTRO_API_KEY is not configured");
    return corsJson(
      { success: false, error: "Server misconfigured" },
      { status: 500 }
    );
  }

  const provided = request.headers.get("x-distro-key");
  if (!provided || provided !== expected) {
    return corsJson(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * Resolve the active Destro user for extension sync.
 * Prefers the session cookie; otherwise finds/creates a user from Facebook id
 * so the sign-in page can pick up the session after sync.
 */
async function resolveUserId(
  fbUserId: string,
  fbUserName: string
): Promise<string> {
  const existing = await getAuthenticatedUserId();
  if (existing) return existing;

  const linked = await db.connectedAccount.findFirst({
    where: {
      platformName: { in: [PLATFORM, "facebook"] },
      identifier: fbUserId,
    },
    select: { userId: true },
  });
  if (linked) return linked.userId;

  // Always bind sync to a real Facebook-derived user — never dump into demo mocks
  const email = `fb_${fbUserId}@distro.app`;
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: hashPassword(`ext-${fbUserId}-${fbUserName}`),
    },
  });
  return user.id;
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return corsJson(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = syncChannelsSchema.safeParse(body);
    if (!parsed.success) {
      return corsJson(
        {
          success: false,
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      fbUserId,
      fbUserName,
      fbAvatarUrl,
      groups,
      cookies,
      sessionCredentials,
    } = parsed.data;
    const userId = await resolveUserId(fbUserId, fbUserName);
    const now = new Date();

    await db.connectedAccount.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    let account = await db.connectedAccount.findFirst({
      where: {
        userId,
        identifier: fbUserId,
      },
    });

    // Preserve previously saved session cookies when this sync payload omits them
    let cookiesToStore = cookies && cookies.length > 0 ? cookies : [];
    if (!cookiesToStore.length && !sessionCredentials && account?.accessToken) {
      const prev = parseStoredSession(account.accessToken);
      if (prev.cookies?.length) cookiesToStore = prev.cookies;
    }

    const accessToken =
      sessionCredentials ||
      encryptSession(
        JSON.stringify({
          fbUserId,
          fbUserName,
          fbAvatarUrl: fbAvatarUrl || "",
          cookies: cookiesToStore,
          source: "chrome-extension",
          lastGroupSyncAt: now.toISOString(),
        })
      );

    if (account) {
      account = await db.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessToken,
          displayName: fbUserName,
          avatarUrl: fbAvatarUrl || account.avatarUrl || "",
          status: "ACTIVE",
          isActive: true,
          lastSyncedAt: now,
          platformName: PLATFORM,
        },
      });
    } else {
      account = await db.connectedAccount.create({
        data: {
          userId,
          platformName: PLATFORM,
          identifier: fbUserId,
          displayName: fbUserName,
          avatarUrl: fbAvatarUrl || "",
          accessToken,
          status: "ACTIVE",
          isActive: true,
          lastSyncedAt: now,
        },
      });
    }

    let syncedCount = 0;
    const syncedExternalIds: string[] = [];

    for (const group of groups) {
      const name = sanitizeGroupName(group.name);
      const existing = await db.channel.findFirst({
        where: {
          accountId: account.id,
          externalId: group.id,
        },
      });

      // Prefer a newly scraped count; keep the previous value if scrape still missed it
      const memberCount =
        group.memberCount !== undefined && group.memberCount > 0
          ? group.memberCount
          : (existing?.memberCount ?? group.memberCount ?? 0);

      if (existing) {
        await db.channel.update({
          where: { id: existing.id },
          data: {
            name,
            memberCount,
            categoryTags: DEFAULT_TAGS,
            isActive: true,
          },
        });
      } else {
        await db.channel.create({
          data: {
            accountId: account.id,
            externalId: group.id,
            name,
            memberCount,
            categoryTags: DEFAULT_TAGS,
            isActive: true,
          },
        });
      }

      syncedExternalIds.push(group.id);
      syncedCount += 1;
    }

    // Deactivate groups that disappeared from the full scroll scrape
    if (syncedExternalIds.length > 0) {
      await db.channel.updateMany({
        where: {
          accountId: account.id,
          externalId: { notIn: syncedExternalIds },
        },
        data: { isActive: false },
      });
    }

    const handoffToken = createHandoffToken(userId);
    const res = corsJson({
      success: true,
      syncedCount,
      accountId: account.id,
      platform: PLATFORM,
      redirectTo: "/dashboard/channels",
      handoffToken,
      extensionToken: handoffToken,
      handoffPath: `/api/auth/extension-handoff?token=${encodeURIComponent(handoffToken)}`,
    });
    setSessionCookie(res, userId);
    return applyCorsHeaders(res);
  } catch (error) {
    if (error instanceof AuthError) {
      return corsJson(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[channels/sync]", error);
    return corsJson(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
