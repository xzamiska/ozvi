import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { eventFor, NO_STATS_COOKIE, pageviewFor, trackedUrl } from "./analytics";

const env = { OZVI_UMAMI_URL: "http://umami:3000/", OZVI_UMAMI_WEBSITE_ID: "site-1" } as unknown as NodeJS.ProcessEnv;
const req = (path: string, h: Record<string, string> = {}) => new NextRequest(`https://ozvi.io${path}`, {
  headers: { accept: "text/html", "user-agent": "Mozilla/5.0", "accept-language": "sk-SK,sk;q=0.9", "x-forwarded-for": "203.0.113.7", ...h },
});

describe("server-side pageviews", () => {
  it("a page load becomes one event: path with utm tags only, external referrer only, language", () => {
    const pv = pageviewFor(req("/cs?utm_source=youtube&email=a@b.c&utm_campaign=ep01&token=x", { referer: "https://news.ycombinator.com/item?id=1" }), "ozvi.io", env)!;
    expect(pv.url).toBe("http://umami:3000/api/send");
    expect(JSON.parse(pv.body)).toEqual({ type: "event", payload: { website: "site-1", hostname: "ozvi.io", url: "/cs?utm_source=youtube&utm_campaign=ep01", referrer: "https://news.ycombinator.com/item", language: "sk-SK" } });
    expect(JSON.parse(pageviewFor(req("/cs?email=a@b.c"), "ozvi.io", env)!.body).payload.url).toBe("/cs");
    expect(pv.headers["user-agent"]).toBe("Mozilla/5.0");
    expect(JSON.parse(pageviewFor(req("/", { referer: "https://ozvi.io/cs" }), "ozvi.io", env)!.body).payload.referrer).toBe("");
  });
  it("nothing for do-not-track, GPC, prefetches, assets, other methods or without config", () => {
    expect(pageviewFor(req("/", { dnt: "1" }), "ozvi.io", env)).toBeNull();
    expect(pageviewFor(req("/", { "sec-gpc": "1" }), "ozvi.io", env)).toBeNull();
    expect(pageviewFor(req("/", { "sec-purpose": "prefetch" }), "ozvi.io", env)).toBeNull();
    expect(pageviewFor(req("/", { accept: "image/png" }), "ozvi.io", env)).toBeNull();
    expect(pageviewFor(req("/"), "ozvi.io", {} as NodeJS.ProcessEnv)).toBeNull();
  });
  it("the team's own visits (signed in to the console once) are not counted", () => {
    expect(pageviewFor(req("/", { cookie: `${NO_STATS_COOKIE}=1` }), "ozvi.io", env)).toBeNull();
  });
  it("an in-app navigation (RSC) counts", () => {
    expect(pageviewFor(req("/pricing", { accept: "*/*", rsc: "1" }), "ozvi.io", env)).not.toBeNull();
  });
  it("keeps only utm_* tags, trimmed to 100 characters", () => {
    expect(trackedUrl(new URL(`https://ozvi.io/?utm_source=${"x".repeat(150)}&ref=1`))).toBe(`/?utm_source=${"x".repeat(100)}`);
    expect(trackedUrl(new URL("https://ozvi.io/docs?q=a"))).toBe("/docs");
  });
  it("skips bots, link previews and clients without a browser language", () => {
    expect(pageviewFor(req("/", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }), "ozvi.io", env)).toBeNull();
    expect(pageviewFor(req("/", { "user-agent": "facebookexternalhit/1.1" }), "ozvi.io", env)).toBeNull();
    expect(pageviewFor(req("/", { "user-agent": "curl/8.4.0" }), "ozvi.io", env)).toBeNull();
    expect(pageviewFor(req("/", { "accept-language": "" }), "ozvi.io", env)).toBeNull();
  });
  it("named steps carry no personal data and honour do-not-track", () => {
    const h = req("/app").headers;
    const e = eventFor("checkout_started", h, "ozvi.io", { plan: "pro", interval: "year" }, env)!;
    expect(JSON.parse(e.body)).toEqual({ type: "event", payload: { website: "site-1", hostname: "ozvi.io", url: "/app", language: "sk-SK", name: "checkout_started", data: { plan: "pro", interval: "year" } } });
    expect(eventFor("account_created", req("/app", { dnt: "1" }).headers, "ozvi.io", undefined, env)).toBeNull();
  });
});
