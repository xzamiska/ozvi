import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { schema } from "@ozvi/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { mayCreateAccount, isAdminEmail } from "./account-rules";
import { db } from "./db";

export { mayCreateAccount };

/**
 * Cloud accounts (/app): people who own workspaces and create projects. Separate from board users,
 * which stay per project. Session = signed cookie on path /app.
 */

export const APP_COOKIE = "ozvi_app";
const MAX_AGE = 60 * 60 * 24 * 30;

interface AppSession { a: string; v: number; exp: number }

const key = () => {
  const s = process.env.OZVI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return s;
};
const mac = (body: string) => createHmac("sha256", key()).update(`app:${body}`).digest("base64url");

export function encodeApp(s: AppSession) {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${mac(body)}`;
}
export function decodeApp(v: string | undefined, now = Date.now()): AppSession | null {
  const [body, sig] = (v ?? "").split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as AppSession;
    return s.exp * 1000 > now ? s : null;
  } catch { return null; }
}

export function appCookie(account: { id: string; sessionVersion: number }) {
  return {
    name: APP_COOKIE,
    value: encodeApp({ a: account.id, v: account.sessionVersion, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
    httpOnly: true, sameSite: "lax" as const, path: "/app", maxAge: MAX_AGE,
    secure: (process.env.PUBLIC_URL ?? "").startsWith("https://"),
  };
}

export type Account = typeof schema.accounts.$inferSelect;

export const getAccount = cache(async (): Promise<Account | null> => {
  const s = decodeApp((await cookies()).get(APP_COOKIE)?.value);
  if (!s) return null;
  const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, s.a) });
  return a && a.sessionVersion === s.v ? a : null;
});

/** Signs in (or up) an account after its e-mail was verified. Self-host admins join the default workspace. */
export async function accountForVerifiedEmail(email: string): Promise<Account | null> {
  const existing = await db.query.accounts.findFirst({ where: eq(schema.accounts.email, email) });
  if (!existing && !mayCreateAccount(email)) return null;
  const [account] = existing
    ? await db.update(schema.accounts).set({ lastLoginAt: new Date() }).where(eq(schema.accounts.id, existing.id)).returning()
    : await db.insert(schema.accounts).values({ email, lastLoginAt: new Date() }).returning();
  // Only the operators: with OZVI_SIGNUP=open anyone may sign up, but must not own other people's workspaces.
  if (process.env.OZVI_MODE !== "cloud" && isAdminEmail(email)) {
    // Self-host: operators listed in OZVI_ADMIN_EMAILS own every workspace on the instance.
    const all = await db.select({ id: schema.workspaces.id }).from(schema.workspaces);
    if (all.length) {
      await db.insert(schema.workspaceMembers).values(all.map((w) => ({ workspaceId: w.id, accountId: account!.id, role: "owner" })))
        .onConflictDoNothing();
    }
  }
  return account!;
}

export async function workspacesOf(accountId: string) {
  const rows = await db.select({ w: schema.workspaces, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers).innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.accountId, accountId)).orderBy(asc(schema.workspaces.createdAt));
  const ids = rows.map((r) => r.w.id);
  const projects = ids.length
    ? await db.select().from(schema.projects).where(inArray(schema.projects.workspaceId, ids)).orderBy(asc(schema.projects.createdAt))
    : [];
  return rows.map((r) => ({ ...r.w, role: r.role, projects: projects.filter((p) => p.workspaceId === r.w.id) }));
}

export async function isMember(accountId: string, workspaceId: string) {
  const [m] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.accountId, accountId), eq(schema.workspaceMembers.workspaceId, workspaceId)));
  return !!m;
}

export const newWorkspaceSlug = () => `w-${randomBytes(5).toString("hex")}`;

/**
 * Board header "back to console" link: only for board users whose e-mail belongs to an Ozvi
 * account that is a member of the project's workspace (people who arrived from /app).
 */
export async function hasConsole(email: string | null | undefined, workspaceId: string) {
  if (!email) return false;
  const [m] = await db.select({ id: schema.workspaceMembers.accountId }).from(schema.workspaceMembers)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.workspaceMembers.accountId))
    .where(and(eq(schema.accounts.email, email.toLowerCase()), eq(schema.workspaceMembers.workspaceId, workspaceId)));
  return !!m;
}
