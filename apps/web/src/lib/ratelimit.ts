import { translator } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";

/**
 * In-memory sliding-window limiter. Enough for one process (self-host, our single cloud VM);
 * swap for a Postgres-backed one if we ever run several replicas.
 */
const hits = new Map<string, number[]>();

export const LIMITS = {
  item: { max: 10, windowMs: 60 * 60_000 },
  comment: { max: 30, windowMs: 60 * 60_000 },
  /** Short bursts (scripts, copy-paste floods) on top of the hourly limits. */
  itemBurst: { max: 4, windowMs: 2 * 60_000 },
  commentBurst: { max: 6, windowMs: 60_000 },
  /** Edits and deletions of own posts and comments; moderation by the team. */
  edit: { max: 60, windowMs: 60 * 60_000 },
  vote: { max: 120, windowMs: 60 * 60_000 },
  widgetIp: { max: 30, windowMs: 60 * 60_000 },
  mcpIp: { max: 600, windowMs: 10 * 60_000 },
  mcp: { max: 300, windowMs: 10 * 60_000 },
  ai: { max: 30, windowMs: 60 * 60_000 },
  /** Post translations per viewer (signed-in user or IP); only cache misses count. */
  translate: { max: 60, windowMs: 60 * 60_000 },
  /** English pivots of typed idea titles (cross-language "similar ideas"), per viewer. */
  pivot: { max: 40, windowMs: 60 * 60_000 },
  loginIp: { max: 20, windowMs: 60 * 60_000 },
  loginVerifyIp: { max: 40, windowMs: 60 * 60_000 },
  signup: { max: 5, windowMs: 60 * 60_000 },
  cimd: { max: 30, windowMs: 10 * 60_000 },
  invite: { max: 20, windowMs: 60 * 60_000 },
  /** Opt-in statistics from self-hosted servers: one a day is normal, a few per IP is plenty. */
  telemetryIp: { max: 10, windowMs: 60 * 60_000 },
  /** Team CSV exports (each one reads the whole filtered list). */
  export: { max: 60, windowMs: 10 * 60_000 },
  /** Import previews and starts (parsing files, calling Canny). */
  import: { max: 60, windowMs: 10 * 60_000 },
  /** Linear/Jira calls on behalf of the team (connect, test, create/link issues). */
  tracker: { max: 30, windowMs: 60_000 },
  /** Public REST API: per token, and per client IP before a token is known (bad or missing tokens). */
  api: { max: 600, windowMs: 10 * 60_000 },
  apiIp: { max: 1200, windowMs: 10 * 60_000 },
} as const;

export function allow(kind: keyof typeof LIMITS, key: string, now = Date.now()): boolean {
  return take(kind, key, now).ok;
}

/** What a limiter call tells an API client (RateLimit-* headers): the cap, what is left, seconds until a slot frees up. */
export interface RateState { ok: boolean; limit: number; remaining: number; resetSeconds: number }

/** Like allow(), with the numbers for RateLimit-Limit / -Remaining / -Reset and Retry-After. */
export function take(kind: keyof typeof LIMITS, key: string, now = Date.now()): RateState {
  const { max, windowMs } = LIMITS[kind];
  const k = `${kind}:${key}`;
  const list = (hits.get(k) ?? []).filter((t) => t > now - windowMs);
  const reset = (l: number[]) => Math.max(1, Math.ceil(((l[0] ?? now) + windowMs - now) / 1000));
  if (list.length >= max) { hits.set(k, list); return { ok: false, limit: max, remaining: 0, resetSeconds: reset(list) }; }
  list.push(now);
  hits.set(k, list);
  if (hits.size > 50_000) for (const [key2, v] of hits) if (!v.some((t) => t > now - 3600_000)) hits.delete(key2);
  return { ok: true, limit: max, remaining: max - list.length, resetSeconds: reset(list) };
}

export class RateLimitError extends Error {
  constructor(locale: Locale = "sk") { super(translator(locale, "errors")("rateLimit")); }
}
