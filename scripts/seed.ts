import { createHash } from "crypto";
import { db } from "../lib/db";

function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

async function main() {
  console.log("Seeding DISTRO Turso database (user only — no mock groups)…");

  const user = await db.user.upsert({
    where: { email: "demo@distro.app" },
    update: {},
    create: {
      email: "demo@distro.app",
      passwordHash: hashPassword("distro-demo"),
    },
  });

  console.log(`User: ${user.email} (${user.id})`);

  const deleted = await db.channel.deleteMany({
    where: {
      OR: [
        { externalId: { startsWith: "fb_15_group_" } },
        { externalId: { startsWith: "fb_il_" } },
        { externalId: { startsWith: "fb_group_" } },
      ],
    },
  });
  console.log(`Purged ${deleted.count} mock groups.`);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
