import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export const DEMO_USER_EMAIL = "demo@distro.app";
export const DEMO_ACCOUNT_IDENTIFIER = "demo_fb_user_42";

/** @deprecated Mock groups removed — real Facebook sync only. */
export const DEMO_CHANNELS = [] as const;

function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export async function ensureDemoWorkspace(): Promise<{
  userId: string;
  accountId: string;
  channelCount: number;
}> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      passwordHash: hashPassword("distro-demo"),
    },
  });

  let account = await prisma.connectedAccount.findFirst({
    where: {
      userId: user.id,
      platformName: { in: ["facebook", "FACEBOOK"] },
      identifier: DEMO_ACCOUNT_IDENTIFIER,
    },
  });

  if (!account) {
    account = await prisma.connectedAccount.create({
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
  }

  await prisma.channel.deleteMany({
    where: {
      accountId: account.id,
      OR: [
        { externalId: { startsWith: "fb_il_" } },
        { externalId: { startsWith: "fb_group_" } },
        { externalId: { startsWith: "fb_15_group_" } },
      ],
    },
  });

  const channelCount = await prisma.channel.count({
    where: { accountId: account.id },
  });

  return {
    userId: user.id,
    accountId: account.id,
    channelCount,
  };
}
