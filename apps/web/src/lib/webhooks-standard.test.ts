import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
const { encryptSecret, newSecret } = await import("@ozvi/db");
const { deliver, sign, standardSecret } = await import("./webhooks");

/** Verification exactly as documented on /docs/webhooks (and as Standard Webhooks libraries do it). */
function verifyStandard(whsec: string, headers: Record<string, string>, body: string, now = Math.floor(Date.now() / 1000)): boolean {
  const key = Buffer.from(whsec.replace(/^whsec_/, ""), "base64");
  const t = Number(headers["webhook-timestamp"]);
  if (Math.abs(now - t) > 300) return false;
  const expected = createHmac("sha256", key).update(`${headers["webhook-id"]}.${t}.${body}`).digest();
  return headers["webhook-signature"]!.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    const got = Buffer.from(sig ?? "", "base64");
    return v === "v1" && got.length === expected.length && timingSafeEqual(got, expected);
  });
}

describe("webhook signatures", () => {
  const secret = newSecret();
  const hook = { id: "h", projectId: "p", url: "https://example.com/hook", secretEnc: encryptSecret(secret), format: "json", events: [], includeBugs: false, active: true, createdAt: new Date() } as never;

  it("sends Standard Webhooks headers next to Ozvi-Signature, both valid", async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    const r = await deliver(hook, { event: "item.created", item: { number: 1 } }, async (_url, init) => {
      seen = { headers: init.headers as Record<string, string>, body: init.body as string };
      return new Response("ok");
    }, "0b7c3f0e-1111-4222-8333-444455556666");
    expect(r.ok).toBe(true);
    const { headers, body } = seen!;
    expect(headers["webhook-id"]).toBe("msg_0b7c3f0e-1111-4222-8333-444455556666");
    expect(headers["webhook-signature"]).toMatch(/^v1,[A-Za-z0-9+/]+=*$/);
    expect(verifyStandard(standardSecret(secret), headers, body)).toBe(true);
    expect(verifyStandard(standardSecret(newSecret()), headers, body)).toBe(false);
    expect(verifyStandard(standardSecret(secret), headers, `${body} `)).toBe(false);
    // The original header still verifies the old way (backwards compatible).
    expect(headers["ozvi-signature"]).toBe(sign(secret, body, Number(headers["webhook-timestamp"])));
  });

  it("rejects stale timestamps", async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    await deliver(hook, { event: "item.created" }, async (_u, init) => { seen = { headers: init.headers as Record<string, string>, body: init.body as string }; return new Response("ok"); });
    expect(verifyStandard(standardSecret(secret), seen!.headers, seen!.body, Math.floor(Date.now() / 1000) + 600)).toBe(false);
  });

  it("whsec_ form is standard base64 of the secret's bytes", () => {
    const s = newSecret();
    expect(Buffer.from(standardSecret(s).slice(6), "base64").toString("base64url")).toBe(s);
  });
});
