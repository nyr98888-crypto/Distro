import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NOISE = [
  /\s*פעילות אחרונה[\s\S]*$/i,
  /\s*פוסטים חדשים(?:\s+היום)?[\s\S]*$/i,
  /\s*Last active[\s\S]*$/i,
  /\s*Active now[\s\S]*$/i,
  /\s*New posts?(?:\s+today)?[\s\S]*$/i,
  /\s*[\d.,]+\s*(?:K|k|M|m|אלף|מיליון)?\s*(?:members?|חברים)[\s\S]*$/i,
  /\s*[·•|].*$/,
];

function cleanName(raw) {
  let name = String(raw || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  name = name.split(/\n/)[0]?.trim() ?? name;
  for (const re of NOISE) name = name.replace(re, "").trim();
  return name;
}

async function main() {
  const rows = await prisma.channel.findMany({
    where: { externalId: { not: { startsWith: "fb_" } } },
  });

  let updated = 0;
  let deleted = 0;
  for (const row of rows) {
    if (!/^\d{5,}$/.test(row.externalId)) {
      await prisma.channel.delete({ where: { id: row.id } });
      deleted += 1;
      continue;
    }
    const name = cleanName(row.name);
    // Drop notification/feed scrapes that aren't real group titles
    if (
      !name ||
      name.length < 2 ||
      /תויגו על ידי|לא נקראו|כולם תויגו/i.test(name)
    ) {
      await prisma.channel.delete({ where: { id: row.id } });
      deleted += 1;
      continue;
    }
    await prisma.channel.update({
      where: { id: row.id },
      data: { name, isActive: true },
    });
    updated += 1;
  }

  console.log(`Cleaned/activated ${updated}, deleted ${deleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
