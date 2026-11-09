export const publicUrl = () => (process.env.PUBLIC_URL ?? "http://localhost:3300").replace(/\/$/, "");

/**
 * Origin for absolute redirects in route handlers. Behind a reverse proxy the request URL is the
 * container's own (e.g. https://0.0.0.0:3000), so PUBLIC_URL wins whenever it is set.
 */
export function appOrigin(requestOrigin: string): string {
  const pub = process.env.PUBLIC_URL;
  if (pub) {
    try { return new URL(pub).origin; } catch { /* fall through */ }
  }
  return requestOrigin;
}

/**
 * Origin for another host of this instance (custom domain, cloud subdomain): scheme and port come
 * from PUBLIC_URL, so production gets https://<host> and local cloud dev http://<host>:3400.
 */
export function hostOrigin(host: string): string {
  try {
    const u = new URL(publicUrl());
    return `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}`;
  } catch { return `https://${host}`; }
}

type Domainish = { customDomain: string | null; customDomainVerifiedAt: Date | null };

/** Where a project lives publicly: its verified custom domain, else the instance's PUBLIC_URL. */
export function projectOrigin(p: Domainish): string {
  return p.customDomain && p.customDomainVerifiedAt ? hostOrigin(p.customDomain) : publicUrl();
}

/** Redirect origin for a request: stay on the project's custom domain if that is where the visitor is. */
export function requestOrigin(p: Domainish | null | undefined, req: { headers: Headers; nextUrl: { origin: string } }): string {
  const host = req.headers.get("host")?.toLowerCase().replace(/:\d+$/, "");
  if (p?.customDomain && p.customDomainVerifiedAt && host === p.customDomain) return hostOrigin(p.customDomain);
  return appOrigin(req.nextUrl.origin);
}
