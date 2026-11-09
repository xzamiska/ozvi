import "server-only";
import { schema, type Tx } from "@ozvi/db";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { itemMrrSql } from "./traits";
import { waitingSinceSql } from "./unanswered";
import type { Row } from "@/components/ItemRow";

const { items, comments, votes, users } = schema;

export type ListOrder = "top" | "new" | "old" | "mrr" | "affected" | "waiting";

/** People affected by a bug: its reporter plus the reporters of duplicates merged into it. */
const affectedSql = sql<number>`(select count(distinct a)::int from (
  select ${items.authorId} as a
  union all select d.author_id from ${items} d where d.merged_into_id = ${items.id}
) affected)`;

/** Comments waiting for the team's approval (suspicious links), per item. */
const pendingCommentsSql = sql<number>`(select count(*)::int from ${comments} where ${comments.itemId} = ${items.id} and ${comments.pending} and ${comments.deletedAt} is null)`;

/**
 * Moderation: deleted posts never show; queued (pending) ideas only to their author (`viewerId`),
 * or as the team's queue (`queue: true` = pending only).
 */
export function moderationWhere(opts: { viewerId?: string | null; queue?: boolean } = {}): SQL {
  // The queue: ideas waiting for approval, and posts with comments waiting for approval.
  if (opts.queue) return and(isNull(items.deletedAt), or(eq(items.pending, true), sql`${pendingCommentsSql} > 0`))!;
  return and(isNull(items.deletedAt),
    opts.viewerId ? or(eq(items.pending, false), eq(items.authorId, opts.viewerId))! : eq(items.pending, false))!;
}

/**
 * Board list. `team` adds team-only columns (MRR from voter traits, affected people); callers pass it
 * only for team viewers. Paging: pass fetchLimit(page) and cut with takePage (lib/paging.ts).
 */
export async function listItems(tx: Tx, where: SQL[], order: ListOrder, includeInternal: boolean,
  opts: { limit?: number; team?: boolean; viewerId?: string | null; queue?: boolean } = {}): Promise<Row[]> {
  const commentCount = includeInternal
    ? sql<number>`(select count(*)::int from ${comments} where ${comments.itemId} = ${items.id} and ${comments.deletedAt} is null)`
    : sql<number>`(select count(*)::int from ${comments} where ${comments.itemId} = ${items.id} and not ${comments.internal} and not ${comments.pending} and ${comments.deletedAt} is null)`;
  const voters = sql<number>`(select count(*)::int from ${votes} where ${votes.itemId} = ${items.id})`;
  const team = opts.team === true;
  // Sorting by team-only data is ignored for everyone else.
  const by = !team && (order === "mrr" || order === "affected" || order === "waiting") ? "top" : order;
  const orderBy = {
    top: [desc(items.voteCount), desc(items.createdAt)],
    new: [desc(items.createdAt)],
    old: [asc(items.createdAt)],
    mrr: [desc(itemMrrSql), desc(items.voteCount), desc(items.createdAt)],
    affected: [desc(affectedSql), desc(items.createdAt)],
    // Team queue "Bez odpovede": longest wait first.
    waiting: [asc(waitingSinceSql), asc(items.createdAt)],
  }[by];
  return tx.select({
    id: items.id, number: items.number, kind: items.kind, title: items.title, body: items.body,
    status: items.status, subStatusId: items.subStatusId, voteCount: items.voteCount, fixedInVersion: items.fixedInVersion, comments: commentCount,
    createdAt: items.createdAt, authorName: users.name, voters, pending: items.pending,
    // Filed by Ozvi from customer feedback (submit_insight): shown as "From customer feedback", never a person.
    system: sql<boolean>`(${items.authorId} is null and coalesce((${items.context}->>'insight')::boolean, false))`,
    ...(team ? { mrr: itemMrrSql, affected: affectedSql, authorId: items.authorId, pendingComments: pendingCommentsSql } : {}),
    ...(team && by === "waiting" ? { waitingSince: sql<Date | null>`${waitingSinceSql}`.mapWith((v: string | Date | null) => (v ? new Date(v) : null)) } : {}),
  }).from(items).leftJoin(users, eq(users.id, items.authorId))
    .where(and(isNull(items.mergedIntoId), moderationWhere(opts), ...where))
    .orderBy(...orderBy, desc(items.number))
    .limit(Math.min(opts.limit ?? 100, 2001));
}

/** Total for the same filter (not capped by paging). */
export async function countItems(tx: Tx, where: SQL[], opts: { viewerId?: string | null; queue?: boolean } = {}): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(items).where(and(isNull(items.mergedIntoId), moderationWhere(opts), ...where));
  return r?.n ?? 0;
}

/** Title/body text, or a number ("12", "#12") for an exact match too. */
export function textMatch(q: string): SQL[] {
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const n = /^#?(\d{1,9})$/.exec(q)?.[1];
  return [or(ilike(items.title, like), ilike(items.body, like), ...(n ? [eq(items.number, Number(n))] : []))!];
}

export async function myVotes(tx: Tx, userId: string | undefined, itemIds: string[]): Promise<Set<string>> {
  if (!userId || itemIds.length === 0) return new Set();
  const rows = await tx.select({ id: votes.itemId }).from(votes).where(and(eq(votes.userId, userId), inArray(votes.itemId, itemIds)));
  return new Set(rows.map((r) => r.id));
}
