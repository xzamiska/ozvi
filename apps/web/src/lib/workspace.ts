import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { schema, withProject, type Db, type Tx } from "@ozvi/db";
import { parseTheme, presets } from "@ozvi/theme";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { Account } from "./account";
import { logActivity, who as label } from "./activity";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { translator, type AppMessages } from "@/i18n/messages";
import { db } from "./db";
import { renderMail } from "./email/render";
import { publicUrl } from "./email/url";
import { sendNow } from "./email/worker";
import { deleteProject } from "./privacy";

/**
 * People in a workspace (/app). Owners manage billing and people; members open and run the
 * projects (they become admins of each board through the hand-off). A workspace always keeps
 * at least one owner. Board admin rights given by the hand-off are taken back when someone
 * leaves, so a removed person cannot keep using an old board session.
 */

export type WorkspaceRole = "owner" | "member";
const INVITE_TTL_MS = 7 * 86_400_000;
const MAX_PENDING = 50;

/** Codes of WorkspaceError: the keys of account.workspace in the messages. */
export type WorkspaceErrorKey = keyof AppMessages["account"]["workspace"];

/** Text of a workspace error; `arg` fills {email} or {ws}, whichever the message uses. */
function workspaceText(locale: Locale, key: WorkspaceErrorKey, arg: string): string {
  return translator(locale, "account")(`workspace.${key}`, { email: arg, ws: arg });
}

/** `key` picks the localized text (`text(locale)`); `message` is the Slovak one, for logs and tests. */
export class WorkspaceError extends Error {
  constructor(public key: WorkspaceErrorKey, public arg = "") { super(workspaceText("sk", key, arg)); }
  get code(): "last_owner" | "not_owner" | "other" { return this.key === "last_owner" || this.key === "not_owner" ? this.key : "other"; }
  text(locale: Locale) { return workspaceText(locale, this.key, this.arg); }
}

const { workspaceMembers: members, workspaceInvites: invites, accounts, workspaces } = schema;

const pepper = () => {
  const s = process.env.OZVI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return s;
};
export const inviteHash = (token: string) => createHmac("sha256", pepper()).update(`invite:${token}`).digest("hex");

export async function roleIn(accountId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const [m] = await db.select({ role: members.role }).from(members)
    .where(and(eq(members.accountId, accountId), eq(members.workspaceId, workspaceId)));
  return (m?.role as WorkspaceRole | undefined) ?? null;
}

export async function requireOwner(account: Account, workspaceId: string) {
  if ((await roleIn(account.id, workspaceId)) !== "owner") throw new WorkspaceError("not_owner");
}

export async function people(workspaceId: string) {
  const list = await db.select({ id: accounts.id, email: accounts.email, name: accounts.name, role: members.role, since: members.createdAt })
    .from(members).innerJoin(accounts, eq(accounts.id, members.accountId))
    .where(eq(members.workspaceId, workspaceId)).orderBy(asc(members.createdAt));
  const pending = await db.select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites).where(and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(asc(invites.createdAt));
  return { members: list, pending };
}

