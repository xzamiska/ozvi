import "server-only";
import { schema, type Tx } from "@ozvi/db";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

const { changelogEntries, changelogItems, items } = schema;

export async function listEntries(tx: Tx, includeDrafts: boolean, limit = 30) {
  // The reviewer's name goes next to the AI label ("s pomocou AI · skontroloval/a …").
  const entries = (await tx.select({ e: changelogEntries, reviewer: schema.users.name }).from(changelogEntries)
    .leftJoin(schema.users, eq(schema.users.id, changelogEntries.reviewedById))
    .where(includeDrafts ? undefined : isNotNull(changelogEntries.publishedAt))
    .orderBy(desc(changelogEntries.publishedAt), desc(changelogEntries.createdAt), desc(changelogEntries.id)).limit(limit))
    .map((r) => ({ ...r.e, reviewerName: r.reviewer }));
  const ids = entries.map((e) => e.id);
  const links = ids.length
    ? await tx.select({ entryId: changelogItems.entryId, number: items.number, title: items.title, kind: items.kind, votes: items.voteCount })
      .from(changelogItems).innerJoin(items, eq(items.id, changelogItems.itemId))
      // Bugs are private: a public changelog lists only ideas.
      .where(and(inArray(changelogItems.entryId, ids), eq(items.kind, "idea"), eq(items.pending, false), isNull(items.deletedAt)))
    : [];
  return entries.map((e) => ({ ...e, items: links.filter((l) => l.entryId === e.id) }));
}

export async function countEntries(tx: Tx, includeDrafts: boolean): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(changelogEntries)
    .where(includeDrafts ? undefined : isNotNull(changelogEntries.publishedAt));
  return r?.n ?? 0;
}

/**
 * Items worth linking: ideas planned, in progress or shipped, plus whatever is already linked or asked for
 * (`also`, e.g. from "Vydané, ale neoznámené"). Bugs only when linked or asked for: they never show in the
 * public changelog, linking them only marks them as announced.
 */
export async function linkCandidates(tx: Tx, alreadyLinked: string[], also: string[] = []) {
  const pinned = [...new Set([...alreadyLinked, ...also])];
  return tx.select({ id: items.id, number: items.number, kind: items.kind, title: items.title, status: items.status, votes: items.voteCount })
    .from(items).where(and(isNull(items.mergedIntoId), eq(items.pending, false), isNull(items.deletedAt),
      or(and(eq(items.kind, "idea"), inArray(items.status, ["planned", "in_progress", "shipped"])), ...(pinned.length ? [inArray(items.id, pinned)] : []))))
    .orderBy(sql`${items.id} in ${pinned.length ? pinned : ["00000000-0000-0000-0000-000000000000"]} desc`, desc(items.updatedAt)).limit(80);
}
