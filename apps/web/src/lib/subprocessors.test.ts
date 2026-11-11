import { createTranslator } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/i18n/messages";

/* /subprocessors: renders from the messages in every legal language, cloud only, unknowns marked, never guessed. */

let locale: "sk" | "cs" | "en" = "sk";
vi.mock("@/i18n/server", () => ({ requestLocale: async () => locale }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale: l, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale: l as "sk", messages: MESSAGES[l as "sk"], namespace: namespace as never }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

const { default: Page } = await import("@/app/subprocessors/page");

type Entry = Record<"name" | "entity" | "purpose" | "data" | "location" | "transfer" | "when", string> & { note?: string };

describe("sub-processors page", () => {
  const mode = process.env.OZVI_MODE;
  beforeEach(() => { process.env.OZVI_MODE = "cloud"; });
  afterEach(() => { process.env.OZVI_MODE = mode; });

  for (const l of ["sk", "cs", "en"] as const) {
    it(`renders in ${l} with every sub-processor and the pending marker`, async () => {
      locale = l;
      const html = renderToStaticMarkup((await Page()) as ReactElement);
      const m = MESSAGES[l].subprocessors;
      expect(html).toContain(`<h1`);
      expect(html).toContain(m.title);
      for (const e of m.items as Entry[]) expect(html).toContain(e.name);
      // Unknowns show as "to be confirmed", never as raw "TODO".
      expect(html).not.toContain("TODO");
      expect(html).toContain(m.pending);
      expect(html).toContain('href="/privacy#cast-7"');
      expect(html).toContain('href="/privacy"');
    });
  }

  it("has the same sub-processors, in the same order, with the same unknowns in every language", () => {
    const shape = (l: "sk" | "cs" | "en") => (MESSAGES[l].subprocessors.items as Entry[]).map((e) =>
      Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k === "name" ? null : v.startsWith("TODO:")])));
    expect(shape("cs")).toEqual(shape("sk"));
    expect(shape("en")).toEqual(shape("sk"));
    expect((MESSAGES.sk.subprocessors.items as Entry[]).map((e) => e.name)).toEqual(["Server Ozvi (Hetzner)", "Resend", "Scaleway", "Creem", "GitHub", "Linear", "Jira Cloud"]);
  });

  it("is not served by a self-hosted instance", async () => {
    process.env.OZVI_MODE = "self";
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

