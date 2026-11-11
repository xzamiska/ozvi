"use server";

import { PLAN_LIMITS, PRICES, schema, withSystem, type Interval, type PaidPlan, type PlanName } from "@ozvi/db";
import { applyCreemEvent, BillingError, changeSubscription, createCheckout, creemConfig, DEV_CREEM, devBilling, portalLink } from "./creem";
import { roleIn } from "./workspace";
import { presets, themeSchema } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { logActivity, who } from "./activity";
import type { LoginState } from "@/components/EmailLogin";
import { signupClosed } from "./account-rules";
import { accountForVerifiedEmail, APP_COOKIE, mayCreateAccount, appCookie, getAccount, isMember, newWorkspaceSlug } from "./account";
import { clientIp } from "./client-ip";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { db } from "./db";
import { issueLogin, LoginError, normalizeEmail, verifyCode, verifyLink } from "./email-login";
import { publicUrl } from "./email/url";
import { allow } from "./ratelimit";

const server = async () => getTranslations("account.server");

/* ---------- Account sign-in ---------- */

export async function requestAccountLogin(_: LoginState, form: FormData): Promise<LoginState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "account.server" });
  if (!allow("loginIp", clientIp(await headers()))) return { step: "email", email, error: t("tooManyAttempts") };
  // No code for an address that could not sign in anyway (closed sign-up, self-host non-admin).
  if (email.includes("@") && !mayCreateAccount(email) && !(await db.query.accounts.findFirst({ columns: { id: true }, where: eq(schema.accounts.email, email) }))) {
    return { step: "email", email, error: t(process.env.OZVI_MODE === "cloud" && signupClosed() ? "signupClosed" : "noAccess") };
  }
  try {
    const { sent } = await issueLogin({ db, email, projectId: null, linkBase: `${publicUrl()}/app/login/link`, brand: { name: "Ozvi" }, locale });
    return { step: "code", email, info: sent ? t("codeSent", { email }) : t("noSmtpCode") };
  } catch (e) {
    if (e instanceof LoginError) return { step: "email", email, error: e.message };
    throw e;
  }
}

async function finish(email: string): Promise<string | null> {
  const account = await accountForVerifiedEmail(email);
  if (!account) return (await server())(process.env.OZVI_MODE === "cloud" && signupClosed() ? "signupClosed" : "noAccess");
  (await cookies()).set(appCookie(account));
  return null;
}

export async function verifyAccountLogin(prev: LoginState, form: FormData): Promise<LoginState> {
  try {
    await verifyCode(db, prev.email ?? "", String(form.get("code") ?? ""), null, await requestLocale());
  } catch (e) {
    if (e instanceof LoginError) return { ...prev, error: e.message, info: undefined };
    throw e;
  }
  const err = await finish(normalizeEmail(prev.email ?? ""));
  if (err) return { step: "email", email: prev.email, error: err };
  redirect("/app");
}

export async function consumeAccountLink(token: string) {
  let row;
  try { row = await verifyLink(db, token, null); } catch (e) {
    if (e instanceof LoginError) redirect("/app/login?expired=1");
    throw e;
  }
  const err = await finish(row.email);
  if (err) redirect("/app/login?denied=1");
  redirect("/app");
}

export async function signOutApp() {
  (await cookies()).set({ name: APP_COOKIE, value: "", path: "/app", maxAge: 0 });
  redirect("/app/login");
}

/* ---------- Projects ---------- */

export interface NewProjectState { error?: string; created?: string }
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const RESERVED = new Set(["app", "api", "mcp", "dev", "demo", "admin", "www", "static", "login", "signup", "billing", "docs", "help", "status", "widget", "fonts", "oauth", "well-known",
  "mail", "smtp", "imap", "ns1", "ns2", "cdn", "assets", "staging", "blog", "domains", "cname", "support", "security", "abuse", "ozvi",
  "podmienky", "sukromie", "pristupnost", "accessibility", "legal", "terms", "privacy", "subprocessors", "releases", "dpa", "invite", "account", "sk", "cs", "en", "de", "pl", "hu"]);

