import { createHmac } from "node:crypto";
import { resolve4, resolve6, resolveCname, resolveTxt } from "node:dns/promises";
import { PLAN_LIMITS, schema, type PlanName } from "@ozvi/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";

/**
 * Custom domains (feedback.billiwo.com) and cloud subdomains (<slug>.ozvi.io).
 * The reverse proxy (Caddy on-demand TLS) asks /api/domains/ask before issuing a certificate,
 * so only verified domains ever get one. Routing happens in src/proxy.ts.
 */

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const primaryHost = () => {
  try { return new URL(process.env.PUBLIC_URL ?? "http://localhost:3300").hostname.toLowerCase(); } catch { return "localhost"; }
};
/** Cloud: projects also answer at <slug>.<OZVI_CLOUD_DOMAIN>. */
export const cloudDomain = () => process.env.OZVI_CLOUD_DOMAIN?.toLowerCase().replace(/^\.+|\.+$/g, "") || null;
/** What customers point their CNAME at; defaults to the primary host. */
export const cnameTarget = () => process.env.OZVI_CNAME_TARGET?.toLowerCase() || primaryHost();

export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  if (!HOST.test(d)) return null;
  const cloud = cloudDomain();
  if (d === primaryHost() || (cloud && (d === cloud || d.endsWith(`.${cloud}`)))) return null;
  return d;
}

/** DNS must point at us: a CNAME to the target, or the same A/AAAA addresses as the target. */
/** Local cloud testing (docs/CLOUD-LOKALNE.md): DNS checks pass; the domain goes into /etc/hosts. Never in production. */
export const fakeDns = () => process.env.OZVI_DEV_DNS === "1" && process.env.NODE_ENV !== "production";

export async function dnsPointsHere(domain: string): Promise<boolean> {
  if (fakeDns()) return true;
  const target = cnameTarget();
  try {
    const cname = await resolveCname(domain);
    if (cname.some((c) => c.toLowerCase().replace(/\.$/, "") === target)) return true;
  } catch { /* no CNAME: compare addresses */ }
  const addrs = async (h: string) => [...(await resolve4(h).catch(() => [])), ...(await resolve6(h).catch(() => []))];
  const [mine, theirs] = await Promise.all([addrs(target), addrs(domain)]);
  return theirs.length > 0 && theirs.every((a) => mine.includes(a));
}

/**
 * Ownership proof: TXT _ozvi.<domain> = this value. Pointing DNS at us is not enough — anyone could
 * otherwise claim a domain someone else already aimed at Ozvi.
 */
export function domainToken(projectId: string, domain: string): string {
  const key = process.env.OZVI_SESSION_SECRET ?? "";
  return `ozvi-verify=${createHmac("sha256", key).update(`domain:${projectId}:${domain}`).digest("base64url").slice(0, 32)}`;
}

export async function ownsDomain(projectId: string, domain: string): Promise<boolean> {
  if (fakeDns()) return true;
  try {
    const records = await resolveTxt(`_ozvi.${domain}`);
    return records.some((chunks) => chunks.join("") === domainToken(projectId, domain));
  } catch { return false; }
}

/* host → project slug, cached briefly (the proxy runs this on every request to a non-primary host). */
const cache = new Map<string, { at: number; slug: string | null }>();

export async function slugForHost(host: string): Promise<string | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.slug;
  let slug: string | null = null;
  const cloud = cloudDomain();
  if (cloud && host.endsWith(`.${cloud}`)) {
    const sub = host.slice(0, -cloud.length - 1);
    if (/^[a-z0-9][a-z0-9-]{1,40}$/.test(sub)) {
      const p = await db.query.projects.findFirst({ where: eq(schema.projects.slug, sub), columns: { slug: true } });
      slug = p?.slug ?? null;
    }
  } else {
    // Custom domains need a plan that includes them (a lapsed Pro keeps its subdomain/path URL).
    const [p] = await db.select({ slug: schema.projects.slug, plan: schema.workspaces.plan }).from(schema.projects)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.projects.workspaceId))
      .where(and(eq(schema.projects.customDomain, host), isNotNull(schema.projects.customDomainVerifiedAt)));
    slug = p && PLAN_LIMITS[p.plan as PlanName].customDomain ? p.slug : null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(host, { at: Date.now(), slug });
  return slug;
}

export const forgetHost = (host: string) => cache.delete(host);
