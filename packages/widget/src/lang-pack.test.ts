import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { packFor } from "./lang-pack";

/**
 * Every language pack (pl/hu/de, loaded lazily) has exactly the keys of the English tables in the
 * chunks it serves, so a string added to the widget cannot silently fall back to English.
 */
const src = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
/** Top-level keys of the `en: { … }` block of a chunk's `const T = { … }` table. */
function enKeys(file: string): string[] {
  const s = src(file);
  const start = s.indexOf("\n  en: {", s.indexOf("const T = {"));
  let depth = 0, i = s.indexOf("{", start), body = "";
  for (; i < s.length; i++) {
    const c = s[i]!;
    if (c === "{" || c === "[" || c === "(") depth++;
    if (c === "}" || c === "]" || c === ")") depth--;
    body += depth === 1 && c !== "{" ? c : depth === 1 ? "" : " ";
    if (depth === 0) break;
  }
  return [...body.replace(/"(?:[^"\\]|\\.)*"|`[^`]*`/g, '""').matchAll(/([A-Za-z]\w*)\s*:/g)].map((m) => m[1]!).sort();
}

describe("widget language packs", () => {
  beforeAll(async () => {
    (globalThis as { window?: unknown }).window ??= globalThis;
    await Promise.all(["pl", "hu", "de"].map((l) => import(`./lang/${l}.ts`)));
  });
  for (const lang of ["pl", "hu", "de"]) {
    it(`${lang} covers main, ideas, annotate and embeds`, () => {
      const p = packFor(lang)!;
      expect(p.lang).toBe(lang);
      expect(enKeys("index.tsx").length).toBeGreaterThan(40);
      expect(enKeys("embeds.tsx")).toContain("freshN");
      expect(Object.keys(p.main).sort()).toEqual(enKeys("index.tsx"));
      expect(Object.keys(p.ideas).sort()).toEqual(enKeys("ideas.tsx"));
      expect(Object.keys(p.annotate).sort()).toEqual(enKeys("annotate.ts"));
      expect(Object.keys(p.embeds).sort()).toEqual(enKeys("embeds.tsx"));
      expect((p.main.stops as string[]).length).toBe(4);
      expect(typeof (p.ideas.votes as (n: number) => string)(5)).toBe("string");
    });
  }
  it("Polish vote counts use one / few / many", () => {
    const votes = packFor("pl")!.embeds.votes as (n: number) => string;
    expect([1, 3, 5, 12, 22].map(votes)).toEqual(["1 głos", "3 głosy", "5 głosów", "12 głosów", "22 głosy"]);
  });
});
