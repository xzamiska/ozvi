import { schema, type Tx } from "@ozvi/db";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { changeStatus, DomainError, type Item } from "./domain";
import { AI_MODEL } from "./ai";
import { changelogReach, notifyChangelog } from "./email/notify";
import { emitChangelog } from "./events";
import { projectOrigin } from "./email/url";
import type { Project, User } from "./project";
import { translator } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";
import { changelogEntryUrl } from "@/lib/changelog-anchor";

const { changelogEntries, changelogItems, items } = schema;
export type Entry = typeof changelogEntries.$inferSelect;

export interface EntryInput {
  title: string; body: string; itemIds: string[];
  /** The text was (co-)written with the AI draft button: the entry carries the AI label from now on. */
  ai?: boolean;
}

/**
 * Machine-readable AI label (EU AI Act art. 50) for API exports, webhooks and MCP:
 * null when people wrote it; otherwise which model and who approved it (null while it is a draft).
 */
export interface AiLabel { generated: true; model: string; reviewedBy: string | null; reviewedAt: string | null }
export function aiLabel(entry: Pick<Entry, "aiModel" | "reviewedAt">, reviewerName: string | null): AiLabel | null {
  return entry.aiModel ? { generated: true, model: entry.aiModel, reviewedBy: entry.reviewedAt ? reviewerName ?? "" : null, reviewedAt: entry.reviewedAt?.toISOString() ?? null } : null;
}

function validate(i: EntryInput, locale: Locale) {
  const title = i.title.trim();
  if (title.length < 3 || title.length > 200) throw new DomainError(translator(locale, "errors")("entryTitle"));
  if (i.body.length > 20_000) throw new DomainError(translator(locale, "errors")("entryBody"));
  return { title, body: i.body.trim(), itemIds: [...new Set(i.itemIds)].slice(0, 50), ai: !!i.ai };
}

/** Creates or updates a draft (published entries can be edited too; that never re-sends e-mails). */
export async function saveEntry(tx: Tx, project: Project, actor: User, input: EntryInput, id?: string, locale: Locale = "sk"): Promise<Entry> {
  const v = validate(input, locale);
  const linked = v.itemIds.length ? await tx.select({ id: items.id }).from(items).where(inArray(items.id, v.itemIds)) : [];
  let entry: Entry;
  if (id) {
    // A person saved it: a pending AI rewrite of a release draft must not overwrite their text.
    const [e] = await tx.update(changelogEntries).set({ title: v.title, body: v.body, aiPending: false, updatedAt: new Date(), ...(v.ai ? { aiModel: AI_MODEL() } : {}) })
      .where(eq(changelogEntries.id, id)).returning();
    if (!e) throw new DomainError(translator(locale, "errors")("entryMissing"));
    entry = e;
    await tx.delete(changelogItems).where(eq(changelogItems.entryId, id));
  } else {
    [entry] = (await tx.insert(changelogEntries).values({ projectId: project.id, title: v.title, body: v.body, authorId: actor.id, aiModel: v.ai ? AI_MODEL() : null }).returning()) as [Entry];
  }
  if (linked.length) await tx.insert(changelogItems).values(linked.map((l) => ({ projectId: project.id, entryId: entry.id, itemId: l.id })));
  return entry;
}

export async function entryItems(tx: Tx, entryId: string): Promise<Item[]> {
  return (await tx.select({ item: items }).from(changelogItems).innerJoin(items, eq(items.id, changelogItems.itemId))
    .where(eq(changelogItems.entryId, entryId))).map((r) => r.item);
}

/** Linked items that publishing ships (and announces): live ideas, not declined. */
const shippable = (i: Item) => i.kind === "idea" && !i.mergedIntoId && !i.pending && !i.deletedAt && i.status !== "declined";

/** Voters hear about an idea once: ideas already announced in another published entry are skipped. */
async function unannounced(tx: Tx, ideas: Item[], entryId: string | null): Promise<Item[]> {
  if (ideas.length === 0) return [];
  const announced = new Set((await tx.select({ id: changelogItems.itemId }).from(changelogItems)
    .innerJoin(changelogEntries, eq(changelogEntries.id, changelogItems.entryId))
    .where(and(inArray(changelogItems.itemId, ideas.map((i) => i.id)), ...(entryId ? [ne(changelogEntries.id, entryId)] : []), isNotNull(changelogEntries.publishedAt)))).map((r) => r.id));
  return ideas.filter((i) => !announced.has(i.id));
}

/**
 * Who publishing would e-mail, per linked item (empty for bugs, declined or already announced ideas): the same
 * people and rules as publishEntry, so the number shown before publishing is the one that goes out.
 */
export async function publishReach(tx: Tx, list: Item[], actorId: string | null, entryId: string | null): Promise<Map<string, string[]>> {
  const reach = await changelogReach(tx, await unannounced(tx, list.filter(shippable), entryId), actorId);
  return new Map(list.map((i) => [i.id, reach.get(i.id) ?? []]));
}

/** The changelog form's candidates with who publishing would e-mail for each (`reach`). */
export async function withReach<C extends { id: string }>(tx: Tx, candidates: C[], actorId: string | null, entryId: string | null): Promise<(C & { reach: string[] })[]> {
  const list = candidates.length ? await tx.select().from(items).where(inArray(items.id, candidates.map((c) => c.id))) : [];
  const reach = await publishReach(tx, list, actorId, entryId);
  return candidates.map((c) => ({ ...c, reach: reach.get(c.id) ?? [] }));
}

/**
 * Publishing: linked ideas become "shipped" (quietly — the changelog e-mail replaces the status
 * e-mail) and every voter gets one e-mail with the entry. Publishing twice does nothing.
 */
export async function publishEntry(tx: Tx, project: Project, actor: User | null, entryId: string, locale: Locale = "sk"): Promise<{ entry: Entry; emailed: number; fresh: boolean }> {
  const [entry] = await tx.select().from(changelogEntries).where(eq(changelogEntries.id, entryId)).for("update");
  if (!entry) throw new DomainError(translator(locale, "errors")("entryMissing"));
  if (entry.publishedAt) return { entry, emailed: 0, fresh: false };
  // Publishing is the human approval: the publisher is recorded as the reviewer (shown next to an AI label).
  const now = new Date();
  const [published] = await tx.update(changelogEntries).set({ publishedAt: now, updatedAt: now, aiPending: false, reviewedById: actor?.id ?? null, reviewedAt: actor ? now : null })
    .where(and(eq(changelogEntries.id, entryId))).returning();
  const linked = await entryItems(tx, entryId);
  const ideas = linked.filter(shippable);
  for (const idea of ideas) {
    if (idea.status !== "shipped") await changeStatus(tx, project, actor, idea, "shipped", undefined, { notify: false });
  }
  const fresh = await unannounced(tx, ideas, entryId);
  const url = changelogEntryUrl(`${projectOrigin(project)}/${project.slug}`, entryId);
  const emailed = await notifyChangelog(tx, project, { title: published!.title, body: published!.body, url }, fresh, actor?.id ?? null);
  await emitChangelog(tx, project, {
    title: published!.title, body: published!.body, url, version: published!.releaseTag,
    publishedAt: published!.publishedAt!.toISOString(),
    ideas: ideas.map((i) => ({ number: i.number, title: i.title, url: `${projectOrigin(project)}/${project.slug}/i/${i.number}` })),
    ai: aiLabel(published!, actor?.name ?? null),
  });
  return { entry: published!, emailed, fresh: true };
}
