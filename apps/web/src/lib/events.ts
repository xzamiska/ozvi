import { schema, type Tx } from "@ozvi/db";
import { parseTheme } from "@ozvi/theme";
import { and, eq, inArray } from "drizzle-orm";
import type { Project } from "./project";
import { projectOrigin } from "./email/url";
import { markdownToText } from "./markdown";
import { authorOf, itemAuthorOf, sourceOf } from "./provenance";
import type { ProofSnapshot } from "./proof";
import { enqueueTrackerSync } from "./trackers";

/**
 * Domain events → webhook outbox. Called inside the transaction that caused the event, so a
 * rolled-back change never notifies anybody (same idea as e-mails, ADR-0007).
 */

export const EVENTS = ["item.created", "item.status_changed", "comment.created", "item.merged", "item.linked", "changelog.published", "item.tags_changed"] as const;
export type EventName = (typeof EVENTS)[number];

type Item = typeof schema.items.$inferSelect;

export interface EventData {
  item: Item;
  actorName?: string | null;
  /** authorId/source: provenance (author.trust, source) in the payload. */
  comment?: { body: string; authorId?: string | null; source?: string };
  /** item.tags_changed: public tag names before the change (the payload's item.tags is after). */
  previousTags?: string[];
  previousStatus?: string;
  mergedInto?: { number: number; title: string };
  link?: { ref: string; url: string };
  /** Proof of the fix/ship (PRs, release, preview) on item.status_changed to fixed/shipped. */
  proof?: ProofSnapshot;
}

/** The board in event payloads; logoUrl (https, from the theme) lets chat messages show the board's logo. */
function projectPayload(project: Project) {
  let logoUrl: string | undefined;
  try { logoUrl = parseTheme(project.theme).logoUrl; } catch { /* unreadable theme: no logo */ }
  return { slug: project.slug, name: project.name, ...(logoUrl && { logoUrl }) };
}

export function itemPayload(project: Project, item: Item) {
  return {
    number: item.number,
    kind: item.kind,
    title: item.title,
    /** Markdown source as written; `bodyText` is the same without Markdown syntax. */
    body: item.body,
    bodyText: markdownToText(item.body, { base: projectOrigin(project) }),
    status: item.status,
    fixedInVersion: item.fixedInVersion,
    votes: item.voteCount,
    url: `${projectOrigin(project)}/${project.slug}/i/${item.number}`,
    createdAt: item.createdAt,
  };
}

/**
 * Public tag names on the item. Team-only tags never leave Ozvi in webhooks: the receiving end may be a
 * public channel, and the endpoint is not a team member.
 */
export async function publicTagNames(tx: Tx, itemId: string): Promise<string[]> {
  const rows = await tx.select({ name: schema.tags.name }).from(schema.itemTags).innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
    .where(and(eq(schema.itemTags.itemId, itemId), eq(schema.tags.public, true)));
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
}

/** item.tags_changed detail: public tags only (team-only tags never leave Ozvi). */
export function tagDiff(previous: string[], current: string[]) {
  const low = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));
  const p = low(previous), c = low(current);
  return { previous, added: current.filter((x) => !p.has(x.toLowerCase())), removed: previous.filter((x) => !c.has(x.toLowerCase())) };
}

export async function emit(tx: Tx, project: Project, event: EventName, data: EventData) {
  // Queued (moderation) and deleted posts never leave Ozvi; approval emits item.created then.
  if (data.item.pending || data.item.deletedAt) return;
  // Linked Linear/Jira issues follow status moves and (optionally) public comments.
  if (event === "item.status_changed") await enqueueTrackerSync(tx, project, "status", data.item, { status: data.item.status });
  if (event === "comment.created" && data.comment) await enqueueTrackerSync(tx, project, "comment", data.item, { comment: data.comment });
  const hooks = await tx.select().from(schema.webhooks).where(and(eq(schema.webhooks.projectId, project.id), eq(schema.webhooks.active, true)));
  const targets = hooks.filter((h) => (h.events.length === 0 || h.events.includes(event)) && (data.item.kind !== "bug" || h.includeBugs));
  if (targets.length === 0) return;
  const ids = [data.item.authorId, data.comment?.authorId].filter((x): x is string => !!x);
  const people = ids.length ? await tx.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, externalId: schema.users.externalId, traits: schema.users.traits })
    .from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const person = (id: string | null | undefined) => authorOf(id ? people.find((p) => p.id === id) : null);
  const tags = await publicTagNames(tx, data.item.id);
  const payload = {
    event,
    project: projectPayload(project),
    // Provenance: author.trust (anonymous | email_verified | sso_customer | team) and source (board | widget | mcp | import | api).
    item: { ...itemPayload(project, data.item), tags, author: itemAuthorOf(data.item, people.find((p) => p.id === data.item.authorId)), source: sourceOf(data.item.source) },
    actor: data.actorName ? { name: data.actorName } : null,
    ...(data.comment && { comment: { body: data.comment.body, bodyText: markdownToText(data.comment.body, { base: projectOrigin(project) }),
      author: person(data.comment.authorId), source: sourceOf(data.comment.source) } }),
    ...(data.previousTags && { tagsChange: tagDiff(data.previousTags, tags) }),
    ...(data.previousStatus && { previousStatus: data.previousStatus }),
    ...(data.mergedInto && { mergedInto: data.mergedInto }),
    ...(data.link && { link: data.link }),
    ...(data.proof && { proof: data.proof }),
    at: new Date().toISOString(),
  };
  await tx.insert(schema.webhookDeliveries).values(targets.map((h) => ({ projectId: project.id, webhookId: h.id, event, payload })));
}

export interface ChangelogEventData {
  title: string; body: string; url: string; version: string | null; publishedAt: string;
  /** Shipped ideas only: bugs are private and never leave Ozvi through the changelog event. */
  ideas: { number: number; title: string; url: string }[];
  /** EU AI Act art. 50: null when people wrote it, otherwise the model and who approved it. */
  ai: { generated: true; model: string; reviewedBy: string | null; reviewedAt: string | null } | null;
}

/** changelog.published → webhook outbox (same transaction as the publish). */
export async function emitChangelog(tx: Tx, project: Project, entry: ChangelogEventData) {
  const event: EventName = "changelog.published";
  const hooks = await tx.select().from(schema.webhooks).where(and(eq(schema.webhooks.projectId, project.id), eq(schema.webhooks.active, true)));
  const targets = hooks.filter((h) => h.events.length === 0 || h.events.includes(event));
  if (targets.length === 0) return;
  const payload = {
    event,
    project: projectPayload(project),
    entry: { ...entry, bodyText: markdownToText(entry.body, { headings: true, base: projectOrigin(project), slug: project.slug }) },
    // Labelled at the top level too, so every consumer sees it without knowing the entry shape.
    ai: entry.ai ?? { generated: false },
    at: new Date().toISOString(),
  };
  await tx.insert(schema.webhookDeliveries).values(targets.map((h) => ({ projectId: project.id, webhookId: h.id, event, payload })));
}
