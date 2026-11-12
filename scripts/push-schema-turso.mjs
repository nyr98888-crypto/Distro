import { spawnSync } from "node:child_process";
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

const urlCandidates = [
  base.TURSO_DATABASE_URL,
  base.DATABASE_URL,
  local.TURSO_DATABASE_URL,
  local.DATABASE_URL,
].filter(Boolean);

const url =
  urlCandidates.find(
    (u) => u.startsWith("libsql://") || u.startsWith("https://")
  ) || "";

const tokenCandidates = [
  local.TURSO_AUTH_TOKEN,
  base.TURSO_AUTH_TOKEN,
  local.DATABASE_AUTH_TOKEN,
  base.DATABASE_AUTH_TOKEN,
].filter(Boolean);

const token =
  tokenCandidates.find((t) => t && t !== "paste-your-turso-token-here") || "";

if (!url) {
  console.error("No remote Turso DATABASE_URL found");
  process.exit(1);
}
if (!token) {
  console.error("No real TURSO_AUTH_TOKEN found in .env / .env.local");
  process.exit(1);
}

const pushUrl = url.includes("authToken=")
  ? url
  : `${url}${url.includes("?") ? "&" : "?"}authToken=${encodeURIComponent(token)}`;

console.log("Pushing Prisma schema to Turso…");
const result = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: pushUrl,
      TURSO_DATABASE_URL: url,
      TURSO_AUTH_TOKEN: token,
    },
    shell: true,
  }
);

process.exit(result.status ?? 1);
