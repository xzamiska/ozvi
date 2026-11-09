/**
 * Client IP for rate limiting. The left part of X-Forwarded-For is whatever the client sent;
 * only the entries appended by our own proxies are trustworthy. OZVI_TRUSTED_PROXIES = how many
 * proxies sit in front of Ozvi (default 1: Caddy/Traefik). 0 = no proxy, ignore the header.
 */
export function clientIp(headers: Headers): string {
  const hops = Number(process.env.OZVI_TRUSTED_PROXIES ?? 1);
  if (!hops) return "direct";
  const list = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list[list.length - hops] ?? list[0] ?? "direct";
}
