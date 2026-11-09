import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { primaryHost, slugForHost } from "@/lib/domains";
import { hostOrigin } from "@/lib/email/url";

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

export async function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  // Single-label names (container names like "ozvi") and IPs are internal traffic: no host routing.
  if (!host || host === primaryHost() || !host.includes(".") || isIP(host)) return next(req);

  const slug = await slugForHost(host);
  if (!slug) return new NextResponse("Neznáma doména.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const path = req.nextUrl.pathname;
  if (path === "/") return NextResponse.redirect(new URL(`/${slug}/ideas`, hostOrigin(host)));
  if (path === `/${slug}` || path.startsWith(`/${slug}/`) || SHARED.has(path) || WIDGET_FILE.test(path) || path.startsWith("/fonts/") || path.startsWith("/_next/") || path.startsWith(`/.well-known/oauth-`)) {
    return next(req);
  }
  return new NextResponse("Nenájdené.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
