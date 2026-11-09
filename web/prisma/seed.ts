import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

async function main() {
  console.log("Seeding DISTRO database (user only — no mock groups)…");

  const user = await prisma.user.upsert({
    where: { email: "demo@distro.app" },
    update: {},
    create: {
      email: "demo@distro.app",
      passwordHash: hashPassword("distro-demo"),
    },
  });

  console.log(`User: ${user.email} (${user.id})`);

  const deleted = await prisma.channel.deleteMany({
    where: {
      OR: [
        { externalId: { startsWith: "fb_15_group_" } },
        { externalId: { startsWith: "fb_il_" } },
        { externalId: { startsWith: "fb_group_" } },
        {
          name: {
            in: [
              "Local Buy & Sell",
              "Auto Classifieds",
              "Home & Garden Deals",
              "Real Estate Investors Hub",
              "Job Seekers Network",
            ],
          },
        },
      ],
    },
  });
  console.log(`Purged ${deleted.count} mock groups.`);
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
