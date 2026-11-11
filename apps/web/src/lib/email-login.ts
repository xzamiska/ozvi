import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { schema, type Db } from "@ozvi/db";
import { parseTheme, type Theme } from "@ozvi/theme";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { resolveBoardLocale } from "../i18n/board";
import { isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "../i18n/locales";
import { allow } from "./ratelimit";
import { translator } from "../i18n/messages";
import { ozviMailTheme, renderMail } from "./email/render";
import { sendNow } from "./email/worker";

/**
 * Sign-in by e-mail: a 6-digit code (type it in) and a link (click it), whichever is easier.
 * Used for cloud accounts (/app) and for boards with email login enabled. Both secrets are
 * stored as keyed hashes, expire in 15 minutes, work once, and the code allows 5 attempts.
 */

const { loginCodes } = schema;
const TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

const pepper = () => {
  const s = process.env.OZVI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return s;
};
const h = (kind: string, v: string) => createHmac("sha256", pepper()).update(`login:${kind}:${v}`).digest("hex");
const eqHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;

export class LoginError extends Error {}

/**
 * Language for sign-in mails and errors when the caller does not pass one: the request's board
 * rules (projectId) or the plain request locale (console). Outside a request (tests, CLI) → sk.
 */
async function ambientLocale(db: Db, projectId: string | null): Promise<Locale> {
  try {
    const { cookies, headers } = await import("next/headers");
    const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    const accept = (await headers()).get("accept-language");
    if (projectId) {
      const [p] = await db.select({ defaultLocale: schema.projects.defaultLocale, locales: schema.projects.locales })
        .from(schema.projects).where(eq(schema.projects.id, projectId));
      if (p) return resolveBoardLocale(p, cookie, accept);
    }
    return isLocale(cookie) ? cookie : matchLocale(accept);
  } catch {
    return "sk";
  }
}

export interface IssueInput {
  db: Db;
  email: string;
  projectId: string | null;
  returnTo?: string | null;
  /** Absolute URL of the page that consumes ?t=<link token>. */
  linkBase: string;
  brand: { name: string; theme?: unknown };
  /** Language of the e-mail and errors; defaults to the request's (see ambientLocale). */
  locale?: Locale;
}

/** Creates a code + link and e-mails them. Silently limits to 5 per e-mail per 15 minutes. */
export async function issueLogin(i: IssueInput): Promise<{ sent: boolean }> {
  const email = normalizeEmail(i.email);
  const locale = i.locale ?? await ambientLocale(i.db, i.projectId);
  const t = translator(locale, "email");
  if (!EMAIL.test(email)) throw new LoginError(t("errInvalidEmail"));
  const scope = i.projectId ? eq(loginCodes.projectId, i.projectId) : isNull(loginCodes.projectId);
  const [c] = await i.db.select({
    here: sql<number>`count(*) filter (where ${scope} and ${loginCodes.createdAt} > now() - interval '15 minutes')::int`,
    hour: sql<number>`count(*) filter (where ${loginCodes.createdAt} > now() - interval '1 hour')::int`,
    failed: sql<number>`coalesce(sum(${loginCodes.attempts}) filter (where ${loginCodes.usedAt} is null), 0)::int`,
  }).from(loginCodes).where(and(eq(loginCodes.email, email), eq(loginCodes.purpose, "login"), gt(loginCodes.createdAt, new Date(Date.now() - 86_400_000))));
  // Per board/app: 5 codes per 15 min. Per address across everything: 15 per hour (no mail-bombing via
  // many boards) and at most 20 wrong guesses a day, which keeps brute force far below 0.01 %.
  if ((c?.here ?? 0) >= 5 || (c?.hour ?? 0) >= 15) throw new LoginError(t("errTooManyCodes"));
  // After 20 wrong guesses a day the code is off, but the link still comes: a stranger guessing codes
  // must not be able to lock the owner of the inbox out (the link cannot be guessed).
  const linkOnly = (c?.failed ?? 0) >= 20;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const link = randomBytes(24).toString("base64url");
  await i.db.insert(loginCodes).values({
    projectId: i.projectId, email, codeHash: h("code", code), linkHash: h("link", link),
    returnTo: i.returnTo ?? null, expiresAt: new Date(Date.now() + TTL_MS),
    ...(linkOnly && { attempts: MAX_ATTEMPTS }),
  });

  let theme: Theme;
  try { theme = i.brand.theme ? parseTheme(i.brand.theme) : ozviMailTheme(); } catch { theme = ozviMailTheme(); }
  const url = `${i.linkBase}${i.linkBase.includes("?") ? "&" : "?"}t=${link}`;
  const mail = renderMail({
    subject: linkOnly ? t("loginSubjectLink", { brand: i.brand.name }) : t("loginSubject", { code, brand: i.brand.name }),
    summary: "",
    preheader: t("loginPreheader", { brand: i.brand.name }),
    heading: t("loginHeading", { brand: i.brand.name }),
    paragraphs: [linkOnly ? t("loginBodyLink") : t("loginBody")],
    ...(!linkOnly && { code: { value: code, note: t("loginValid") }, ctaLead: t("loginOr") }),
    cta: { label: t("signIn"), href: url },
    fine: [t("loginIgnore", { email })],
  }, theme, i.brand.name, null, locale);
  const sent = await sendNow({ to: email, fromName: i.brand.name, subject: mail.subject, html: mail.html, text: mail.text, kind: "login" });
  if (!sent && process.env.NODE_ENV !== "production") console.log(`[ozvi] login for ${email}: code ${code}, link ${url}`);
  return { sent };
}

type Row = typeof loginCodes.$inferSelect;

/** Checks the newest open code for this e-mail + scope. Wrong guesses count; 5 burn the code. */
export async function verifyCode(db: Db, emailIn: string, code: string, projectId: string | null, locale?: Locale, ip?: string): Promise<Row> {
  const email = normalizeEmail(emailIn);
  // Guessing across many addresses from one place is limited too (each code allows only 5 tries).
  if (ip && !allow("loginVerifyIp", ip)) throw new LoginError(translator(locale ?? await ambientLocale(db, projectId), "email")("errTooManyTries"));
  const scope = projectId ? eq(loginCodes.projectId, projectId) : isNull(loginCodes.projectId);
  // The transaction must commit on a wrong guess too (so the attempt counts): errors are thrown after it.
  const r = await db.transaction(async (tx): Promise<{ row?: Row; error?: "errCodeExpired" | "errCodeBurned" | "errCodeWrong" }> => {
    const [row] = await tx.select().from(loginCodes)
      .where(and(eq(loginCodes.email, email), scope, eq(loginCodes.purpose, "login"), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, new Date())))
      .orderBy(desc(loginCodes.createdAt)).limit(1).for("update");
    if (!row || row.attempts >= MAX_ATTEMPTS) return { error: "errCodeExpired" };
    if (!eqHex(row.codeHash, h("code", code.replace(/\D/g, "")))) {
      await tx.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.id, row.id));
      return { error: row.attempts + 1 >= MAX_ATTEMPTS ? "errCodeBurned" : "errCodeWrong" };
    }
    await tx.update(loginCodes).set({ usedAt: new Date() }).where(eq(loginCodes.id, row.id));
    return { row };
  });
  if (!r.row) throw new LoginError(translator(locale ?? await ambientLocale(db, projectId), "email")(r.error ?? "errCodeExpired"));
  return r.row;
}

