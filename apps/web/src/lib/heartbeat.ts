import { schema, withSystem, type Db } from "@ozvi/db";
import { and, eq, lt, sql } from "drizzle-orm";

/**
 * Heartbeat for an uptime monitor (GlitchTip "Heartbeat", Uptime Kuma "Push", healthchecks.io …): with
 * OZVI_HEARTBEAT_URL set, the job runner calls it every minute while the server is healthy. It stays
 * silent, so the monitor raises the alarm, when the database does not answer or queued e-mails are stuck
 * (the worker or SMTP is down). Sends nothing about the instance; off without the variable.
 */
export const heartbeatUrl = (env: Record<string, string | undefined> = process.env) => env.OZVI_HEARTBEAT_URL?.trim() || null;

/** E-mails that should have gone out over 15 minutes ago and are still queued. */
export async function stuckEmails(db: Db): Promise<number> {
  const [r] = await withSystem(db, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(schema.emails)
    .where(and(eq(schema.emails.status, "queued"), lt(schema.emails.sendAfter, new Date(Date.now() - 15 * 60_000)))));
  return r?.n ?? 0;
}

export type HeartbeatResult = "off" | "stuck" | "sent" | "failed";

export async function heartbeatTick(db: Db, deps: { fetch?: typeof fetch; stuck?: (db: Db) => Promise<number>; url?: string | null } = {}): Promise<HeartbeatResult> {
  const url = deps.url === undefined ? heartbeatUrl() : deps.url;
  if (!url) return "off";
  // A database that does not answer throws here: no beat, and the job runner logs it.
  if ((await (deps.stuck ?? stuckEmails)(db)) > 0) return "stuck";
  try {
    const r = await (deps.fetch ?? fetch)(url, { method: "POST", signal: AbortSignal.timeout(10_000) });
    return r.ok ? "sent" : "failed";
  } catch {
    // The monitor being unreachable is not this server's error: no report, the missing beats speak for it.
    return "failed";
  }
}
