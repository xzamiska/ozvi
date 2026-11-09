import { schema, withProject, withSystem, type Db, type Tx } from "@ozvi/db";
import { and, eq, inArray, lt, lte, or } from "drizzle-orm";
import { getJira, jiraComment, jiraSetState } from "./jira";
import { getLinear, linearComment, linearSetState } from "./linear";
import { safeFetch } from "./net";
import type { Project } from "./project";
import type { ItemSource, Trust } from "./provenance";
import { commentAdf, commentParts, readSync, stateForBucket, statusBucket, type TrackerProvider } from "./trackers";

/**
 * Tracker outbox worker (Ozvi → Linear/Jira): claims queued tracker_syncs rows with a lease, sends each
 * inside its project's transaction, retries after 1, 4, 9, 16, 25 minutes, then gives up.
 */

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
const { trackerSyncs, itemLinks } = schema;
const BATCH = 10;
const MAX_ATTEMPTS = 6;
const LEASE_MS = 2 * 60_000;

export type SyncOutcome = "sent" | "skipped" | "disconnected";

/** One outbox row. Exported for tests (fake Linear/Jira servers via `f`). */
export async function sendTrackerSync(tx: Tx, project: Project, row: typeof trackerSyncs.$inferSelect, f?: { linear?: Fetch; jira?: Fetch }): Promise<SyncOutcome> {
  const link = await tx.query.itemLinks.findFirst({ where: eq(itemLinks.id, row.linkId) });
  if (!link) return "skipped";
  const provider = link.provider as TrackerProvider;
  const tracker = provider === "linear" ? await getLinear(tx) : provider === "jira" ? await getJira(tx) : null;
  if (!tracker) return "disconnected";
  const cfg = tracker.config;
  const payload = row.payload as Record<string, unknown>;

  if (row.kind === "status") {
    const bucket = statusBucket(String(payload.status ?? ""));
    if (!cfg.push || bucket === "none") return "skipped";
    const sync = readSync(link.sync);
    // Already there (it is where the change came from, or someone moved both sides): nothing to push.
    if (sync.stateId && cfg.mapping[sync.stateId] === bucket) return "skipped";
    const target = stateForBucket(cfg, bucket);
    if (!target) return "skipped";
    if (provider === "linear") {
      if (!link.externalId) return "skipped";
      await linearSetState(tracker.token, link.externalId, target.id, f?.linear);
    } else {
      const j = tracker as Awaited<ReturnType<typeof getJira>> & object;
      const ok = await jiraSetState({ site: j.config.site, email: j.config.email, token: j.token }, link.ref, target.id, f?.jira ?? safeFetch);
      if (!ok) throw new Error(`no Jira transition to “${target.name}”`);
    }
    await tx.update(itemLinks).set({
      sync: { ...sync, stateId: target.id, stateName: target.name, pushedStateId: target.id, pushedAt: new Date().toISOString() },
      state: bucket === "done" || bucket === "off" ? "closed" : "open",
    }).where(eq(itemLinks.id, link.id));
    return "sent";
  }

  if (row.kind === "comment") {
    const internal = payload.internal === true;
    if (cfg.comments === "off" || (internal && cfg.comments !== "all")) return "skipped";
    const c = commentParts(project, { body: String(payload.body ?? ""), trust: (payload.trust as Trust) ?? "anonymous", source: (payload.source as ItemSource) ?? "board", internal });
    if (provider === "linear") {
      if (!link.externalId) return "skipped";
      await linearComment(tracker.token, link.externalId, c.markdown, f?.linear);
    } else {
      const j = tracker as Awaited<ReturnType<typeof getJira>> & object;
      await jiraComment({ site: j.config.site, email: j.config.email, token: j.token }, link.ref, commentAdf(c.header, c.adfBody), f?.jira ?? safeFetch);
    }
    return "sent";
  }
  return "skipped";
}

let lastCleanup = 0;

export async function trackerTick(db: Db, f?: { linear?: Fetch; jira?: Fetch }) {
  const batch = await withSystem(db, async (tx) => {
    const rows = await tx.select({ s: trackerSyncs, p: schema.projects }).from(trackerSyncs)
      .innerJoin(schema.projects, eq(schema.projects.id, trackerSyncs.projectId))
      .where(and(eq(trackerSyncs.status, "queued"), lte(trackerSyncs.sendAfter, new Date())))
      .orderBy(trackerSyncs.createdAt).limit(BATCH)
      .for("update", { skipLocked: true, of: trackerSyncs });
    if (rows.length) await tx.update(trackerSyncs).set({ sendAfter: new Date(Date.now() + LEASE_MS) }).where(inArray(trackerSyncs.id, rows.map((r) => r.s.id)));
    return rows;
  });

  // In order: two quick moves of one item must reach the tracker in the order they happened.
  for (const { s, p } of batch) {
    let ok = false, error: string | null = null, final = false;
    try {
      const out = await withProject(db, p.id, (tx) => sendTrackerSync(tx, p, s, f));
      ok = true;
      final = out !== "sent";
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    }
    const attempts = s.attempts + 1;
    const giveUp = !ok && attempts >= MAX_ATTEMPTS;
    await withSystem(db, (tx) => tx.update(trackerSyncs).set({
      attempts, lastError: error ?? (final ? "skipped" : null),
      status: ok ? "sent" : giveUp ? "failed" : "queued",
      sentAt: ok ? new Date() : null,
      sendAfter: ok || giveUp ? new Date() : new Date(Date.now() + attempts * attempts * 60_000),
    }).where(eq(trackerSyncs.id, s.id)));
  }

  if (Date.now() - lastCleanup > 3_600_000) {
    lastCleanup = Date.now();
    await withSystem(db, (tx) => tx.delete(trackerSyncs).where(and(
      or(eq(trackerSyncs.status, "sent"), eq(trackerSyncs.status, "failed")),
      lt(trackerSyncs.createdAt, new Date(Date.now() - 30 * 86_400_000)),
    )));
  }
  return batch.length;
}
