import { afterEach, describe, expect, it, vi } from "vitest";
import { framesOf, parseDsn, reportError, safePath } from "./error-report";

afterEach(() => vi.unstubAllGlobals());

describe("error report", () => {
  it("reads a Sentry/GlitchTip DSN", () => {
    expect(parseDsn("http://abc123@10.50.0.10:8083/4")).toMatchObject({ store: "http://10.50.0.10:8083/api/4/store/" });
    expect(parseDsn("http://abc123@10.50.0.10:8083/4")?.auth).toContain("sentry_key=abc123");
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("https://errors.example.com/4")).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });

  it("drops the query string (sign-in tokens live there)", () => {
    expect(safePath("/app/login/verify?t=secret-token&x=1")).toBe("/app/login/verify");
    expect(safePath("/feedback/ideas#top")).toBe("/feedback/ideas");
  });

  it("turns a Node stack into frames, oldest first", () => {
    const f = framesOf("Error: x\n    at inner (/app/a.js:10:5)\n    at outer (/app/node_modules/b.js:3:1)");
    expect(f.map((x) => [x.function, x.lineno, x.in_app])).toEqual([["outer", 3, false], ["inner", 10, true]]);
  });

  it("sends nothing without a DSN, and only the error with one", async () => {
    const calls: { url: string; body: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: new Headers(init.headers).get("x-sentry-auth") });
      return new Response(null, { status: 200 });
    });
    expect(await reportError(new Error("boom"), { path: "/x?t=1" }, {})).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await reportError(new TypeError("boom"), { path: "/app/w/1?t=secret", method: "POST", route: "/app/w/[id]" }, { OZVI_ERROR_DSN: "http://k@host:8083/7", OZVI_MODE: "cloud" })).toBe(true);
    const ev = JSON.parse(calls[0]!.body);
    expect(calls[0]!.url).toBe("http://host:8083/api/7/store/");
    expect(ev.exception.values[0]).toMatchObject({ type: "TypeError", value: "boom" });
    expect(ev.request).toEqual({ url: "/app/w/1", method: "POST" });
    expect(ev.environment).toBe("cloud");
    expect(calls[0]!.body).not.toContain("secret");
  });
});
