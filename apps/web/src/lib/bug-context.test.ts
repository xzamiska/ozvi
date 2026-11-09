import { describe, expect, it } from "vitest";
import { CAPTURE_KEYS, CAPTURE_LIMITS, cleanCapture, contextFor, timeline, toCurl, type NetEntry } from "./bug-context";

const T = Date.UTC(2026, 10, 8, 10);
const req = (i: number, over: Record<string, unknown> = {}) => ({ at: T + i, method: "GET", url: `https://api.x.sk/r/${i}`, status: 200, ms: 12, failed: false, ...over });

describe("cleanCapture: shapes and masking", () => {
  it("keeps known fields, masks again on the server", () => {
    const c = cleanCapture({
      network: [req(1, { url: "https://api.x.sk/a?token=leak&id=1", status: 500, failed: true, req: '{"password":"p"}', res: "Bearer abcdefghijkl", evil: "<script>" })],
      actions: [{ at: T, kind: "click", label: "Pay jan@firma.sk", role: "button", value: "typed secret" }],
      errors: [{ at: T, text: "TypeError for eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln" }],
    });
    expect(c.network![0]).toEqual({ at: T + 1, method: "GET", url: "https://api.x.sk/a?token=***&id=1", status: 500, ms: 12, failed: true, req: '{"password":"***"}', res: "Bearer ***" });
    expect(c.actions![0]).toEqual({ at: T, kind: "click", label: "Pay ***", role: "button" });
    expect(c.errors![0]!.text).toBe("TypeError for ***");
  });

  it("drops bodies of successful requests and malformed entries", () => {
    const c = cleanCapture({
      network: [req(1, { res: "secret body" }), { url: "x" }, req(2, { method: "G E T" }), req(3, { at: "yesterday" }), "junk", null],
      actions: [{ at: T, kind: "type", label: "x" }, { at: T, kind: "nav", label: "/a?session=1" }],
    });
    expect(c.network).toHaveLength(1);
    expect(c.network![0]!.res).toBeUndefined();
    expect(c.actions).toEqual([{ at: T, kind: "nav", label: "/a?session=***" }]);
  });

  it("session links: only the known tools and http(s)", () => {
    expect(cleanCapture({ links: { sentry: "https://acme.sentry.io/replays/1/", posthog: "javascript:alert(1)", datadog: "https://x", logrocket: 5 } }).links)
      .toEqual({ sentry: "https://acme.sentry.io/replays/1/" });
    expect(cleanCapture({ links: { posthog: "data:text/html,x" } }).links).toBeUndefined();
  });
});

describe("cleanCapture: size caps", () => {
  it("bounds counts", () => {
    const c = cleanCapture({
      network: Array.from({ length: 500 }, (_, i) => req(i)),
      actions: Array.from({ length: 500 }, (_, i) => ({ at: T + i, kind: "click", label: `b${i}` })),
      errors: Array.from({ length: 500 }, (_, i) => ({ at: T + i, text: `e${i}` })),
    });
    expect(c.network).toHaveLength(CAPTURE_LIMITS.network);
    expect(c.actions).toHaveLength(CAPTURE_LIMITS.actions);
    expect(c.errors).toHaveLength(CAPTURE_LIMITS.errors);
    // The newest survive.
    expect(c.network!.at(-1)!.url).toBe("https://api.x.sk/r/499");
  });

  it("bounds string lengths", () => {
    const c = cleanCapture({
      network: [req(1, { url: `https://api.x.sk/${"a".repeat(10_000)}`, status: 500, failed: true, res: "b".repeat(100_000), req: "c".repeat(100_000) })],
      actions: [{ at: T, kind: "click", label: "d".repeat(10_000) }],
    });
    expect(c.network![0]!.url.length).toBeLessThanOrEqual(CAPTURE_LIMITS.url);
    expect(c.network![0]!.res!.length).toBeLessThanOrEqual(CAPTURE_LIMITS.body + 1);
    expect(c.network![0]!.req!.length).toBeLessThanOrEqual(CAPTURE_LIMITS.body + 1);
    expect(c.actions![0]!.label.length).toBeLessThanOrEqual(CAPTURE_LIMITS.label);
  });

  it("keeps the whole capture under the byte cap (bodies go first)", () => {
    const c = cleanCapture({
      network: Array.from({ length: 30 }, (_, i) => req(i, { url: `https://api.x.sk/${"u".repeat(900)}${i}`, status: 500, failed: true, res: "r".repeat(2000), req: "q".repeat(2000) })),
      actions: Array.from({ length: 30 }, (_, i) => ({ at: T + i, kind: "click", label: "l".repeat(120) })),
    });
    expect(JSON.stringify(c).length).toBeLessThanOrEqual(CAPTURE_LIMITS.bytes);
    expect(c.network!.every((e) => !e.res && !e.req)).toBe(true);
    expect(c.network!.length).toBeGreaterThan(0);
  });

  it("ignores non-objects", () => {
    expect(cleanCapture(null)).toEqual({});
    expect(cleanCapture("x")).toEqual({});
    expect(cleanCapture({ network: "nope", actions: { a: 1 } })).toEqual({});
  });
});

describe("contextFor: the capture is team-only", () => {
  const ctx = { url: "https://app.x.sk/inv", browser: "Firefox", console: "TypeError", ...cleanCapture({
    network: [req(1)], actions: [{ at: T, kind: "click", label: "Save" }], errors: [{ at: T, text: "x" }],
    links: { sentry: "https://acme.sentry.io/replays/1/" }, sentAt: T,
  }) };
  it("the team sees everything", () => {
    expect(contextFor(ctx, true)).toEqual(ctx);
  });
  it("the reporter (or anyone else) sees the basic context only", () => {
    const seen = contextFor(ctx, false)!;
    for (const k of CAPTURE_KEYS) expect(seen).not.toHaveProperty(k);
    expect(seen).toEqual({ url: "https://app.x.sk/inv", browser: "Firefox", console: "TypeError" });
  });
  it("null stays null", () => expect(contextFor(null, false)).toBeNull());
});

describe("toCurl and timeline", () => {
  const e: NetEntry = { at: T, method: "POST", url: "https://api.x.sk/inv?token=***", status: 500, ms: 80, failed: true, req: `{"name":"O'Neil","password":"***"}` };
  it("builds a shell-safe cURL without auth headers", () => {
    const c = toCurl(e);
    expect(c).toContain("curl 'https://api.x.sk/inv?token=***'");
    expect(c).toContain("-X POST");
    expect(c).toContain(`--data-raw '{"name":"O'\\''Neil","password":"***"}'`);
    expect(c.toLowerCase()).not.toMatch(/authorization|cookie/);
    expect(toCurl({ ...e, method: "GET", req: undefined })).toBe("curl 'https://api.x.sk/inv?token=***'");
  });
  it("merges steps, errors and failed requests in time order", () => {
    const tl = timeline({
      actions: [{ at: T + 1, kind: "nav", label: "/a" }, { at: T + 5, kind: "click", label: "Save" }],
      errors: [{ at: T + 7, text: "boom" }],
      network: [{ ...e, at: T + 6 }, { ...e, at: T + 2, failed: false, status: 200 }],
    });
    expect(tl.map((x) => x.type)).toEqual(["action", "action", "request", "error"]);
  });
});
