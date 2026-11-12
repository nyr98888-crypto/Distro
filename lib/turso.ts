import { createClient, type Client } from "@libsql/client";
import { resolveLibsqlConfig } from "@/lib/libsql-config";

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
