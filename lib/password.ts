import { createHash } from "crypto";

export function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function verifyPassword(plain: string, passwordHash: string): boolean {
  return hashPassword(plain) === passwordHash;
}
