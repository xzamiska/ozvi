import { createHmac, timingSafeEqual } from "node:crypto";
import { PLAN_LIMITS, schema, type PaidPlan, type Interval, type PlanName } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { logActivity } from "./activity";
import type { Locale } from "@/i18n/locales";
import { translator, type AppMessages } from "@/i18n/messages";
import { db } from "./db";

/**
 * Cloud billing through Creem (merchant of record, ADR-0006). Quarterly or yearly only.
 * The plan of a workspace changes only from verified webhooks, never from the redirect back.
 *
 * Env: CREEM_API_KEY, CREEM_WEBHOOK_SECRET, CREEM_TEST=1 for the sandbox, and product ids
 * CREEM_PRODUCT_PRO_YEAR / _PRO_QUARTER / _STUDIO_YEAR / _STUDIO_QUARTER.
 */

export interface CreemConfig { apiKey: string; webhookSecret: string; base: string; products: Record<`${PaidPlan}_${Interval}`, string | undefined> }

export function creemConfig(env = process.env): CreemConfig | null {
  if (!env.CREEM_API_KEY || !env.CREEM_WEBHOOK_SECRET) return null;
  return {
    apiKey: env.CREEM_API_KEY,
    webhookSecret: env.CREEM_WEBHOOK_SECRET,
    base: env.CREEM_TEST === "1" ? "https://test-api.creem.io/v1" : "https://api.creem.io/v1",
    products: {
      pro_year: env.CREEM_PRODUCT_PRO_YEAR, pro_quarter: env.CREEM_PRODUCT_PRO_QUARTER,
      studio_year: env.CREEM_PRODUCT_STUDIO_YEAR, studio_quarter: env.CREEM_PRODUCT_STUDIO_QUARTER,
    },
  };
}

/**
 * Local cloud testing without a Creem account (OZVI_DEV_BILLING=1, never in production): checkout and
 * the customer portal open a simulation page that feeds synthetic events through applyCreemEvent,
 * so plan changes go through exactly the same code as real webhooks.
 */
export const devBilling = () => process.env.OZVI_DEV_BILLING === "1" && process.env.NODE_ENV !== "production";
export const DEV_CREEM: CreemConfig = {
  apiKey: "dev", webhookSecret: "dev", base: "",
  products: { pro_year: "dev_pro_year", pro_quarter: "dev_pro_quarter", studio_year: "dev_studio_year", studio_quarter: "dev_studio_quarter" },
};
export const billingEnabled = () => !!creemConfig() || devBilling();

export function planForProduct(cfg: CreemConfig, productId: string | undefined): PaidPlan | null {
  for (const [k, v] of Object.entries(cfg.products)) if (v && v === productId) return k.split("_")[0] as PaidPlan;
  return null;
}

export type BillingErrorKey = keyof AppMessages["account"]["billing"];

/** A payment gateway failure the owner should see; `key` picks the localized text. */
export class BillingError extends Error {
  constructor(public key: BillingErrorKey) { super(translator("sk", "account")(`billing.${key}`)); }
  text(locale: Locale) { return translator(locale, "account")(`billing.${this.key}`); }
}

