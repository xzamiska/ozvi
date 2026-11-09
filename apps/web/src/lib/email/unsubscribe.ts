import { createHmac, timingSafeEqual } from "node:crypto";

function key() {
  const k = process.env.OZVI_SESSION_SECRET;
  if (!k || k.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return k;
}

const sig = (userId: string) => createHmac("sha256", key()).update(`unsub:${userId}`).digest("base64url").slice(0, 32);

export function unsubscribeUrl(base: string, slug: string, userId: string) {
  return `${base}/${slug}/unsubscribe?u=${userId}&s=${sig(userId)}`;
}

export function verifyUnsubscribe(userId: string, s: string) {
  const a = Buffer.from(s);
  const b = Buffer.from(sig(userId));
  return a.length === b.length && timingSafeEqual(a, b);
}
