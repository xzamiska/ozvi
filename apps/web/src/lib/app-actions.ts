"use server";

import { noStatsCookie } from "./analytics";
import { ownBoardSlug, slugAllowed } from "./slug";
import { PLAN_LIMITS, PRICES, schema, withSystem, type Interval, type PaidPlan, type PlanName } from "@ozvi/db";
import { applyCreemEvent, BillingError, cancelSubscription, changeSubscription, createCheckout, creemConfig, DEV_CREEM, devBilling, devSubscription, portalLink, resumeSubscription, type CreemConfig, type Sub } from "./creem";
import { roleIn } from "./workspace";
import { presets, themeSchema } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logActivity, who } from "./activity";
import type { LoginState } from "@/components/EmailLogin";
import { freeQuotaEmail, freeQuotaEmailSql, isAdminEmail, safeAppNext, signupClosed } from "./account-rules";
import { accountForVerifiedEmail, APP_COOKIE, mayCreateAccount, appCookie, getAccount, isMember, newWorkspaceSlug } from "./account";
import { clientIp } from "./client-ip";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { db } from "./db";
import { issueLogin, LoginError, normalizeEmail, verifyCode, verifyLink } from "./email-login";
import { publicUrl } from "./email/url";
import { allow, release, take } from "./ratelimit";
import { trackEvent } from "./analytics";
import { newBoardTranslationMode } from "./translate";

const server = async () => getTranslations("account.server");

/* ---------- Account sign-in ---------- */

/** `next`: where to return after signing in (bound by the login page, checked by safeAppNext). */
export async function requestAccountLogin(next: string | null, _: LoginState, form: FormData): Promise<LoginState> {
  const back = safeAppNext(next);
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "account.server" });
  if (!allow("loginIp", clientIp(await headers()))) return { step: "email", email, error: t("tooManyAttempts") };
  // No code for an address that could not sign in anyway (closed sign-up, self-host non-admin).
  const existing = email.includes("@") ? await db.query.accounts.findFirst({ columns: { id: true }, where: eq(schema.accounts.email, email) }) : undefined;
  if (email.includes("@") && !mayCreateAccount(email) && !existing) {
    return { step: "email", email, error: t(process.env.OZVI_MODE === "cloud" && signupClosed() ? "signupClosed" : "noAccess") };
  }
  try {
    const { sent } = await issueLogin({ db, email, projectId: null, linkBase: `${publicUrl()}/app/login/link${back ? `?next=${encodeURIComponent(back)}` : ""}`, brand: { name: "Ozvi" }, locale });
    if (!existing) await trackEvent("signup_started");
    return { step: "code", email, info: sent ? t("codeSent", { email }) : t("noSmtpCode") };
  } catch (e) {
    if (e instanceof LoginError) return { step: "email", email, error: e.message };
    throw e;
  }
}

async function finish(email: string): Promise<string | null> {
  const isNew = !(await db.query.accounts.findFirst({ columns: { id: true }, where: eq(schema.accounts.email, email) }));
  const account = await accountForVerifiedEmail(email);
  if (!account) return (await server())(process.env.OZVI_MODE === "cloud" && signupClosed() ? "signupClosed" : "noAccess");
  if (isNew) await trackEvent("account_created");
  (await cookies()).set(appCookie(account));
  (await cookies()).set(noStatsCookie);
  return null;
}

export async function verifyAccountLogin(next: string | null, prev: LoginState, form: FormData): Promise<LoginState> {
  try {
    await verifyCode(db, prev.email ?? "", String(form.get("code") ?? ""), null, await requestLocale(), clientIp(await headers()));
  } catch (e) {
    if (e instanceof LoginError) return { ...prev, error: e.message, info: undefined };
    throw e;
  }
  const err = await finish(normalizeEmail(prev.email ?? ""));
  if (err) return { step: "email", email: prev.email, error: err };
  redirect(safeAppNext(next) ?? "/app");
}

export async function consumeAccountLink(token: string, next: string | null = null) {
  const back = safeAppNext(next);
  const keep = back ? `&next=${encodeURIComponent(back)}` : "";
  let row;
  try { row = await verifyLink(db, token, null); } catch (e) {
    if (e instanceof LoginError) redirect(`/app/login?expired=1${keep}`);
    throw e;
  }
  const err = await finish(row.email);
  if (err) redirect("/app/login?denied=1");
  redirect(back ?? "/app");
}

export async function signOutApp() {
  (await cookies()).set({ name: APP_COOKIE, value: "", path: "/app", maxAge: 0 });
  redirect("/app/login");
}

/* ---------- Projects ---------- */

export interface NewProjectState { error?: string; created?: string; link?: { href: string; label: string } }

const inHours = (seconds: number) => Math.max(1, Math.ceil(seconds / 3600));
const inMinutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