async function creem<T>(cfg: CreemConfig, path: string, body: unknown, f: typeof fetch = fetch): Promise<T> {
  const res = await f(`${cfg.base}${path}`, {
    method: "POST", headers: { "x-api-key": cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error("[ozvi] creem", path, res.status, (await res.text()).slice(0, 300));
    throw new BillingError("gateway_down");
  }
  return (await res.json()) as T;
}

export async function createCheckout(
  cfg: CreemConfig, input: { workspaceId: string; plan: PaidPlan; interval: Interval; email: string; successUrl: string }, f?: typeof fetch,
): Promise<string> {
  const productId = cfg.products[`${input.plan}_${input.interval}`];
  if (!productId) throw new BillingError("not_for_sale");
  const r = await creem<{ checkout_url?: string }>(cfg, "/checkouts", {
    product_id: productId,
    request_id: `${input.workspaceId}:${Date.now()}`,
    success_url: input.successUrl,
    customer: { email: input.email },
    metadata: { workspace_id: input.workspaceId },
  }, f);
  if (!r.checkout_url) throw new BillingError("no_checkout");
  return r.checkout_url;
}

export async function portalLink(cfg: CreemConfig, customerId: string, f?: typeof fetch): Promise<string> {
  const r = await creem<{ customer_portal_link?: string }>(cfg, "/customers/billing", { customer_id: customerId }, f);
  if (!r.customer_portal_link) throw new BillingError("no_portal");
  return r.customer_portal_link;
}

export function verifyCreemSignature(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(header, "hex");
  const b = createHmac("sha256", secret).update(body).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Sub {
  id: string; status: string; current_period_end_date?: string;
  customer?: { id: string } | string; product?: { id: string } | string; metadata?: Record<string, unknown>;
}
export interface Event { id: string; eventType: string; created_at?: number | string; object: Record<string, unknown> }

const idOf = (v: { id: string } | string | undefined) => (typeof v === "string" ? v : v?.id);

/** What a subscription status means for the plan: keep the paid plan, or drop to free. */
export function planAfter(status: string, paid: PaidPlan): PlanName {
  return ["active", "trialing", "paid", "scheduled_cancel", "past_due"].includes(status) ? paid : "free";
}

/** Applies one verified webhook. Returns a short description (logged and returned to Creem). */
export async function applyCreemEvent(cfg: CreemConfig, ev: Event): Promise<string> {
  let sub: Sub | undefined;
  let workspaceId: string | undefined;
  if (ev.eventType === "checkout.completed") {
    const o = ev.object as { metadata?: { workspace_id?: string }; subscription?: Sub | string; customer?: { id: string } | string; product?: { id: string } | string };
    workspaceId = o.metadata?.workspace_id;
    sub = typeof o.subscription === "object" ? o.subscription : o.subscription ? { id: o.subscription, status: "active", product: o.product, customer: o.customer } : undefined;
    if (sub && !sub.customer) sub.customer = o.customer;
    if (sub && !sub.product) sub.product = o.product;
  } else if (ev.eventType.startsWith("subscription.")) {
    sub = ev.object as unknown as Sub;
    workspaceId = typeof sub.metadata?.workspace_id === "string" ? sub.metadata.workspace_id : undefined;
  } else {
    return `ignored ${ev.eventType}`;
  }
  if (!sub?.id) return "no subscription";

  const ws = workspaceId
    ? await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) })
    : await db.query.workspaces.findFirst({ where: eq(schema.workspaces.creemSubscriptionId, sub.id) });
  if (!ws) return "unknown workspace";
  if (ws.plan === "self") return "self-hosted workspace";
  if (ws.creemSubscriptionId && ws.creemSubscriptionId !== sub.id && ev.eventType !== "checkout.completed") return "stale subscription";
  // Late retries and replays must not undo newer state (e.g. "active" arriving after "expired").
  const at = ev.created_at !== undefined ? new Date(typeof ev.created_at === "number" && ev.created_at < 1e12 ? ev.created_at * 1000 : ev.created_at) : null;
  if (at && !Number.isNaN(at.getTime()) && ws.creemEventAt && at <= ws.creemEventAt) return "older than last applied event";

  const paid = planForProduct(cfg, idOf(sub.product));
  if (!paid) return `unknown product ${idOf(sub.product)}`;
  // subscription.expired carries the status as it was; expiry itself means the paid period is over.
  const status = ev.eventType === "subscription.expired" ? "expired" : ev.eventType === "subscription.paid" ? "active" : sub.status;
  const plan = planAfter(status, paid);
  await db.update(schema.workspaces).set({
    plan,
    planStatus: status,
    planPeriodEnd: sub.current_period_end_date ? new Date(sub.current_period_end_date) : ws.planPeriodEnd,
    creemSubscriptionId: sub.id,
    creemCustomerId: idOf(sub.customer) ?? ws.creemCustomerId,
    ...(at && !Number.isNaN(at.getTime()) && { creemEventAt: at }),
  }).where(eq(schema.workspaces.id, ws.id));
  if (plan !== ws.plan || status !== ws.planStatus) {
    await logActivity({ workspaceId: ws.id, actor: "Creem", action: "plan.changed", detail: `${ws.plan} → ${plan} (${status})` });
  }
  if (!PLAN_LIMITS[plan].customDomain) {
    // Links in e-mails must not point at a domain we no longer serve; re-verify after upgrading.
    await db.update(schema.projects).set({ customDomainVerifiedAt: null }).where(eq(schema.projects.workspaceId, ws.id));
  }
  return `${ws.id}: ${plan} (${status})`;
}