/** Consumes a magic link token (only via POST after a confirm page, so mail scanners cannot burn it). */
export async function verifyLink(db: Db, token: string, projectId: string | null, purpose: "login" | "handoff" = "login", locale?: Locale): Promise<Row> {
  const scope = and(projectId ? eq(loginCodes.projectId, projectId) : isNull(loginCodes.projectId), eq(loginCodes.purpose, purpose));
  const row = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(loginCodes)
      .where(and(eq(loginCodes.linkHash, h("link", token)), scope)).limit(1).for("update");
    // Wrong code guesses never burn the link: it is 192 random bits, and burning it would let anyone lock the owner out.
    if (!row || row.usedAt || row.expiresAt < new Date()) return null;
    await tx.update(loginCodes).set({ usedAt: new Date() }).where(eq(loginCodes.id, row.id));
    return row;
  });
  if (!row) throw new LoginError(translator(locale ?? await ambientLocale(db, projectId), "email")("errLinkInvalid"));
  return row;
}

/** Read-only peek for the confirm page (shows which e-mail the link is for). */
export async function peekLink(db: Db, token: string, projectId: string | null): Promise<string | null> {
  const scope = and(projectId ? eq(loginCodes.projectId, projectId) : isNull(loginCodes.projectId), eq(loginCodes.purpose, "login"));
  const [row] = await db.select({ email: loginCodes.email, usedAt: loginCodes.usedAt, expiresAt: loginCodes.expiresAt })
    .from(loginCodes).where(and(eq(loginCodes.linkHash, h("link", token)), scope)).limit(1);
  return row && !row.usedAt && row.expiresAt > new Date() ? row.email : null;
}

