import { createHmac, timingSafeEqual } from "node:crypto";
import { OzviTokenError } from "@ozvi/sdk";

/**
 * Widget token (ADR-0014): what the widget gets after the person verified an e-mail code inside it, when the
 * host app gives no token. `ozw.<payload>.<mac>`: project, user, the user's session version, expiry. Signed
 * with OZVI_SESSION_SECRET under its own label, so it can never pass as a session cookie or the other way round.
 */

export const WIDGET_TOKEN_PREFIX = "ozw.";
/** 30 days; "sign out everywhere", account deletion and turning e-mail sign-in off end it sooner. */
export const WIDGET_TOKEN_TTL = 60 * 60 * 24 * 30;

export interface WidgetClaims { p: string; u: string; v: number; exp: number }

function secret() {
  const s = process.env.OZVI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return s;
}
const mac = (body: string) => createHmac("sha256", secret()).update(`widget:${body}`).digest("base64url");

export const isWidgetToken = (token: string) => token.startsWith(WIDGET_TOKEN_PREFIX);

export function signWidgetToken(c: { projectId: string; userId: string; sessionVersion: number }, now = Date.now()): string {
  const claims: WidgetClaims = { p: c.projectId, u: c.userId, v: c.sessionVersion, exp: Math.floor(now / 1000) + WIDGET_TOKEN_TTL };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${WIDGET_TOKEN_PREFIX}${body}.${mac(body)}`;
}

/** Checks the signature and expiry; the caller checks the project, the user and the session version. */
export function verifyWidgetToken(token: string, now = Date.now()): WidgetClaims {
  if (!isWidgetToken(token)) throw new OzviTokenError("malformed");
  const [body, sig, extra] = token.slice(WIDGET_TOKEN_PREFIX.length).split(".");
  if (!body || !sig || extra !== undefined) throw new OzviTokenError("malformed");
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(mac(body), "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new OzviTokenError("signature");
  let c: WidgetClaims;
  try { c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new OzviTokenError("malformed"); }
  if (typeof c?.p !== "string" || typeof c.u !== "string" || typeof c.v !== "number" || typeof c.exp !== "number") throw new OzviTokenError("claims");
  if (c.exp * 1000 <= now) throw new OzviTokenError("expired");
  return c;
}
