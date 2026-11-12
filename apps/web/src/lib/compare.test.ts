import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPARE_IDS, COMPARE_PATH, type CompareLocale } from "./compare";

/* Comparison pages: cloud only, both languages, hreflang pair, a dated note, FAQ structured data. */

vi.mock("@/lib/account", () => ({ getAccount: async () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

const { ComparePage, compareContent, compareMetadata } = await import("@/components/compare/ComparePage");

const LOCALES: CompareLocale[] = ["sk", "en"];

describe("comparison pages", () => {
  const mode = process.env.OZVI_MODE;
  beforeEach(() => { process.env.OZVI_MODE = "cloud"; });
  afterEach(() => { process.env.OZVI_MODE = mode; });

  for (const id of COMPARE_IDS) {
    for (const l of LOCALES) {
      it(`${id} renders in ${l} with the dated note and FAQPage JSON-LD`, async () => {
        const c = compareContent(id, l);
        const html = renderToStaticMarkup((await ComparePage({ id, locale: l })) as ReactElement);
        expect(html).toContain(">" + c.h1 + "</h1>");
        expect(html).toContain(l === "sk" ? "Údaje o konkurencii k novembru 2026" : "Competitor details as of November 2026");
        const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]!);
        expect(ld["@type"]).toBe("FAQPage");
        expect(ld.mainEntity).toHaveLength(c.faq.length);
        // The demo opens in the page's language (Slovak /demo, English /en/demo).
        expect(html).toContain(`href="${l === "sk" ? "/demo" : "/en/demo"}"`);
        expect(html).toContain(`href="${COMPARE_PATH[id][l === "sk" ? "en" : "sk"]}"`);
        // A mark always carries its word next to the icon (state never by colour alone).
        expect(html).toContain(l === "sk" ? ">áno</span>" : ">yes</span>");
        // Ozvi is "verejný zdrojový kód" / source-available, never "open source" (CLAUDE.md).
        expect(html).not.toMatch(/open source/i);
      });

      it(`${id} has a canonical, the sk/en pair and a short description in ${l}`, () => {
        const m = compareMetadata(id, l);
        expect(m.alternates?.canonical).toBe(COMPARE_PATH[id][l]);
        expect(m.alternates?.languages).toEqual({ sk: COMPARE_PATH[id].sk, en: COMPARE_PATH[id].en, "x-default": COMPARE_PATH[id].sk });
        const d = String(m.description);
        expect(d.length).toBeGreaterThan(110);
        expect(d.length).toBeLessThanOrEqual(170);
      });
    }

    it(`${id} has the same table rows and FAQ count in both languages`, () => {
      const [sk, en] = LOCALES.map((l) => compareContent(id, l));
      expect(en!.table.rows.map((r) => [r.ozvi.mark, r.them.mark])).toEqual(sk!.table.rows.map((r) => [r.ozvi.mark, r.them.mark]));
      expect(en!.faq).toHaveLength(sk!.faq.length);
    });
  }

  it("is not served by a self-hosted instance", async () => {
    process.env.OZVI_MODE = "self";
    await expect(ComparePage({ id: "canny", locale: "sk" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
