import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session = signed cookie scoped to one project path (/billiwo), so several projects on one
 * host never share a login. Payload is tiny on purpose: user id, project id, expiry.
 */

/** v = users.session_version at issue time; bumping it signs the user out everywhere. */
export interface Session { u: string; p: string; exp: number; v?: number }

/** 7 days: role changes in the host app reach Ozvi at the latest on the next SSO login (every widget/board open re-signs). */
export const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.OZVI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return s;
}

const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");
export const cookieName = (slug: string) => `ozvi_${slug}`;

export function encodeSession(s: Session): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function decodeSession(value: string | undefined, now = Date.now()): Session | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(mac(body), "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    return s.exp * 1000 > now ? s : null;
  } catch {
    return null;
  }
}


/** Only same-project relative paths; blocks //evil.com and backslash tricks. */
export function safeReturn(slug: string, ret: string | null | undefined): string {
  const fallback = `/${slug}/ideas`;
  if (!ret || !ret.startsWith(`/${slug}/`) || ret.startsWith("//") || ret.includes("\\")) return fallback;
  return ret;
}
