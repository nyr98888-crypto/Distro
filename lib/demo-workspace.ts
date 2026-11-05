import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export const DEMO_USER_EMAIL = "demo@listpilot.dev";
export const DEMO_ACCOUNT_IDENTIFIER = "demo_fb_user_42";

/** Israeli sample Facebook groups for local / demo testing. */
export const DEMO_CHANNELS = [
  {
    externalId: "fb_il_1001",
    name: "לוח נדל״ן תל אביב",
    memberCount: 18420,
    categoryTags: ["נדלן", "תל-אביב", "דירות"],
    isApprovalRequired: true,
    isActive: true,
  },
  {
    externalId: "fb_il_1002",
    name: "רכבים למכירה מרכז",
    memberCount: 22100,
    categoryTags: ["רכבים", "מרכז", "מכירות"],
    isApprovalRequired: false,
    isActive: true,
  },
  {
    externalId: "fb_il_1003",
    name: "קהילת שכונת בבלי",
    memberCount: 6740,
    categoryTags: ["קהילה", "בבלי", "מקומי"],
    isApprovalRequired: false,
    isActive: true,
  },
  {
    externalId: "fb_il_1004",
    name: "לוח יד שנייה חיפה והקריות",
    memberCount: 15680,
    categoryTags: ["יד-שניה", "חיפה", "מכירות"],
    isApprovalRequired: false,
    isActive: true,
  },
  {
    externalId: "fb_il_1005",
    name: "דרושים הייטק ישראל",
    memberCount: 31250,
    categoryTags: ["דרושים", "הייטק", "קריירה"],
    isApprovalRequired: true,
    isActive: false,
  },
] as const;

function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Creates (or reuses) the demo User + ConnectedAccount + sample channels.
 * Idempotent — safe to call on every dev login.
 */
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
      passwordHash: hashPassword("listpilot-demo"),
    },
  });

  let account = await prisma.connectedAccount.findFirst({
    where: {
      userId: user.id,
      platformName: "facebook",
      identifier: DEMO_ACCOUNT_IDENTIFIER,
    },
  });

  if (!account) {
    account = await prisma.connectedAccount.create({
      data: {
        userId: user.id,
        platformName: "facebook",
        identifier: DEMO_ACCOUNT_IDENTIFIER,
        sessionPayload: JSON.stringify({ seeded: true, demo: true }),
        status: "ACTIVE",
        lastSyncedAt: new Date(),
      },
    });
  } else if (account.status !== "ACTIVE") {
    account = await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: "ACTIVE", lastSyncedAt: new Date() },
    });
  }

  for (const channel of DEMO_CHANNELS) {
    const existing = await prisma.channel.findFirst({
      where: {
        accountId: account.id,
        externalId: channel.externalId,
      },
    });

    if (existing) {
      await prisma.channel.update({
        where: { id: existing.id },
        data: {
          name: channel.name,
          memberCount: channel.memberCount,
          categoryTags: JSON.stringify([...channel.categoryTags]),
          isApprovalRequired: channel.isApprovalRequired,
          isActive: channel.isActive,
        },
      });
    } else {
      await prisma.channel.create({
        data: {
          accountId: account.id,
          externalId: channel.externalId,
          name: channel.name,
          memberCount: channel.memberCount,
          categoryTags: JSON.stringify([...channel.categoryTags]),
          isApprovalRequired: channel.isApprovalRequired,
          isActive: channel.isActive,
        },
      });
    }
  }

  const channelCount = await prisma.channel.count({
    where: { accountId: account.id },
  });

  return {
    userId: user.id,
    accountId: account.id,
    channelCount,
  };
}
