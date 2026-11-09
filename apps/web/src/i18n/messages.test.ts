/**
 * Every message is valid ICU and cs/en carry exactly the keys of sk (as Billiwo's
 * messages.test.ts): next-intl compiles a message only when it is shown, so a typo in a
 * rarely opened screen would otherwise reach production unnoticed.
 */
import { describe, expect, it } from "vitest";
import { createTranslator, IntlErrorCode } from "next-intl";
import { LOCALES, type Locale } from "./locales";
import { MESSAGES } from "./messages";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = "", out: string[] = []): string[] {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.push(path);
    else if (value && typeof value === "object") leaves(value, path, out);
  }
  return out;
}

function invalid(locale: Locale): string[] {
  const messages = MESSAGES[locale] as unknown as Tree;
  const bad: string[] = [];
  const t = createTranslator({ locale, messages, onError: (e) => { if (e.code === IntlErrorCode.INVALID_MESSAGE) bad.push(e.message); } });
  const rich = t.rich as unknown as (k: string, v: Record<string, unknown>) => unknown;
  const raw = t.raw as unknown as (k: string) => unknown;
  for (const key of leaves(messages)) {
    const tags: Record<string, unknown> = {};
    for (const m of String(raw(key)).matchAll(/<([A-Za-z][\w-]*)/g)) tags[m[1]!] = (chunks: unknown) => chunks;
    try { rich(key, tags); } catch { /* reported through onError */ }
  }
  return bad;
}

describe("messages", () => {
  const sk = new Set(leaves(MESSAGES.sk as unknown as Tree));
  for (const locale of LOCALES.filter((l) => l !== "sk")) {
    it(`${locale} has exactly the keys of sk`, () => {
      const other = new Set(leaves(MESSAGES[locale] as unknown as Tree));
      expect([...sk].filter((k) => !other.has(k))).toEqual([]);
      expect([...other].filter((k) => !sk.has(k))).toEqual([]);
    });
  }
  for (const locale of LOCALES) {
    it(`every ${locale} message is valid ICU`, () => expect(invalid(locale)).toEqual([]));
    it(`no ${locale} message is left unconverted`, () => {
      const left = leaves(MESSAGES[locale] as unknown as Tree).filter((k) => String((createTranslator({ locale, messages: MESSAGES[locale] as unknown as Tree }).raw as (k: string) => unknown)(k)).startsWith("TODO(icu)"));
      expect(left).toEqual([]);
    });
  }
});