export async function createProject(_: NewProjectState, form: FormData): Promise<NewProjectState> {
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "account.server" });
  const c = await getTranslations({ locale, namespace: "console" });
  if (!allow("signup", account.id)) return { error: t("tooManyProjects") };
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const preset = String(form.get("preset") ?? "ozvi") as keyof typeof presets;
  let workspaceId = String(form.get("workspace") ?? "");
  if (name.length < 2 || name.length > 60) return { error: t("nameLength") };
  if (!SLUG.test(slug) || RESERVED.has(slug)) return { error: t("slugInvalid") };
  if (!presets[preset]) return { error: t("pickLook") };

  if (workspaceId) {
    if (!(await isMember(account.id, workspaceId))) return { error: t("noWorkspaceAccess") };
  }
  const result = await withSystem(db, async (tx): Promise<NewProjectState | { slug: string }> => {
    if (await tx.query.projects.findFirst({ where: eq(schema.projects.slug, slug), columns: { id: true } })) return { error: t("slugTaken", { slug }) };
    if (!workspaceId) {
      const cloud = process.env.OZVI_MODE === "cloud";
      if (cloud) {
        // One free workspace owned per account; otherwise "new workspace" would multiply the free project limit.
        // (Being invited into someone else's free workspace does not count.)
        const [free] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.workspaceMembers)
          .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
          .where(and(eq(schema.workspaceMembers.accountId, account.id), eq(schema.workspaceMembers.role, "owner"), eq(schema.workspaces.plan, "free")));
        if ((free?.n ?? 0) >= 1) return { error: t("freeExists") };
      }
      const [w] = await tx.insert(schema.workspaces).values({ slug: newWorkspaceSlug(), name, plan: cloud ? "free" : "self" }).returning();
      await tx.insert(schema.workspaceMembers).values({ workspaceId: w!.id, accountId: account.id, role: "owner" });
      workspaceId = w!.id;
    }
    const [w] = await tx.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).for("update");
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.projects).where(eq(schema.projects.workspaceId, workspaceId));
    const limit = PLAN_LIMITS[(w!.plan ?? "self") as PlanName].projects;
    if ((count?.n ?? 0) >= limit) return { error: t("planLimit", { plan: c(`planName.${(w!.plan ?? "self") as PlanName}`), projects: c("plan.fProjects", { count: limit }) }) };
    const theme = themeSchema.parse({ ...presets[preset], name });
    const [p] = await tx.insert(schema.projects).values({
      // No SSO secret yet: it is created (and shown once) when the owner turns SSO on in settings.
      workspaceId, slug, name, theme, ssoSecretEnc: null, emailLogin: true,
    }).returning();
    await tx.insert(schema.users).values({ projectId: p!.id, externalId: `email:${account.email}`, email: account.email, name: account.name ?? null, role: "admin" });
    return { slug };
  });
  if (!("slug" in result)) return result;
  await logActivity({ workspaceId, actor: who(account), action: "project.created", detail: `${name} (/${result.slug})` });
  // The hand-off sets a cookie on another path (or domain): the client does a full navigation.
  return { created: result.slug };
}

/** Workspace membership check for a project slug (used by /app/open). */
export async function canOpen(accountId: string, slug: string) {
  const p = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  return p && (await isMember(accountId, p.workspaceId)) ? p : null;
}

/* ---------- Billing (cloud) ---------- */

async function owner(workspaceId: string) {
  const account = await getAccount();
  if (!account) redirect("/app/login");
  // Billing belongs to owners; members see the plan but cannot change it.
  if ((await roleIn(account.id, workspaceId)) !== "owner") throw new Error((await server())("ownerOnlyBilling"));
  return account;
}

/** Gateway failures reach the owner in their language. */
async function billing<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (e instanceof BillingError) throw new Error(e.text(await requestLocale()));
    throw e;
  }
}

export async function startCheckout(workspaceId: string, plan: PaidPlan, interval: Interval) {
  const account = await owner(workspaceId);
  if (!(plan in PRICES) || !["year", "quarter"].includes(interval)) throw new Error((await server())("invalidPlan"));
  if (devBilling()) redirect(`/app/billing/${workspaceId}/simulate?plan=${plan}&i=${interval}`);
  const cfg = creemConfig();
  if (!cfg) throw new Error((await server())("billingOff"));
  const url = await billing(() => createCheckout(cfg, { workspaceId, plan, interval, email: account.email, successUrl: `${publicUrl()}/app/w/${workspaceId}/plan?paid=1` }));
  redirect(url);
}

