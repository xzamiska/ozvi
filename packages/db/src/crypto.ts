import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Secrets at rest (per-project SSO secrets) are AES-256-GCM encrypted with OZVI_SECRET_KEY.
 * Format: v1.<iv>.<tag>.<ciphertext>, all base64url. Losing the key = re-issue SSO secrets.
 */

function key(raw = process.env.OZVI_SECRET_KEY): Buffer {
  if (!raw || raw.length < 32) throw new Error("OZVI_SECRET_KEY must be set (at least 32 characters)");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), enc].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(blob: string, rawKey?: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}
