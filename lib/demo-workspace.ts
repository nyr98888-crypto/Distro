import "server-only";

import { createHash } from "crypto";
import { db } from "@/lib/db";

export const DEMO_USER_EMAIL = "demo@distro.app";
export const DEMO_ACCOUNT_IDENTIFIER = "demo_fb_user_42";

/** @deprecated Mock groups removed — real Facebook sync only. Kept empty for callers. */
export const DEMO_CHANNELS = [] as const;

function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Creates (or reuses) the demo User + ConnectedAccount without sample groups.
 * Idempotent — safe to call on every dev login.
 */
export async function ensureDemoWorkspace(): Promise<{
  userId: string;
  accountId: string;
  channelCount: number;
}> {
  const user = await db.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      passwordHash: hashPassword("distro-demo"),
    },
  });

  let account = await db.connectedAccount.findFirst({
    where: {
      userId: user.id,
      platformName: { in: ["facebook", "FACEBOOK"] },
      identifier: DEMO_ACCOUNT_IDENTIFIER,
    },
  });

  if (!account) {
    account = await db.connectedAccount.create({
      data: {
        userId: user.id,
        platformName: "FACEBOOK",
        identifier: DEMO_ACCOUNT_IDENTIFIER,
        displayName: "Demo User",
        avatarUrl: "",
        accessToken: "",
        status: "ACTIVE",
        isActive: false,
        lastSyncedAt: new Date(),
      },
    });
  } else if (account.status !== "ACTIVE") {
    account = await db.connectedAccount.update({
      where: { id: account.id },
      data: { status: "ACTIVE", lastSyncedAt: new Date() },
    });
  }

  // Remove any leftover seed/mock channels for this account
  await db.channel.deleteMany({
    where: {
      accountId: account.id,
      OR: [
        { externalId: { startsWith: "fb_il_" } },
        { externalId: { startsWith: "fb_group_" } },
        { externalId: { startsWith: "fb_15_group_" } },
      ],
    },
  });

  const channelCount = await db.channel.count({
    where: { accountId: account.id },
  });

  return {
    userId: user.id,
    accountId: account.id,
    channelCount,
  };
}
