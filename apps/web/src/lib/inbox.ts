import { schema, type Tx } from "@ozvi/db";
import { and, eq, gt, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";

/**
 * Team inbox "New" (internal review 17 Nov 2026: "what's new since yesterday?" had no answer): items where
 * somebody else did something since this team member last marked the inbox as read: a new item, a comment
 * (internal notes too) or a status change. Per person (users.inbox_seen_at), never the customer's view.
 */

/** Without a read mark, the last 7 days count as new. */
export const INBOX_DEFAULT_DAYS = 7;

export const inboxSince = (seenAt: Date | null, now = new Date()) => seenAt ?? new Date(now.getTime() - INBOX_DEFAULT_DAYS * 86_400_000);

export interface InboxEntry { itemId: string; at: Date; created: boolean; comments: number; statuses: number }

const { items, comments, itemEvents } = schema;

/**
 * What happened per item since `since`, newest activity first. `kinds`: the sections that are on.
 * The viewer's own actions never count; deleted and merged items are left out.
 */
export async function inboxActivity(tx: Tx, me: string, since: Date, kinds: readonly ("idea" | "bug")[], limit = 200): Promise<InboxEntry[]> {
  if (kinds.length === 0) return [];
  const live: SQL[] = [isNull(items.deletedAt), isNull(items.mergedIntoId), inArray(items.kind, [...kinds])];
  const [made, said, moved] = await Promise.all([
    tx.select({ id: items.id, at: items.createdAt }).from(items)
      .where(and(...live, gt(items.createdAt, since), or(isNull(items.authorId), ne(items.authorId, me)))),
    tx.select({ id: comments.itemId, at: sql<Date>`max(${comments.createdAt})`, n: sql<number>`count(*)::int` }).from(comments)
      .innerJoin(items, eq(items.id, comments.itemId))
      .where(and(...live, gt(comments.createdAt, since), isNull(comments.deletedAt), or(isNull(comments.authorId), ne(comments.authorId, me))))
      .groupBy(comments.itemId),
    tx.select({ id: itemEvents.itemId, at: sql<Date>`max(${itemEvents.createdAt})`, n: sql<number>`count(*)::int` }).from(itemEvents)
      .innerJoin(items, eq(items.id, itemEvents.itemId))
      // The first stop of a new item is its creation, already counted above.
      .where(and(...live, gt(itemEvents.createdAt, since), sql`${itemEvents.fromStatus} is not null`, or(isNull(itemEvents.actorId), ne(itemEvents.actorId, me))))
      .groupBy(itemEvents.itemId),
  ]);
  const byItem = new Map<string, InboxEntry>();
  const entry = (id: string) => byItem.get(id) ?? byItem.set(id, { itemId: id, at: new Date(0), created: false, comments: 0, statuses: 0 }).get(id)!;
  const later = (e: InboxEntry, at: Date | string) => { const d = new Date(at); if (d > e.at) e.at = d; };
  for (const r of made) { const e = entry(r.id); e.created = true; later(e, r.at); }
  for (const r of said) { const e = entry(r.id); e.comments = r.n; later(e, r.at); }
  for (const r of moved) { const e = entry(r.id); e.statuses = r.n; later(e, r.at); }
  return [...byItem.values()].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** How many items have news for this person (the tab's badge). */
export async function inboxCount(tx: Tx, me: string, since: Date, kinds: readonly ("idea" | "bug")[]): Promise<number> {
  return (await inboxActivity(tx, me, since, kinds, 1000)).length;
}

/** "Mark as read": everything up to now is no longer new for this person. */
export async function markInboxRead(tx: Tx, me: string, at = new Date()) {
  await tx.update(schema.users).set({ inboxSeenAt: at }).where(eq(schema.users.id, me));
}
