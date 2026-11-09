import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALES, matchLocale, type Locale } from "./locales";

/**
 * Locale for a request outside the landing (which is path-based): an explicit choice in the
 * cookie wins, then the browser's Accept-Language within `allowed`, then `fallback`.
 */
export async function requestLocale(allowed: readonly Locale[] = LOCALES, fallback: Locale = DEFAULT_LOCALE): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen) && allowed.includes(chosen)) return chosen;
  return matchLocale((await headers()).get("accept-language"), allowed, allowed.includes(fallback) ? fallback : allowed[0] ?? DEFAULT_LOCALE);
}

/** Landing pages carry the locale in the path: "/" is Slovak, "/cs" and "/en" the others. */
export function landingLocale(path: string): Locale | null {
  if (path === "/" ) return "sk";
  const first = path.split("/")[1];
  return isLocale(first) && (path === `/${first}` || path === `/${first}/`) ? first : null;
}

/** Top-level routes that are never a board slug. */
const NOT_BOARDS = new Set(["app", "api", "demo", "dev", "mcp", "terms", "privacy", "accessibility", "subprocessors", "releases", "releases.json", "podmienky", "sukromie", "pristupnost", "_next", ...LOCALES]);

/** The board slug of this request (/<slug>/…), or null outside boards. */
export async function boardSlugOfRequest(): Promise<string | null> {
  const path = (await headers()).get("x-ozvi-path") ?? "/";
  if (landingLocale(path)) return null;
  const first = path.split("/")[1];
  return first && !NOT_BOARDS.has(first) ? first : null;
}

/**
 * <html lang> for any path. Landing: from the path. Boards (/<slug>/…): the board's language rules
 * (lib/project.ts). Everything else: the request locale.
 */
export async function htmlLocale(): Promise<Locale> {
  const path = (await headers()).get("x-ozvi-path") ?? "/";
  const landing = landingLocale(path);
  if (landing) return landing;
  const first = path.split("/")[1];
  if (first && !NOT_BOARDS.has(first)) {
    const { boardLocaleForSlug } = await import("@/lib/project");
    const board = await boardLocaleForSlug(first);
    if (board) return board;
  }
  return requestLocale();
}
