import { COMPARE_PATHS } from "./compare";

/**
 * Search engines: only Ozvi's own public pages in the cloud (landing, docs, legal, releases) on the
 * primary host may be indexed. Boards never are, on any host, in any mode, and there is no setting
 * for it: they hold a customer's users' feedback (ADR-0010).
 */

export const NOINDEX = "noindex, nofollow, noarchive, nosnippet";

const PUBLIC_PAGES = new Set(["/", "/cs", "/en", "/pl", "/hu", "/de", "/releases", "/privacy", "/terms", "/dpa", "/subprocessors", "/accessibility", "/docs", "/demo", "/cs/demo", "/en/demo", "/pl/demo", "/hu/demo", "/de/demo", ...COMPARE_PATHS]);

export function indexable(o: { cloud: boolean; primary: boolean; path: string }): boolean {
  if (!o.cloud || !o.primary) return false;
  const path = o.path.length > 1 ? o.path.replace(/\/+$/, "") : o.path;
  return PUBLIC_PAGES.has(path) || path.startsWith("/docs/");
}

/** Board hosts stay crawlable on purpose: a crawler has to fetch a page to see its noindex header. */
export function robotsTxt(o: { cloud: boolean; primary: boolean; origin?: string }): string {
  if (!o.cloud || !o.primary) return "User-agent: *\nDisallow:\n";
  // /demo itself is a public page (the widget in a sample app); the demo's board pages under it are not.
  return "User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /mcp\nDisallow: /dev/\nDisallow: /demo/\n"
    + (o.origin ? `\nSitemap: ${o.origin}/sitemap.xml\n` : "");
}

/** The public pages a search engine should know about (cloud, primary host). */
export const SITEMAP_PAGES = ["/demo", "/cs/demo", "/en/demo", "/pl/demo", "/hu/demo", "/de/demo", "/releases", "/docs/widget", "/docs/api", "/docs/webhooks", "/docs/automation", "/privacy", "/terms", "/dpa", "/subprocessors", "/accessibility"] as const;
