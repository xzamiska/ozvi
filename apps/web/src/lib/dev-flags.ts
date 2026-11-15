/**
 * Simulations for local cloud testing (OZVI_DEV_BILLING, OZVI_DEV_DNS). In development they follow the flag.
 * A production build (`next start`, e.g. the e2e server) may use them too, but only while PUBLIC_URL points at
 * a local dev host, so a real deployment can never switch payments or DNS checks off by setting the flag.
 */
export function isLocalDevHost(publicUrl: string | undefined): boolean {
  if (!publicUrl) return false;
  let host: string;
  try { host = new URL(publicUrl).hostname.toLowerCase().replace(/\.$/, ""); } catch { return false; }
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]";
}

export function devSimulation(flag: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (flag !== "1") return false;
  if (env.NODE_ENV !== "production") return true;
  return isLocalDevHost(env.PUBLIC_URL);
}
