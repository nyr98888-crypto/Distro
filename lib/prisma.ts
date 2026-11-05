import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Seeded local DB lives at prisma/dev.db (schema path file:./dev.db from prisma/)
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // @prisma/adapter-libsql v6 takes Config { url, authToken } — not a Client instance
  const adapter = new PrismaLibSQL({
    url,
    ...(url.startsWith("libsql://") &&
    authToken &&
    authToken !== "paste-your-turso-token-here"
      ? { authToken }
      : {}),
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
