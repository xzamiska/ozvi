import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/**
 * The landing's language carries on into sign-up and the console (internal review 17 Nov 2026: "Start for free" on
 * /en used to open a Slovak sign-in for anyone whose browser or cookie said Slovak). Pure, used by proxy.ts.
 *
 * - `/app/…?hl=en`: the landing links add the language the person was reading; it is remembered (cookie) and dropped
 *   from the address.
 * - `/en/app/…`, `/en/login`, `/en/signup`: addresses people guess; the same as above.
 * - `/en/pricing`: the pricing section of that landing.
 * - `/en/<board>/…`: that board, remembering the language (boards choose among their own languages).
 */
/** Pages that live under a language prefix (app/<locale>/<page>); i18n/locale-route.test.ts keeps it in sync. */
export const LANDING_PAGES = new Set(["demo", "vs", "fider-alternative"]);

export function localeRedirect(path: string, search: URLSearchParams): { to: string; locale: Locale | null } | null {
  const hl = search.get("hl");
  if ((path === "/app" || path.startsWith("/app/")) && hl !== null) {
    const rest = new URLSearchParams(search);
    rest.delete("hl");
    const q = rest.toString();
    return { to: `${path}${q ? `?${q}` : ""}`, locale: isLocale(hl) ? hl : null };
  }
  const m = /^\/([a-z]{2})(\/app(?:\/.*)?|\/login|\/signup|\/pricing)\/?$/.exec(path);
  if (!m || !isLocale(m[1])) {
    // `/en/<board>/…`: a board with a language prefix someone guessed or shared; the board in that language.
    const b = /^\/([a-z]{2})(\/([^/]+)(?:\/.*)?)$/.exec(path);
    if (b && isLocale(b[1]) && b[1] !== DEFAULT_LOCALE && !LANDING_PAGES.has(b[3]!)) {
      const q = search.toString();
      return { to: `${b[2]}${q ? `?${q}` : ""}`, locale: b[1] };
    }
    return null;
  }
  const locale = m[1];
  const rest = m[2]!;
  if (rest === "/pricing") return { to: `${locale === DEFAULT_LOCALE ? "/" : `/${locale}`}#pricing`, locale: null };
  const q = search.toString();
  return { to: `${rest === "/login" || rest === "/signup" ? "/app/login" : rest}${q ? `?${q}` : ""}`, locale };
}

/** A console link from a landing page in `locale` (see localeRedirect). */
export const withLang = (href: string, locale: Locale) => `${href}${href.includes("?") ? "&" : "?"}hl=${locale}`;
