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

let warned = false;
/**
 * Logs once when a public request arrives without X-Forwarded-For although Ozvi trusts a proxy:
 * then nothing is in front of Ozvi, clients can spoof the header and slip past the IP rate limits
 * (set OZVI_TRUSTED_PROXIES=0, or put the proxy back). Internal traffic (health checks) is not counted.
 */
export function warnIfNoProxy(headers: Headers, env: Record<string, string | undefined> = process.env, log: (m: string) => void = console.warn): boolean {
  if (warned || Number(env.OZVI_TRUSTED_PROXIES ?? 1) === 0 || headers.get("x-forwarded-for")) return false;
  warned = true;
  log("[ozvi] A request arrived without X-Forwarded-For, but OZVI_TRUSTED_PROXIES expects a proxy in front of Ozvi. "
    + "Without a proxy, clients can fake their IP and bypass rate limits: set OZVI_TRUSTED_PROXIES=0 (see docs/SELFHOST.md).");
  return true;
}
export const resetProxyWarning = () => { warned = false; };
