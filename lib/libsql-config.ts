const PLACEHOLDER_TOKEN = "paste-your-turso-token-here";

export type LibsqlConfig = {
  url: string;
  authToken?: string;
};

function isRemoteLibsql(url: string): boolean {
  return (
    url.startsWith("libsql://") ||
    (url.startsWith("https://") && /turso\.io/i.test(url))
  );
}

function isFileSqlite(url: string): boolean {
  return url.startsWith("file:");
}

/**
 * Resolve Turso / libSQL connection for Prisma adapter + raw client.
 * On Vercel / production, never falls back to local `dev.db`.
 */
export function resolveLibsqlConfig(): LibsqlConfig {
  let url = (
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ""
  ).trim();

  let authToken = (
    process.env.TURSO_AUTH_TOKEN ||
    process.env.DATABASE_AUTH_TOKEN ||
    ""
  ).trim();

  const onVercel = process.env.VERCEL === "1";
  const isProd = process.env.NODE_ENV === "production";

  if (!url) {
    if (onVercel || isProd) {
      throw new Error(
        "Database is not configured: set TURSO_DATABASE_URL (or DATABASE_URL) and TURSO_AUTH_TOKEN on Vercel"
      );
    }
    // Local CLI / offline only (never used on Vercel)
    url = "file:./dev.db";
  }

  if (isFileSqlite(url) && (onVercel || isProd)) {
    throw new Error(
      "Local SQLite (file:./…/dev.db) is not allowed on Vercel. Set TURSO_DATABASE_URL to a libsql:// Turso URL"
    );
  }

  const queryIndex = url.indexOf("?");
  if (queryIndex !== -1) {
    const params = new URLSearchParams(url.slice(queryIndex + 1));
    authToken =
      authToken ||
      params.get("authToken") ||
      params.get("auth_token") ||
      "";
    url = url.slice(0, queryIndex);
  }

  if (url.startsWith("https://") && /turso\.io$/i.test(new URL(url).host)) {
    url = `libsql://${new URL(url).host}`;
  }

  if (!authToken || authToken === PLACEHOLDER_TOKEN) {
    authToken = "";
  }

  if (isRemoteLibsql(url) && !authToken) {
    throw new Error(
      "Database is not configured: TURSO_AUTH_TOKEN is missing or still a placeholder"
    );
  }

  return {
    url,
    ...(isRemoteLibsql(url) && authToken ? { authToken } : {}),
  };
}

export function assertDatabaseConfigured(): void {
  resolveLibsqlConfig();
}
