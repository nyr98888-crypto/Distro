import "server-only";

import { hashPassword } from "@/lib/password";
import { db } from "@/lib/db";

/** Chrome Web Store reviewer credentials (also documented in extension notes). */
export const REVIEWER_EMAIL = "reviewer@distro.app";
export const REVIEWER_PASSWORD = "ReviewerPass2026!";
export const REVIEWER_ACCOUNT_IDENTIFIER = "chrome_store_reviewer";

/**
 * Ensures the Google reviewer demo workspace exists (account only — no mock groups).
 */
export async function ensureReviewerWorkspace(): Promise<{
  userId: string;
  accountId: string;
  channelCount: number;
}> {
  const user = await db.user.upsert({
    where: { email: REVIEWER_EMAIL },
    update: {
      passwordHash: hashPassword(REVIEWER_PASSWORD),
    },
    create: {
      email: REVIEWER_EMAIL,
      passwordHash: hashPassword(REVIEWER_PASSWORD),
    },
  });

  let account = await db.connectedAccount.findFirst({
    where: {
      userId: user.id,
      platformName: "FACEBOOK",
      identifier: REVIEWER_ACCOUNT_IDENTIFIER,
    },
  });

  if (!account) {
    account = await db.connectedAccount.create({
      data: {
        userId: user.id,
        platformName: "FACEBOOK",
        identifier: REVIEWER_ACCOUNT_IDENTIFIER,
        displayName: "Chrome Store Reviewer",
        avatarUrl: "",
        accessToken: "",
        status: "ACTIVE",
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });
  } else if (account.status !== "ACTIVE") {
    account = await db.connectedAccount.update({
      where: { id: account.id },
      data: { status: "ACTIVE", lastSyncedAt: new Date() },
    });
  }

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
