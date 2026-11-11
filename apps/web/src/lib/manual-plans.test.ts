import { createDb, schema, withSystem } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
const { expireManualPlans } = await import("./manual-plans");
const { applyCreemEvent } = await import("./creem");
const db = createDb();

describe("manual plans", () => {
  it("end at plan_until (back to Free); Creem events leave them alone except a new checkout", async () => {
    const tag = `mp-${Date.now().toString(36)}`;
    const [ended, kept] = await withSystem(db, async (tx) => tx.insert(schema.workspaces).values([
      { slug: `${tag}-a`, name: "A", plan: "studio", planSource: "manual", planUntil: new Date(Date.now() - 1000) },
      { slug: `${tag}-b`, name: "B", plan: "pro", planSource: "manual", planUntil: null },
    ]).returning());
    expect(await expireManualPlans(db)).toBeGreaterThanOrEqual(1);
    const a = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, ended!.id) });
    expect([a?.plan, a?.planSource]).toEqual(["free", null]);
    const cfg = { apiKey: "k", webhookSecret: "w", base: "x", products: { pro_year: "p_py", pro_quarter: "p_pq", studio_year: "p_sy", studio_quarter: "p_sq" } };
    const sub = { id: `sub_${tag}`, status: "expired", product: { id: "p_py" }, customer: { id: "c" }, metadata: { workspace_id: kept!.id } };
    expect(await applyCreemEvent(cfg, { id: "e1", eventType: "subscription.expired", object: sub })).toBe("manual plan, ignored");
    expect((await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, kept!.id) }))?.plan).toBe("pro");
  });
});
