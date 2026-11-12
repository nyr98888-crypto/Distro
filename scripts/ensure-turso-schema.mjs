/**
 * Create Prisma tables on remote Turso using the same DDL as ensureAuthSchema.
 * Used when `prisma db push` is awkward with the libSQL adapter.
 */
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const base = loadEnv(resolve(process.cwd(), ".env"));
const local = loadEnv(resolve(process.cwd(), ".env.local"));

let url =
  [base.TURSO_DATABASE_URL, base.DATABASE_URL, local.TURSO_DATABASE_URL]
    .find((u) => u && (u.startsWith("libsql://") || u.startsWith("https://"))) ||
  "";

let authToken =
  [local.TURSO_AUTH_TOKEN, base.TURSO_AUTH_TOKEN]
    .find((t) => t && t !== "paste-your-turso-token-here") || "";

if (!url || !authToken) {
  console.error("Need remote Turso URL + real TURSO_AUTH_TOKEN");
  process.exit(1);
}

if (url.startsWith("https://")) {
  url = `libsql://${new URL(url).host}`;
}

const client = createClient({ url, authToken });

const ddl = `
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
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceSession_userId_key" ON "DeviceSession"("userId");

CREATE TABLE IF NOT EXISTS "DeviceWorker" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceWorker_accountId_key" ON "DeviceWorker"("accountId");

CREATE TABLE IF NOT EXISTS "GroupPreset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "accountId" TEXT,
  "name" TEXT NOT NULL,
  "groupIds" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rawContent" TEXT NOT NULL,
  "mediaUrls" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  "isActive" BOOLEAN NOT NULL DEFAULT true
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
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
  "priority" INTEGER NOT NULL DEFAULT 5
);
`;

await client.executeMultiple(ddl);
const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
);
console.log("Turso tables:", tables.rows.map((r) => r.name).join(", "));
client.close();
