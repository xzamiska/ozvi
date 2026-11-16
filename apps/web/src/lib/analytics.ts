import type { NextRequest } from "next/server";
import { clientIp } from "./client-ip";

/**
 * Visits of Ozvi's own public pages (landing, docs, releases, legal) counted in Umami from the server,
 * from what the browser sends anyway: the path, the campaign tags of the link (utm_*, nothing else from
 * the query), the referring site, the language and the user agent. No script runs on the page and
 * nothing is read from or stored on the device, so there is nothing to consent to and the "no cookies"
 * promise holds. Boards, the console pages, the widget and the API are never counted as visits.
 * Do-not-track and Global Privacy Control are honoured; obvious bots are skipped.
 *
 * A few named steps in the console (sign-up, project, checkout) are sent as anonymous events with no
 * address, name or id in them (trackEvent), so the funnel from visit to customer can be measured.
 *
 * OZVI_UMAMI_URL (the Umami server, e.g. http://umami.internal:3000) and OZVI_UMAMI_WEBSITE_ID; unset = off.
 */

/** Campaign tags kept from the query; every other parameter (e-mails, tokens, ids) is dropped. */
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
/** Crawlers, link previews, monitors and scripts: not people. Browsers also always send accept-language. */
const BOT = /bot|crawl|spider|slurp|scrap|headless|lighthouse|preview|facebookexternalhit|embedly|fetch|curl|wget|python|java\/|go-http|httpclient|okhttp|axios|node-fetch|monitor|uptime|pingdom/i;

/**
 * Set on sign-in to the console (path "/"): the team's own visits to the landing are not marketing
 * traffic, and the console's own session cookie is scoped to /app, so the landing could not tell otherwise.
 */
export const NO_STATS_COOKIE = "ozvi_nostats";
export const noStatsCookie = { name: NO_STATS_COOKIE, value: "1", path: "/", maxAge: 365 * 86_400, sameSite: "lax" as const, httpOnly: true };

export type AnalyticsEvent = "signup_started" | "account_created" | "project_created" | "checkout_started";

type Send = { url: string; body: string; headers: Record<string, string> };

/** Whose browser this is, if it may be counted at all: null for do-not-track, GPC, bots or no config. */
function visitor(h: Headers, env: NodeJS.ProcessEnv) {
  const base = env.OZVI_UMAMI_URL?.trim().replace(/\/$/, "");
  const website = env.OZVI_UMAMI_WEBSITE_ID?.trim();
  if (!base || !website) return null;
  if (h.get("dnt") === "1" || h.get("sec-gpc") === "1") return null;
  const ua = h.get("user-agent") ?? "";
  const language = (h.get("accept-language") ?? "").split(",")[0]?.trim().slice(0, 35) ?? "";
  if (!ua || !language || BOT.test(ua)) return null;
  return { base, website, language, headers: { "content-type": "application/json", "user-agent": ua, "x-forwarded-for": clientIp(h) ?? "" } };
}

/** The path plus its utm_* tags (values trimmed), nothing else from the query. */
export function trackedUrl(u: URL): string {
  const keep = new URLSearchParams();
  for (const k of UTM) {
    const v = u.searchParams.get(k)?.trim();
    if (v) keep.set(k, v.slice(0, 100));
  }
  const q = keep.toString();
  return q ? `${u.pathname}?${q}` : u.pathname;
}

export function pageviewFor(req: NextRequest, host: string, env = process.env): Send | null {
  if (req.method !== "GET") return null;
  if (req.cookies.has(NO_STATS_COOKIE)) return null;
  const h = req.headers;
  // Prefetches are not visits; a page load (HTML) or an in-app navigation (RSC) is.
  if (/prefetch/i.test(`${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""}`) || h.get("next-router-prefetch")) return null;
  const isPage = (h.get("accept") ?? "").includes("text/html") || h.get("rsc") === "1";
  if (!isPage) return null;
  const v = visitor(h, env);
  if (!v) return null;
  let referrer = "";
  try {
    const r = new URL(h.get("referer") ?? "");
    if (r.hostname !== host) referrer = `${r.protocol}//${r.host}${r.pathname}`;
  } catch { /* none */ }
  return {
    url: `${v.base}/api/send`,
    body: JSON.stringify({ type: "event", payload: { website: v.website, hostname: host, url: trackedUrl(req.nextUrl), referrer, language: v.language } }),
    headers: v.headers,
  };
}

/** A named step from a request's headers. `data` holds only plain labels (a plan name), never personal data. */
export function eventFor(name: AnalyticsEvent, h: Headers, host: string, data?: Record<string, string>, env = process.env): Send | null {
  const v = visitor(h, env);
  if (!v) return null;
  return {
    url: `${v.base}/api/send`,
    body: JSON.stringify({ type: "event", payload: { website: v.website, hostname: host, url: "/app", language: v.language, name, ...(data && { data }) } }),
    headers: v.headers,
  };
}

/** Sends it without holding the response; failures are ignored (analytics never breaks a page). */
export function sendPageview(p: Send): Promise<void> {
  return fetch(p.url, { method: "POST", headers: p.headers, body: p.body, signal: AbortSignal.timeout(2000) }).then(() => undefined, () => undefined);
}

/** For server actions: counts one named step of the current request (cloud only), never throws. */
export async function trackEvent(name: AnalyticsEvent, data?: Record<string, string>): Promise<void> {
  if (process.env.OZVI_MODE !== "cloud") return;
  try {
    const [{ headers }, { after }, { primaryHost }] = await Promise.all([import("next/headers"), import("next/server"), import("./domains")]);
    const e = eventFor(name, await headers(), primaryHost(), data);
    // Sent after the response, so a slow analytics server never delays sign-in or checkout.
    if (e) after(() => sendPageview(e));
  } catch { /* analytics never breaks an action */ }
}
