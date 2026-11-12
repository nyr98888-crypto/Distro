/**
 * One-shot: delete seeded fake Facebook groups from Turso.
 * Uses TURSO_* from .env.local — do not commit secrets.
 */
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FAKE_IDS = [
  "918273645019283",
  "847291056384720",
  "763948215607148",
  "692847103958261",
  "581936472048195",
];

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

const url =
  [local.TURSO_DATABASE_URL, base.TURSO_DATABASE_URL, local.DATABASE_URL, base.DATABASE_URL]
    .find((u) => u && (u.startsWith("libsql://") || u.startsWith("https://"))) ||
  "";

const authToken =
  [local.TURSO_AUTH_TOKEN, base.TURSO_AUTH_TOKEN].find(
    (t) => t && t !== "paste-your-turso-token-here"
  ) || "";

if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const client = createClient({ url, authToken });

const placeholders = FAKE_IDS.map(() => "?").join(",");

const select = await client.execute({
  sql: `SELECT "id", "externalId", "name", "categoryTags" FROM "Channel"
        WHERE "externalId" IN (${placeholders})
           OR "categoryTags" LIKE ?
           OR "categoryTags" LIKE ?`,
  args: [...FAKE_IDS, "%בדיקה%", "%seed%"],
});

const rows = select.rows || [];
console.log(`Found ${rows.length} fake/test channel row(s)`);
for (const r of rows) {
  console.log(` - ${r.externalId} | ${r.name}`);
}

if (!rows.length) {
  console.log("Nothing to delete.");
  process.exit(0);
}

const ids = rows.map((r) => r.id);
const idPlace = ids.map(() => "?").join(",");

await client.execute({
  sql: `DELETE FROM "PublishJob" WHERE "channelId" IN (${idPlace})`,
  args: ids,
});

const del = await client.execute({
  sql: `DELETE FROM "Channel" WHERE "id" IN (${idPlace})`,
  args: ids,
});

console.log(`Deleted ${del.rowsAffected ?? ids.length} Channel row(s).`);
process.exit(0);
