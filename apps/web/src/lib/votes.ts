import { schema, type Tx } from "@ozvi/db";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { sectionOn } from "./sections";

const { items, votes } = schema;

/** Ideas whose votes count against the budget; shipped/declined/merged ones give their points back. */
export const ACTIVE_IDEA = ["open", "planned", "in_progress"] as const;

export type VoteMode = "simple" | "importance";
export const voteModeOf = (p: { voteMode?: string | null }): VoteMode => (p.voteMode === "importance" ? "importance" : "simple");

/** What a person's vote is worth: always 1 in simple mode, 1–3 in importance mode, 0 = no vote. */
export function normalizeWeight(mode: VoteMode, weight: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (mode === "simple") return 1;
  return Math.min(3, Math.max(1, Math.round(weight))) as 1 | 2 | 3;
}

/** Points a person has spent on active ideas, optionally ignoring one idea (the one being re-voted). */
export async function spentPoints(tx: Tx, userId: string, exceptItemId?: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`coalesce(sum(${votes.weight}), 0)::int` }).from(votes)
    .innerJoin(items, eq(items.id, votes.itemId))
    .where(and(eq(votes.userId, userId), inArray(items.status, [...ACTIVE_IDEA]), isNull(items.mergedIntoId),
      ...(exceptItemId ? [ne(votes.itemId, exceptItemId)] : [])));
  return r?.n ?? 0;
}

/** Remaining points for the budget UI; null when the project has no budget. */
export async function budgetLeft(tx: Tx, project: { voteBudget: number | null }, userId: string | undefined): Promise<number | null> {
  if (project.voteBudget == null || !userId) return null;
  return Math.max(0, project.voteBudget - (await spentPoints(tx, userId)));
}

export type VoteResult = { ok: true; weight: number } | { ok: false; reason: "missing" | "budget"; left?: number };

/**
 * The one place a vote is written (board, any future API): the server decides the weight from the
 * project's mode and enforces the budget, whatever the client sent. weight 0 removes the vote.
 * A vote on an inactive (shipped/declined) idea costs nothing, so the budget only guards active ideas.
 */
export async function applyVote(tx: Tx, project: { id: string; voteMode: string; voteBudget: number | null; sections?: readonly string[] | null },
  userId: string, itemId: string, requested: number): Promise<VoteResult> {
  if (project.sections && !sectionOn(project, "ideas")) return { ok: false, reason: "missing" };
  const item = await tx.query.items.findFirst({ where: and(eq(items.id, itemId), eq(items.kind, "idea")) });
  // Deleted and queued (moderation) ideas take no votes.
  if (!item || item.deletedAt || item.pending) return { ok: false, reason: "missing" };
  const w = normalizeWeight(voteModeOf(project), requested);
  if (w === 0) {
    await tx.delete(votes).where(and(eq(votes.itemId, itemId), eq(votes.userId, userId)));
  } else {
    const counts = (ACTIVE_IDEA as readonly string[]).includes(item.status) && !item.mergedIntoId;
    if (project.voteBudget != null && counts) {
      // Serialise one person's votes so two quick clicks cannot both squeeze under the budget.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`vote:${userId}`}))`);
      const left = project.voteBudget - (await spentPoints(tx, userId, itemId));
      if (w > left) return { ok: false, reason: "budget", left: Math.max(0, left) };
    }
    await tx.insert(votes).values({ projectId: project.id, itemId, userId, weight: w })
      .onConflictDoUpdate({ target: [votes.itemId, votes.userId], set: { weight: w } });
  }
  await tx.update(items)
    .set({ voteCount: sql`(select coalesce(sum(${votes.weight}), 0) from ${votes} where ${votes.itemId} = ${itemId})` })
    .where(eq(items.id, itemId));
  return { ok: true, weight: w };
}

/** The viewer's vote weight per item (missing = not voted). */
export async function myVoteWeights(tx: Tx, userId: string | undefined, itemIds: string[]): Promise<Map<string, number>> {
  if (!userId || itemIds.length === 0) return new Map();
  const rows = await tx.select({ id: votes.itemId, w: votes.weight }).from(votes)
    .where(and(eq(votes.userId, userId), inArray(votes.itemId, itemIds)));
  return new Map(rows.map((r) => [r.id, r.w]));
}
