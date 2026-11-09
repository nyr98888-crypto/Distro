import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.connectedAccount.updateMany({ data: { isActive: false } });

  const real = await prisma.connectedAccount.findFirst({
    where: {
      identifier: { not: "demo_fb_user_42" },
      status: { not: "DELETED" },
    },
    orderBy: { lastSyncedAt: "desc" },
  });

  if (!real) {
    console.log("No real Facebook account found.");
    return;
  }

  const updated = await prisma.connectedAccount.update({
    where: { id: real.id },
    data: {
      isActive: true,
      status: "ACTIVE",
      displayName: real.displayName || "משתמש פייסבוק",
      avatarUrl:
        real.avatarUrl ||
        (/^\d+$/.test(real.identifier)
          ? `https://graph.facebook.com/${real.identifier}/picture?type=large`
          : ""),
      platformName: "FACEBOOK",
    },
  });

  console.log(
    "Activated:",
    updated.id,
    updated.identifier,
    updated.displayName,
    updated.avatarUrl
  );

  const left = await prisma.channel.count({
    where: { accountId: updated.id, isActive: true },
  });
  console.log("Active channels for account:", left);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
