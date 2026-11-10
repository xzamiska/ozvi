/**
 * Search engines: only Ozvi's own public pages in the cloud (landing, docs, legal, releases) on the
 * primary host may be indexed. Boards never are, on any host, in any mode, and there is no setting
 * for it: they hold a customer's users' feedback (ADR-0010).
 */

export const NOINDEX = "noindex, nofollow, noarchive, nosnippet";

const PUBLIC_PAGES = new Set(["/", "/cs", "/en", "/pl", "/hu", "/de", "/releases", "/privacy", "/terms", "/subprocessors", "/accessibility", "/docs"]);

export function indexable(o: { cloud: boolean; primary: boolean; path: string }): boolean {
  if (!o.cloud || !o.primary) return false;
  const path = o.path.length > 1 ? o.path.replace(/\/+$/, "") : o.path;
  return PUBLIC_PAGES.has(path) || path.startsWith("/docs/");
}

/** Board hosts stay crawlable on purpose: a crawler has to fetch a page to see its noindex header. */
export function robotsTxt(o: { cloud: boolean; primary: boolean }): string {
  if (!o.cloud || !o.primary) return "User-agent: *\nDisallow:\n";
  return "User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /mcp\nDisallow: /dev/\nDisallow: /demo\n";
}
