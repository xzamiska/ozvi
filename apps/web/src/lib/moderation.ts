import { schema, type Tx } from "@ozvi/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { assertCanParticipate, fail, type Item } from "./domain";
import { emit } from "./events";
import { notifyComment, notifyRejected } from "./email/notify";
import { canDeleteComment, canEditComment, canEditPost, commentNeedsApproval, isTeam } from "./moderation-rules";
import type { Project, User } from "./project";

/**
 * Editing, soft deletion, the approval queue and blocking. Runs inside the caller's withProject
 * transaction; permission rules live in moderation-rules.ts (pure, tested). Callers log the
 * moderation action to the workspace activity afterwards.
 */

const { items, comments, users } = schema;
type Comment = typeof comments.$inferSelect;

/** Has anybody from the team answered publicly (not deleted)? Then the author can no longer change the post. */
export async function teamReplied(tx: Tx, itemId: string): Promise<boolean> {
  const [r] = await tx.select({ id: comments.id }).from(comments).innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.itemId, itemId), eq(comments.internal, false), isNull(comments.deletedAt), inArray(users.role, ["team", "admin"])))
    .limit(1);
  return !!r;
}

export async function editItem(tx: Tx, actor: User, item: Item, input: { title: string; body: string }): Promise<Item> {
  assertCanParticipate(actor);
  if (!canEditPost(item, actor, await teamReplied(tx, item.id))) throw fail((t) => t("cannotEditPost"));
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) throw fail((t) => t("titleShort"));
  if (title.length > 200) throw fail((t) => t("titleLong"));
  if (body.length > 10_000) throw fail((t) => t("bodyLong"));
  if (title === item.title && body === item.body) return item;
  const [updated] = await tx.update(items).set({ title, body, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(items.id, item.id)).returning();
  return updated!;
}

/** Soft delete by the author (while allowed) or the team; `reason` is shown to the author (rejection). */
export async function deleteItem(tx: Tx, actor: User, item: Item, reason?: string | null): Promise<Item> {
  assertCanParticipate(actor);
  if (!canEditPost(item, actor, await teamReplied(tx, item.id))) throw fail((t) => t("cannotDeletePost"));
  const [updated] = await tx.update(items).set({
    deletedAt: new Date(), deletedById: actor.id, deleteReason: isTeam(actor) ? (reason?.trim().slice(0, 500) || null) : null, updatedAt: new Date(),
  }).where(eq(items.id, item.id)).returning();
  // Cached AI translations (lib/translate.ts) go with the post; a restored post is translated again on request.
  await tx.delete(schema.contentTranslations).where(eq(schema.contentTranslations.subjectId, item.id));
  return updated!;
}

/** Team: bring a deleted post back (it returns to the queue if it was waiting there). */
export async function restoreItem(tx: Tx, actor: User, item: Item): Promise<Item> {
  if (!isTeam(actor)) throw fail((t) => t("teamOnly"));
  if (!item.deletedAt) return item;
  const [updated] = await tx.update(items).set({ deletedAt: null, deletedById: null, deleteReason: null, updatedAt: new Date() })
    .where(eq(items.id, item.id)).returning();
  return updated!;
}

/** Team: publish a queued idea. Webhooks hear about it only now (item.created); the team was e-mailed at submit. */
export async function approveItem(tx: Tx, project: Project, actor: User, item: Item): Promise<Item> {
  if (!isTeam(actor)) throw fail((t) => t("teamOnly"));
  if (item.deletedAt) throw fail((t) => t("deleted"));
  if (!item.pending) return item;
  const [updated] = await tx.update(items).set({ pending: false, pendingReason: null, updatedAt: new Date() })
    .where(eq(items.id, item.id)).returning();
  const [author] = item.authorId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, item.authorId)) : [];
  await emit(tx, project, "item.created", { item: updated!, actorName: author?.name ?? null });
  return updated!;
}

/**
 * Team: reject a queued idea = soft delete with an optional reason the author sees on the post.
 * The author also gets an e-mail with that reason (in their language, unless they opted out).
 */
export async function rejectItem(tx: Tx, project: Project, actor: User, item: Item, reason?: string | null): Promise<Item> {
  if (!isTeam(actor)) throw fail((t) => t("teamOnly"));
  if (!item.pending) throw fail((t) => t("notPending"));
  const rejected = await deleteItem(tx, actor, item, reason);
  await notifyRejected(tx, project, rejected, actor.id);
  return rejected;
}

export async function editComment(tx: Tx, actor: User, comment: Comment, body: string, now = Date.now()): Promise<Comment> {
  assertCanParticipate(actor);
  if (!canEditComment(comment, actor, now)) {
    throw fail((t) => (comment.authorId === actor.id && !comment.deletedAt ? t("editWindow") : t("cannotEditComment")));
  }
  const text = body.trim();
  if (!text) throw fail((t) => t("emptyComment"));
  if (text.length > 5000) throw fail((t) => t("longComment"));
  if (text === comment.body) return comment;
  // Adding links later must not slip past the queue: an edit that now looks like link spam waits again.
  const [item] = await tx.select({ kind: items.kind }).from(items).where(eq(items.id, comment.itemId));
  const pending = comment.pending || (!comment.internal && !!item && commentNeedsApproval({ kind: item.kind, body: text }, actor));
  const [updated] = await tx.update(comments).set({ body: text, editedAt: new Date(), pending }).where(eq(comments.id, comment.id)).returning();
  return updated!;
}

/** Team: publish a comment held for approval; the item's followers hear about it now (and webhooks). */
export async function approveComment(tx: Tx, project: Project, actor: User, item: Item, comment: Comment): Promise<Comment> {
  if (!isTeam(actor)) throw fail((t) => t("teamOnly"));
  if (comment.deletedAt || item.deletedAt) throw fail((t) => t("deleted"));
  if (!comment.pending) return comment;
  const [updated] = await tx.update(comments).set({ pending: false }).where(eq(comments.id, comment.id)).returning();
  const [author] = comment.authorId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, comment.authorId)) : [];
  if (comment.authorId) {
    await notifyComment(tx, project, item, { authorId: comment.authorId, authorName: author?.name ?? null, body: comment.body, commentId: comment.id, audience: "approved" });
  }
  await emit(tx, project, "comment.created", { item, actorName: author?.name ?? null, comment: { body: comment.body, authorId: comment.authorId, source: comment.source } });
  return updated!;
}

export async function deleteComment(tx: Tx, actor: User, comment: Comment): Promise<Comment> {
  assertCanParticipate(actor);
  if (!canDeleteComment(comment, actor)) throw fail((t) => t("cannotEditComment"));
  const [updated] = await tx.update(comments).set({ deletedAt: new Date(), deletedById: actor.id }).where(eq(comments.id, comment.id)).returning();
  // A deleted comment's text is never sent again: neither are its translations.
  await tx.delete(schema.contentTranslations).where(eq(schema.contentTranslations.subjectId, comment.id));
  return updated!;
}

/** Team: block or unblock somebody on this board. Team members cannot be blocked (change their role first). */
export async function setBlocked(tx: Tx, actor: User, target: User, blocked: boolean): Promise<User> {
  if (!isTeam(actor)) throw fail((t) => t("teamOnly"));
  if (isTeam(target) || target.id === actor.id) throw fail((t) => t("cannotBlockTeam"));
  const [updated] = await tx.update(users).set({ blockedAt: blocked ? (target.blockedAt ?? new Date()) : null })
    .where(eq(users.id, target.id)).returning();
  return updated!;
}
