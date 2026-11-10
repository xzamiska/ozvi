import { safeFetch } from "./net";
import { sniff } from "./storage";

/**
 * A board's favicon: taken from the host app's website, uploaded by an admin, or (until then) a
 * letter in the board's accent colour. Never Ozvi's own icon: a board looks like the host product.
 * The image is fetched once, checked by its bytes and stored (lib/storage); the board never links
 * to someone else's server.
 */

export const MAX_ICON_BYTES = 200 * 1024;
const MAX_HTML_BYTES = 512 * 1024;

/** The icon types we serve; anything else (or a renamed HTML page) is refused. */
export function iconType(b: Uint8Array): string | null {
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "image/x-icon";
  const t = sniff(b);
  if (t === "image/png" || t === "image/jpeg" || t === "image/gif" || t === "image/webp") return t;
  if (t === "text/plain") {
    const head = new TextDecoder().decode(b.subarray(0, 2048)).replace(/<!--[\s\S]*?-->/g, "").trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  }
  return null;
}

export interface IconCandidate { href: string; score: number }

/** <link rel="icon" …> candidates from a page, best first: SVG, then the largest PNG, apple-touch-icon, then the rest. */
export function iconLinks(html: string, base: string): IconCandidate[] {
  const out: IconCandidate[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((v) => v !== undefined) ?? null;
    const rel = (attr("rel") ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon") && !rel.includes("apple-touch-icon-precomposed")) continue;
    const href = attr("href");
    if (!href || href.startsWith("data:")) continue;
    let url: string;
    try { url = new URL(href, base).toString(); } catch { continue; }
    if (!/^https?:/.test(url)) continue;
    const type = (attr("type") ?? "").toLowerCase();
    const size = Math.max(0, ...(attr("sizes") ?? "").split(/\s+/).map((s) => Number(s.split("x")[0]) || 0));
    const svg = type === "image/svg+xml" || /\.svg(\?|$)/i.test(url) || (attr("sizes") ?? "") === "any";
    const score = svg ? 1000 : rel.includes("icon") ? 100 + Math.min(size, 512) : 90 + Math.min(size, 180) / 10;
    out.push({ href: url, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** GET with redirects followed by hand (safeFetch never follows them), at most 3 hops, body capped. */
async function get(url: string, cap: number, accept: string): Promise<{ url: string; body: Uint8Array } | null> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    const r = await safeFetch(at, { headers: { accept, "user-agent": "Ozvi favicon fetch (+https://ozvi.io)" }, signal: AbortSignal.timeout(8000) });
    if (r.status >= 300 && r.status < 400) {
      const next = r.headers.get("location");
      if (!next) return null;
      at = new URL(next, at).toString();
      continue;
    }
    if (!r.ok || !r.body) return null;
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > cap) return null;
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > cap) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { body.set(c, o); o += c.length; }
    return { url: at, body };
  }
  return null;
}

/** The host app's icon: its page's <link rel="icon">s, then /favicon.ico. Null when none is usable. */
export async function fetchSiteIcon(site: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const page = await get(site, MAX_HTML_BYTES, "text/html").catch(() => null);
  const base = page?.url ?? site;
  const candidates = page ? iconLinks(new TextDecoder().decode(page.body), base) : [];
  candidates.push({ href: new URL("/favicon.ico", base).toString(), score: 0 });
  const tried = new Set<string>();
  for (const c of candidates) {
    if (tried.has(c.href)) continue;
    tried.add(c.href);
    const icon = await get(c.href, MAX_ICON_BYTES, "image/*").catch(() => null);
    const type = icon && iconType(icon.body);
    if (icon && type) return { bytes: icon.body, type };
  }
  return null;
}

/** The host app's address, as the admin set it: the login URL's site, else the first allowed origin. */
export function appSite(p: { loginUrl: string | null; allowedOrigins: string[] }): string | null {
  for (const u of [p.loginUrl, ...p.allowedOrigins]) {
    if (!u) continue;
    try { return new URL(u).origin + "/"; } catch { /* next */ }
  }
  return null;
}

/** Until a board has an icon: its first letter, white on the accent colour. */
export function letterIcon(name: string, accent: string, onAccent: string): string {
  const letter = (name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "?").toUpperCase().replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/>`
    + `<text x="32" y="44" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="36" font-weight="700" fill="${onAccent}">${letter}</text></svg>`;
}
