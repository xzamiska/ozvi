import { schema, type Tx } from "@ozvi/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { SIMILAR_SHOW } from "./similar";

/**
 * Known issues (ADR-0015 phase 3). Bug reports stay private (CLAUDE.md rule 5); the team may publish one
 * with a title and a short note written or approved by a person. Reporters see and match only those two
 * fields — never the report's own title, text, files, context, comments or its reporter. "Mám ten istý
 * problém" files the reporter's own report (with its own context) already merged into the known issue,
 * so they hear when it is fixed.
 */

const { items } = schema;

/** Stops on the route where someone else can still say "I have it too". */
export const KNOWN_OPEN = ["new", "confirmed", "in_progress"] as const;
export const KNOWN_TITLE_MAX = 200;
export const KNOWN_BODY_MAX = 2000;

export const knownOpen = (status: string) => (KNOWN_OPEN as readonly string[]).includes(status);

export type KnownItem = Pick<typeof items.$inferSelect, "kind" | "knownAt" | "mergedIntoId" | "deletedAt" | "pending" | "status">;

/** Published and still something a reporter can join. */
export const joinable = (i: KnownItem) =>
  i.kind === "bug" && !!i.knownAt && !i.mergedIntoId && !i.deletedAt && !i.pending && knownOpen(i.status);

/** What a reporter may see of a known issue. */
export interface KnownIssue {
  id: string; number: number; title: string; body: string; status: string; fixedInVersion: string | null;
  /** Reports joined to it plus the original. */
  affected: number;
}

const knownCols = {
  id: items.id, number: items.number, title: sql<string>`${items.knownTitle}`, body: sql<string>`coalesce(${items.knownBody}, '')`,
  status: items.status, fixedInVersion: items.fixedInVersion,
  // Qualified by hand: inside the subquery an unqualified "id" would be the subquery's own row.
  affected: sql<number>`1 + (select count(*)::int from items m where m.merged_into_id = "items"."id" and m.deleted_at is null)`,
};
const published = and(eq(items.kind, "bug"), isNotNull(items.knownAt), isNull(items.mergedIntoId), isNull(items.deletedAt), eq(items.pending, false));

/** Known issues of the board (transaction of withProject): open ones first, then recently fixed. */
export async function listKnown(tx: Tx, opts: { limit?: number } = {}): Promise<KnownIssue[]> {
  return tx.select(knownCols).from(items).where(and(published, inArray(items.status, [...KNOWN_OPEN, "fixed", "verified"])))
    .orderBy(sql`${items.status} in ('fixed', 'verified')`, desc(items.knownAt), asc(items.number)).limit(opts.limit ?? 30);
}

/** One known issue by its number, or null when it is not published (anything else stays private). */
export async function knownByNumber(tx: Tx, number: number): Promise<KnownIssue | null> {
  return (await tx.select(knownCols).from(items).where(and(published, eq(items.number, number))))[0] ?? null;
}

/** Same for the original a report was merged into. */
export async function knownById(tx: Tx, id: string): Promise<KnownIssue | null> {
  return (await tx.select(knownCols).from(items).where(and(published, eq(items.id, id))))[0] ?? null;
}

/**
 * Open known issues similar to what a reporter types. Trigrams on the public title and note only: the
 * report's own text never takes part, so typing cannot probe what other people reported. (Embeddings
 * are of the original text, so they are not used here.)
 */
export async function matchKnown(tx: Tx, text: string, limit = 3): Promise<(KnownIssue & { score: number })[]> {
  const q = text.slice(0, 500);
  const score = sql<number>`round(greatest(word_similarity(ozvi_fold(${q}), ozvi_fold(${items.knownTitle})),
    0.7 * word_similarity(ozvi_fold(${q}), ozvi_fold(left(coalesce(${items.knownBody}, ''), 1000))))::numeric, 3)::float`;
  const rows = await tx.select({ ...knownCols, score }).from(items)
    .where(and(published, inArray(items.status, [...KNOWN_OPEN]))).orderBy(desc(score)).limit(limit * 3);
  return rows.filter((r) => r.score >= SIMILAR_SHOW.trigram).slice(0, limit);
}

export class KnownIssueError extends Error {}

/**
 * Team: publish (or update) a bug as a known issue. The title is required and is what reporters see;
 * it is never copied from the report without the team submitting it.
 */
export async function publishKnown(tx: Tx, item: typeof items.$inferSelect, input: { title: string; body: string }) {
  const title = input.title.trim().replace(/\s+/g, " ");
  const body = input.body.trim();
  if (item.kind !== "bug") throw new KnownIssueError("kind");
  if (item.mergedIntoId || item.deletedAt || item.pending) throw new KnownIssueError("state");
  if (title.length < 3 || title.length > KNOWN_TITLE_MAX) throw new KnownIssueError("title");
  if (body.length > KNOWN_BODY_MAX) throw new KnownIssueError("body");
  const [row] = await tx.update(items).set({ knownTitle: title, knownBody: body || null, knownAt: item.knownAt ?? new Date() })
    .where(eq(items.id, item.id)).returning();
  return row!;
}

/** Team: take it off the list. Reports already joined stay merged into it. */
export async function unpublishKnown(tx: Tx, item: typeof items.$inferSelect) {
  await tx.update(items).set({ knownTitle: null, knownBody: null, knownAt: null }).where(eq(items.id, item.id));
}
