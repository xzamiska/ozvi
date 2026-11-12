import { randomBytes } from "node:crypto";
import { OZVI_VERSION } from "./version";

/**
 * Server errors to a Sentry-compatible collector (GlitchTip, Sentry) without an SDK: one HTTP POST per
 * event to the DSN's store endpoint. Off unless OZVI_ERROR_DSN is set (ozvi.io sets it; a self-hosted
 * server may point it at its own GlitchTip/Sentry). Only the error itself leaves the server: type,
 * message, stack, method and the path WITHOUT its query string (sign-in links carry tokens there).
 * Never headers, cookies, bodies or user data.
 */

interface Dsn { store: string; auth: string }

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !/^\d+$/.test(project)) return null;
    return {
      store: `${u.protocol}//${u.host}/api/${project}/store/`,
      auth: `Sentry sentry_version=7, sentry_client=ozvi/${OZVI_VERSION}, sentry_key=${u.username}`,
    };
  } catch { return null; }
}

/** Node stack lines → Sentry frames (oldest first). */
export function framesOf(stack: string | undefined) {
  const frames: { function?: string; filename: string; lineno?: number; colno?: number; in_app: boolean }[] = [];
  for (const line of (stack ?? "").split("\n").slice(1, 40)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) continue;
    const filename = m[2]!.replace(/^file:\/\//, "");
    frames.push({ function: m[1], filename, lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|node:internal/.test(filename) });
  }
  return frames.reverse();
}

/** The path without query or fragment (tokens live there), capped. */
export const safePath = (path: string | undefined) => (path ?? "").split(/[?#]/)[0]!.slice(0, 300);

// At most 30 events a minute per process: an error in a loop must not flood the collector.
let windowStart = 0, sent = 0;

export async function reportError(err: unknown, ctx: { path?: string; method?: string; route?: string; kind?: string; job?: string } = {}, env = process.env): Promise<boolean> {
  const dsn = parseDsn(env.OZVI_ERROR_DSN);
  if (!dsn) return false;
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; sent = 0; }
  if (++sent > 30) return false;
  const e = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  const event = {
    event_id: randomBytes(16).toString("hex"),
    timestamp: new Date(now).toISOString(),
    platform: "node",
    level: "error",
    release: `ozvi@${OZVI_VERSION}`,
    environment: env.OZVI_ERROR_ENV || (env.OZVI_MODE === "cloud" ? "cloud" : "self-host"),
    exception: { values: [{ type: e.name || "Error", value: e.message.slice(0, 2000), stacktrace: { frames: framesOf(e.stack) } }] },
    tags: Object.fromEntries(Object.entries({ route: ctx.route, kind: ctx.kind, job: ctx.job, method: ctx.method, digest }).filter(([, v]) => v)),
    ...(ctx.path && { request: { url: safePath(ctx.path), method: ctx.method } }),
    transaction: ctx.route ?? ctx.job,
  };
  try {
    const r = await fetch(dsn.store, {
      method: "POST", headers: { "content-type": "application/json", "x-sentry-auth": dsn.auth },
      body: JSON.stringify(event), signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}
