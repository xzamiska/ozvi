import { createHmac } from "node:crypto";
import { createDb, schema, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { applyCreemEvent, planAfter } = await import("./creem");
type Cfg = Parameters<typeof applyCreemEvent>[0];
type Ev = Parameters<typeof applyCreemEvent>[1];

/**
 * Creem webhook matrix (QA audit 17 Nov 2026): every event type and every guard of applyCreemEvent, plus the
 * route's own checks. Money: a wrong branch either gives a paid plan away or takes a paid one from a customer.
 */
const db = createDb();
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `creem-${Date.now().toString(36)}`;
const cfg: Cfg = { apiKey: "k", webhookSecret: "whsec_test", base: "", products: { pro_year: "p_pro_y", pro_quarter: "p_pro_q", studio_year: "p_studio_y", studio_quarter: undefined } };
let n = 0;
let wsId = "";
let projectId = "";

const ws = async () => (await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, wsId) }))!;
const set = (v: Partial<typeof schema.workspaces.$inferInsert>) => db.update(schema.workspaces).set(v).where(eq(schema.workspaces.id, wsId));
const sub = (id: string, product = "p_pro_y", status = "active", extra: Record<string, unknown> = {}) =>
  ({ id, status, product: { id: product }, customer: { id: "cust_1" }, current_period_end_date: "2027-11-19T00:00:00Z", metadata: { workspace_id: wsId }, ...extra });
const ev = (eventType: string, object: Record<string, unknown>, at = Date.now() + ++n * 1000): Ev => ({ id: `e${n}`, eventType, created_at: at, object });
const checkout = (subId: string, product = "p_pro_y") =>
  ev("checkout.completed", { metadata: { workspace_id: wsId }, customer: { id: "cust_1" }, product: { id: product }, subscription: sub(subId, product) });

describe.skipIf(!up)("Creem webhook events", () => {
  beforeEach(async () => {
    if (!wsId) {
      await withSystem(db, async (tx) => {
        const [w] = await tx.insert(schema.workspaces).values({ slug, name: slug }).returning();
        wsId = w!.id;
        projectId = (await tx.insert(schema.projects).values({ workspaceId: wsId, slug, name: "Creem", theme: presets.ozvi, customDomain: "f.creem.test", customDomainVerifiedAt: new Date() }).returning())[0]!.id;
      });
    }
    await set({ plan: "free", planStatus: null, planSource: null, planUntil: null, planInterval: null, creemSubscriptionId: null, creemCustomerId: null, creemEventAt: null });
  });
  afterAll(async () => {
    if (wsId) await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.id, wsId)));
  });

  it("checkout gives the plan and interval of the product bought", async () => {
    await applyCreemEvent(cfg, checkout("sub_a", "p_studio_y"));
    expect(await ws()).toMatchObject({ plan: "studio", planInterval: "year", planSource: "creem", creemSubscriptionId: "sub_a", creemCustomerId: "cust_1", planStatus: "active" });
  });

  it("status by status: paid keeps it, past_due and scheduled_cancel keep it, canceled and expired end it", async () => {
    expect(["active", "trialing", "paid", "scheduled_cancel", "past_due"].map((s) => planAfter(s, "pro"))).toEqual(["pro", "pro", "pro", "pro", "pro"]);
    expect(["canceled", "unpaid", "expired", "whatever"].map((s) => planAfter(s, "pro"))).toEqual(["free", "free", "free", "free"]);
    await applyCreemEvent(cfg, checkout("sub_b"));
    await applyCreemEvent(cfg, ev("subscription.past_due", sub("sub_b", "p_pro_y", "past_due")));
    expect((await ws()).plan).toBe("pro");
    await applyCreemEvent(cfg, ev("subscription.paid", sub("sub_b", "p_pro_y", "past_due")));
    expect(await ws()).toMatchObject({ plan: "pro", planStatus: "active" });
    await applyCreemEvent(cfg, ev("subscription.canceled", sub("sub_b", "p_pro_y", "canceled")));
    expect((await ws()).plan).toBe("free");
  });

  it("expiry ends the plan even when the event still says active, and unverifies a custom domain the plan no longer allows", async () => {
    await applyCreemEvent(cfg, checkout("sub_c"));
    await applyCreemEvent(cfg, ev("subscription.expired", sub("sub_c", "p_pro_y", "active")));
    expect(await ws()).toMatchObject({ plan: "free", planStatus: "expired" });
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    expect(p!.customDomainVerifiedAt).toBeNull();
  });

  it("a second checkout while the first subscription pays is not applied (it would orphan the first)", async () => {
    await applyCreemEvent(cfg, checkout("sub_first"));
    expect(await applyCreemEvent(cfg, checkout("sub_second", "p_studio_y"))).toBe("second subscription ignored");
    expect(await ws()).toMatchObject({ plan: "pro", creemSubscriptionId: "sub_first" });
  });

  it("after the first subscription ended, a new checkout is the new subscription", async () => {
    await applyCreemEvent(cfg, checkout("sub_old"));
    await applyCreemEvent(cfg, ev("subscription.expired", sub("sub_old")));
    await applyCreemEvent(cfg, checkout("sub_new", "p_pro_q"));
    expect(await ws()).toMatchObject({ plan: "pro", planInterval: "quarter", creemSubscriptionId: "sub_new" });
  });

  it("events of another (stale) subscription never touch the workspace", async () => {
    await applyCreemEvent(cfg, checkout("sub_live"));
    expect(await applyCreemEvent(cfg, ev("subscription.canceled", sub("sub_gone", "p_pro_y", "canceled")))).toBe("stale subscription");
    expect(await ws()).toMatchObject({ plan: "pro", creemSubscriptionId: "sub_live" });
  });

  it("an unknown product changes nothing", async () => {
    await applyCreemEvent(cfg, checkout("sub_u"));
    expect(await applyCreemEvent(cfg, ev("subscription.active", sub("sub_u", "p_mystery")))).toBe("unknown product p_mystery");
    expect((await ws()).plan).toBe("pro");
    await set({ plan: "free", creemSubscriptionId: null });
    expect(await applyCreemEvent(cfg, checkout("sub_u2", "p_mystery"))).toBe("unknown product p_mystery");
    expect((await ws()).plan).toBe("free");
  });

  it("replays and late retries do not undo newer state; created_at in seconds or milliseconds", async () => {
    const t = Math.floor(Date.now() / 1000) + 10_000;
    await applyCreemEvent(cfg, ev("checkout.completed", checkout("sub_r").object, t));
    await applyCreemEvent(cfg, ev("subscription.expired", sub("sub_r"), (t + 60) * 1000));
    expect(await applyCreemEvent(cfg, ev("subscription.active", sub("sub_r"), t + 30))).toBe("older than last applied event");
    expect((await ws()).plan).toBe("free");
  });

  it("a plan the operator granted by hand stays until the owner buys one", async () => {
    await set({ plan: "studio", planSource: "manual", creemSubscriptionId: "sub_m" });
    expect(await applyCreemEvent(cfg, ev("subscription.canceled", sub("sub_m", "p_pro_y", "canceled")))).toBe("manual plan, ignored");
    expect((await ws()).plan).toBe("studio");
    await set({ creemSubscriptionId: null });
    await applyCreemEvent(cfg, checkout("sub_bought"));
    expect(await ws()).toMatchObject({ plan: "pro", planSource: "creem" });
  });

  it("self-hosted workspaces, unknown workspaces and other event types are ignored", async () => {
    await set({ plan: "self" });
    expect(await applyCreemEvent(cfg, checkout("sub_s"))).toBe("self-hosted workspace");
    expect((await ws()).plan).toBe("self");
    expect(await applyCreemEvent(cfg, ev("subscription.active", { ...sub("sub_nobody"), metadata: {} }))).toBe("unknown workspace");
    expect(await applyCreemEvent(cfg, ev("refund.created", { id: "r1" }))).toBe("ignored refund.created");
    expect(await applyCreemEvent(cfg, ev("checkout.completed", { metadata: { workspace_id: wsId } }))).toBe("no subscription");
  });
});

