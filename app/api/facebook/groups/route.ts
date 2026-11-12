import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth, setSessionCookie } from "@/lib/auth";
import { applyCorsHeaders, corsJson, corsPreflight } from "@/lib/cors";
import {
  encryptAccountSession,
  parseStoredSession,
  upsertFacebookAccount,
  type FbCookie,
} from "@/lib/facebook-accounts";
import { getActiveAccountId } from "@/lib/channels";
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
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  expirationDate: z.number().optional(),
  sameSite: z
    .enum(["no_restriction", "lax", "strict", "unspecified"])
    .optional(),
});

const bodySchema = z.object({
  accountId: z.string().uuid().optional(),
  facebookId: z.string().min(1).optional(),
  name: z.string().optional(),
  avatarUrl: z.string().optional().or(z.literal("")),
  groups: z.array(groupSchema).min(1),
  cookies: z.array(cookieSchema).optional().default([]),
});

const DEFAULT_TAGS = JSON.stringify(["פייסבוק", "אישי"]);

const GROUP_NAME_NOISE = [
  /\s*פעילות אחרונה[\s\S]*$/i,
  /\s*פוסטים חדשים(?:\s+היום)?[\s\S]*$/i,
  /\s*Last active[\s\S]*$/i,
  /\s*Active now[\s\S]*$/i,
  /\s*New posts?(?:\s+today)?[\s\S]*$/i,
  /\s*[\d.,]+\s*(?:K|k|M|m|אלף|מיליון)?\s*(?:members?|חברים)[\s\S]*$/i,
  /\s*[·•|].*$/,
];

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

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/facebook/groups
 * Upsert scraped Facebook groups for the active (or specified) account.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return corsJson(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(body);
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
      accountId: preferredAccountId,
      facebookId,
      name,
      avatarUrl,
      groups,
      cookies,
    } = parsed.data;

    let account =
      preferredAccountId
        ? await db.connectedAccount.findFirst({
            where: { id: preferredAccountId, userId },
          })
        : null;

    if (!account && facebookId) {
      account = await upsertFacebookAccount({
        userId,
        facebookId,
        name: name || `משתמש ${facebookId.slice(-4)}`,
        avatarUrl: avatarUrl || "",
        cookies: cookies as FbCookie[],
        makeActive: true,
      });
    }

    if (!account) {
      const activeId = await getActiveAccountId(userId, preferredAccountId);
      if (activeId) {
        account = await db.connectedAccount.findFirst({
          where: { id: activeId, userId },
        });
      }
    }

    if (!account) {
      return corsJson(
        {
          success: false,
          error: "No active Facebook account — connect one first",
        },
        { status: 400 }
      );
    }

    // Refresh profile + cookies on the account when provided
    if (facebookId || name || avatarUrl || cookies.length) {
      const prev = parseStoredSession(account.accessToken);
      const nextCookies =
        cookies.length > 0 ? (cookies as FbCookie[]) : prev.cookies || [];
      const accessToken = encryptAccountSession({
        fbUserId: facebookId || account.identifier,
        fbUserName: name || account.displayName || prev.fbUserName || "",
        fbAvatarUrl: avatarUrl || account.avatarUrl || prev.fbAvatarUrl || "",
        cookies: nextCookies,
      });

      await db.connectedAccount.updateMany({
        where: { userId },
        data: { isActive: false },
      });

      account = await db.connectedAccount.update({
        where: { id: account.id },
        data: {
          ...(facebookId ? { identifier: facebookId } : {}),
          displayName:
            name || account.displayName || prev.fbUserName || account.displayName,
          avatarUrl:
            avatarUrl ||
            account.avatarUrl ||
            prev.fbAvatarUrl ||
            account.avatarUrl,
          accessToken,
          status: "ACTIVE",
          isActive: true,
          lastSyncedAt: new Date(),
          platformName: "FACEBOOK",
        },
      });
    }

    let syncedCount = 0;
    const syncedExternalIds: string[] = [];

    for (const group of groups) {
      const groupName = sanitizeGroupName(group.name);
      if (!groupName) continue;

      const existing = await db.channel.findFirst({
        where: { accountId: account.id, externalId: group.id },
      });

      const memberCount =
        group.memberCount !== undefined && group.memberCount > 0
          ? group.memberCount
          : (existing?.memberCount ?? 0);
      const groupUrl =
        (group.url && String(group.url).trim()) ||
        `https://www.facebook.com/groups/${group.id}`;

      if (existing) {
        await db.channel.update({
          where: { id: existing.id },
          data: {
            name: groupName,
            url: groupUrl,
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
            name: groupName,
            url: groupUrl,
            memberCount,
            categoryTags: DEFAULT_TAGS,
            isActive: true,
          },
        });
      }

      syncedExternalIds.push(group.id);
      syncedCount += 1;
    }

    if (syncedExternalIds.length > 0) {
      await db.channel.updateMany({
        where: {
          accountId: account.id,
          externalId: { notIn: syncedExternalIds },
        },
        data: { isActive: false },
      });
    }

    // Drop leftover mock rows for this account
    await db.channel.deleteMany({
      where: {
        accountId: account.id,
        OR: [
          { externalId: { startsWith: "fb_15_group_" } },
          { externalId: { startsWith: "fb_il_" } },
          { externalId: { startsWith: "fb_group_" } },
        ],
      },
    });

    const res = corsJson({
      success: true,
      syncedCount,
      accountId: account.id,
      accountName: account.displayName || name || null,
      avatarUrl: account.avatarUrl || avatarUrl || null,
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
    console.error("[facebook/groups]", error);
    return corsJson(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
