import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 5 * 60 * 1000;

function secret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.DISTRO_API_KEY ||
    "destro-dev-handoff"
  );
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

/** Create a short-lived token the extension opens in a normal browser tab. */
export function createHandoffToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = b64url(JSON.stringify({ userId, exp }));
  const sig = b64url(
    createHmac("sha256", secret()).update(payload).digest()
  );
  return `${payload}.${sig}`;
}

export function verifyHandoffToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = b64url(
    createHmac("sha256", secret()).update(payload).digest()
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(fromB64url(payload).toString("utf8")) as {
      userId?: string;
      exp?: number;
    };
    if (!data.userId || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return data.userId;
  } catch {
    return null;
  }
}
