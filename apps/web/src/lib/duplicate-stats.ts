import { DUPLICATE_EVENTS, schema, type Tx } from "@ozvi/db";
import { sql } from "drizzle-orm";

/**
 * Counters for duplicates before they happen (ADR-0015): one number per board, day (UTC) and event in
 * duplicate_stats — never who, never which item. Written where the event happens, read by duplicateStats.
 */

export type DuplicateEvent = (typeof DUPLICATE_EVENTS)[number];

/** One more of `kind` today (UTC) on the board (duplicate_stats): a number per day, never who or which item. */
export async function countDuplicate(tx: Tx, projectId: string, kind: DuplicateEvent) {
  await tx.execute(sql`
    insert into ${schema.duplicateStats} (project_id, day, kind, n) values (${projectId}, (now() at time zone 'utc')::date, ${kind}, 1)
    on conflict (project_id, day, kind) do update set n = ${schema.duplicateStats.n} + 1`);
}

export interface DuplicateStats {
  /** Drafts turned into a vote and comment on an existing idea. */
  attached: number;
  /** Ideas created although similar ones were shown. */
  createdAnyway: number;
  /** …of which the author was asked about a strong match and said it was different. */
  saidDifferent: number;
  /** Merges of such ideas by the team (counted on the day of the merge). */
  mergedLater: number;
  /** Merges the team undid (Oddeliť). */
  split: number;
}

/** Aggregate counts from the day of `since` (UTC) on the board of the current transaction (withProject). No person in them. */
export async function duplicateStats(tx: Tx, since: Date): Promise<DuplicateStats> {
  const rows = (await tx.execute(sql`
    select kind, sum(n)::int as n from ${schema.duplicateStats}
    where project_id = nullif(current_setting('ozvi.project_id', true), '')::uuid and day >= ${since.toISOString().slice(0, 10)}::date
    group by kind`)) as unknown as { kind: DuplicateEvent; n: number }[];
  const n = (k: DuplicateEvent) => rows.find((r) => r.kind === k)?.n ?? 0;
  return { attached: n("attached"), createdAnyway: n("created_anyway"), saidDifferent: n("said_different"), mergedLater: n("merged_later"), split: n("split") };
}
