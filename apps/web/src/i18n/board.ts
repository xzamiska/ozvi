import { DEFAULT_LOCALE, isLocale, matchLocale, type Locale } from "./locales";

/** The language settings of one board, as stored on the project row. */
export interface BoardLanguages { defaultLocale?: string | null; locales?: readonly string[] | null }

/** Enabled locales (always non-empty, always including the default) and the default itself. */
export function boardLocales(p: BoardLanguages): { allowed: Locale[]; fallback: Locale } {
  const fallback = isLocale(p.defaultLocale) ? p.defaultLocale : DEFAULT_LOCALE;
  const allowed = (p.locales ?? []).filter(isLocale);
  if (!allowed.includes(fallback)) allowed.unshift(fallback);
  return { allowed, fallback };
}

/**
 * Board locale: an explicit choice (cookie, or the host app's `locale` claim stored in it) when the
 * board offers it, then Accept-Language within the enabled set, then the board default.
 */
export function resolveBoardLocale(p: BoardLanguages, cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  const { allowed, fallback } = boardLocales(p);
  if (isLocale(cookie) && allowed.includes(cookie)) return cookie;
  return matchLocale(acceptLanguage, allowed, fallback);
}

/** A stored per-user locale if the board still offers it, else the board default (for e-mails). */
export function recipientLocale(p: BoardLanguages, userLocale: string | null | undefined): Locale {
  const { allowed, fallback } = boardLocales(p);
  return isLocale(userLocale) && allowed.includes(userLocale) ? userLocale : fallback;
}
