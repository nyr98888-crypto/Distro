import { db } from "@/lib/db";



async function main() {
  const ch = await db.channel.findMany({
    select: {
      id: true,
      accountId: true,
      externalId: true,
      name: true,
      isActive: true,
    },
  });
  console.log("channels", JSON.stringify(ch, null, 2));
  const ac = await db.connectedAccount.findMany({
    select: {
      id: true,
      identifier: true,
      isActive: true,
      status: true,
      displayName: true,
    },
  });
  console.log("accounts", JSON.stringify(ac, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
