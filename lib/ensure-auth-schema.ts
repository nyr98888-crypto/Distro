import "server-only";

import { assertDatabaseConfigured } from "@/lib/libsql-config";
import { turso } from "@/lib/turso";

export { assertDatabaseConfigured };

let schemaReady: Promise<void> | null = null;

async function addColumnIfMissing(
  table: string,
  column: string,
  ddl: string
): Promise<void> {
  const cols = await turso.execute(`PRAGMA table_info("${table}")`);
  const exists = cols.rows.some((row) => String(row.name) === column);
  if (exists) return;
  await turso.execute(
    `ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`
  );
}

/**
 * Create Prisma auth / app tables in Turso (or local SQLite) if missing.
 * Safe to call on every login / register / OAuth request.
 */
export async function ensureAuthSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      assertDatabaseConfigured();

      await turso.executeMultiple(`
        CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL,
          "passwordHash" TEXT,
          "facebookId" TEXT,
          "name" TEXT NOT NULL DEFAULT '',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
        CREATE UNIQUE INDEX IF NOT EXISTS "User_facebookId_key" ON "User"("facebookId");

        CREATE TABLE IF NOT EXISTS "ConnectedAccount" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "platformName" TEXT NOT NULL DEFAULT 'facebook',
          "identifier" TEXT NOT NULL,
          "displayName" TEXT NOT NULL DEFAULT '',
          "avatarUrl" TEXT NOT NULL DEFAULT '',
          "accessToken" TEXT NOT NULL DEFAULT '',
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "isActive" BOOLEAN NOT NULL DEFAULT false,
          "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ConnectedAccount_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedAccount_userId_identifier_key"
          ON "ConnectedAccount"("userId", "identifier");
        CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_isActive_idx"
          ON "ConnectedAccount"("userId", "isActive");

        CREATE TABLE IF NOT EXISTS "DeviceSession" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "lastExtensionPing" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "isOnline" BOOLEAN NOT NULL DEFAULT false,
          "extensionVersion" TEXT NOT NULL DEFAULT '',
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "DeviceSession_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "DeviceSession_userId_key"
          ON "DeviceSession"("userId");

        CREATE TABLE IF NOT EXISTS "DeviceWorker" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "accountId" TEXT NOT NULL,
          "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "isOnline" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "DeviceWorker_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "DeviceWorker_accountId_key"
          ON "DeviceWorker"("accountId");
        CREATE INDEX IF NOT EXISTS "DeviceWorker_isOnline_lastSeenAt_idx"
          ON "DeviceWorker"("isOnline", "lastSeenAt");

        CREATE TABLE IF NOT EXISTS "GroupPreset" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "accountId" TEXT,
          "name" TEXT NOT NULL,
          "groupIds" TEXT NOT NULL DEFAULT '[]',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "GroupPreset_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "GroupPreset_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "GroupPreset_userId_idx" ON "GroupPreset"("userId");
        CREATE INDEX IF NOT EXISTS "GroupPreset_accountId_idx" ON "GroupPreset"("accountId");

        CREATE TABLE IF NOT EXISTS "Campaign" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "rawContent" TEXT NOT NULL,
          "mediaUrls" TEXT NOT NULL DEFAULT '[]',
          "status" TEXT NOT NULL DEFAULT 'DRAFT',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Campaign_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "Channel" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "accountId" TEXT NOT NULL,
          "externalId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "url" TEXT NOT NULL DEFAULT '',
          "memberCount" INTEGER NOT NULL DEFAULT 0,
          "categoryTags" TEXT NOT NULL DEFAULT '[]',
          "isApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          CONSTRAINT "Channel_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "ScheduledPost" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "accountId" TEXT,
          "name" TEXT NOT NULL DEFAULT '',
          "content" TEXT NOT NULL,
          "imageUrl" TEXT NOT NULL DEFAULT '',
          "targetGroups" TEXT NOT NULL DEFAULT '[]',
          "scheduledTime" DATETIME NOT NULL,
          "delaySeconds" INTEGER NOT NULL DEFAULT 60,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "errorMessage" TEXT NOT NULL DEFAULT '',
          "whatsappJson" TEXT NOT NULL DEFAULT '',
          "scheduleType" TEXT NOT NULL DEFAULT 'once',
          "daysOfWeek" TEXT NOT NULL DEFAULT '[]',
          "runTime" TEXT NOT NULL DEFAULT '07:00',
          "endDate" DATETIME,
          "maxRuns" INTEGER,
          "runsCount" INTEGER NOT NULL DEFAULT 0,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "nextRunAt" DATETIME,
          "executionMode" TEXT NOT NULL DEFAULT 'extension',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ScheduledPost_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "ScheduledPost_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "ScheduledPost_userId_scheduledTime_idx"
          ON "ScheduledPost"("userId", "scheduledTime");
        CREATE INDEX IF NOT EXISTS "ScheduledPost_accountId_status_idx"
          ON "ScheduledPost"("accountId", "status");
        CREATE INDEX IF NOT EXISTS "ScheduledPost_status_scheduledTime_idx"
          ON "ScheduledPost"("status", "scheduledTime");
        CREATE INDEX IF NOT EXISTS "ScheduledPost_isActive_nextRunAt_idx"
          ON "ScheduledPost"("isActive", "nextRunAt");
        CREATE INDEX IF NOT EXISTS "ScheduledPost_nextRunAt_isActive_idx"
          ON "ScheduledPost"("nextRunAt", "isActive");

        CREATE TABLE IF NOT EXISTS "PublishedGroupPost" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "scheduledPostId" TEXT NOT NULL,
          "groupId" TEXT NOT NULL DEFAULT '',
          "groupName" TEXT NOT NULL DEFAULT '',
          "groupExternalId" TEXT NOT NULL DEFAULT '',
          "postUrl" TEXT NOT NULL,
          "postFbId" TEXT NOT NULL DEFAULT '',
          "status" TEXT NOT NULL DEFAULT 'live',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PublishedGroupPost_scheduledPostId_fkey"
            FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "PublishedGroupPost_scheduledPostId_idx"
          ON "PublishedGroupPost"("scheduledPostId");
        CREATE INDEX IF NOT EXISTS "PublishedGroupPost_postUrl_idx"
          ON "PublishedGroupPost"("postUrl");

        CREATE TABLE IF NOT EXISTS "PublishJob" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "campaignId" TEXT NOT NULL,
          "channelId" TEXT NOT NULL,
          "accountId" TEXT NOT NULL,
          "scheduledFor" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "executedAt" DATETIME,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "postResultUrl" TEXT,
          "errorMessage" TEXT,
          "priority" INTEGER NOT NULL DEFAULT 5,
          CONSTRAINT "PublishJob_campaignId_fkey"
            FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "PublishJob_channelId_fkey"
            FOREIGN KEY ("channelId") REFERENCES "Channel" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "PublishJob_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      // Older local DBs may predate Facebook OAuth columns.
      try {
        await addColumnIfMissing("User", "facebookId", "TEXT");
        await addColumnIfMissing("User", "name", "TEXT NOT NULL DEFAULT ''");
        await turso.execute(
          `CREATE UNIQUE INDEX IF NOT EXISTS "User_facebookId_key" ON "User"("facebookId")`
        );
      } catch (error) {
        console.warn("[ensure-auth-schema] column migrate warning:", error);
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

/** Map DB/config failures to a safe client-facing message + log detail. */
export function describeAuthError(error: unknown): string {
  if (!(error instanceof Error)) return "Internal server error";
  const msg = error.message || "Internal server error";
  if (
    msg.includes("Database is not configured") ||
    msg.includes("TURSO_AUTH_TOKEN") ||
    msg.includes("DATABASE_URL")
  ) {
    return msg;
  }
  if (/no such table/i.test(msg)) {
    return "Database schema is not initialized. Please retry — tables will be created automatically.";
  }
  if (/SERVER_ERROR|HTTP status|UNAUTHORIZED/i.test(msg)) {
    return "Database connection failed. Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.";
  }
  return "Internal server error";
}
