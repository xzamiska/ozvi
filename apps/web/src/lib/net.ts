import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";

/**
 * Outbound HTTP to addresses chosen by project admins (webhooks, OIDC issuers).
 * Cloud: internal targets are refused, and the check runs inside the connection's DNS lookup, so
 * a hostname cannot pass the check and then resolve to 127.0.0.1 (DNS rebinding). Redirects are
 * never followed. Self-host: your own LAN is a legitimate target (Mattermost, Keycloak…).
 */

const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
  [0xe0000000, 4], [0xf0000000, 4],
];

function v4ToInt(ip: string) {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = v4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => (n & (~0 << (32 - bits)) >>> 0) >>> 0 === base);
  }
  const h = expandV6(ip);
  if (!h) return true; // not an address we can read: refuse
  const v4 = (a: number, b: number) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  const zero = (n: number) => h.slice(0, n).every((x) => x === 0);
  if (zero(5) && h[5] === 0xffff) return isPrivateAddress(v4(h[6]!, h[7]!)); // ::ffff:a.b.c.d, also written ::ffff:7f00:1
  if (zero(6)) return h[6] === 0 && h[7]! <= 1 ? true : isPrivateAddress(v4(h[6]!, h[7]!)); // ::, ::1, ::a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b) return true; // NAT64
  if (h[0] === 0x2002) return isPrivateAddress(v4(h[1]!, h[2]!)); // 6to4
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo
  if (h[0] === 0x2001 && h[1] === 0xdb8) return true; // documentation
  return (h[0]! & 0xfe00) === 0xfc00 || (h[0]! & 0xffc0) === 0xfe80 || (h[0]! & 0xffc0) === 0xfec0 || (h[0]! & 0xff00) === 0xff00;
}

/** Eight 16-bit groups of an IPv6 address in any notation (::, embedded IPv4, zone id), or null. */
export function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    if (isIP(tail[1]!) !== 4) return null;
    const o = tail[1]!.split(".").map(Number);
    s = s.slice(0, -tail[1]!.length) + `${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const parts = s.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const rest = parts.length === 2 ? (parts[1] ? parts[1].split(":") : []) : [];
  const fill = parts.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (parts.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

export const isCloud = (mode = process.env.OZVI_MODE ?? "self") => mode === "cloud";

/** Static checks before saving an address. Returns an error message (in `locale`) or null. */
export function checkUrl(url: string, mode = process.env.OZVI_MODE ?? "self", locale: Locale = "sk"): string | null {
  const t = translator(locale, "net");
  let u: URL;
  try { u = new URL(url); } catch { return t("invalid"); }
  if (u.protocol !== "https:" && !(!isCloud(mode) && u.protocol === "http:")) return t("https");
  if (u.username || u.password) return t("creds");
  if (isCloud(mode)) {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && isPrivateAddress(host)) return t("internal");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || !host.includes(".")) return t("internal");
  }
  return null;
}

export class BlockedAddressError extends Error {}

/** DNS lookup for undici that refuses private addresses (cloud mode). */
export function guardedLookup(hostname: string, options: object, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return cb(new BlockedAddressError(translator("sk", "net")("internal")), []);
    }
    const all = (options as { all?: boolean }).all;
    return all ? cb(null, list) : cb(null, list[0]!.address, list[0]!.family);
  });
}

let guardedAgent: Agent | undefined;
const agent = () => (guardedAgent ??= new Agent({ connect: { lookup: guardedLookup as never } }));

/** fetch() for admin-chosen URLs: static check, no redirects, pinned-safe DNS in cloud. */
export async function safeFetch(url: string, init: RequestInit = {}, mode = process.env.OZVI_MODE ?? "self"): Promise<Response> {
  const bad = checkUrl(url, mode);
  if (bad) throw new BlockedAddressError(bad);
  const opts = { ...init, redirect: "manual" as const };
  if (!isCloud(mode)) return fetch(url, opts);
  return (await undiciFetch(url, { ...(opts as object), dispatcher: agent() } as never)) as unknown as Response;
}
