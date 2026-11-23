import { isIP } from "node:net";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { pageviewFor, sendPageview } from "@/lib/analytics";
import { primaryHost, slugForHost } from "@/lib/domains";
import { hostOrigin } from "@/lib/email/url";
import { indexable, NOINDEX } from "@/lib/indexing";
import { warnIfNoProxy } from "@/lib/client-ip";
import { localeRedirect } from "@/i18n/locale-route";
import { LOCALE_COOKIE } from "@/i18n/locales";
import { LOCALE_MAX_AGE } from "@/lib/storage-keys";
import { LAST_WORKSPACE_COOKIE, LAST_WORKSPACE_MAX_AGE, workspaceInPath } from "@/lib/last-workspace";

/**
 * Host routing. The primary host (PUBLIC_URL) serves everything. A project's custom domain or
 * cloud subdomain serves only that project: "/" → its ideas, other projects → 404.
 */

const SHARED = new Set(["/favicon.ico", "/api/health", "/robots.txt"]);
/** widget.js and its lazy chunks (widget-shot, -annotate, -ideas, -embeds, language packs). */
const WIDGET_FILE = /^\/widget(-[a-z0-9]+)*\.js$/;

/** Pass the path on so the root layout can pick <html lang> (landing locales live in the path). */
function next(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-ozvi-path", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

/** Every response except Ozvi's own public pages carries noindex (ADR-0010). */
export async function proxy(req: NextRequest, event: NextFetchEvent) {
  const res = await route(req);
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const pub = indexable({ cloud: process.env.OZVI_MODE === "cloud", primary: host === primaryHost(), path: req.nextUrl.pathname });
  if (!pub) res.headers.set("X-Robots-Tag", NOINDEX);
  // Ozvi's own public pages only (lib/analytics): counted server-side, never boards, console or widget.
  else if (res.status < 400) {
    const pv = pageviewFor(req, host);
    if (pv) event.waitUntil(sendPageview(pv));
  }
  return res;
}

async function route(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  // Single-label names (container names like "ozvi") and IPs are internal traffic: no host routing.
  const internal = !host || !host.includes(".") || isIP(host);
  // Public traffic in production should come through the proxy, which adds X-Forwarded-For.
  if (!internal && process.env.NODE_ENV === "production" && !host.endsWith("localhost")) warnIfNoProxy(req.headers);
  if (internal || host === primaryHost()) {
    // The landing's language carries on into sign-up and the console (i18n/locale-route.ts).
    const lr = localeRedirect(req.nextUrl.pathname, req.nextUrl.searchParams);
    if (lr) {
      const res = NextResponse.redirect(new URL(lr.to, req.url));
      if (lr.locale) res.cookies.set(LOCALE_COOKIE, lr.locale, { path: "/", maxAge: LOCALE_MAX_AGE, sameSite: "lax" });
      return res;
    }
    const res = next(req);
    // /app returns to the workspace open last (lib/last-workspace.ts). Set here, with the page itself, so even
    // leaving at once (or a navigation inside the console) is remembered.
    const ws = workspaceInPath(req.nextUrl.pathname);
    if (ws && req.cookies.get(LAST_WORKSPACE_COOKIE)?.value !== ws) {
      res.cookies.set(LAST_WORKSPACE_COOKIE, ws, { path: "/app", maxAge: LAST_WORKSPACE_MAX_AGE, sameSite: "lax", httpOnly: true });
    }
    return res;
  }

  const slug = await slugForHost(host);
  if (!slug) return new NextResponse("Neznáma doména.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const path = req.nextUrl.pathname;
  if (path === "/") return NextResponse.redirect(new URL(`/${slug}`, hostOrigin(host)));
  // Browsers ask a board's domain for /favicon.ico: the board's icon, not Ozvi's.
  if (path === "/favicon.ico") return NextResponse.rewrite(new URL(`/${slug}/favicon`, req.url));
  // A board that moved from Fider keeps its old domain: Fider post links (/posts/<n>/<slug>) find the item.
  if (/^\/posts\/\d+(\/|$)/.test(path)) return NextResponse.rewrite(new URL(`/${slug}${path}`, req.url));
  if (path === `/${slug}` || path.startsWith(`/${slug}/`) || SHARED.has(path) || WIDGET_FILE.test(path) || path.startsWith("/fonts/") || path.startsWith("/_next/") || path.startsWith(`/.well-known/oauth-`)) {
    return next(req);
  }
  return new NextResponse("Nenájdené.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

// Dev's hot-reload socket (/_next/webpack-hmr) must not go through the proxy: rewriting its upgrade broke the
// socket, which reconnected and reloaded the page every second in local dev.
export const config = { matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr).*)"] };