export async function createProject(_: NewProjectState, form: FormData): Promise<NewProjectState> {
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "account.server" });
  const c = await getTranslations({ locale, namespace: "console" });
  // Only projects that get created count: a taken slug, a typo or a plan limit must not use up the hourly attempts.
  const now = Date.now();
  const slot = take("signup", account.id, now);
  if (!slot.ok) return { error: t("tooManyProjects", { minutes: inMinutes(slot.resetSeconds) }) };
  let ipSlot: string | null = null;
  let done = false;
  try {
    const out = await createProjectFor(account, form, t, c, now, (ip) => { ipSlot = ip; });
    done = !!out.created;
    return out;
  } finally {
    if (!done) {
      release("signup", account.id, now);
      if (ipSlot) release("freeWorkspaceIp", ipSlot, now);
    }
  }
}

type Tr = Awaited<ReturnType<typeof getTranslations>>;

async function createProjectFor(account: NonNullable<Awaited<ReturnType<typeof getAccount>>>, form: FormData, t: Tr, c: Tr, now: number,
  tookIp: (ip: string) => void): Promise<NewProjectState> {
  const ip = clientIp(await headers()) ?? "unknown";
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const preset = String(form.get("preset") ?? "ozvi") as keyof typeof presets;
  let workspaceId = String(form.get("workspace") ?? "");
  if (name.length < 2 || name.length > 60) return { error: t("nameLength") };
  // Ozvi's own board (OZVI_FEEDBACK_PROJECT) is reserved too: if it were missing, someone could create it and
  // receive every console account's feedback and identity.
  const own = ownBoardSlug();
  if (!slugAllowed(slug) || (own && slug === own && !isAdminEmail(account.email))) return { error: t("slugInvalid") };
  if (!presets[preset]) return { error: t("pickLook") };

  if (workspaceId) {
    if (!(await isMember(account.id, workspaceId))) return { error: t("noWorkspaceAccess") };
  }
  const result = await withSystem(db, async (tx): Promise<NewProjectState | { slug: string }> => {
    if (await tx.query.projects.findFirst({ where: eq(schema.projects.slug, slug), columns: { id: true } })) return { error: t("slugTaken", { slug }) };
    if (!workspaceId) {
      const cloud = process.env.OZVI_MODE === "cloud";
      if (cloud) {
        // One free workspace owned per person; otherwise "new workspace" would multiply the free project limit.
        // A person = their account, or any account on the same mailbox (+tags ignored everywhere, Gmail dots too,
        // see freeQuotaEmail and freeQuotaEmailSql). Being invited into someone else's free workspace does not count.
        const quota = freeQuotaEmail(account.email);
        // Two requests at once (two tabs, two alias accounts) must not both count zero and both insert: the lock
        // serialises the check-and-insert per mailbox until this transaction ends.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ozvi:free-workspace:${quota}`}))`);
        const free = await tx.select({ accountId: schema.workspaceMembers.accountId }).from(schema.workspaceMembers)
          .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
          .innerJoin(schema.accounts, eq(schema.accounts.id, schema.workspaceMembers.accountId))
          .where(and(sql`${freeQuotaEmailSql(schema.accounts.email)} = ${quota}`, eq(schema.workspaceMembers.role, "owner"), eq(schema.workspaces.plan, "free")));
        // Own free workspace: add the project there. Another account on the same mailbox owns it: say so.
        if (free.some((f) => f.accountId === account.id)) return { error: t("freeExists") };
        if (free.length) return { error: t("freeExistsOther") };
        // Many accounts from one place (scripts, throwaway addresses): a few new free workspaces a day per IP.
        const perIp = take("freeWorkspaceIp", ip, now);
        if (!perIp.ok) {
          const hours = inHours(perIp.resetSeconds);
          // Someone already in a workspace (invited, or a paid one) can add the project there right away.
          const [mine] = await tx.select({ id: schema.workspaces.id, name: schema.workspaces.name }).from(schema.workspaceMembers)
            .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
            .where(eq(schema.workspaceMembers.accountId, account.id)).orderBy(schema.workspaces.createdAt).limit(1);
          if (mine) return { error: t("tooManyFreeHasWorkspace", { hours }), link: { href: `/app/new?w=${mine.id}`, label: t("addToWorkspace", { workspace: mine.name }) } };
          return { error: t("tooManyFree", { hours }) };
        }
        tookIp(ip);
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
      // Plans with AI translations start with "Translate" on request; Free (and no AI) stays off.
      translationMode: newBoardTranslationMode((w!.plan ?? "self") as PlanName),
    }).returning();
    await tx.insert(schema.users).values({ projectId: p!.id, externalId: `email:${account.email}`, email: account.email, emailVerified: true, name: account.name ?? null, role: "admin" });
    return { slug };
  });
  if (!("slug" in result)) return result;
  await logActivity({ workspaceId, actor: who(account), action: "project.created", detail: `${name} (/${result.slug})` });
  await trackEvent("project_created");
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
  await trackEvent("checkout_started", { plan, interval });
  if (devBilling()) redirect(`/app/billing/${workspaceId}/simulate?plan=${plan}&i=${interval}`);
  const cfg = creemConfig();
  if (!cfg) throw new Error((await server())("billingOff"));
  // A paying workspace changes plan on its subscription (changePlan); a second checkout would bill twice.
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (ws?.creemSubscriptionId && (ws.plan === "pro" || ws.plan === "studio")) throw new Error((await server())("alreadySubscribed"));
  const url = await billing(() => createCheckout(cfg, { workspaceId, plan, interval, email: account.email, successUrl: `${publicUrl()}/app/w/${workspaceId}/plan?paid=1` }));
  redirect(url);
}

