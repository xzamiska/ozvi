import { describe, expect, it } from "vitest";
import { isLocale, LOCALE_NAME, LOCALE_TAG, LOCALES, matchLocale } from "./locales";

describe("matchLocale", () => {
  it("picks the highest-q supported base language", () => {
    expect(matchLocale("fr-FR,en-US;q=0.8,cs;q=0.9")).toBe("cs");
    expect(matchLocale("en-GB,en;q=0.9")).toBe("en");
  });
  it("falls back when nothing matches or the header is missing", () => {
    expect(matchLocale("fr,it")).toBe("sk");
    expect(matchLocale(null, ["en", "cs"], "en")).toBe("en");
  });
  it("respects the allowed set", () => {
    expect(matchLocale("cs", ["sk", "en"])).toBe("sk");
    expect(matchLocale("de-DE,cs;q=0.9", ["sk", "cs", "en"])).toBe("cs");
  });
  it("matches Polish, Hungarian and German browsers (regional variants too)", () => {
    expect(matchLocale("pl-PL,pl;q=0.9,en;q=0.8")).toBe("pl");
    expect(matchLocale("hu-HU")).toBe("hu");
    expect(matchLocale("de-AT,de;q=0.9")).toBe("de");
    expect(matchLocale("de-CH;q=0.5,hu;q=0.7")).toBe("hu");
  });
});

describe("locale tables", () => {
  it("every locale has a native name and a BCP 47 tag", () => {
    expect(LOCALES).toEqual(["sk", "cs", "en", "pl", "hu", "de"]);
    expect(LOCALE_NAME).toMatchObject({ pl: "Polski", hu: "Magyar", de: "Deutsch" });
    expect(LOCALE_TAG).toMatchObject({ pl: "pl-PL", hu: "hu-HU", de: "de-DE" });
    for (const l of LOCALES) expect(Intl.getCanonicalLocales(LOCALE_TAG[l])).toEqual([LOCALE_TAG[l]]);
    expect(isLocale("pl")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
