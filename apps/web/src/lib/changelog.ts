import { schema, type Tx } from "@ozvi/db";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { changeStatus, DomainError, type Item } from "./domain";
import { AI_MODEL } from "./ai";
import { notifyChangelog } from "./email/notify";
import { emitChangelog } from "./events";
import { projectOrigin } from "./email/url";
import type { Project, User } from "./project";
import { translator } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";

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

/**
 * Publishing: linked ideas become "shipped" (quietly — the changelog e-mail replaces the status
 * e-mail) and every voter gets one e-mail with the entry. Publishing twice does nothing.
 */
export async function publishEntry(tx: Tx, project: Project, actor: User | null, entryId: string, locale: Locale = "sk"): Promise<{ entry: Entry; emailed: number }> {
  const [entry] = await tx.select().from(changelogEntries).where(eq(changelogEntries.id, entryId)).for("update");
  if (!entry) throw new DomainError(translator(locale, "errors")("entryMissing"));
  if (entry.publishedAt) return { entry, emailed: 0 };
  // Publishing is the human approval: the publisher is recorded as the reviewer (shown next to an AI label).
  const now = new Date();
  const [published] = await tx.update(changelogEntries).set({ publishedAt: now, updatedAt: now, aiPending: false, reviewedById: actor?.id ?? null, reviewedAt: actor ? now : null })
    .where(and(eq(changelogEntries.id, entryId))).returning();
  const linked = await entryItems(tx, entryId);
  const ideas = linked.filter((i) => i.kind === "idea" && !i.mergedIntoId && !i.pending && !i.deletedAt && i.status !== "declined");
  for (const idea of ideas) {
    if (idea.status !== "shipped") await changeStatus(tx, project, actor, idea, "shipped", undefined, { notify: false });
  }
  // Voters hear about an idea once: skip ideas already announced in an earlier published entry.
  const announced = ideas.length ? new Set((await tx.select({ id: changelogItems.itemId }).from(changelogItems)
    .innerJoin(changelogEntries, eq(changelogEntries.id, changelogItems.entryId))
    .where(and(inArray(changelogItems.itemId, ideas.map((i) => i.id)), ne(changelogEntries.id, entryId), isNotNull(changelogEntries.publishedAt)))).map((r) => r.id)) : new Set<string>();
  const fresh = ideas.filter((i) => !announced.has(i.id));
  const url = `${projectOrigin(project)}/${project.slug}/changelog#${entryId}`;
  const emailed = await notifyChangelog(tx, project, { title: published!.title, body: published!.body, url }, fresh, actor?.id ?? null);
  await emitChangelog(tx, project, {
    title: published!.title, body: published!.body, url, version: published!.releaseTag,
    publishedAt: published!.publishedAt!.toISOString(),
    ideas: ideas.map((i) => ({ number: i.number, title: i.title, url: `${projectOrigin(project)}/${project.slug}/i/${i.number}` })),
    ai: aiLabel(published!, actor?.name ?? null),
  });
  return { entry: published!, emailed };
}
