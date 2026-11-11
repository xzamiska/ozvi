import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { pageviewFor } from "./analytics";

const env = { OZVI_UMAMI_URL: "http://umami:3000/", OZVI_UMAMI_WEBSITE_ID: "site-1" } as unknown as NodeJS.ProcessEnv;
const req = (path: string, h: Record<string, string> = {}) => new NextRequest(`https://ozvi.io${path}`, {
  headers: { accept: "text/html", "user-agent": "Mozilla/5.0", "accept-language": "sk-SK,sk;q=0.9", "x-forwarded-for": "203.0.113.7", ...h },
});

describe("server-side pageviews", () => {
  it("a page load becomes one event: path without query, external referrer only, language", () => {
    const pv = pageviewFor(req("/cs?utm_source=x&email=a@b.c", { referer: "https://news.ycombinator.com/item?id=1" }), "ozvi.io", env)!;
    expect(pv.url).toBe("http://umami:3000/api/send");
    expect(JSON.parse(pv.body)).toEqual({ type: "event", payload: { website: "site-1", hostname: "ozvi.io", url: "/cs", referrer: "https://news.ycombinator.com/item", language: "sk-SK" } });
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
  it("an in-app navigation (RSC) counts", () => {
    expect(pageviewFor(req("/pricing", { accept: "*/*", rsc: "1" }), "ozvi.io", env)).not.toBeNull();
  });
});