/** Creates (or renews) an invitation and e-mails the link. Returns false when no mail transport is set (dev logs the link). */
export async function invite(account: Account, workspaceId: string, email: string, role: WorkspaceRole, locale: Locale = DEFAULT_LOCALE): Promise<boolean> {
  await requireOwner(account, workspaceId);
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new WorkspaceError("no_workspace");
  const [already] = await db.select({ id: accounts.id }).from(members).innerJoin(accounts, eq(accounts.id, members.accountId))
    .where(and(eq(members.workspaceId, workspaceId), eq(accounts.email, email)));
  if (already) throw new WorkspaceError("already_member", email);
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(invites)
    .where(and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  if ((count?.n ?? 0) >= MAX_PENDING) throw new WorkspaceError("too_many_pending");

  const token = randomBytes(24).toString("base64url");
  await db.transaction(async (tx) => {
    // One open invitation per address: a new one replaces the old link.
    await tx.delete(invites).where(and(eq(invites.workspaceId, workspaceId), eq(invites.email, email), isNull(invites.acceptedAt)));
    await tx.insert(invites).values({ workspaceId, email, role, tokenHash: inviteHash(token), invitedBy: account.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  });

  await logActivity({ workspaceId, actor: label(account), action: "member.invited", detail: `${email} (${role})` });
  const url = `${publicUrl()}/app/invite?t=${token}`;
  const who = account.name ? `${account.name} (${account.email})` : account.email;
  // The invitee's language is unknown: the mail goes out in the inviter's console language.
  const t = translator(locale, "account");
  const mail = renderMail({
    subject: t("mail.inviteSubject", { ws: ws.name }),
    summary: "",
    heading: t("mail.inviteHeading", { ws: ws.name }),
    paragraphs: [t(role === "owner" ? "mail.inviteBodyOwner" : "mail.inviteBodyMember", { who, ws: ws.name }), t("mail.inviteValidity")],
    cta: { label: t("mail.inviteCta"), href: url },
  }, parseTheme(presets.ozvi), "Ozvi", null, locale);
  const sent = await sendNow({ to: email, fromName: "Ozvi", subject: mail.subject, html: mail.html, text: mail.text, kind: "invite" });
  if (!sent && process.env.NODE_ENV !== "production") console.log(`[ozvi] invite for ${email}: ${url}`);
  return sent;
}

export async function peekInvite(token: string) {
  const [row] = await db.select({ email: invites.email, role: invites.role, workspace: workspaces.name, inviter: accounts.email, acceptedAt: invites.acceptedAt, expiresAt: invites.expiresAt })
    .from(invites).innerJoin(workspaces, eq(workspaces.id, invites.workspaceId)).leftJoin(accounts, eq(accounts.id, invites.invitedBy))
    .where(eq(invites.tokenHash, inviteHash(token)));
  return row && !row.acceptedAt && row.expiresAt > new Date() ? row : null;
}

/**
 * Accepts an invitation. The link was e-mailed to the address, so opening it proves the address:
 * the account is found or created and signed in. Works once.
 */
export async function acceptInvite(token: string): Promise<Account> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invites).where(eq(invites.tokenHash, inviteHash(token))).for("update");
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new WorkspaceError("invite_expired");
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id));
    const [account] = await tx.insert(accounts).values({ email: inv.email, lastLoginAt: new Date() })
      .onConflictDoUpdate({ target: accounts.email, set: { lastLoginAt: new Date() } }).returning();
    await tx.insert(members).values({ workspaceId: inv.workspaceId, accountId: account!.id, role: inv.role })
      // Already a member: an owner invitation promotes, a member invitation never demotes.
      .onConflictDoUpdate({ target: [members.workspaceId, members.accountId], set: { role: sql`case when excluded.role = 'owner' then 'owner' else ${members.role} end` } });
    return { account: account!, workspaceId: inv.workspaceId };
  }).then(async ({ account, workspaceId }) => {
    await logActivity({ workspaceId, actor: label(account), action: "member.joined" });
    return account;
  });
}

export async function revokeInvite(account: Account, workspaceId: string, inviteId: string) {
  await requireOwner(account, workspaceId);
  const [gone] = await db.delete(invites).where(and(eq(invites.id, inviteId), eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt)))
    .returning({ email: invites.email });
  if (gone) await logActivity({ workspaceId, actor: label(account), action: "member.invite_revoked", detail: gone.email });
}

async function ownerCount(d: Db | Tx, workspaceId: string) {
  const [c] = await d.select({ n: sql<number>`count(*)::int` }).from(members).where(and(eq(members.workspaceId, workspaceId), eq(members.role, "owner")));
  return c?.n ?? 0;
}

