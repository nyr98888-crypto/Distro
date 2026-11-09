import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MOCK_EXTERNAL_PREFIXES = ["fb_15_group_", "fb_il_", "fb_group_"];
const MOCK_NAMES = [
  "Local Buy & Sell",
  "Auto Classifieds",
  "Real Estate Investors Hub",
  "Job Seekers Network",
  "Home & Garden Deals",
];

async function main() {
  const all = await prisma.channel.findMany({
    select: { id: true, externalId: true, name: true },
  });

  const toDelete = all.filter((row) => {
    const ext = row.externalId || "";
    if (MOCK_EXTERNAL_PREFIXES.some((p) => ext.startsWith(p))) return true;
    if (MOCK_NAMES.includes(row.name)) return true;
    if (!/^\d{5,}$/.test(ext)) return true; // keep only real numeric FB group ids
    return false;
  });

  if (!toDelete.length) {
    console.log("No mock groups found.");
    return;
  }

  const ids = toDelete.map((r) => r.id);
  const deleted = await prisma.channel.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`Deleted ${deleted.count} mock/non-numeric groups:`);
  for (const row of toDelete) {
    console.log(`  - ${row.externalId} | ${row.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
