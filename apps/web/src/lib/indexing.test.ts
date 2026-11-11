import { describe, expect, it } from "vitest";
import { COMPARE_IDS, COMPARE_PATH, COMPARE_PATHS, compareLanguages, compareLocale } from "./compare";
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

describe("comparison pages", () => {
  const cloud = { cloud: true, primary: true };
  it("are indexable in both languages, and nothing under them is", () => {
    expect(COMPARE_PATHS).toHaveLength(6);
    for (const path of COMPARE_PATHS) expect(indexable({ ...cloud, path })).toBe(true);
    for (const path of ["/vs", "/vs/uservoice", "/en/vs", "/en/vs/canny/x"]) expect(indexable({ ...cloud, path })).toBe(false);
    expect(indexable({ cloud: false, primary: true, path: "/vs/canny" })).toBe(false);
    expect(indexable({ cloud: true, primary: false, path: "/en/fider-alternative" })).toBe(false);
  });
  it("know their language from the path and pair sk with en", () => {
    expect(compareLocale("/vs/canny")).toBe("sk");
    expect(compareLocale("/en/fider-alternative/")).toBe("en");
    expect(compareLocale("/billiwo")).toBeNull();
    expect(compareLanguages("fider")).toEqual({ sk: "/alternativa-k-fideru", en: "/en/fider-alternative", "x-default": "/alternativa-k-fideru" });
  });
  it("are listed in the sitemap with their hreflang pair", async () => {
    const env = { ...process.env };
    Object.assign(process.env, { OZVI_MODE: "cloud", PUBLIC_URL: "https://ozvi.io" });
    try {
      const { GET } = await import("@/app/sitemap.xml/route");
      const xml = await GET(new Request("https://ozvi.io/sitemap.xml", { headers: { host: "ozvi.io" } })).text();
      for (const id of COMPARE_IDS) {
        const { sk, en } = COMPARE_PATH[id];
        expect(xml).toContain(`<loc>https://ozvi.io${sk}</loc>`);
        expect(xml).toContain(`<loc>https://ozvi.io${en}</loc>`);
        expect(xml).toContain(`hreflang="sk" href="https://ozvi.io${sk}"`);
        expect(xml).toContain(`hreflang="en" href="https://ozvi.io${en}"`);
        expect(xml).toContain(`hreflang="x-default" href="https://ozvi.io${sk}"`);
      }
    } finally {
      process.env = env;
    }
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
