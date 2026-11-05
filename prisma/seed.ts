import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

const SAMPLE_CHANNELS = [
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

async function main() {
  console.log("Seeding ListPilot database…");

  const user = await prisma.user.upsert({
    where: { email: "demo@listpilot.dev" },
    update: {},
    create: {
      email: "demo@listpilot.dev",
      passwordHash: hashPassword("listpilot-demo"),
    },
  });

  console.log(`User: ${user.email} (${user.id})`);

  let account = await prisma.connectedAccount.findFirst({
    where: {
      userId: user.id,
      platformName: "facebook",
      identifier: "demo_fb_user_42",
    },
  });

  if (!account) {
    account = await prisma.connectedAccount.create({
      data: {
        userId: user.id,
        platformName: "facebook",
        identifier: "demo_fb_user_42",
        sessionPayload: JSON.stringify({ seeded: true }),
        status: "ACTIVE",
        lastSyncedAt: new Date(),
      },
    });
  }

  console.log(
    `ConnectedAccount: ${account.platformName}/${account.identifier} (${account.id})`
  );

  for (const channel of SAMPLE_CHANNELS) {
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
      console.log(`  updated: ${channel.name}`);
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
      console.log(`  created: ${channel.name}`);
    }
  }

  console.log("Seed complete.");
  console.log(`Demo login cookie: listpilot_user_id=${user.id}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
