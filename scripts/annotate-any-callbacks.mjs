import fs from "fs";
import path from "path";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", "web"].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

for (const f of [...walk("app"), ...walk("lib")]) {
  let c = fs.readFileSync(f, "utf8");
  const n = c
    .replace(/\.map\(\(async\s+([a-zA-Z_][\w]*)\)\s*=>/g, ".map(async ($1: any) =>")
    .replace(/\.map\(\(async\s+\(([a-zA-Z_][\w]*)\)\s*=>/g, ".map(async ($1: any) =>")
    .replace(/\.map\(async\s+\(([a-zA-Z_][\w]*)\)\s*=>/g, ".map(async ($1: any) =>")
    .replace(/\.map\(\(([a-zA-Z_][\w]*)\)\s*=>/g, ".map(($1: any) =>")
    .replace(/\.filter\(\(([a-zA-Z_][\w]*)\)\s*=>/g, ".filter(($1: any) =>")
    .replace(/\.forEach\(\(([a-zA-Z_][\w]*)\)\s*=>/g, ".forEach(($1: any) =>")
    .replace(/\.flatMap\(\(([a-zA-Z_][\w]*)\)\s*=>/g, ".flatMap(($1: any) =>");
  if (n !== c) {
    fs.writeFileSync(f, n);
    console.log("updated", f);
  }
}
