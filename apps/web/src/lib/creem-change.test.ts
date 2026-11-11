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
