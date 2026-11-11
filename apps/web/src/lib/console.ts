import "server-only";
import { PLAN_LIMITS, schema, withProject, type PlanName } from "@ozvi/db";
import { and, desc, eq, gte, inArray, max, ne, sql } from "drizzle-orm";
import { workspacesOf } from "./account";
import { db } from "./db";
import { translationsUsed } from "./translate";

/**
 * Read models for the console (/app/w/[id]/…). Every function takes a workspace the caller already
 * got from `consoleWorkspace` (membership checked). Tenant tables are read per project under RLS.
 */

export type ConsoleWorkspace = NonNullable<Awaited<ReturnType<typeof consoleWorkspace>>>;
export type ConsoleProject = ConsoleWorkspace["projects"][number];

export async function consoleWorkspace(accountId: string, id: string) {
  const all = await workspacesOf(accountId);
  const ws = all.find((w) => w.id === id);
  return ws ? { ...ws, all: all.map((w) => ({ id: w.id, name: w.name, plan: w.plan })) } : null;
}

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };
const weekAgo = () => new Date(Date.now() - 7 * 86_400_000);

export interface ProjectStats {
  newBugs: number;
  waitingIdeas: number;
  commentsWeek: number;
  itemsWeek: number;
  /** People from the host app who ever signed in to the board (excludes console admins). */
  appUsers: number;
  lastActivity: Date | null;
}

/** Per-project numbers for the overview (one RLS transaction per project). */
export async function statsFor(projectId: string): Promise<ProjectStats> {
  return withProject(db, projectId, async (tx) => {
    const { items, comments, users } = schema;
    const [counts] = await tx.select({
      newBugs: sql<number>`count(*) filter (where ${items.kind} = 'bug' and ${items.status} = 'new')::int`,
      waitingIdeas: sql<number>`count(*) filter (where ${items.kind} = 'idea' and ${items.status} = 'open')::int`,
      itemsWeek: sql<number>`count(*) filter (where ${items.createdAt} >= ${weekAgo().toISOString()}::timestamptz)::int`,
      lastItem: max(items.updatedAt),
    }).from(items).where(sql`${items.mergedIntoId} is null and ${items.deletedAt} is null`);
    const [c] = await tx.select({
      week: sql<number>`count(*) filter (where ${comments.createdAt} >= ${weekAgo().toISOString()}::timestamptz)::int`,
      last: max(comments.createdAt),
    }).from(comments).where(sql`${comments.deletedAt} is null`);
    const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(users)
      .where(and(ne(users.role, "admin"), sql`not (${users.externalId} like 'email:%' and ${users.role} <> 'member')`));
    const dates = [counts?.lastItem, c?.last].filter(Boolean).map((d) => new Date(d as Date));
    return {
      newBugs: counts?.newBugs ?? 0,
      waitingIdeas: counts?.waitingIdeas ?? 0,
      itemsWeek: counts?.itemsWeek ?? 0,
      commentsWeek: c?.week ?? 0,
      appUsers: u?.n ?? 0,
      lastActivity: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    };
  });
}

export interface Usage {
  plan: PlanName;
  emails: { used: number; limit: number };
  storage: { used: number; limit: number };
  projects: { used: number; limit: number };
  /** New AI translations this month (cached ones are free). */
  translations: { used: number; limit: number };
}

/** What the plan limits, measured the same way the worker and uploads enforce it. */
export async function usageOf(ws: ConsoleWorkspace): Promise<Usage> {
  const plan = ws.plan as PlanName;
  const limits = PLAN_LIMITS[plan];
  let emails = 0;
  let storage = 0;
  for (const p of ws.projects) {
    const r = await withProject(db, p.id, async (tx) => {
      const [e] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.emails)
        .where(and(inArray(schema.emails.status, ["sent", "digested"]), gte(schema.emails.sentAt, monthStart())));
      const [a] = await tx.select({ b: sql<number>`coalesce(sum(${schema.attachments.bytes}), 0)::bigint` }).from(schema.attachments);
      return { e: e?.n ?? 0, a: Number(a?.b ?? 0) };
    });
    emails += r.e;
    storage += r.a;
  }
  return {
    plan,
    emails: { used: emails, limit: limits.emailsPerMonth },
    storage: { used: storage, limit: limits.attachmentBytes },
    projects: { used: ws.projects.length, limit: limits.projects },
    translations: { used: limits.translationsPerMonth > 0 ? await translationsUsed(db, ws.id) : 0, limit: limits.translationsPerMonth },
  };
}

export interface MailRow { id: string; project: string; to: string; kind: string; subject: string; status: string; error: string | null; at: Date }
export interface HookRow { id: string; project: string; host: string; event: string; status: string; code: number | null; error: string | null; attempts: number; at: Date }

/** Latest outgoing e-mails and webhook calls across the workspace's projects, newest first. */
export async function deliveriesOf(ws: ConsoleWorkspace, opts: { problems?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  const mails: MailRow[] = [];
  const hooks: HookRow[] = [];
  for (const p of ws.projects) {
    await withProject(db, p.id, async (tx) => {
      const { emails, webhookDeliveries: wd, webhooks } = schema;
      const m = await tx.select({ id: emails.id, to: emails.to, kind: emails.kind, subject: emails.subject, status: emails.status, error: emails.lastError, at: emails.createdAt, sentAt: emails.sentAt })
        .from(emails).where(opts.problems ? inArray(emails.status, ["failed", "deferred", "skipped"]) : undefined)
        .orderBy(desc(emails.createdAt)).limit(limit);
      mails.push(...m.map((r) => ({ id: r.id, project: p.name, to: r.to, kind: r.kind, subject: r.subject, status: r.status, error: r.error, at: r.sentAt ?? r.at })));
      const h = await tx.select({ id: wd.id, url: webhooks.url, event: wd.event, status: wd.status, code: wd.responseCode, error: wd.lastError, attempts: wd.attempts, at: wd.createdAt, sentAt: wd.sentAt })
        .from(wd).innerJoin(webhooks, eq(webhooks.id, wd.webhookId))
        .where(opts.problems ? eq(wd.status, "failed") : undefined)
        .orderBy(desc(wd.createdAt)).limit(limit);
      hooks.push(...h.map((r) => ({ id: r.id, project: p.name, host: safeHost(r.url), event: r.event, status: r.status, code: r.code, error: r.error, attempts: r.attempts, at: r.sentAt ?? r.at })));
    });
  }
  const byTime = (a: { at: Date }, b: { at: Date }) => b.at.getTime() - a.at.getTime();
  return { mails: mails.sort(byTime).slice(0, limit), hooks: hooks.sort(byTime).slice(0, limit) };
}

function safeHost(url: string) {
  try { return new URL(url).host; } catch { return url; }
}
