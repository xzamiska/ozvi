import { createHash } from "node:crypto";

/**
 * Idempotency-Key for POSTs that create something (draft-ietf-httpapi-idempotency-key-header):
 * the first response is kept for 24 hours per token and key and replayed for a retry with the same
 * request; the same key with a different request is an error, and so is a retry while the first one runs.
 *
 * In memory, like lib/ratelimit: enough for one process (self-host, our single cloud VM). Several
 * replicas would need a table (api_idempotency: token_id, key, fingerprint, status, body, expires_at).
 */

export interface Stored { status: number; body: string; headers: Record<string, string> }
type Entry = { fingerprint: string; expires: number; result: Stored | null };

const TTL_MS = 24 * 3600_000;
const MAX = 20_000;
const store = new Map<string, Entry>();

export const KEY_RE = /^[\x21-\x7e]{1,255}$/;

export const fingerprint = (method: string, path: string, body: string) =>
  createHash("sha256").update(`${method} ${path}\n${body}`).digest("hex");

export type Claim =
  | { kind: "new" }
  | { kind: "replay"; result: Stored }
  | { kind: "mismatch" }
  | { kind: "in_progress" };

export function claim(scope: string, key: string, fp: string, now = Date.now()): Claim {
  const k = `${scope}:${key}`;
  const e = store.get(k);
  if (e && e.expires > now) {
    if (e.fingerprint !== fp) return { kind: "mismatch" };
    return e.result ? { kind: "replay", result: e.result } : { kind: "in_progress" };
  }
  if (store.size >= MAX) for (const [key2, v] of store) if (v.expires <= now) store.delete(key2);
  store.set(k, { fingerprint: fp, expires: now + TTL_MS, result: null });
  return { kind: "new" };
}

/** Keep a finished response. Server errors and 429s are not kept: the client may retry them with the same key. */
export function settle(scope: string, key: string, result: Stored) {
  const k = `${scope}:${key}`;
  const e = store.get(k);
  if (!e) return;
  if (result.status >= 500 || result.status === 429) store.delete(k);
  else e.result = result;
}

export function release(scope: string, key: string) {
  store.delete(`${scope}:${key}`);
}
