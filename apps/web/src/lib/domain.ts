import { ITEM_STATUSES, schema, type Tx } from "@ozvi/db";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { notifyComment, notifyStatusChange } from "./email/notify";
import { emit } from "./events";
import { enqueueTrackerSync } from "./trackers";
import { proofSnapshot, type ProofSnapshot } from "./proof";
import type { Project, User } from "./project";
import { boardLocales } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { canSeePost, commentNeedsApproval, DUPLICATE_COMMENT_WINDOW_MS, isBlocked } from "./moderation-rules";
import type { ItemSource } from "./provenance";
import { sectionOfKind, sectionOn } from "./sections";

/**
 * Item changes shared by the board (server actions), MCP tools and integrations (GitHub).
 * Every function runs inside the caller's withProject transaction and enqueues e-mails and
 * webhooks in that same transaction. Permission checks stay with the caller (who knows the channel).
 */

const { items, comments, votes } = schema;
export type Item = typeof items.$inferSelect;


/**
 * A rule the change broke. `message` is Slovak (logs, MCP); show people `text(locale)`.
 */
export class DomainError extends Error {
  readonly text: (locale: Locale) => string;
  constructor(text: string | ((locale: Locale) => string)) {
    const f = typeof text === "string" ? () => text : text;
    super(f("sk"));
    this.text = f;
  }
}
type DomainT = ReturnType<typeof translator<"domain">>;
export function fail(text: (t: DomainT) => string): DomainError {
  return new DomainError((l) => text(translator(l, "domain")));
}

export const isTeamRole = (role: string | undefined | null) => role === "team" || role === "admin";

/**
 * Bugs are private: only the reporter and the team may see them. Ideas waiting in the moderation
 * queue: only their author and the team. Deleted posts: nobody (the item page has its own tombstone).
 */
export function canSee(item: Item, user: User | null): boolean {
  return canSeePost(item, user);
}

/** Blocked people may read the board but not post, comment, vote or edit. */
export function assertCanParticipate(user: Pick<User, "role" | "blockedAt">) {
  if (isBlocked(user)) throw fail((t) => t("blocked"));
}

export async function changeStatus(
  tx: Tx, project: Project, actor: User | null, item: Item, status: string, fixedInVersion?: string | null,
  opts: { notify?: boolean; subStatusId?: string | null; release?: { tag: string; url: string | null } | null } = {},
): Promise<Item | null> {
  const allowed = ITEM_STATUSES[item.kind] as readonly string[];
  if (!allowed.includes(status)) throw fail((t) => t("badStatus", { status, allowed: allowed.join(", ") }));
  const version = item.kind === "bug" ? (fixedInVersion === undefined ? item.fixedInVersion : fixedInVersion) : null;
  // Custom sub-status: kept while the item stays on its stage, cleared when the stage moves (the stage is the truth).
  let sub = opts.subStatusId !== undefined ? opts.subStatusId : item.status === status ? item.subStatusId : null;
  if (sub) {
    const [cs] = await tx.select({ kind: schema.customStatuses.kind, stage: schema.customStatuses.stage })
      .from(schema.customStatuses).where(eq(schema.customStatuses.id, sub));
    if (!cs) {
      if (opts.subStatusId) throw fail((t) => t("subMissing"));
      sub = null;
    } else if (cs.kind !== item.kind || cs.stage !== status) throw fail((t) => t("subStage"));
  }
  if (item.status === status && item.fixedInVersion === version && item.subStatusId === sub) return null;
  if (item.kind === "bug" && REOPENED.has(status) && DONE.has(item.status)) await forgetIssueClosures(tx, item.id);
  const [updated] = await tx.update(items).set({ status: status as Item["status"], fixedInVersion: version, subStatusId: sub, updatedAt: new Date() })
    .where(eq(items.id, item.id)).returning();
  // Proof of the fix (PRs, release, preview) travels with the stop that finished the item.
  const proof = PROOF_STOPS.has(status) && (item.status !== status || (version && version !== item.fixedInVersion))
    ? await proofSnapshot(tx, item.id, opts.release ?? null) : null;
  if (item.status !== status || (version && version !== item.fixedInVersion) || (sub && sub !== item.subStatusId)) {
    await recordStatus(tx, project.id, item.id, item.status, status, version, actor?.id ?? null, sub, proof);
  }
  if (item.status !== status) {
    if (opts.notify !== false) await notifyStatusChange(tx, project, updated!, actor?.id ?? "", proof);
    await emit(tx, project, "item.status_changed", { item: updated!, actorName: actor?.name, previousStatus: item.status, ...(proof ? { proof } : {}) });
  }
  return updated!;
}

/** One stop on the item's route (status history). */
export async function recordStatus(tx: Tx, projectId: string, itemId: string, from: string | null, to: string, version: string | null, actorId: string | null, subStatusId: string | null = null, proof: ProofSnapshot | null = null) {
  await tx.insert(schema.itemEvents).values({
    projectId, itemId, fromStatus: from as Item["status"] | null, toStatus: to as Item["status"], version, actorId, subStatusId, proof,
  });
}

/** Stops that finish an item: they carry the proof of the fix. */
const PROOF_STOPS = new Set(["fixed", "shipped"]);