describe("Creem webhook route", () => {
  const sign = (body: string, secret = "whsec_test") => createHmac("sha256", secret).update(body).digest("hex");
  const post = async (body: string, headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/creem/route");
    return POST(new NextRequest("http://localhost/api/creem", { method: "POST", body, headers }));
  };
  const env = (on: boolean) => {
    if (on) Object.assign(process.env, { CREEM_API_KEY: "k", CREEM_WEBHOOK_SECRET: "whsec_test" });
    else { delete process.env.CREEM_API_KEY; delete process.env.CREEM_WEBHOOK_SECRET; }
  };
  afterAll(() => env(false));

  it("billing off: 404, nothing read", async () => {
    env(false);
    expect((await post("{}")).status).toBe(404);
  });

  it("no signature, a wrong one, or one with another secret: 401", async () => {
    env(true);
    const body = JSON.stringify({ id: "x", eventType: "refund.created", object: {} });
    expect((await post(body)).status).toBe(401);
    expect((await post(body, { "creem-signature": "00" })).status).toBe(401);
    expect((await post(body, { "creem-signature": sign(body, "other") })).status).toBe(401);
    expect((await post(`${body} `, { "creem-signature": sign(body) })).status).toBe(401);
  });

  it("over 1 MB: 413 before any signature work", async () => {
    env(true);
    expect((await post("x".repeat(1_000_001), { "creem-signature": "00" })).status).toBe(413);
  });

  it("a signed event is applied and answered 200; a signed but broken body is a 500 Creem retries", async () => {
    env(true);
    const body = JSON.stringify({ id: "x", eventType: "refund.created", object: {} });
    const r = await post(body, { "creem-signature": sign(body) });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ignored refund.created");
    const broken = "{not json";
    expect((await post(broken, { "creem-signature": sign(broken) })).status).toBe(500);
  });
});
