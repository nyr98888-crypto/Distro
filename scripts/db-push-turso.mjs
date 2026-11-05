import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
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
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(resolve(process.cwd(), ".env"));

const url = process.env.DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

if (!token || token === "paste-your-turso-token-here") {
  console.error(
    "TURSO_AUTH_TOKEN is missing. Paste your real Turso token into .env"
  );
  process.exit(1);
}

const pushUrl = url.includes("authToken=")
  ? url
  : `${url}${url.includes("?") ? "&" : "?"}authToken=${encodeURIComponent(token)}`;

const result = spawnSync(
  "npx",
  ["prisma", "db", "push", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: pushUrl },
    shell: true,
  }
);

process.exit(result.status ?? 1);
