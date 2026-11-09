import { schema, withProject, withSystem, type Db, type Tx } from "@ozvi/db";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { discard } from "./attachments";
import { CAPTURE_KEYS } from "./bug-context";
import { INSIGHT_PREFIX } from "./provenance";

/**
 * Retention per project (admin → Dáta): the nightly job deletes what the project no longer needs.
 *  - bug capture data (network log, steps, console errors, session links, the widget screenshot) after N days;
 *  - attachments of bugs that have been closed for N days;
 *  - placeholder contacts (imported or from agent insights) that never signed in, after N months: their
 *    personal details are erased, the row stays as an anonymous voter so vote counts don't change.
 * Every rule can be off (null). The same queries power the admin preview (dry run).
 */

const { items, attachments, users, comments, emails, itemEvents } = schema;

export const CAPTURE_DAYS = [30, 90, 180, 365] as const;
export const CLOSED_FILES_DAYS = [30, 90, 180, 365] as const;
export const CONTACT_MONTHS = [6, 12, 24] as const;
export const DEFAULT_CAPTURE_DAYS = 180;
/** The file name the widget gives its screenshot (packages/widget/src/index.tsx). */
export const SCREENSHOT_NAME = "screenshot.jpg";
const CLOSED_BUG = ["fixed", "verified", "wont_fix"] as const;
const DAY = 86_400_000;

export interface RetentionPolicy { captureDays: number | null; closedFilesDays: number | null; contactsMonths: number | null }

export interface RetentionReport {
  /** Bugs whose network log, steps, console and session links were removed. */
  captures: number;
  /** Widget screenshots deleted with the capture. */
  screenshots: number;
  /** Attachments of closed bugs deleted. */
  files: number;
  /** Bytes freed by screenshots and files together. */
  bytes: number;
  /** Placeholder contacts anonymised. */
  contacts: number;
}

export const emptyReport = (): RetentionReport => ({ captures: 0, screenshots: 0, files: 0, bytes: 0, contacts: 0 });
export const reportTotal = (r: RetentionReport) => r.captures + r.screenshots + r.files + r.contacts;

export const policyOf = (p: { retentionCaptureDays: number | null; retentionClosedFilesDays: number | null; retentionContactsMonths: number | null }): RetentionPolicy =>
  ({ captureDays: p.retentionCaptureDays, closedFilesDays: p.retentionClosedFilesDays, contactsMonths: p.retentionContactsMonths });

/** A form value → an allowed option or null ("never"). Unknown values are rejected (undefined). */
export function parseOption(v: unknown, allowed: readonly number[]): number | null | undefined {
  const s = String(v ?? "");
  if (s === "never") return null;
  const n = Number(s);
  return allowed.includes(n) ? n : undefined;
}

/** Months back from `now`, calendar-aware (6 months before 31 August is 28/29 February). */
export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

const captureKeys = sql.raw(`array[${CAPTURE_KEYS.map((k) => `'${k}'`).join(", ")}]`);

/** When a bug reached its closed stop: the last status event, else its last update. */
const closedAt = sql`coalesce((select max(${itemEvents.createdAt}) from ${itemEvents} where ${itemEvents.itemId} = ${items.id}), ${items.updatedAt})`;

interface Targets {
  captureItemIds: string[];
  /** Screenshots and closed bugs' files, with their storage keys. */
  files: { id: string; key: string; bytes: number; screenshot: boolean }[];
  contactIds: string[];
}

async function findTargets(tx: Tx, policy: RetentionPolicy, now: Date): Promise<Targets> {
  const t: Targets = { captureItemIds: [], files: [], contactIds: [] };
  if (policy.captureDays) {
    const cutoff = new Date(now.getTime() - policy.captureDays * DAY);
    t.captureItemIds = (await tx.select({ id: items.id }).from(items)
      .where(and(eq(items.kind, "bug"), lt(items.createdAt, cutoff), isNotNull(items.context), sql`${items.context} ?| ${captureKeys}`)))
      .map((r) => r.id);
    const shots = await tx.select({ id: attachments.id, key: attachments.storageKey, bytes: attachments.bytes }).from(attachments)
      .innerJoin(items, eq(items.id, attachments.itemId))
      .where(and(eq(items.kind, "bug"), eq(attachments.name, SCREENSHOT_NAME), lt(attachments.createdAt, cutoff)));
    t.files.push(...shots.map((s) => ({ ...s, screenshot: true })));
  }
  if (policy.closedFilesDays) {
    const cutoff = new Date(now.getTime() - policy.closedFilesDays * DAY);
    const seen = new Set(t.files.map((f) => f.id));
    const closed = await tx.select({ id: attachments.id, key: attachments.storageKey, bytes: attachments.bytes }).from(attachments)
      .innerJoin(items, eq(items.id, attachments.itemId))
      .where(and(eq(items.kind, "bug"), inArray(items.status, [...CLOSED_BUG]), sql`${closedAt} < ${cutoff.toISOString()}::timestamptz`));
    t.files.push(...closed.filter((f) => !seen.has(f.id)).map((f) => ({ ...f, screenshot: false })));
  }
  if (policy.contactsMonths) {
    const cutoff = monthsAgo(now, policy.contactsMonths);
    // Placeholders only: created by an import or an agent's insight, never signed in, nothing written on the
    // board themselves (imported posts don't count), and not already anonymised.
    t.contactIds = (await tx.select({ id: users.id }).from(users).where(and(
      eq(users.role, "member"),
      isNull(users.lastSeenAt),
      lt(users.createdAt, cutoff),
      or(sql`${users.traits} ? 'importedFrom'`, sql`${users.externalId} like ${`${INSIGHT_PREFIX}%`}`),
      sql`not (${users.traits} ? 'anonymizedAt')`,
      sql`not exists (select 1 from ${items} where ${items.authorId} = ${users.id} and ${items.source} <> 'import')`,
      sql`not exists (select 1 from ${comments} where ${comments.authorId} = ${users.id} and ${comments.source} <> 'import')`,
    ))).map((r) => r.id);
  }
  return t;
}

