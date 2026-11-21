import { schema, type PlanName, type Tx } from "@ozvi/db";
import { eq, sql } from "drizzle-orm";
import { translator } from "@/i18n/messages";
import { addCommentTo, DomainError, fail, recordStatus, type Item } from "./domain";
import { countDuplicate } from "./duplicate-stats";
import { emit } from "./events";
import type { Project, User } from "./project";
import { sameTitle } from "./moderation-rules";
import { allow } from "./ratelimit";
import { atLeast, embeddingsFor, embedQuery, findSimilar, SIMILAR_SHOW, SIMILAR_STRONG, type SimilarMethod } from "./similar";
import { pivotQuery } from "./translate";
import { applyVote, myVoteWeights } from "./votes";

/**
 * Duplicates before they happen (ADR-0015, phase 1): the author of a new idea sees the same candidates as the
 * team (findSimilar), can vote and comment there instead, is asked once on submit about a strong match, and
 * the team sees what the author was shown when they created a new idea anyway. Counts are aggregate only.
 */

export { countDuplicate, duplicateStats, type DuplicateEvent, type DuplicateStats } from "./duplicate-stats";

const { items } = schema;

/** A similar idea as the author sees it while writing (and the viewer's own vote on it, 0 = none). */
export interface Suggestion {
  id: string; number: number; title: string; status: string; votes: number; score: number; method: SimilarMethod; weight: number;
}

/** What findSimilar needs from outside the transaction: the English pivot of the text and its embedding. */
export async function similarInputs(project: Project, plan: PlanName, rateKey: string, text: string) {
  const pivot = await pivotQuery(text, { project, plan, rateKey });
  // Embedding API calls cost money: only plans with AI (and self-host); the local model runs on every plan.
  // A per-viewer cap while typing either way.
  const queryVector = embeddingsFor(plan) && allow("similar", `${project.id}:${rateKey}`) ? await embedQuery(text) : null;
  return { pivot, queryVector };
}

/**
 * Published ideas similar to `text` at or above `thresholds` (per method), best first. Merged, deleted and
 * queued ideas never match (findSimilar); bugs never (they are private).
 */
export async function similarIdeas(tx: Tx, opts: {
  text: string; pivot?: string | null; queryVector?: string | null; userId?: string; limit?: number;
  thresholds?: Record<SimilarMethod, number>;
}): Promise<Suggestion[]> {
  const rows = await findSimilar(tx, {
    text: opts.text, pivot: opts.pivot, queryVector: opts.queryVector, limit: 10,
    minScore: Math.min(SIMILAR_SHOW.trigram, opts.thresholds?.trigram ?? 1), where: [eq(items.kind, "idea")],
  });
  const keep = atLeast(rows, opts.thresholds ?? SIMILAR_SHOW).slice(0, opts.limit ?? 3);
  const mine = await myVoteWeights(tx, opts.userId, keep.map((r) => r.id));
  return keep.map((r) => ({ id: r.id, number: r.number, title: r.title, status: r.status, votes: r.votes, score: r.score, method: r.method, weight: mine.get(r.id) ?? 0 }));
}

/** The one strong match the form asks about on submit, unless the author already voted on or opened it (`seen`). */
export async function strongMatch(tx: Tx, opts: { text: string; pivot?: string | null; queryVector?: string | null; seen: number[]; userId?: string }) {
  const [top] = await similarIdeas(tx, { ...opts, limit: 1, thresholds: SIMILAR_STRONG });
  if (!top || opts.seen.includes(top.number)) return null;
  // The author's own idea with the same title is a repeated submit, which createItem answers with that idea.
  if (opts.userId && sameTitle(top.title, opts.text)) {
    const [own] = await tx.select({ authorId: items.authorId }).from(items).where(eq(items.id, top.id));
    if (own?.authorId === opts.userId) return null;
  }
  return { number: top.number, title: top.title, votes: top.votes, status: top.status };
}

/** Stored on an idea created despite similar ones (items.context.similarSeen): what its author was shown. */
export interface SimilarSeen { shown: { number: number; score: number }[]; strong?: number; reason?: string }

