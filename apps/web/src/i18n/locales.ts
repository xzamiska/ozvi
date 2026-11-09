/**
 * Locales Ozvi speaks. Slovak is the source language: messages/sk.json types every key
 * (src/global.d.ts), and messages.test.ts checks every other locale carries the same keys.
 * Polish, Hungarian and German (wave 3) still need a native review before launch (docs/LANGUAGES.md).
 */

export const LOCALES = ["sk", "cs", "en", "pl", "hu", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "sk";

/** Native names, shown in the language switcher. */
export const LOCALE_NAME: Record<Locale, string> = { sk: "Slovenčina", cs: "Čeština", en: "English", pl: "Polski", hu: "Magyar", de: "Deutsch" };
/** BCP 47 tags for Intl formatters and <html lang>. */
export const LOCALE_TAG: Record<Locale, string> = { sk: "sk-SK", cs: "cs-CZ", en: "en-GB", pl: "pl-PL", hu: "hu-HU", de: "de-DE" };

/** Cookie the console and boards remember an explicit choice in (next-intl's name, as in Billiwo). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Best supported locale for an Accept-Language header, limited to `allowed`. */
export function matchLocale(header: string | null | undefined, allowed: readonly Locale[] = LOCALES, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!header) return fallback;
  const wanted = header.split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { tag: (tag ?? "").toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split("-")[0]!;
    if ((allowed as readonly string[]).includes(base)) return base as Locale;
  }
  return fallback;
}