/** A paying workspace switches plan or interval: the same Creem subscription moves to the new product. */
export async function changePlan(workspaceId: string, plan: PaidPlan, interval: Interval) {
  await owner(workspaceId);
  if (!(plan in PRICES) || !["year", "quarter"].includes(interval)) throw new Error((await server())("invalidPlan"));
  if (devBilling()) redirect(`/app/billing/${workspaceId}/simulate?plan=${plan}&i=${interval}`);
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  const cfg = creemConfig();
  const productId = cfg?.products[`${plan}_${interval}`];
  if (!cfg || !ws?.creemSubscriptionId) throw new Error((await server())("noSubscription"));
  if (!productId) throw new Error((await server())("invalidPlan"));
  const subscription = ws.creemSubscriptionId;
  const upgrade = PRICES[plan][interval] * (interval === "quarter" ? 4 : 1) > (ws.plan === "pro" || ws.plan === "studio" ? PRICES[ws.plan].year : 0);
  const sub = await billing(() => changeSubscription(cfg, subscription, productId, upgrade));
  // Show the new plan right away; Creem's subscription.update webhook confirms the same state.
  await applyCreemEvent(cfg, { id: `change:${sub.id}:${Date.now()}`, eventType: "subscription.update", object: { ...sub, metadata: { ...(sub.metadata ?? {}), workspace_id: workspaceId } } });
  redirect(`/app/w/${workspaceId}/plan?changed=${plan}`);
}

export async function openPortal(workspaceId: string) {
  await owner(workspaceId);
  if (devBilling()) redirect(`/app/billing/${workspaceId}/simulate`);
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  const cfg = creemConfig();
  if (!cfg || !ws?.creemCustomerId) throw new Error((await server())("noSubscription"));
  const customer = ws.creemCustomerId;
  redirect(await billing(() => portalLink(cfg, customer)));
}

/* ---------- Local cloud testing: simulated Creem (OZVI_DEV_BILLING=1, never in production) ---------- */

export type SimulatedEvent = "pay" | "renew" | "past_due" | "cancel" | "expire";

export async function simulateBilling(workspaceId: string, kind: SimulatedEvent, plan: PaidPlan = "pro", interval: Interval = "year") {
  if (!devBilling()) throw new Error((await server())("simulationOff"));
  await owner(workspaceId);
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (!ws) throw new Error((await getTranslations("account"))("workspace.no_workspace"));
  const current = (ws.plan === "pro" || ws.plan === "studio" ? ws.plan : plan) as PaidPlan;
  const subId = kind === "pay" ? `dev_sub_${Date.now()}` : ws.creemSubscriptionId ?? `dev_sub_${Date.now()}`;
  const end = new Date(Date.now() + (interval === "quarter" ? 91 : 365) * 86_400_000).toISOString();
  const sub = (status: string, p: PaidPlan) => ({
    id: subId, status, current_period_end_date: end, customer: { id: ws.creemCustomerId ?? `dev_cus_${workspaceId.slice(0, 8)}` },
    product: { id: `dev_${p}_${interval}` }, metadata: { workspace_id: workspaceId },
  });
  const ev = { id: `dev_evt_${Date.now()}`, created_at: Date.now() } as const;
  const event =
    kind === "pay" ? { ...ev, eventType: "checkout.completed", object: { metadata: { workspace_id: workspaceId }, subscription: sub("active", plan), customer: { id: `dev_cus_${workspaceId.slice(0, 8)}` }, product: { id: `dev_${plan}_${interval}` } } }
    : kind === "renew" ? { ...ev, eventType: "subscription.paid", object: sub("active", current) }
    : kind === "past_due" ? { ...ev, eventType: "subscription.update", object: sub("past_due", current) }
    : kind === "cancel" ? { ...ev, eventType: "subscription.update", object: sub("scheduled_cancel", current) }
    : { ...ev, eventType: "subscription.expired", object: sub("active", current) };
  const result = await applyCreemEvent(DEV_CREEM, event);
  console.log("[ozvi] simulated creem", kind, result);
  redirect(`/app/w/${workspaceId}/plan${kind === "pay" ? "?paid=1" : ""}`);
}
