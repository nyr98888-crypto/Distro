import fs from "fs";
import path from "path";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", "web", "dist", ".git"].includes(e.name)) {
        continue;
      }
      walk(p, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const skip = new Set([
  path.normalize("lib/db.ts"),
  path.normalize("lib/prisma.ts"),
  path.normalize("scripts/migrate-off-prisma.mjs"),
]);

const files = walk(".");
let changed = 0;
for (const f of files) {
  const rel = path.normalize(f);
  if ([...skip].some((s) => rel.endsWith(s))) continue;

  let c = fs.readFileSync(f, "utf8");
  let n = c;
  n = n.replaceAll('from "@/lib/prisma"', 'from "@/lib/db"');
  n = n.replaceAll("from '@/lib/prisma'", "from '@/lib/db'");
  n = n.replace(/import\s*\{\s*prisma\s*\}/g, "import { db }");
  n = n.replace(
    /import\s*\{\s*prisma\s+as\s+(\w+)\s*\}/g,
    "import { db as $1 }"
  );

  if (
    n.includes("@/lib/db") ||
    c.includes("@/lib/prisma") ||
    c.includes('from "@prisma/client"')
  ) {
    n = n.replace(/\bprisma\./g, "db.");
  }

  // seed files that import PrismaClient
  n = n.replace(
    /import\s*\{\s*PrismaClient\s*\}\s*from\s*["']@prisma\/client["'];?/g,
    'import { db } from "@/lib/db";'
  );
  n = n.replace(/const\s+prisma\s*=\s*new\s+PrismaClient\(\);?/g, "");
  n = n.replace(/new\s+PrismaClient\(\)/g, "db");

  if (n !== c) {
    fs.writeFileSync(f, n);
    changed += 1;
    console.log("updated", f);
  }
}
console.log("changed", changed);
