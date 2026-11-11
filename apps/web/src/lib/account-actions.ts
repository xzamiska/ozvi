"use server";

import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { APP_COOKIE, appCookie, getAccount } from "./account";
import { requestLocale } from "@/i18n/server";
import { getTranslations } from "next-intl/server";
import { db } from "./db";
import { logActivity, who } from "./activity";
import { consumeEmailChange, EMAIL, issueEmailChange, LoginError, normalizeEmail } from "./email-login";
import { publicUrl } from "./email/url";
import { allow } from "./ratelimit";
import {
  acceptInvite, applyEmailChange, deleteAccount, invite, removeMember, requireOwner, revokeInvite, setRole, signOutEverywhere,
  WorkspaceError, type WorkspaceRole,
} from "./workspace";

/** /app: people in a workspace, invitations, account settings. Every action re-checks the session and role. */

export interface FormState { error?: string; info?: string }

const msg = async () => {
  const locale = await requestLocale();
  return { locale, t: await getTranslations({ locale, namespace: "account.server" }) };
};

async function me() {
  const account = await getAccount();
  if (!account) redirect("/app/login");
  return account;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const role = (v: unknown): WorkspaceRole => (v === "owner" ? "owner" : "member");

/** Short codes in the URL (never free text) for errors of buttons without a form state. */
const code = (e: WorkspaceError) => (e.code === "last_owner" ? "last_owner" : "not_owner");

/* ---------- Workspace settings ---------- */

/** Owners rename the workspace (the console, invitations and billing show the name; boards don't). */
export async function renameWorkspaceAction(workspaceId: string, _: FormState, form: FormData): Promise<FormState> {
  const account = await me();
  const { locale } = await msg();
  const t = await getTranslations({ locale, namespace: "console.settings" });
  if (!UUID.test(workspaceId)) return { error: new WorkspaceError("no_workspace").text(locale) };
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return { error: t("nameLength") };
  try {
    await requireOwner(account, workspaceId);
  } catch (e) {
    if (e instanceof WorkspaceError) return { error: e.text(locale) };
    throw e;
  }
  const [old] = await db.select({ name: schema.workspaces.name }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  if (old?.name === name) return { info: t("saved") };
  await db.update(schema.workspaces).set({ name }).where(eq(schema.workspaces.id, workspaceId));
  await logActivity({ workspaceId, actor: who(account), action: "workspace.renamed", detail: `${old?.name ?? ""} → ${name}` });
  revalidatePath(`/app/w/${workspaceId}`, "layout");
  return { info: t("saved") };
}

/* ---------- People ---------- */

export async function inviteAction(workspaceId: string, _: FormState, form: FormData): Promise<FormState> {
  const account = await me();
  const { locale, t } = await msg();
  if (!UUID.test(workspaceId)) return { error: new WorkspaceError("no_workspace").text(locale) };
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!EMAIL.test(email)) return { error: t("validEmail") };
  if (!allow("invite", account.id)) return { error: t("tooManyInvites") };
  try {
    const sent = await invite(account, workspaceId, email, role(form.get("role")), locale);
    revalidatePath(`/app/w/${workspaceId}/people`);
    return { info: sent ? t("inviteSent", { email }) : t("inviteNoSmtp") };
  } catch (e) {
    if (e instanceof WorkspaceError) return { error: e.text(locale) };
    throw e;
  }
}

export async function revokeInviteAction(workspaceId: string, inviteId: string) {
  const account = await me();
  if (!UUID.test(workspaceId) || !UUID.test(inviteId)) return;
  try { await revokeInvite(account, workspaceId, inviteId); } catch (e) {
    if (e instanceof WorkspaceError) redirect(`/app/w/${workspaceId}/people?e=${code(e)}`);
    throw e;
  }
  redirect(`/app/w/${workspaceId}/people`);
}

export async function removeMemberAction(workspaceId: string, accountId: string) {
  const account = await me();
  if (!UUID.test(workspaceId) || !UUID.test(accountId)) return;
  try { await removeMember(account, workspaceId, accountId); } catch (e) {
    if (e instanceof WorkspaceError) redirect(`/app/w/${workspaceId}/people?e=${code(e)}`);
    throw e;
  }
  redirect(accountId === account.id ? "/app" : `/app/w/${workspaceId}/people`);
}

export async function setRoleAction(workspaceId: string, accountId: string, form: FormData) {
  const account = await me();
  if (!UUID.test(workspaceId) || !UUID.test(accountId)) return;
  try { await setRole(account, workspaceId, accountId, role(form.get("role"))); } catch (e) {
    if (e instanceof WorkspaceError) redirect(`/app/w/${workspaceId}/people?e=${code(e)}`);
    throw e;
  }
  redirect(`/app/w/${workspaceId}/people`);
}

export async function acceptInviteAction(token: string) {
  let account;
  try { account = await acceptInvite(token); } catch (e) {
    if (e instanceof WorkspaceError) redirect("/app/invite?expired=1");
    throw e;
  }
  (await cookies()).set(appCookie(account));
  redirect("/app");
}

/* ---------- Account ---------- */

export async function renameAction(_: FormState, form: FormData): Promise<FormState> {
  const account = await me();
  const name = String(form.get("name") ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80);
  await db.update(schema.accounts).set({ name: name || null }).where(eq(schema.accounts.id, account.id));
  return { info: (await msg()).t("nameSaved") };
}

export async function requestEmailChangeAction(_: FormState, form: FormData): Promise<FormState> {
  const account = await me();
  const { locale, t } = await msg();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (email === account.email) return { error: t("sameEmail") };
  const taken = await db.query.accounts.findFirst({ where: eq(schema.accounts.email, email), columns: { id: true } });
  if (taken) return { error: t("emailTaken", { email }) };
  try {
    const { sent } = await issueEmailChange(db, account.id, email, `${publicUrl()}/app/account/email`, locale);
    return { info: sent ? t("linkSent", { email }) : t("noSmtpLink") };
  } catch (e) {
    if (e instanceof LoginError) return { error: e.message };
    throw e;
  }
}

export async function confirmEmailChangeAction(token: string) {
  const account = await me();
  let change;
  try { change = await consumeEmailChange(db, token); } catch (e) {
    if (e instanceof LoginError) redirect("/app/account?e=expired");
    throw e;
  }
  // The link belongs to one account; opening it while signed in as someone else does nothing.
  if (change.accountId !== account.id) redirect("/app/account?e=other");
  try { await applyEmailChange(account.id, change.email, await requestLocale()); } catch (e) {
    if (e instanceof WorkspaceError) redirect("/app/account?e=taken");
    throw e;
  }
  redirect("/app/account?changed=1");
}

export async function signOutEverywhereAction() {
  const account = await me();
  await signOutEverywhere(account.id);
  (await cookies()).set({ name: APP_COOKIE, value: "", path: "/app", maxAge: 0 });
  redirect("/app/login");
}

export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const account = await me();
  const { locale, t } = await msg();
  if (process.env.OZVI_MODE !== "cloud") return { error: t("selfHostDelete") };
  if (normalizeEmail(String(form.get("confirm") ?? "")) !== account.email) return { error: t("typeEmail") };
  try { await deleteAccount(account); } catch (e) {
    if (e instanceof WorkspaceError) return { error: e.text(locale) };
    throw e;
  }
  (await cookies()).set({ name: APP_COOKIE, value: "", path: "/app", maxAge: 0 });
  redirect("/?deleted=1");
}
