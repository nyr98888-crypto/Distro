import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * libSQL rejects query params on the URL (e.g. ?authToken=...).
 * Vercel / Turso dashboards sometimes paste those into DATABASE_URL —
 * strip them and pass the token via the adapter config instead.
 */
function resolveLibsqlConfig(): { url: string; authToken?: string } {
  let url = (
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "file:./prisma/dev.db"
  ).trim();

  let authToken =
    process.env.TURSO_AUTH_TOKEN ||
    process.env.DATABASE_AUTH_TOKEN ||
    undefined;

  const queryIndex = url.indexOf("?");
  if (queryIndex !== -1) {
    const params = new URLSearchParams(url.slice(queryIndex + 1));
    authToken =
      authToken ||
      params.get("authToken") ||
      params.get("auth_token") ||
      undefined;
    url = url.slice(0, queryIndex);
  }

  // Normalize Turso HTTPS URLs to libsql://
  if (url.startsWith("https://") && /turso\.io$/i.test(new URL(url).host)) {
    url = `libsql://${new URL(url).host}`;
  }

  if (!authToken || authToken === "paste-your-turso-token-here") {
    authToken = undefined;
  }

  return {
    url,
    ...(url.startsWith("libsql://") && authToken ? { authToken } : {}),
  };
}

function createPrismaClient(): PrismaClient {
  const config = resolveLibsqlConfig();
  const adapter = new PrismaLibSQL(config);
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/** Lazy client — avoids constructing libSQL during unrelated module evaluation. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
