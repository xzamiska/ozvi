import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Host-app SSO: your backend signs who the user is, Ozvi trusts it.
 * HS256 JWT with a shared secret (OZVI_SSO_SECRET). No round-trip, no Ozvi account needed.
 *
 *   const token = signOzviToken({ id: user.id, email: user.email, name: user.name,
 *                                 locale: "en", traits: { company: "Acme", plan: "pro", mrr: 2900 } }, process.env.OZVI_SSO_SECRET!);
 *   // pass it to the widget: <ozvi-widget sso-token="...">  or  https://feedback.example.com/sso?token=...
 *
 * `locale` (optional) forces the board language for this user ("sk" | "cs" | "en"), so the board
 * matches your app. Ignored when the board does not have that language enabled.
 */

export interface OzviUser {
  /** Stable id in YOUR system. Ozvi keys the user on (project, id), never on e-mail alone. */
  id: string;
  email?: string;
  /**
   * true only if YOUR app has verified that this person owns `email` (a confirmation link or code).
   * Ozvi then treats them as the same person as someone who signs in to the board with that e-mail
   * (one account, not two). Never set it for addresses you have not verified: whoever registered an
   * unverified address in your app would take over that person's board account.
   */
  emailVerified?: boolean;
  name?: string;
  avatarUrl?: string;
  /** "team" can triage and write internal notes, "admin" can also change settings. Defaults to "member". */
  role?: "member" | "team" | "admin";
  /** UI language on the board and in e-mails: "sk", "cs" or "en". Omit to let the browser decide. */
  locale?: "sk" | "cs" | "en";
  /**
   * Customer data shown only to your team (item page "who wants it", ideas sorted by MRR, plan filter, MCP for
   * triage tokens). Known names: `company`, `companyId` (people with the same id count as one company),
   * `plan`, `mrr` (monthly revenue in cents, integer), `currency` (ISO 4217, default "EUR"). Other keys are
   * stored as they are (max 30, strings up to 200 chars). Omit `traits` to keep the stored ones; `{}` clears them.
   */
  traits?: OzviTraits;
}

export interface OzviTraits {
  company?: string;
  companyId?: string;
  plan?: string;
  /** Monthly recurring revenue in cents (2900 = 29.00). */
  mrr?: number;
  /** ISO 4217 currency of `mrr`; "EUR" when missing. */
  currency?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface OzviClaims extends OzviUser {
  iat: number;
  exp: number;
}

export interface SignOptions {
  /** Token lifetime in seconds. Short by default — tokens are minted per page load. */
  expiresIn?: number;
  now?: () => number;
}

const MIN_SECRET = 32;
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const HEADER = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

function assertSecret(secret: string) {
  if (typeof secret !== "string" || secret.length < MIN_SECRET) {
    throw new Error(`Ozvi SSO secret must be at least ${MIN_SECRET} characters`);
  }
}

export function signOzviToken(user: OzviUser, secret: string, opts: SignOptions = {}): string {
  assertSecret(secret);
  if (!user.id) throw new Error("Ozvi SSO token needs user.id");
  const iat = Math.floor((opts.now?.() ?? Date.now()) / 1000);
  const claims: OzviClaims = { ...user, iat, exp: iat + (opts.expiresIn ?? 600) };
  const body = `${HEADER}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export class OzviTokenError extends Error {
  constructor(public readonly reason: "malformed" | "algorithm" | "signature" | "expired" | "claims") {
    super(`Invalid Ozvi SSO token: ${reason}`);
  }
}

/** Used by the Ozvi server. Exported so integrators can test their setup locally. */
export function verifyOzviToken(token: string, secret: string, opts: { now?: () => number; leewaySeconds?: number } = {}): OzviClaims {
  assertSecret(secret);
  const parts = token.split(".");
  if (parts.length !== 3) throw new OzviTokenError("malformed");
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: string };
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  } catch {
    throw new OzviTokenError("malformed");
  }
  if (header.alg !== "HS256") throw new OzviTokenError("algorithm");

  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new OzviTokenError("signature");

  let claims: OzviClaims;
  try {
    claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    throw new OzviTokenError("malformed");
  }
  if (typeof claims.id !== "string" || !claims.id || typeof claims.exp !== "number") throw new OzviTokenError("claims");
  const now = Math.floor((opts.now?.() ?? Date.now()) / 1000);
  if (claims.exp + (opts.leewaySeconds ?? 30) < now) throw new OzviTokenError("expired");
  return claims;
}
