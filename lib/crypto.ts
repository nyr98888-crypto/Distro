import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Resolve a 32-byte AES key from SESSION_SECRET (preferred)
 * or legacy SESSION_ENCRYPTION_KEY.
 * Accepts raw base64 (32 bytes) or any string (SHA-256 hashed).
 */
function getSessionKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET || process.env.SESSION_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with: " +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }

  try {
    const asB64 = Buffer.from(secret, "base64");
    if (asB64.length === 32) return asB64;
  } catch {
    // fall through to hash
  }

  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM.
 * Returns `iv:authTag:ciphertext` (all base64).
 */
export function encryptSession(data: string): string {
  const key = getSessionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a token produced by {@link encryptSession}.
 */
export function decryptSession(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted session token format.");
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getSessionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/** @deprecated Prefer encryptSession */
export const encrypt = encryptSession;
/** @deprecated Prefer decryptSession */
export const decrypt = decryptSession;
