import { describe, expect, it } from "vitest";
import { indexable, robotsTxt } from "./indexing";

describe("indexable", () => {
  const cloud = { cloud: true, primary: true };
  it("allows only Ozvi's public pages on the cloud primary host", () => {
    for (const path of ["/", "/en", "/de/", "/docs", "/docs/api", "/releases", "/terms", "/privacy"]) expect(indexable({ ...cloud, path })).toBe(true);
  });
  it("never indexes boards, the app or sign-in", () => {
    for (const path of ["/billiwo", "/billiwo/ideas", "/billiwo/roadmap", "/app", "/app/new", "/login", "/demo/board", "/demo/board/ideas", "/docsx", "/en/x"]) expect(indexable({ ...cloud, path })).toBe(false);
  });
  it("never indexes project hosts or a self-hosted instance", () => {
    expect(indexable({ cloud: true, primary: false, path: "/" })).toBe(false);
    expect(indexable({ cloud: true, primary: false, path: "/docs" })).toBe(false);
    expect(indexable({ cloud: false, primary: true, path: "/" })).toBe(false);
  });
});

describe("robotsTxt", () => {
  it("keeps the app out on the cloud primary host", () => {
    expect(robotsTxt({ cloud: true, primary: true })).toContain("Disallow: /app");
    expect(indexable({ cloud: true, primary: true, path: "/demo" })).toBe(true);
    expect(robotsTxt({ cloud: true, primary: true })).not.toMatch(/Disallow: \/demo\n/);
    expect(robotsTxt({ cloud: true, primary: true, origin: "https://ozvi.io" })).toContain("Sitemap: https://ozvi.io/sitemap.xml");
  });
  it("leaves board hosts crawlable so the noindex header is seen", () => {
    expect(robotsTxt({ cloud: true, primary: false })).toBe("User-agent: *\nDisallow:\n");
    expect(robotsTxt({ cloud: false, primary: true })).toBe("User-agent: *\nDisallow:\n");
  });
});