/** Untrusted form fields → SimilarSeen, or null when the author was shown nothing. */
export function cleanSimilarSeen(shownJson: string, strong: string, reason: string): SimilarSeen | null {
  let raw: unknown = [];
  try { raw = JSON.parse(shownJson || "[]"); } catch { /* ignore malformed */ }
  const shown = (Array.isArray(raw) ? raw : [])
    .filter((x): x is { number: number; score: number } => !!x && Number.isInteger(x.number) && x.number > 0 && typeof x.score === "number" && x.score >= 0 && x.score <= 1)
    .map((x) => ({ number: x.number, score: Math.round(x.score * 1000) / 1000 }))
    .filter((x, i, all) => all.findIndex((y) => y.number === x.number) === i)
    .slice(0, 10);
  const n = Number(strong);
  const s: SimilarSeen = { shown, ...(Number.isInteger(n) && n > 0 && { strong: n }) };
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 200);
  if (why && s.strong) s.reason = why;
  return s.shown.length || s.strong ? s : null;
}

/** Reads context.similarSeen back (null for bugs, older ideas and anything malformed). */
export function similarSeenOf(item: Pick<Item, "kind" | "context">): SimilarSeen | null {
  if (item.kind !== "idea" || !item.context || typeof item.context !== "object") return null;
  const s = (item.context as { similarSeen?: unknown }).similarSeen;
  if (!s || typeof s !== "object") return null;
  const v = s as Record<string, unknown>;
  return {
    shown: Array.isArray(v.shown) ? v.shown.filter((x): x is { number: number; score: number } => !!x && Number.isInteger((x as { number: unknown }).number)) : [],
    ...(Number.isInteger(v.strong) && { strong: v.strong as number }),
    ...(typeof v.reason === "string" && v.reason && { reason: v.reason }),
  };
}

/** The comment an author's draft becomes on an existing idea. */
export const draftComment = (title: string, body: string) => [title.trim(), body.trim()].filter(Boolean).join("\n\n");

/**
 * "Pridať hlas a môj popis k #N": the author's vote (if not yet; importance boards: level 1 within the budget,
 * without budget left only the comment) and their draft as their comment, through the normal paths (approval
 * queue, rate limits are the caller's). Returns whether the vote was added and whether the comment waits.
 */
export async function attachDraft(tx: Tx, project: Project, user: User, item: Item, text: string) {
  if (item.kind !== "idea" || item.deletedAt || item.pending || item.mergedIntoId) throw new DomainError((l) => translator(l, "errors")("ideaMissing"));
  const had = (await myVoteWeights(tx, user.id, [item.id])).get(item.id) ?? 0;
  const voted = had > 0 ? false : (await applyVote(tx, project, user.id, item.id, 1)).ok;
  const comment = await addCommentTo(tx, project, user, item, text, false);
  await countDuplicate(tx, project.id, "attached");
  return { voted, queued: comment.pending };
}

/**
 * "Oddeliť": undo a merge. The item is open again (ideas "open", bugs "new") with its own route; votes moved to
 * the original stay there (they cannot be told apart from votes cast there). Emits item.status_changed.
 */
export async function splitItem(tx: Tx, project: Project, actor: User, item: Item) {
  if (!item.mergedIntoId) throw fail((t) => t("notMerged", { n: String(item.number) }));
  if (item.deletedAt) throw fail((t) => t("deleted"));
  const [into] = await tx.select({ number: items.number }).from(items).where(eq(items.id, item.mergedIntoId));
  const status = item.kind === "idea" ? "open" : "new";
  const [moved] = await tx.update(items).set({ mergedIntoId: null, status, subStatusId: null, updatedAt: new Date() })
    .where(eq(items.id, item.id)).returning();
  await recordStatus(tx, project.id, item.id, item.status, status, null, actor.id);
  await emit(tx, project, "item.status_changed", { item: moved!, actorName: actor.name, previousStatus: item.status });
  await countDuplicate(tx, project.id, "split");
  return { item: moved!, from: into?.number ?? null };
}
