import { describe, expect, it } from "vitest";
import { changeSubscription, type CreemConfig } from "./creem";

const cfg = { apiKey: "k", webhookSecret: "w", base: "https://test-api.creem.io/v1", products: {} } as unknown as CreemConfig;

describe("changeSubscription", () => {
  it("moves the subscription to the new product, charging upgrades now and prorating downgrades", async () => {
    const calls: { url: string; body: Record<string, string>; key: string | null }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get("x-api-key") });
      return new Response(JSON.stringify({ id: "sub_1", status: "active", product: { id: "prod_s" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const sub = await changeSubscription(cfg, "sub_1", "prod_s", true, f);
    await changeSubscription(cfg, "sub_1", "prod_p", false, f);
    expect(sub.id).toBe("sub_1");
    expect(calls[0]).toEqual({ url: "https://test-api.creem.io/v1/subscriptions/sub_1/upgrade", body: { product_id: "prod_s", update_behavior: "proration-charge-immediately" }, key: "k" });
    expect(calls[1]!.body.update_behavior).toBe("proration-charge");
  });

  it("fails as a gateway error when Creem refuses", async () => {
    const f = (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch;
    await expect(changeSubscription(cfg, "sub_1", "prod_s", true, f)).rejects.toThrow();
  });
});

import { cancelSubscription, isUpgrade, prorationEstimate } from "./creem";

describe("plan change pricing", () => {
  const DAY = 86_400_000;
  it("upgrade = the new plan costs more per day", () => {
    expect(isUpgrade({ plan: "pro", planInterval: "year" }, "studio", "year")).toBe(true);
    expect(isUpgrade({ plan: "studio", planInterval: "year" }, "pro", "year")).toBe(false);
    expect(isUpgrade({ plan: "pro", planInterval: "quarter" }, "pro", "year")).toBe(false); // yearly is cheaper per day
    expect(isUpgrade({ plan: "free", planInterval: null }, "pro", "year")).toBe(true);
  });
  it("estimates the prorated charge for the rest of the period", () => {
    const now = Date.UTC(2026, 10, 11);
    // Right after paying: the whole difference (49 − 19 = 30 €, the 36.90 € with VAT on staging).
    expect(prorationEstimate({ plan: "pro", planInterval: "year", planPeriodEnd: new Date(now + 365 * DAY) }, "studio", "year", now)).toBe(3000);
    expect(prorationEstimate({ plan: "pro", planInterval: "year", planPeriodEnd: new Date(now + 182.5 * DAY) }, "studio", "year", now)).toBe(1500);
    expect(prorationEstimate({ plan: "pro", planInterval: "year", planPeriodEnd: new Date(now + 100 * DAY) }, "studio", "quarter", now)).toBeNull();
  });
  it("cancels at the end of the period", async () => {
    let body = "";
    const f = (async (_u: string, init: RequestInit) => { body = String(init.body); return new Response(JSON.stringify({ id: "sub_1", status: "scheduled_cancel" })); }) as unknown as typeof fetch;
    await cancelSubscription(cfg, "sub_1", f);
    expect(JSON.parse(body)).toEqual({ mode: "scheduled", onExecute: "cancel" });
  });
});
