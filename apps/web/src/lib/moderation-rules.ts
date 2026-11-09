/**
 * Moderation rules, pure so they can be tested without a database.
 *
 * Who may change what:
 * - Team and admins may edit and delete any post or comment, approve or reject queued ideas and
 *   block people on the board.
 * - Authors may edit or delete their own post while the team has not picked it up yet: it is
 *   still at its first stop (idea "open", bug "new"), it is not a merged duplicate and nobody
 *   from the team has replied publicly. After that the post is part of a conversation (votes,
 *   answers, status e-mails), so changing it would change what others reacted to.
 * - Authors may edit their own comment for 30 minutes after posting it and delete it any time.
 * - Blocked people may read but not post, comment, vote or edit; team members cannot be blocked.
 *
 * Deleting is soft everywhere (who and when is kept): deleted posts disappear from every list,
 * search, MCP, widget, webhook and e-mail; deleted comments stay in the thread as a quiet
 * placeholder without their text.
 */

export const COMMENT_EDIT_WINDOW_MS = 30 * 60_000;
/** Same title from the same person within this window = a double submit, not a new post. */
export const DUPLICATE_ITEM_WINDOW_MS = 10 * 60_000;
export const DUPLICATE_COMMENT_WINDOW_MS = 2 * 60_000;
/** Name of the hidden form field that only bots fill in. */
export const HONEYPOT = "website";

type Role = "member" | "team" | "admin" | string;
export interface Actor { id: string; role: Role; blockedAt?: Date | null }

export const isTeam = (a: Pick<Actor, "role"> | null | undefined) => a?.role === "team" || a?.role === "admin";
export const isBlocked = (a: Pick<Actor, "role" | "blockedAt"> | null | undefined) => !!a?.blockedAt && !isTeam(a);

const FIRST_STOP = { idea: "open", bug: "new" } as const;

export interface PostState {
  kind: "idea" | "bug";
  authorId: string | null;
  status: string;
  mergedIntoId: string | null;
  deletedAt: Date | null;
}

/** May `actor` edit (or delete) this post? `teamReplied` = a public comment from the team exists. */
export function canEditPost(post: PostState, actor: Actor | null, teamReplied: boolean): boolean {
  if (!actor || post.deletedAt) return false;
  if (isTeam(actor)) return true;
  if (isBlocked(actor) || post.authorId !== actor.id) return false;
  return post.status === FIRST_STOP[post.kind] && !post.mergedIntoId && !teamReplied;
}

export interface CommentState { authorId: string | null; createdAt: Date; deletedAt: Date | null }

export function canEditComment(c: CommentState, actor: Actor | null, now = Date.now()): boolean {
  if (!actor || c.deletedAt) return false;
  if (isTeam(actor)) return true;
  return !isBlocked(actor) && c.authorId === actor.id && now - c.createdAt.getTime() <= COMMENT_EDIT_WINDOW_MS;
}

export function canDeleteComment(c: CommentState, actor: Actor | null): boolean {
  if (!actor || c.deletedAt) return false;
  return isTeam(actor) || (!isBlocked(actor) && c.authorId === actor.id);
}

/** Who may see a post at all (bugs: author + team; queued ideas: author + team; deleted: nobody). */
export function canSeePost(post: Pick<PostState, "kind" | "authorId" | "deletedAt"> & { pending: boolean }, viewer: Actor | null): boolean {
  if (post.deletedAt) return false;
  if (post.kind === "idea" && !post.pending) return true;
  return !!viewer && (isTeam(viewer) || post.authorId === viewer.id);
}

/** Visible to everybody who may see the board (lists, MCP, widget, webhooks): not queued, not deleted. */
export const isPublished = (post: { pending: boolean; deletedAt: Date | null }) => !post.pending && !post.deletedAt;

const LINK = /\bhttps?:\/\/\S+|\bwww\.[a-z0-9-]+\.[a-z]{2,}\S*/gi;
export const countLinks = (text: string) => text.match(LINK)?.length ?? 0;

/** Posts that look like link spam go to the queue even when the project does not moderate. */
export function looksLikeSpam(title: string, body: string): boolean {
  return countLinks(title) > 0 || countLinks(body) >= 3;
}

export type PendingReason = "approval" | "links";

/** Why a new post waits for the team, or null when it is published right away. Bugs are private and never queued. */
export function pendingReason(
  input: { kind: "idea" | "bug"; title: string; body: string }, author: Actor, project: { moderateIdeas: boolean },
): PendingReason | null {
  if (input.kind !== "idea" || isTeam(author)) return null;
  if (project.moderateIdeas) return "approval";
  return looksLikeSpam(input.title, input.body) ? "links" : null;
}

/**
 * A comment from outside the team that looks like link spam (same heuristic as a post body: three
 * or more links) waits for the team before anybody else sees it. Bug threads are private (reporter
 * and team only), so nothing there is queued; internal notes are team-only anyway.
 */
export function commentNeedsApproval(input: { kind: "idea" | "bug"; body: string }, author: Actor): boolean {
  if (input.kind !== "idea" || isTeam(author)) return false;
  return looksLikeSpam("", input.body);
}

/** Who may see a comment: published ones everybody who sees the post; queued ones their author and the team. */
export function canSeeComment(c: { pending: boolean; internal: boolean; authorId: string | null; deletedAt?: Date | null }, viewer: Actor | null): boolean {
  if (c.internal) return isTeam(viewer);
  if (!c.pending) return true;
  return !!viewer && (isTeam(viewer) || c.authorId === viewer.id);
}

/** Normalised title for the double-submit guard. */
export const sameTitle = (a: string, b: string) => a.trim().toLocaleLowerCase().replace(/\s+/g, " ") === b.trim().toLocaleLowerCase().replace(/\s+/g, " ");