export interface BillingResult { error?: string }

type Workspace = typeof schema.workspaces.$inferSelect;
/** Real Creem calls, or under dev billing the answer Creem would give (same subscription id, lib/creem.ts devSubscription). */
interface SubscriptionApi {
  change(cfg: CreemConfig, id: string, ws: Workspace, productId: string, plan: PaidPlan, interval: Interval): Promise<Sub>;
  cancel(cfg: CreemConfig, id: string, ws: Workspace): Promise<Sub>;
  resume(cfg: CreemConfig, id: string, ws: Workspace): Promise<Sub>;
}
const creemApi: SubscriptionApi = {
  change: (cfg, id, _ws, productId) => changeSubscription(cfg, id, productId),
  cancel: (cfg, id) => cancelSubscription(cfg, id),
  resume: (cfg, id) => resumeSubscription(cfg, id),
};
const devApi: SubscriptionApi = {
  change: async (_cfg, _id, ws, _productId, plan, interval) => devSubscription(ws, { status: "active", plan, interval }),
  cancel: async (_cfg, _id, ws) => devSubscription(ws, { status: "scheduled_cancel" }),
  resume: async (_cfg, _id, ws) => devSubscription(ws, { status: "active" }),
};

/** Runs one subscription change against Creem and applies the returned state at once (the webhook confirms it). */
async function onSubscription(workspaceId: string, call: (api: SubscriptionApi, cfg: CreemConfig, subscriptionId: string, ws: Workspace) => Promise<Sub | null>, done: string): Promise<BillingResult> {
  const account = await owner(workspaceId);
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  const dev = devBilling();
  const cfg = dev ? DEV_CREEM : creemConfig();
  if (!cfg || !ws?.creemSubscriptionId || (ws.plan !== "pro" && ws.plan !== "studio")) return { error: (await server())("noSubscription") };
  const subscription = ws.creemSubscriptionId;
  let sub: Sub | null;
  try { sub = await call(dev ? devApi : creemApi, cfg, subscription, ws); } catch (e) {
    if (e instanceof BillingError) return { error: e.text(await requestLocale()) };
    throw e;
  }
  if (sub) await applyCreemEvent(cfg, { id: `console:${sub.id}:${Date.now()}`, eventType: "subscription.update", object: { ...sub, metadata: { ...(sub.metadata ?? {}), workspace_id: workspaceId } } }, who(account) ?? undefined);
  revalidatePath(`/app/w/${workspaceId}/plan`);
  redirect(`/app/w/${workspaceId}/plan?done=${done}`);
}

/** A paying workspace moves its Creem subscription to another plan or interval (after the owner confirmed the charge). */
export async function changePlan(workspaceId: string, plan: PaidPlan, interval: Interval): Promise<BillingResult> {
  if (!(plan in PRICES) || !["year", "quarter"].includes(interval)) return { error: (await server())("invalidPlan") };
  return onSubscription(workspaceId, async (api, cfg, id, ws) => {
    // A second click (or a stale tab) asking for what is already in place charges nothing.
    if (ws.plan === plan && ws.planInterval === interval) return null;
    if (ws.planStatus === "scheduled_cancel") throw new BillingError("resume_first");
    const productId = cfg.products[`${plan}_${interval}`];
    if (!productId) throw new BillingError("not_for_sale");
    return api.change(cfg, id, ws, productId, plan, interval);
  }, `${plan}-${interval}`);
}

/** Cancel at the end of the paid period; the plan stays until then. */
export async function cancelPlan(workspaceId: string): Promise<BillingResult> {
  return onSubscription(workspaceId, (api, cfg, id, ws) => (ws.planStatus === "scheduled_cancel" ? Promise.resolve(null) : api.cancel(cfg, id, ws)), "canceled");
}

/** Take back a scheduled cancellation. */
export async function resumePlan(workspaceId: string): Promise<BillingResult> {
  return onSubscription(workspaceId, (api, cfg, id, ws) => (ws.planStatus !== "scheduled_cancel" ? Promise.resolve(null) : api.resume(cfg, id, ws)), "resumed");
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
  const paying = ws.plan === "pro" || ws.plan === "studio";
  const current = (paying ? ws.plan : plan) as PaidPlan;
  // A payment while the workspace already pays continues the same subscription: a new id would be ignored by
  // applyCreemEvent as a second subscription (a paying workspace changes plan through changePlan anyway).
  const subId = kind === "pay" && !(paying && ws.creemSubscriptionId) ? `dev_sub_${Date.now()}` : ws.creemSubscriptionId ?? `dev_sub_${Date.now()}`;
  if (kind !== "pay" && paying) interval = ws.planInterval === "quarter" ? "quarter" : "year";
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