function summarise(t: Targets): RetentionReport {
  const shots = t.files.filter((f) => f.screenshot);
  return {
    captures: t.captureItemIds.length,
    screenshots: shots.length,
    files: t.files.length - shots.length,
    bytes: t.files.reduce((s, f) => s + f.bytes, 0),
    contacts: t.contactIds.length,
  };
}

/** What a policy would remove in a project right now (admin preview; nothing is changed). */
export async function previewRetention(db: Db, projectId: string, policy: RetentionPolicy, now = new Date()): Promise<RetentionReport> {
  return withProject(db, projectId, async (tx) => summarise(await findTargets(tx, policy, now)));
}

/** Applies a policy in one project. Files leave storage only after the transaction commits. */
export async function applyRetention(db: Db, projectId: string, policy: RetentionPolicy, now = new Date()): Promise<RetentionReport> {
  const { report, keys } = await withProject(db, projectId, async (tx) => {
    const t = await findTargets(tx, policy, now);
    if (t.captureItemIds.length) {
      // Keep page, browser and version (what the bug is about); drop the recorded session. The marker lets the
      // team see why the log is gone.
      await tx.update(items)
        .set({ context: sql`(${items.context} - ${captureKeys}) || jsonb_build_object('captureRemovedAt', ${now.toISOString()}::text)` })
        .where(inArray(items.id, t.captureItemIds));
    }
    if (t.files.length) await tx.delete(attachments).where(inArray(attachments.id, t.files.map((f) => f.id)));
    if (t.contactIds.length) {
      await tx.delete(emails).where(inArray(emails.userId, t.contactIds));
      await tx.update(users).set({
        externalId: sql`'anon:' || ${users.id}::text`,
        email: null, name: null, avatarUrl: null, locale: null, emailOptOut: true,
        // importedFrom keeps the row "anonymous" for provenance (trustOf) and out of a second run.
        traits: sql`jsonb_build_object('importedFrom', coalesce(${users.traits}->>'importedFrom', 'insight'), 'anonymizedAt', ${now.toISOString()}::text)`,
      }).where(inArray(users.id, t.contactIds));
    }
    return { report: summarise(t), keys: t.files.map((f) => f.key) };
  });
  await discard(keys);
  return report;
}

/** Compact, language-neutral activity detail ("c=3;s=2;f=1;b=1048576;u=4"); console/activity.ts renders it. */
export const encodeReport = (r: RetentionReport) => `c=${r.captures};s=${r.screenshots};f=${r.files};b=${r.bytes};u=${r.contacts}`;
export function decodeReport(s: string | null): RetentionReport | null {
  const m = /^c=(\d+);s=(\d+);f=(\d+);b=(\d+);u=(\d+)$/.exec(s ?? "");
  return m ? { captures: +m[1]!, screenshots: +m[2]!, files: +m[3]!, bytes: +m[4]!, contacts: +m[5]! } : null;
}

/** Night window in Central European time (the cloud's users): runs between 02:00 and 05:59. */
export function isNight(now: Date): boolean {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Bratislava" }).format(now));
  return h >= 2 && h < 6;
}

/**
 * Nightly job (lib/jobs.ts checks every 30 min): every project with a rule switched on, once per night.
 * A run that removed anything is written to the workspace activity log.
 */
export async function retentionTick(db: Db, now = new Date(), opts: { force?: boolean; projectIds?: string[] } = {}): Promise<Map<string, RetentionReport>> {
  const out = new Map<string, RetentionReport>();
  if (!opts.force && !isNight(now)) return out;
  const p = schema.projects;
  const due = await withSystem(db, (tx) => tx.select().from(p).where(and(
    or(isNotNull(p.retentionCaptureDays), isNotNull(p.retentionClosedFilesDays), isNotNull(p.retentionContactsMonths)),
    // Once a night: the window is 4 hours, so 12 hours apart is always the next night.
    or(isNull(p.retentionRunAt), lt(p.retentionRunAt, new Date(now.getTime() - 12 * 3600_000))),
    ...(opts.projectIds ? [inArray(p.id, opts.projectIds)] : []),
  )));
  for (const project of due) {
    try {
      const report = await applyRetention(db, project.id, policyOf(project), now);
      out.set(project.id, report);
      await withSystem(db, async (tx) => {
        await tx.update(p).set({ retentionRunAt: now }).where(eq(p.id, project.id));
        if (reportTotal(report) > 0) {
          await tx.insert(schema.activity).values({ workspaceId: project.workspaceId, projectId: project.id, actor: null, action: "retention.run", detail: encodeReport(report) });
        }
      });
    } catch (e) {
      console.error(`[ozvi] retention ${project.slug}`, e);
    }
  }
  return out;
}