/** Takes back board admin rights a person got through the hand-off, and ends their board sessions. */
export async function revokeBoardAccess(workspaceId: string, email: string) {
  const projects = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.workspaceId, workspaceId));
  for (const p of projects) {
    await withProject(db, p.id, async (tx) => {
      // The console account on the board, and any team/admin account with the same address (the hand-off
      // used to promote app accounts): back to member, signed out, API tokens revoked.
      const hit = await tx.update(schema.users)
        .set({ role: "member", sessionVersion: sql`${schema.users.sessionVersion} + 1` })
        .where(or(eq(schema.users.externalId, `email:${email}`), and(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`, inArray(schema.users.role, ["team", "admin"]))))
        .returning({ id: schema.users.id });
      if (hit.length) await tx.update(schema.apiTokens).set({ revokedAt: new Date() })
        .where(and(inArray(schema.apiTokens.userId, hit.map((h) => h.id)), isNull(schema.apiTokens.revokedAt)));
    });
  }
}

/** Removes someone (or yourself: leave). The last owner cannot leave or be removed. */
export async function removeMember(account: Account, workspaceId: string, accountId: string) {
  if (accountId !== account.id) await requireOwner(account, workspaceId);
  const target = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
  if (!target) return;
  await db.transaction(async (tx) => {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
    const [m] = await tx.select().from(members).where(and(eq(members.workspaceId, workspaceId), eq(members.accountId, accountId)));
    if (!m) return;
    if (m.role === "owner" && (await ownerCount(tx, workspaceId)) <= 1) {
      throw new WorkspaceError("last_owner");
    }
    await tx.delete(members).where(and(eq(members.workspaceId, workspaceId), eq(members.accountId, accountId)));
  });
  await revokeBoardAccess(workspaceId, target.email);
  await logActivity(accountId === account.id
    ? { workspaceId, actor: label(account), action: "member.left" }
    : { workspaceId, actor: label(account), action: "member.removed", detail: target.email });
}

export async function setRole(account: Account, workspaceId: string, accountId: string, role: WorkspaceRole) {
  await requireOwner(account, workspaceId);
  await db.transaction(async (tx) => {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
    if (role === "member") {
      const [m] = await tx.select().from(members).where(and(eq(members.workspaceId, workspaceId), eq(members.accountId, accountId)));
      if (m?.role === "owner" && (await ownerCount(tx, workspaceId)) <= 1) throw new WorkspaceError("last_owner");
    }
    await tx.update(members).set({ role }).where(and(eq(members.workspaceId, workspaceId), eq(members.accountId, accountId)));
  });
  const target = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId), columns: { email: true } });
  await logActivity({ workspaceId, actor: label(account), action: "member.role", detail: `${target?.email ?? "?"} → ${role}` });
}

/* ---------- Account deletion (cloud) ---------- */

const PAYING = new Set(["active", "trialing", "paid", "past_due"]);

export interface DeletionPlan {
  /** Workspaces only this account is in: deleted with all their projects. */
  remove: { id: string; name: string; projects: string[] }[];
  /** Workspaces with other people: the account just leaves. */
  leave: { id: string; name: string }[];
  /** Reasons the account cannot be deleted yet, in `locale`. */
  blockers: string[];
  /** The same reasons as keys (the workspace name is the argument). */
  blockerKeys: { key: "subscription" | "sole_owner"; workspace: string }[];
}

export async function deletionPlan(accountId: string, locale: Locale = DEFAULT_LOCALE): Promise<DeletionPlan> {
  const mine = await db.select({ ws: workspaces, role: members.role }).from(members)
    .innerJoin(workspaces, eq(workspaces.id, members.workspaceId)).where(eq(members.accountId, accountId));
  const plan: DeletionPlan = { remove: [], leave: [], blockers: [], blockerKeys: [] };
  for (const { ws, role } of mine) {
    const all = await db.select({ role: members.role, accountId: members.accountId }).from(members).where(eq(members.workspaceId, ws.id));
    const others = all.filter((m) => m.accountId !== accountId);
    if (others.length === 0) {
      if (ws.plan !== "free" && ws.plan !== "self" && PAYING.has(ws.planStatus ?? "")) {
        plan.blockerKeys.push({ key: "subscription", workspace: ws.name });
      }
      const projects = await db.select({ name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.workspaceId, ws.id));
      plan.remove.push({ id: ws.id, name: ws.name, projects: projects.map((p) => p.name) });
    } else if (role === "owner" && !others.some((m) => m.role === "owner")) {
      plan.blockerKeys.push({ key: "sole_owner", workspace: ws.name });
    } else {
      plan.leave.push({ id: ws.id, name: ws.name });
    }
  }
  plan.blockers = plan.blockerKeys.map((b) => workspaceText(locale, b.key, b.workspace));
  return plan;
}

/** Deletes the account: its solo workspaces with every project and file, memberships elsewhere, open codes. */
export async function deleteAccount(account: Account) {
  const plan = await deletionPlan(account.id);
  const blocker = plan.blockerKeys[0];
  if (blocker) throw new WorkspaceError(blocker.key, blocker.workspace);
  for (const ws of plan.remove) {
    const projects = await db.select().from(schema.projects).where(eq(schema.projects.workspaceId, ws.id));
    for (const p of projects) await deleteProject(p);
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
  }
  for (const ws of plan.leave) await revokeBoardAccess(ws.id, account.email);
  await db.delete(schema.loginCodes).where(and(eq(schema.loginCodes.email, account.email), isNull(schema.loginCodes.projectId)));
  await db.delete(invites).where(eq(invites.email, account.email));
  await db.delete(accounts).where(eq(accounts.id, account.id));
}

/* ---------- Account e-mail ---------- */

/**
 * Applies a confirmed e-mail change. Board identities the hand-off created for the old address
 * (email:<old>) in this account's workspaces move to the new one, so the person keeps their
 * history and admin rights. The old address gets a notice (in case someone else did this).
 */
export async function applyEmailChange(accountId: string, email: string, locale: Locale = DEFAULT_LOCALE) {
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
  if (!account) throw new WorkspaceError("no_account");
  if (account.email === email) return account;
  const taken = await db.query.accounts.findFirst({ where: eq(accounts.email, email), columns: { id: true } });
  if (taken) throw new WorkspaceError("email_taken", email);
  const old = account.email;
  const [updated] = await db.update(accounts).set({ email }).where(eq(accounts.id, accountId)).returning();

  const projects = await db.select({ id: schema.projects.id }).from(schema.projects)
    .innerJoin(members, eq(members.workspaceId, schema.projects.workspaceId)).where(eq(members.accountId, accountId));
  for (const p of projects) {
    await withProject(db, p.id, async (tx) => {
      const [clash] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.externalId, `email:${email}`));
      if (clash) {
        // The new address already has its own board identity there: the old one stops being an admin.
        await tx.update(schema.users).set({ role: "member", sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.externalId, `email:${old}`));
      } else {
        await tx.update(schema.users).set({ externalId: `email:${email}`, email }).where(eq(schema.users.externalId, `email:${old}`));
      }
    });
  }
  await db.delete(invites).where(and(eq(invites.email, old), isNull(invites.acceptedAt)));

  const t = translator(locale, "account");
  const mail = renderMail({
    subject: t("mail.changedSubject"),
    summary: "",
    heading: t("mail.changedHeading"),
    paragraphs: [t("mail.changedBody", { email }), t("mail.changedNotYou")],
  }, parseTheme(presets.ozvi), "Ozvi", null, locale);
  await sendNow({ to: old, fromName: "Ozvi", subject: mail.subject, html: mail.html, text: mail.text, kind: "login" }).catch(() => false);
  return updated!;
}

/** Ends every /app session of this account (the cookie carries the version). */
export async function signOutEverywhere(accountId: string) {
  await db.update(accounts).set({ sessionVersion: sql`${accounts.sessionVersion} + 1` }).where(eq(accounts.id, accountId));
}

/**
 * Is this board user the console account of an owner of the board's workspace? Only the console's own
 * e-mail account counts (externalId email:…, proven by the hand-off), never an app account with the
 * same address. For actions bigger than one board's settings (deleting the project).
 */
export async function boardUserIsOwner(project: { workspaceId: string }, user: { externalId: string; email: string | null } | null): Promise<boolean> {
  if (!user?.email || !user.externalId.startsWith("email:")) return false;
  const [m] = await db.select({ role: members.role }).from(members).innerJoin(accounts, eq(accounts.id, members.accountId))
    .where(and(eq(members.workspaceId, project.workspaceId), eq(accounts.email, user.email.toLowerCase())));
  return m?.role === "owner";
}