/**
 * Changing an account's e-mail: a link sent to the new address, bound to the account. The address
 * changes only when that link is opened (proof the person can read it). 1 hour, single use.
 */
export async function issueEmailChange(db: Db, accountId: string, newEmail: string, linkBase: string, locale?: Locale): Promise<{ sent: boolean; url: string }> {
  const email = normalizeEmail(newEmail);
  const loc = locale ?? await ambientLocale(db, null);
  const t = translator(loc, "email");
  if (!EMAIL.test(email)) throw new LoginError(t("errInvalidEmail"));
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(loginCodes)
    .where(and(eq(loginCodes.accountId, accountId), eq(loginCodes.purpose, "email"), gt(loginCodes.createdAt, new Date(Date.now() - 3600_000))));
  if ((c?.n ?? 0) >= 5) throw new LoginError(t("errTooManyLinks"));
  const link = randomBytes(24).toString("base64url");
  await db.insert(loginCodes).values({
    projectId: null, purpose: "email", accountId, email, codeHash: h("code", randomBytes(16).toString("hex")), linkHash: h("link", link),
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const url = `${linkBase}?t=${link}`;
  const mail = renderMail({
    subject: t("changeSubject"),
    summary: "",
    heading: t("changeHeading"),
    paragraphs: [t("changeBody")],
    cta: { label: t("confirmEmail"), href: url },
    fine: [t("changeIgnore")],
  }, ozviMailTheme(), "Ozvi", null, loc);
  const sent = await sendNow({ to: email, fromName: "Ozvi", subject: mail.subject, html: mail.html, text: mail.text, kind: "login" });
  if (!sent && process.env.NODE_ENV !== "production") console.log(`[ozvi] e-mail change to ${email}: ${url}`);
  return { sent, url };
}

export async function peekEmailChange(db: Db, token: string): Promise<{ email: string; accountId: string } | null> {
  const [row] = await db.select().from(loginCodes).where(and(eq(loginCodes.linkHash, h("link", token)), eq(loginCodes.purpose, "email"))).limit(1);
  return row && row.accountId && !row.usedAt && row.expiresAt > new Date() ? { email: row.email, accountId: row.accountId } : null;
}

export async function consumeEmailChange(db: Db, token: string, locale?: Locale): Promise<{ email: string; accountId: string }> {
  const done = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(loginCodes).where(and(eq(loginCodes.linkHash, h("link", token)), eq(loginCodes.purpose, "email"))).limit(1).for("update");
    if (!row?.accountId || row.usedAt || row.expiresAt < new Date()) return null;
    await tx.update(loginCodes).set({ usedAt: new Date() }).where(eq(loginCodes.id, row.id));
    return { email: row.email, accountId: row.accountId };
  });
  if (!done) throw new LoginError(translator(locale ?? await ambientLocale(db, null), "email")("errChangeInvalid"));
  return done;
}

/** Housekeeping (worker): drop codes older than a day. */
export async function pruneLogins(db: Db) {
  await db.delete(loginCodes).where(sql`${loginCodes.createdAt} < now() - interval '1 day'`);
}

/**
 * Account → project hand-off (/app/open/<slug>): a one-time link token for that project, valid
 * 2 minutes, never e-mailed. Consumed by /<slug>/account on the project's own origin.
 */
export async function issueHandoff(db: Db, projectId: string, email: string, returnTo: string): Promise<string> {
  const link = randomBytes(24).toString("base64url");
  await db.insert(loginCodes).values({
    projectId, purpose: "handoff", email: normalizeEmail(email), codeHash: h("code", randomBytes(16).toString("hex")), linkHash: h("link", link),
    returnTo, expiresAt: new Date(Date.now() + 2 * 60_000),
  });
  return link;
}
