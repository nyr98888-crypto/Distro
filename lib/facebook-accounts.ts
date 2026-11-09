import "server-only";

import { decryptSession, encryptSession } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

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
} {
  if (!accessToken) return {};
  try {
    const raw = decryptSession(accessToken);
    return JSON.parse(raw) as {
      fbUserId?: string;
      fbUserName?: string;
      fbAvatarUrl?: string;
      cookies?: FbCookie[];
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
}): string {
  return encryptSession(
    JSON.stringify({
      ...payload,
      source: "chrome-extension",
      lastGroupSyncAt: new Date().toISOString(),
    })
  );
}

export async function getActiveConnectedAccount(userId: string) {
  const active = await prisma.connectedAccount.findFirst({
    where: { userId, isActive: true, status: "ACTIVE" },
  });
  if (active) return active;
  return prisma.connectedAccount.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { lastSyncedAt: "desc" },
  });
}

export async function listFacebookAccounts(
  userId: string,
  opts?: { includeCookiesForId?: string }
): Promise<FacebookAccountDTO[]> {
  const rows = await prisma.connectedAccount.findMany({
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

  // Prefer active-channel counts
  const withCounts = await Promise.all(
    rows.map(async (row) => {
      const groupCount = await prisma.channel.count({
        where: { accountId: row.id, isActive: true },
      });
      const stored = parseStoredSession(row.accessToken);
      const rawName = (row.displayName || stored.fbUserName || "").trim();
      const looksLikeToken =
        !rawName ||
        /^t[_-]?\d/i.test(rawName) ||
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(rawName) ||
        rawName.startsWith("demo_fb_") ||
        /session|token|bearer/i.test(rawName);
      const safeName = looksLikeToken ? "משתמש פייסבוק" : rawName;

      const avatarUrl =
        row.avatarUrl ||
        stored.fbAvatarUrl ||
        (/^\d+$/.test(row.identifier)
          ? `https://graph.facebook.com/${row.identifier}/picture?type=large`
          : "");

      const dto: FacebookAccountDTO = {
        id: row.id,
        facebookId: row.identifier,
        name: safeName,
        avatarUrl,
        isActive: row.isActive,
        status: row.status,
        groupCount,
        lastSyncedAt: row.lastSyncedAt.toISOString(),
        createdAt: (row.createdAt ?? row.lastSyncedAt).toISOString(),
      };
      if (opts?.includeCookiesForId === row.id && stored.cookies?.length) {
        dto.cookies = stored.cookies;
      }
      return dto;
    })
  );

  return withCounts;
}

export async function setActiveAccount(userId: string, accountId: string) {
  const target = await prisma.connectedAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!target) return null;

  await prisma.connectedAccount.updateMany({
    where: { userId },
    data: { isActive: false },
  });
  return prisma.connectedAccount.update({
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
  makeActive?: boolean;
}) {
  const accessToken = encryptAccountSession({
    fbUserId: input.facebookId,
    fbUserName: input.name,
    fbAvatarUrl: input.avatarUrl || "",
    cookies: input.cookies || [],
  });

  if (input.makeActive !== false) {
    await prisma.connectedAccount.updateMany({
      where: { userId: input.userId },
      data: { isActive: false },
    });
  }

  const existing = await prisma.connectedAccount.findFirst({
    where: {
      userId: input.userId,
      identifier: input.facebookId,
    },
  });

  if (existing) {
    return prisma.connectedAccount.update({
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

  return prisma.connectedAccount.create({
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
  const account = await prisma.connectedAccount.findFirst({
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
  return prisma.connectedAccount.update({
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
