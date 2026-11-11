import type { NextRequest } from "next/server";
import { clientIp } from "./client-ip";

/**
 * Visits of Ozvi's own public pages (landing, docs, releases, legal) counted in Umami from the server,
 * from what the browser sends anyway: the path without its query, the referring site, the language
 * and the user agent. No script runs on the page and nothing is read from or stored on the device,
 * so there is nothing to consent to and the "no cookies" promise holds. Boards, the console, the
 * widget and the API are never counted. Do-not-track and Global Privacy Control are honoured.
 *
 * OZVI_UMAMI_URL (the Umami server, e.g. http://umami.internal:3000) and OZVI_UMAMI_WEBSITE_ID; unset = off.
 */
export function pageviewFor(req: NextRequest, host: string, env = process.env): { url: string; body: string; headers: Record<string, string> } | null {
  const base = env.OZVI_UMAMI_URL?.trim().replace(/\/$/, "");
  const website = env.OZVI_UMAMI_WEBSITE_ID?.trim();
  if (!base || !website || req.method !== "GET") return null;
  const h = req.headers;
  if (h.get("dnt") === "1" || h.get("sec-gpc") === "1") return null;
  // Prefetches are not visits; a page load (HTML) or an in-app navigation (RSC) is.
  if (/prefetch/i.test(`${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""}`) || h.get("next-router-prefetch")) return null;
  const isPage = (h.get("accept") ?? "").includes("text/html") || h.get("rsc") === "1";
  if (!isPage) return null;
  let referrer = "";
  try {
    const r = new URL(h.get("referer") ?? "");
    if (r.hostname !== host) referrer = `${r.protocol}//${r.host}${r.pathname}`;
  } catch { /* none */ }
  const language = (h.get("accept-language") ?? "").split(",")[0]?.trim().slice(0, 35) ?? "";
  const ua = h.get("user-agent") ?? "";
  if (!ua) return null;
  return {
    url: `${base}/api/send`,
    body: JSON.stringify({ type: "event", payload: { website, hostname: host, url: req.nextUrl.pathname, referrer, language } }),
    headers: { "content-type": "application/json", "user-agent": ua, "x-forwarded-for": clientIp(h) ?? "" },
  };
}

/** Sends it without holding the response; failures are ignored (analytics never breaks a page). */
export function sendPageview(p: NonNullable<ReturnType<typeof pageviewFor>>): Promise<void> {
  return fetch(p.url, { method: "POST", headers: p.headers, body: p.body, signal: AbortSignal.timeout(2000) }).then(() => undefined, () => undefined);
}
