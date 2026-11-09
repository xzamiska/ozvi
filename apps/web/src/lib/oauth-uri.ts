/** Pure URI rules shared by the OAuth endpoints (no DB, so they're cheap to test). */

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** Redirect URIs: https, or http on loopback (native apps); never fragments. Matched exactly later. */
export function validRedirectUri(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.hash || u.includes("#") || url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOOPBACK.includes(url.hostname);
  } catch { return false; }
}

/** The MCP resource a project's tokens are for (RFC 8707 / RFC 9728 `resource`). */
export const mcpResource = (origin: string, slug: string) => `${origin}/${slug}/mcp`;

/**
 * RFC 8707 audience check: tokens are bound to one project's MCP server, so a `resource`
 * parameter must name it (or a parent of it on the same origin, which some clients send).
 * Scheme/host case and a trailing slash are tolerated, as the MCP spec asks.
 */
export function resourceMatches(resource: string | null | undefined, origin: string, slug: string): boolean {
  if (resource === null || resource === undefined) return true;
  let u: URL;
  try { u = new URL(resource); } catch { return false; }
  if (u.hash || u.search || u.username || u.password) return false;
  let want: URL;
  try { want = new URL(mcpResource(origin, slug)); } catch { return false; }
  if (u.origin !== want.origin) return false;
  const path = u.pathname.replace(/\/+$/, "");
  return path === "" || path === `/${slug}` || path === `/${slug}/mcp`;
}
