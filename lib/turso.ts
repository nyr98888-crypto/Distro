import "server-only";

import { createClient, type Client } from "@libsql/client";

/**
 * libSQL rejects query params on the URL (e.g. ?authToken=...).
 * Prefer TURSO_* vars; fall back to DATABASE_* used by Prisma on Vercel.
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

const globalForTurso = globalThis as unknown as {
  turso: Client | undefined;
};

function getTursoClient(): Client {
  if (!globalForTurso.turso) {
    globalForTurso.turso = createClient(resolveLibsqlConfig());
  }
  return globalForTurso.turso;
}

/** Lazy client — avoids constructing libSQL during unrelated module evaluation. */
export const turso = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    const client = getTursoClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Cloud-test tables (separate from Prisma `Campaign` to avoid SQLite name clashes).
 */
export async function ensureTables() {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS fb_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cookies_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS cloud_campaigns (
      id TEXT PRIMARY KEY,
      group_url TEXT NOT NULL,
      post_text TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
