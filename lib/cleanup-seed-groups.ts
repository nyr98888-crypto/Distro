import { db } from "@/lib/db";

/** Known fake Hebrew test-group Facebook IDs previously seeded for demos. */
export const SEED_TEST_GROUP_IDS = [
  "918273645019283",
  "847291056384720",
  "763948215607148",
  "692847103958261",
  "581936472048195",
] as const;

/**
 * Delete dummy/seed Channel rows from Turso:
 * - known test externalIds
 * - rows tagged בדיקה
 * - rows with categoryTags containing "seed"
 * - legacy mock prefixes
 */
export async function cleanupSeedChannels(accountId?: string): Promise<number> {
  const whereBase = accountId ? { accountId } : {};

  const candidates = await db.channel.findMany({
    where: accountId ? { accountId } : undefined,
    select: {
      id: true,
      externalId: true,
      categoryTags: true,
      name: true,
    },
  });

  const toDelete: string[] = [];
  for (const row of candidates || []) {
    const externalId = String(row.externalId || "");
    const tags = String(row.categoryTags || "");
    const name = String(row.name || "");
    const isKnownSeed = (SEED_TEST_GROUP_IDS as readonly string[]).includes(
      externalId
    );
    const isTagged =
      tags.includes("בדיקה") ||
      /"seed"/i.test(tags) ||
      tags.toLowerCase().includes("seed");
    const isMockPrefix =
      externalId.startsWith("fb_15_group_") ||
      externalId.startsWith("fb_il_") ||
      externalId.startsWith("fb_group_") ||
      /^91\d{12}$/.test(externalId); // custom addTestGroup random ids in 91e14 range
    const isTestName = /בדיקה|test group/i.test(name);

    if (isKnownSeed || isTagged || isMockPrefix || isTestName) {
      toDelete.push(String(row.id));
    }
  }

  for (const id of toDelete) {
    await db.channel.delete({ where: { id } });
  }

  // Also hard-delete by known IDs in case select missed anything
  await db.channel.deleteMany({
    where: {
      ...whereBase,
      externalId: { in: [...SEED_TEST_GROUP_IDS] },
    },
  });

  return toDelete.length;
}
