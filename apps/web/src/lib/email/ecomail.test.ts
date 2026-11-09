import { describe, expect, it } from "vitest";
import { ecomailTransport, parseFrom } from "./ecomail";

describe("ecomail transport", () => {
  it("parses the from header", () => {
    expect(parseFrom('"Billiwo" <feedback@billiwo.com>')).toEqual({ name: "Billiwo", email: "feedback@billiwo.com" });
    expect(parseFrom("a@b.sk")).toEqual({ name: "", email: "a@b.sk" });
  });
  it("sends with tracking off and fails on rejection", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ results: { total_accepted_recipients: 1, id: 7 } })); }) as typeof fetch;
    const t = ecomailTransport("k", ok);
    await t.sendMail({ from: '"X" <x@y.sk>', to: "r@z.sk", subject: "S", html: "<p>h</p>", text: "h" });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect((calls[0]!.init.headers as Record<string, string>).key).toBe("k");
    expect(body.message).toMatchObject({ from_email: "x@y.sk", from_name: "X", to: [{ email: "r@z.sk" }], options: { click_tracking: false, open_tracking: false } });
    const rejected = ecomailTransport("k", (async () => new Response(JSON.stringify({ results: { total_accepted_recipients: 0 } }))) as unknown as typeof fetch);
    await expect(rejected.sendMail({ from: "x@y.sk", to: "r@z.sk", subject: "S" })).rejects.toThrow(/rejected/);
  });
});
