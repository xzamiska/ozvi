import { describe, expect, it } from "vitest";
import { boardLocales, recipientLocale, resolveBoardLocale } from "./board";

const all = { defaultLocale: "sk", locales: ["sk", "cs", "en"] };
const czOnly = { defaultLocale: "cs", locales: ["cs"] };

describe("board locale", () => {
  it("prefers an enabled cookie choice over the browser", () => {
    expect(resolveBoardLocale(all, "en", "cs-CZ")).toBe("en");
  });
  it("ignores a cookie the board does not offer", () => {
    expect(resolveBoardLocale(czOnly, "en", "en-GB")).toBe("cs");
  });
  it("uses Accept-Language within enabled locales, then the default", () => {
    expect(resolveBoardLocale(all, null, "de-DE,cs;q=0.8")).toBe("cs");
    expect(resolveBoardLocale({ defaultLocale: "sk", locales: ["sk", "pl", "de"] }, null, "de-DE,cs;q=0.8")).toBe("de");
    expect(resolveBoardLocale({ defaultLocale: "pl", locales: ["pl", "hu"] }, "de", "hu-HU")).toBe("hu");
    expect(resolveBoardLocale({ defaultLocale: "en", locales: ["en", "sk"] }, null, "fr")).toBe("en");
  });
  it("always enables the default and drops unknown codes", () => {
    expect(boardLocales({ defaultLocale: "en", locales: ["sk", "xx"] })).toEqual({ allowed: ["en", "sk"], fallback: "en" });
    expect(boardLocales({ defaultLocale: "xx", locales: [] })).toEqual({ allowed: ["sk"], fallback: "sk" });
  });
  it("sends e-mails in the stored user locale when still enabled", () => {
    expect(recipientLocale(all, "cs")).toBe("cs");
    expect(recipientLocale(czOnly, "en")).toBe("cs");
    expect(recipientLocale(all, null)).toBe("sk");
    expect(recipientLocale({ defaultLocale: "de", locales: ["de", "pl"] }, "pl")).toBe("pl");
    expect(recipientLocale({ defaultLocale: "de", locales: ["de"] }, "hu")).toBe("de");
  });
});
