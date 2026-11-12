import "server-only";

import { decryptSession, encryptSession } from "@/lib/crypto";
import { db } from "@/lib/db";
import { asString, safeIso } from "@/lib/safe";

export type FbCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
};

export type FacebookAccountDTO = {
  id: string;
  facebookId: string;
  name: string;
  avatarUrl: string;
  isActive: boolean;
  status: string;
  groupCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
  /** Only included when explicitly requested (switch restore). */
  cookies?: FbCookie[];
};

export function parseStoredSession(accessToken: string): {
  fbUserId?: string;
  fbUserName?: string;
  fbAvatarUrl?: string;
  cookies?: FbCookie[];
  oauthAccessToken?: string;
  source?: string;
} {
  if (!accessToken) return {};
  try {
    const raw = decryptSession(accessToken);
    return JSON.parse(raw) as {
      fbUserId?: string;
      fbUserName?: string;
      fbAvatarUrl?: string;
      cookies?: FbCookie[];
      oauthAccessToken?: string;
      source?: string;
    };
  } catch {
    return {};
  }
}

export function encryptAccountSession(payload: {
  fbUserId: string;
  fbUserName: string;
  fbAvatarUrl?: string;
  cookies?: FbCookie[];
  oauthAccessToken?: string;
  source?: string;
}): string {
  return encryptSession(
    JSON.stringify({
      ...payload,
      source: payload.source || "chrome-extension",
      lastGroupSyncAt: new Date().toISOString(),
    })
  );
}

export async function getActiveConnectedAccount(userId: string) {
  const active = await db.connectedAccount.findFirst({
    where: { userId, isActive: true, status: "ACTIVE" },
  });
  if (active) return active;
  return db.connectedAccount.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { lastSyncedAt: "desc" },
  });
}

export async function listFacebookAccounts(
  userId: string,
  opts?: { includeCookiesForId?: string }
): Promise<FacebookAccountDTO[]> {
  const rows = await db.connectedAccount.findMany({
    where: {
      userId,
      platformName: { in: ["FACEBOOK", "facebook"] },
      status: { not: "DELETED" },
      // Hide legacy demo seed accounts from the switcher
      NOT: { identifier: { in: ["demo_fb_user_42", "chrome_store_reviewer"] } },
    },
    orderBy: [{ isActive: "desc" }, { lastSyncedAt: "desc" }],
    include: {
      _count: { select: { channels: true } },
    },
  });

  const withCounts = await Promise.all(
    (rows || []).map(async (row: any) => {
      const id = asString(row?.id);
      const identifier = asString(row?.identifier);
      let groupCount = 0;
      try {
        groupCount = await db.channel.count({
          where: { accountId: id, isActive: true },
        });
      } catch {
        groupCount = Number((row as { _count?: { channels?: number } })?._count?.channels ?? 0) || 0;
      }

      const stored = parseStoredSession(asString(row?.accessToken));
      const rawName = (asString(row?.displayName) || stored.fbUserName || "").trim();
      const looksLikeToken =
        !rawName ||
        /^t[_-]?\d/i.test(rawName) ||
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(rawName) ||
        rawName.startsWith("demo_fb_") ||
        /session|token|bearer/i.test(rawName);
      const safeName = looksLikeToken ? "משתמש פייסבוק" : rawName;

      const avatarUrl =
        asString(row?.avatarUrl) ||
        stored.fbAvatarUrl ||
        (/^\d+$/.test(identifier)
          ? `https://graph.facebook.com/${identifier}/picture?type=large`
          : "");

      const now = new Date().toISOString();
      const dto: FacebookAccountDTO = {
        id,
        facebookId: identifier,
        name: safeName,
        avatarUrl,
        isActive: Boolean(row?.isActive),
        status: asString(row?.status, "ACTIVE"),
        groupCount,
        lastSyncedAt: safeIso(row?.lastSyncedAt, null),
        createdAt: safeIso(row?.createdAt ?? row?.lastSyncedAt, now) || now,
      };
      if (opts?.includeCookiesForId === id && stored.cookies?.length) {
        dto.cookies = stored.cookies;
      }
      return dto;
    })
  );

  return withCounts;
}

export async function setActiveAccount(userId: string, accountId: string) {
  const target = await db.connectedAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!target) return null;

  await db.connectedAccount.updateMany({
    where: { userId },
    data: { isActive: false },
  });
  return db.connectedAccount.update({
    where: { id: accountId },
    data: { isActive: true, status: "ACTIVE" },
  });
}

export async function upsertFacebookAccount(input: {
  userId: string;
  facebookId: string;
  name: string;
  avatarUrl?: string;
  cookies?: FbCookie[];
  oauthAccessToken?: string;
  source?: string;
  makeActive?: boolean;
}) {
  const accessToken = encryptAccountSession({
    fbUserId: input.facebookId,
    fbUserName: input.name,
    fbAvatarUrl: input.avatarUrl || "",
    cookies: input.cookies || [],
    oauthAccessToken: input.oauthAccessToken,
    source: input.source,
  });

  if (input.makeActive !== false) {
    await db.connectedAccount.updateMany({
      where: { userId: input.userId },
      data: { isActive: false },
    });
  }

  const existing = await db.connectedAccount.findFirst({
    where: {
      userId: input.userId,
      identifier: input.facebookId,
    },
  });

  if (existing) {
    return db.connectedAccount.update({
      where: { id: existing.id },
      data: {
        displayName: input.name,
        avatarUrl: input.avatarUrl || existing.avatarUrl,
        accessToken,
        status: "ACTIVE",
        isActive: input.makeActive !== false ? true : existing.isActive,
        lastSyncedAt: new Date(),
        platformName: "FACEBOOK",
      },
    });
  }

  return db.connectedAccount.create({
    data: {
      userId: input.userId,
      platformName: "FACEBOOK",
      identifier: input.facebookId,
      displayName: input.name,
      avatarUrl: input.avatarUrl || "",
      accessToken,
      status: "ACTIVE",
      isActive: input.makeActive !== false,
      lastSyncedAt: new Date(),
    },
  });
}

export async function saveAccountCookies(
  userId: string,
  accountId: string,
  cookies: FbCookie[],
  profile?: { name?: string; avatarUrl?: string }
) {
  const account = await db.connectedAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) return null;
  const prev = parseStoredSession(account.accessToken);
  const accessToken = encryptAccountSession({
    fbUserId: account.identifier,
    fbUserName: profile?.name || account.displayName || prev.fbUserName || "",
    fbAvatarUrl:
      profile?.avatarUrl || account.avatarUrl || prev.fbAvatarUrl || "",
    cookies,
  });
  return db.connectedAccount.update({
    where: { id: account.id },
    data: {
      accessToken,
      ...(profile?.name ? { displayName: profile.name } : {}),
      ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      lastSyncedAt: new Date(),
      status: "ACTIVE",
    },
  });
}
