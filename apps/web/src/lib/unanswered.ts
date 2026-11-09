import { schema } from "@ozvi/db";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

/**
 * The team's "Bez odpovede" queue: active reports where somebody outside the team has been waiting
 * longer than the project's N days for a public team reply or a status change.
 *
 * waitingSince = the earliest outside activity (the report itself, a public comment, a reporter's own
 * status change such as "still broken") after the team's last public touch (public team comment or any
 * status change by the team or by automation). Null = nobody is waiting. Internal notes, queued or
 * deleted comments never count either way. The SQL below and `waitingSince()` (used in tests) say the same.
 */

const { items, comments, itemEvents, users } = schema;

export const UNANSWERED_DEFAULT_DAYS = 7;
export const UNANSWERED_MAX_DAYS = 90;

/** Stages where a report still expects the team; finished and off-route ones never wait. */
export const ACTIVE_STAGES = ["open", "planned", "in_progress", "new", "confirmed"] as const;

const TEAM = sql`('team', 'admin')`;

/** Last public team touch on the item (null if the team never answered). */
export const teamTouchSql = sql<Date | null>`greatest(
  (select max(c.created_at) from ${comments} c join ${users} u on u.id = c.author_id
    where c.item_id = ${items.id} and not c.internal and not c.pending and c.deleted_at is null and u.role in ${TEAM}),
  (select max(e.created_at) from ${itemEvents} e left join ${users} u on u.id = e.actor_id
    where e.item_id = ${items.id} and (e.actor_id is null or u.role in ${TEAM}))
)`;

/** Earliest outside activity after the team's last touch. */
export const waitingSinceSql = sql<Date | null>`(select min(w.at) from (
    select ${items.createdAt} as at where coalesce((select a.role::text from ${users} a where a.id = ${items.authorId}), 'member') = 'member'
    union all
    select c.created_at from ${comments} c join ${users} u on u.id = c.author_id
      where c.item_id = ${items.id} and not c.internal and not c.pending and c.deleted_at is null and u.role = 'member'
    union all
    select e.created_at from ${itemEvents} e join ${users} u on u.id = e.actor_id
      where e.item_id = ${items.id} and u.role = 'member'
  ) w where w.at > coalesce(${teamTouchSql}, '-infinity'::timestamptz))`;

/** Items in the queue for a project setting of `days` (relative to `now`, the database clock by default). */
export function unansweredWhere(days: number, now?: Date): SQL {
  const d = clampDays(days);
  const cutoff = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
  return and(
    inArray(items.status, [...ACTIVE_STAGES]), isNull(items.mergedIntoId), isNull(items.deletedAt), eq(items.pending, false),
    sql`${waitingSinceSql} < ${cutoff} - make_interval(days => ${d})`,
  )!;
}

export function clampDays(days: unknown): number {
  const n = Math.round(Number(days));
  return Number.isFinite(n) ? Math.min(UNANSWERED_MAX_DAYS, Math.max(1, n)) : UNANSWERED_DEFAULT_DAYS;
}

/** Whole days someone has waited (for the row label). */
export function daysWaiting(since: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
}

export interface Touch { at: Date; team: boolean }

/** Pure mirror of waitingSinceSql (public touches only; internal/queued/deleted are filtered out by the caller). */
export function waitingSince(created: Touch, touches: readonly Touch[]): Date | null {
  const teamAt = touches.filter((t) => t.team).reduce<number>((m, t) => Math.max(m, t.at.getTime()), -Infinity);
  const outside = [created, ...touches].filter((t) => !t.team && t.at.getTime() > teamAt).map((t) => t.at.getTime());
  return outside.length ? new Date(Math.min(...outside)) : null;
}

export function isUnanswered(status: string, since: Date | null, days: number, now = new Date()): boolean {
  return (ACTIVE_STAGES as readonly string[]).includes(status) && !!since && now.getTime() - since.getTime() > clampDays(days) * 86_400_000;
}
