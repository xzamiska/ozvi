import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES } from "./locales";
import { LANDING_PAGES, localeRedirect, withLang } from "./locale-route";

const r = (url: string) => { const u = new URL(url, "http://x"); return localeRedirect(u.pathname, u.searchParams); };

describe("the landing's language carries on into the console", () => {
  it("?hl= on /app is remembered and dropped from the address, other parameters stay", () => {
    expect(r("/app/login?hl=en")).toEqual({ to: "/app/login", locale: "en" });
    expect(r("/app/login?next=%2Fapp%2Fw%2F1&hl=cs")).toEqual({ to: "/app/login?next=%2Fapp%2Fw%2F1", locale: "cs" });
    expect(r("/app?hl=de")).toEqual({ to: "/app", locale: "de" });
    // An unknown language is dropped without remembering anything.
    expect(r("/app/login?hl=xx")).toEqual({ to: "/app/login", locale: null });
  });

  it("guessed addresses under a language prefix", () => {
    expect(r("/en/app/login")).toEqual({ to: "/app/login", locale: "en" });
    expect(r("/en/app")).toEqual({ to: "/app", locale: "en" });
    expect(r("/pl/login")).toEqual({ to: "/app/login", locale: "pl" });
    expect(r("/hu/signup/")).toEqual({ to: "/app/login", locale: "hu" });
    expect(r("/en/pricing")).toEqual({ to: "/en#pricing", locale: null });
    expect(r("/sk/pricing")).toEqual({ to: "/#pricing", locale: null });
  });

  it("everything else is left alone (landing pages, boards, other prefixes)", () => {
    for (const p of ["/", "/en", "/en/", "/en/demo", "/en/vs/canny", "/en/fider-alternative", "/billiwo", "/billiwo/app", "/xx/app/login", "/application", "/app/login", "/sk/billiwo"]) expect(r(p), p).toBeNull();
  });

  it("a board under a language prefix opens that board in that language", () => {
    expect(r("/en/billiwo")).toEqual({ to: "/billiwo", locale: "en" });
    expect(r("/de/billiwo/i/12?x=1")).toEqual({ to: "/billiwo/i/12?x=1", locale: "de" });
  });

  it("every page under app/<locale>/ is a landing page, not taken for a board", () => {
    const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../app");
    for (const l of LOCALES) {
      let dirs: string[] = [];
      try { dirs = readdirSync(path.join(app, l)).filter((f) => statSync(path.join(app, l, f)).isDirectory()); } catch { continue; }
      for (const d of dirs) expect(LANDING_PAGES.has(d), `app/${l}/${d}`).toBe(true);
    }
  });

  it("withLang adds the language to console links", () => {
    expect(withLang("/app/login", "en")).toBe("/app/login?hl=en");
    expect(withLang("/app/login?x=1", "sk")).toBe("/app/login?x=1&hl=sk");
  });
});
