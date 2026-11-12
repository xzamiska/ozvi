import { schema, withSystem, type Db } from "@ozvi/db";
import { and, eq, lt } from "drizzle-orm";
import { pruneLogins } from "./email-login";
import { teamDigests } from "./digest";
import { importTick } from "./import/engine";
import { retentionTick } from "./retention";
import { embedPending } from "./similar";
import { pivotPending } from "./translate";
import { usageAlertsTick } from "./usage-alerts";
import { expireManualPlans } from "./manual-plans";
import { telemetryTick } from "./telemetry";
import { reportError } from "./error-report";
import { webhookTick } from "./webhooks";
import { trackerTick } from "./tracker-sync";
import { jiraPollTick } from "./jira";

/** Background jobs next to the e-mail worker: webhook deliveries every 5 s, embeddings every 30 s. */
export function startJobs(db: Db) {
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    let running = false;
    const t = setInterval(async () => {
      if (running) return;
      running = true;
      try { await fn(); } catch (e) { console.error(`[ozvi] ${name}`, e); void reportError(e, { job: name }); } finally { running = false; }
    }, ms);
    t.unref?.();
    return () => clearInterval(t);
  };
  const once = (ms: number, name: string, fn: () => Promise<unknown>) => {
    const t = setTimeout(() => { fn().catch((e) => { console.error(`[ozvi] ${name}`, e); void reportError(e, { job: name }); }); }, ms);
    t.unref?.();
    return () => clearTimeout(t);
  };
  const stops = [
    every(5_000, "webhooks", () => webhookTick(db)),
    // Linear/Jira: Ozvi status moves and mirrored comments; Jira polling for sites without an admin webhook.
    every(5_000, "trackers", () => trackerTick(db)),
    every(60_000, "jira poll", () => jiraPollTick(db)),
    // Imports (Canny, CSV): queued runs, one at a time; started right away by the action, this picks up the rest.
    every(3_000, "imports", () => importTick(db)),
    every(30_000, "embeddings", () => embedPending(db)),
    // English title pivots for cross-language duplicate search (boards with post translation and AI).
    every(60_000, "translation pivots", () => pivotPending(db)),
    every(15 * 60_000, "team digest", () => teamDigests(db)),
    every(3_600_000, "usage alerts", () => usageAlertsTick(db)),
    every(3_600_000, "manual plans", () => expireManualPlans(db)),
    every(86_400_000, "telemetry", () => telemetryTick(db)),
    // The first report soon after start: a server restarted every night would otherwise never send one.
    once(10 * 60_000, "telemetry", () => telemetryTick(db)),
    // Retention (admin → Dáta): once a night per project, 02:00–06:00 Central European time.
    every(30 * 60_000, "retention", () => retentionTick(db)),
    // Sign-in codes and OAuth codes are short-lived; keep a day for debugging, then drop.
    every(3_600_000, "cleanup", async () => {
      await pruneLogins(db);
      await withSystem(db, (tx) => tx.delete(schema.oauthCodes).where(lt(schema.oauthCodes.expiresAt, new Date(Date.now() - 86_400_000))));
      // A release draft whose AI rewrite never finished (restart mid-call) keeps its template text.
      await withSystem(db, (tx) => tx.update(schema.changelogEntries).set({ aiPending: false })
        .where(and(eq(schema.changelogEntries.aiPending, true), lt(schema.changelogEntries.createdAt, new Date(Date.now() - 15 * 60_000)))));
    }),
  ];
  return () => stops.forEach((s) => s());
}
