import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BODY_LIMIT, finish, ignored, installNetwork, MAX_NET, net, ring, sessionLinks, snapshot, type NetEntry, type OzviConfig } from "./capture";

const g = globalThis as typeof globalThis & { OzviConfig?: OzviConfig; posthog?: unknown; LogRocket?: unknown };
const tick = () => new Promise((r) => setTimeout(r, 5));
const entry = (over: Partial<NetEntry> = {}): NetEntry => ({ at: Date.now(), method: "GET", url: "https://api.x.sk/a", status: 200, ms: 5, failed: false, ...over });

let reply: () => Response = () => new Response("ok");
beforeAll(() => {
  g.fetch = (async () => reply()) as typeof fetch;
  installNetwork();
});
afterEach(() => { net.clear(); delete g.OzviConfig; ignored.length = 0; reply = () => new Response("ok"); });

describe("ring buffer", () => {
  it("keeps only the newest entries", () => {
    const r = ring<number>(3);
    for (let i = 0; i < 10; i++) r.push(i);
    expect(r.list()).toEqual([7, 8, 9]);
  });
  it("network log holds at most MAX_NET requests", async () => {
    for (let i = 0; i < MAX_NET + 12; i++) await fetch(`https://api.x.sk/r/${i}`);
    await tick();
    const list = net.list();
    expect(list).toHaveLength(MAX_NET);
    expect(list.at(-1)!.url).toBe(`https://api.x.sk/r/${MAX_NET + 11}`);
  });
});

describe("fetch capture", () => {
  it("records method, masked URL, status, timing; no bodies by default", async () => {
    reply = () => new Response('{"error":"boom","token":"t"}', { status: 500, headers: { "content-type": "application/json" } });
    await fetch("https://api.x.sk/save?token=abc&id=7", { method: "post", body: '{"password":"x"}', headers: { authorization: "Bearer secret" } });
    await tick();
    const [e] = net.list();
    expect(e).toMatchObject({ method: "POST", url: "https://api.x.sk/save?token=***&id=7", status: 500, failed: true, type: "application/json" });
    expect(e!.req).toBeUndefined();
    expect(e!.res).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain("secret");
  });

  it("with networkBodies keeps masked bodies of failed requests only", async () => {
    g.OzviConfig = { networkBodies: true };
    reply = () => new Response('{"error":"boom","sessionId":"s1"}', { status: 422, headers: { "content-type": "application/json" } });
    await fetch("https://api.x.sk/save", { method: "POST", body: '{"password":"hunter2","name":"Jan"}' });
    reply = () => new Response('{"token":"ok"}', { status: 200, headers: { "content-type": "application/json" } });
    await fetch("https://api.x.sk/ok", { method: "POST", body: '{"a":1}' });
    await tick(); await tick();
    const [failed, ok] = net.list().sort((a, b) => a.status - b.status).reverse();
    expect(JSON.parse(failed!.req!)).toEqual({ password: "***", name: "Jan" });
    expect(JSON.parse(failed!.res!)).toEqual({ error: "boom", sessionId: "***" });
    expect(ok!.req).toBeUndefined();
    expect(ok!.res).toBeUndefined();
  });

  it("caps bodies", async () => {
    g.OzviConfig = { networkBodies: true };
    reply = () => new Response("x".repeat(50_000), { status: 500, headers: { "content-type": "text/plain" } });
    await fetch("https://api.x.sk/big");
    await tick(); await tick();
    expect(net.list()[0]!.res!.length).toBeLessThanOrEqual(BODY_LIMIT + 1);
  });

  it("records network failures", async () => {
    reply = () => { throw new TypeError("Failed to fetch"); };
    await fetch("https://down.x.sk/").catch(() => {});
    await tick();
    expect(net.list()[0]).toMatchObject({ status: 0, failed: true, error: "TypeError" });
  });

  it("skips ignored prefixes (the Ozvi host, the token endpoint) and respects network: false", async () => {
    ignored.push("https://ozvi.x.sk/");
    await fetch("https://ozvi.x.sk/billiwo/api/widget/items");
    g.OzviConfig = { network: false };
    await fetch("https://api.x.sk/a");
    await tick();
    expect(net.list()).toHaveLength(0);
  });
});

describe("maskRequest hook", () => {
  it("can drop an entry", () => {
    g.OzviConfig = { maskRequest: (e) => (e.url.includes("/health") ? null : e) };
    finish(entry({ url: "https://api.x.sk/health" }));
    finish(entry());
    expect(net.list().map((e) => e.url)).toEqual(["https://api.x.sk/a"]);
  });
  it("can rewrite, and built-in masking still applies afterwards", () => {
    g.OzviConfig = { maskRequest: (e) => ({ ...e, url: e.url.replace(/\/customers\/\d+/, "/customers/:id") + "?apiKey=leak" }) };
    finish(entry({ url: "https://api.x.sk/customers/42" }));
    expect(net.list()[0]!.url).toBe("https://api.x.sk/customers/:id?apiKey=***");
  });
  it("a throwing hook drops the entry instead of leaking it", () => {
    g.OzviConfig = { maskRequest: () => { throw new Error("bug in host"); } };
    finish(entry());
    expect(net.list()).toHaveLength(0);
  });
});

describe("snapshot and session links", () => {
  it("omits the network log when opted out at send time", () => {
    finish(entry());
    g.OzviConfig = { network: false };
    expect(snapshot().network).toEqual([]);
  });
  it("uses explicit links and detects globals only when allowed", () => {
    g.posthog = { get_session_replay_url: () => "https://eu.posthog.com/replay/abc" };
    g.LogRocket = { sessionURL: "https://app.logrocket.com/x/s/1" };
    g.OzviConfig = { links: { sentry: () => "https://acme.sentry.io/replays/1/", posthog: "javascript:alert(1)" } };
    expect(sessionLinks()).toEqual({ sentry: "https://acme.sentry.io/replays/1/" });
    g.OzviConfig = { ...g.OzviConfig, detectLinks: true };
    expect(sessionLinks()).toEqual({ sentry: "https://acme.sentry.io/replays/1/", posthog: "https://eu.posthog.com/replay/abc", logrocket: "https://app.logrocket.com/x/s/1" });
    delete g.posthog; delete g.LogRocket;
  });
});