const REOPENED = new Set(["new", "confirmed", "in_progress"]);
const DONE = new Set(["fixed", "verified"]);

/**
 * A reopened bug must not be marked fixed again by the next GitHub release just because its
 * linked issue is still closed; the issue has to close again first.
 */
export async function forgetIssueClosures(tx: Tx, itemId: string) {
  await tx.update(schema.itemLinks).set({ closedAt: null }).where(eq(schema.itemLinks.itemId, itemId));
}

export async function addCommentTo(
  tx: Tx, project: Project, actor: User, item: Item, body: string, internal: boolean, source: ItemSource = "board",
) {
  const text = body.trim();
  assertCanParticipate(actor);
  if (item.deletedAt) throw fail((t) => t("deleted"));
  // A switched-off section takes no new comments either (board, API, MCP).
  if (!sectionOn(project, sectionOfKind(item.kind))) throw new DomainError((l) => translator(l, "errors")("sectionOff"));
  if (!text) throw fail((t) => t("emptyComment"));
  if (text.length > 5000) throw fail((t) => t("longComment"));
  const isInternal = internal && isTeamRole(actor.role);
  // Double submit (two clicks, a retried request): the same text from the same person a moment ago is the same comment.
  const [dup] = await tx.select().from(comments).where(and(eq(comments.itemId, item.id), eq(comments.authorId, actor.id),
    eq(comments.body, text), isNull(comments.deletedAt), gte(comments.createdAt, new Date(Date.now() - DUPLICATE_COMMENT_WINDOW_MS))))
    .orderBy(desc(comments.createdAt)).limit(1);
  if (dup) return dup;
  // Link spam from outside the team waits for approval: only its author and the team see it until then.
  const pending = !isInternal && commentNeedsApproval({ kind: item.kind, body: text }, actor);
  const [c] = await tx.insert(comments).values({ projectId: project.id, itemId: item.id, authorId: actor.id, body: text, internal: isInternal, pending, source }).returning();
  await notifyComment(tx, project, item, {
    authorId: actor.id, authorName: actor.name, body: text, commentId: c!.id, audience: isInternal ? "internal" : pending ? "queued" : "all",
  });
  if (!isInternal && !pending) await emit(tx, project, "comment.created", { item, actorName: actor.name, comment: { body: text, authorId: actor.id, source } });
  // Internal notes never reach webhooks; a tracker may still mirror them when the team chose "all comments".
  if (isInternal && !item.pending) await enqueueTrackerSync(tx, project, "comment", item, { comment: { body: text, authorId: actor.id, source, internal: true } });
  return c!;
}

/**
 * Duplicate → original. Votes move to the original (one per user, highest weight wins), the duplicate
 * disappears from lists and points at the original. Both must be the same kind.
 */
export async function mergeItems(tx: Tx, project: Project, actor: User, source: Item, target: Item) {
  if (source.id === target.id) throw fail((t) => t("mergeSelf"));
  if (source.kind !== target.kind) throw fail((t) => t("mergeKinds"));
  if (source.mergedIntoId) throw fail((t) => t("alreadyMerged", { n: String(source.number) }));
  if (target.mergedIntoId) throw fail((t) => t("targetMerged", { n: String(target.number) }));
  if (source.deletedAt || target.deletedAt) throw fail((t) => t("deleted"));
  if (source.pending || target.pending) throw fail((t) => t("mergePending"));

  await tx.execute(sql`
    insert into ${votes} (project_id, item_id, user_id, weight, created_at)
    select project_id, ${target.id}, user_id, weight, created_at from ${votes} where item_id = ${source.id}
    on conflict (item_id, user_id) do update set weight = greatest(${votes}.weight, excluded.weight)`);
  await tx.delete(votes).where(eq(votes.itemId, source.id));
  const [updatedTarget] = await tx.update(items)
    .set({ voteCount: sql`(select coalesce(sum(${votes.weight}), 0) from ${votes} where ${votes.itemId} = ${target.id})`, updatedAt: new Date() })
    .where(eq(items.id, target.id)).returning();
  const closed = source.kind === "idea" ? "declined" : "wont_fix";
  const [updatedSource] = await tx.update(items)
    .set({ mergedIntoId: target.id, status: closed, subStatusId: null, voteCount: 0, updatedAt: new Date() })
    .where(and(eq(items.id, source.id))).returning();
  // Bugs are private per reporter: the duplicate's reporter must not learn the original's title.
  // The note is stored content, so it is written once, in the board's default language.
  const t = translator(boardLocales(project).fallback, "domain");
  await tx.insert(comments).values({
    projectId: project.id, itemId: source.id, authorId: actor.id,
    body: source.kind === "idea" ? t("mergedIdea", { n: String(target.number), title: target.title }) : t("mergedBug"),
  });
  await emit(tx, project, "item.merged", { item: updatedSource!, actorName: actor.name, mergedInto: { number: target.number, title: target.title } });
  return { source: updatedSource!, target: updatedTarget! };
}

export async function itemByNumber(tx: Tx, number: number) {
  return (await tx.query.items.findFirst({ where: eq(items.number, number) })) ?? null;
}
