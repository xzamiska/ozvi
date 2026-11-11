"use server";

import { rememberLocale } from "@/lib/user-locale";
import type { Locale } from "@/i18n/locales";

import { schema, withProject } from "@ozvi/db";
import { asc, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "./client-ip";
import { resolveBoardLocale } from "@/i18n/board";
import { LOCALE_COOKIE } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { db } from "./db";
import { issueLogin, LoginError, normalizeEmail, verifyCode, verifyLink } from "./email-login";
import { projectOrigin } from "./email/url";
import { allow } from "./ratelimit";
import { safeReturn, sessionCookie } from "./session";

/** Board sign-in by e-mail (projects with emailLogin on). Account sign-in for /app lives in app-actions.ts. */

import type { LoginState } from "@/components/EmailLogin";
export type { LoginState };

async function project(slug: string) {
  const p = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!p?.emailLogin) throw new Error((await getTranslations("account"))("server.emailLoginOff"));
  return p;
}

/** The board's language rules (enabled locales, default) applied to this request. */
async function boardLocale(p: { defaultLocale: string; locales: string[] }) {
  return resolveBoardLocale(p, (await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
}

export async function requestBoardLogin(slug: string, ret: string, _: LoginState, form: FormData): Promise<LoginState> {
  const p = await project(slug);
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const locale = await boardLocale(p);
  const t = await getTranslations({ locale, namespace: "account.server" });
  if (!allow("loginIp", clientIp(await headers()))) return { step: "email", email, error: t("tooManyAttempts") };
  try {
    const { sent } = await issueLogin({
      db, email, projectId: p.id, returnTo: safeReturn(slug, ret),
      linkBase: `${projectOrigin(p)}/${slug}/login/link`, brand: { name: p.name, theme: p.theme }, locale,
    });
    return { step: "code", email, info: sent ? t("codeSent", { email }) : t("noSmtpCode") };
  } catch (e) {
    if (e instanceof LoginError) return { step: "email", email, error: e.message };
    throw e;
  }
}

/**
 * The code proved the mailbox, so the person is whoever in this project already has that e-mail proven
 * (an e-mail user, or one the host app signed in with emailVerified): same reports, same name, one identity.
 * Only a brand-new e-mail gets its own `email:` user, without a made-up name.
 */
async function signIn(slug: string, projectId: string, email: string, locale?: Locale) {
  const user = await withProject(db, projectId, async (tx) => {
    // Only an account whose e-mail is proven too: an app that did not verify the address (no emailVerified
    // in its token) must not put this person into an account someone else opened with their address.
    const [known] = await tx.select().from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${email} and (${schema.users.externalId} like 'email:%' or ${schema.users.emailVerified})`)
      .orderBy(sql`${schema.users.externalId} like 'email:%'`, asc(schema.users.createdAt)).limit(1);
    // Signing in makes an imported placeholder a real person: retention never anonymises them.
    if (known) return (await tx.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, known.id)).returning())[0] ?? known;
    const [created] = await tx.insert(schema.users)
      .values({ projectId, externalId: `email:${email}`, email, emailVerified: true, name: null, lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: [schema.users.projectId, schema.users.externalId], set: { email, lastSeenAt: new Date() } })
      .returning();
    return created!;
  });
  (await cookies()).set(sessionCookie(slug, user, projectId));
  if (locale) await rememberLocale(projectId, user.id, locale);
  return user;
}

export async function verifyBoardLogin(slug: string, ret: string, prev: LoginState, form: FormData): Promise<LoginState> {
  const p = await project(slug);
  const email = prev.email ?? "";
  try {
    await verifyCode(db, email, String(form.get("code") ?? ""), p.id, await boardLocale(p));
  } catch (e) {
    if (e instanceof LoginError) return { ...prev, error: e.message, info: undefined };
    throw e;
  }
  await signIn(slug, p.id, normalizeEmail(email), await boardLocale(p));
  redirect(safeReturn(slug, ret));
}

export async function consumeBoardLink(slug: string, token: string) {
  const p = await project(slug);
  let row;
  try {
    row = await verifyLink(db, token, p.id);
  } catch (e) {
    if (e instanceof LoginError) redirect(`/${slug}/login?expired=1`);
    throw e;
  }
  await signIn(slug, p.id, row.email, await boardLocale(p));
  redirect(safeReturn(slug, row.returnTo));
}
