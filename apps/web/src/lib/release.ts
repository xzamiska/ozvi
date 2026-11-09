import { schema, withProject, type Db, type Tx } from "@ozvi/db";
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { boardLocales } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { AI_MODEL, draftReleaseChangelog, type ReleaseDraftInput } from "./ai";
import type { Item } from "./domain";
import { notifyReleaseDraft } from "./email/notify";
import { projectOrigin } from "./email/url";
import type { Project } from "./project";

/**
 * The release-driven loop: a published GitHub release marks linked bugs fixed and ideas shipped
 * (github.ts) and drafts one changelog entry from them. The draft is never published automatically:
 * the team gets an e-mail, edits and publishes it, and only then voters hear about it (once).
 *
 * The draft starts as a deterministic template (inside the webhook transaction). With AI available the
 * text is rewritten by the AI model afterwards, outside any transaction (enrichReleaseDraft), unless the team
 * already touched it. Either way the item list with links is generated here, never by the model.
 */

const { changelogEntries, changelogItems, items, itemProofs } = schema;

export interface ReleaseInfo { tag: string; url: string | null; name?: string | null }

const itemLine = (slug: string, i: Pick<Item, "number" | "title">) => `- [${i.title.replace(/[[\]]/g, "")}](/${slug}/i/${i.number})`;

/** The deterministic draft (also the fallback when AI is off or fails). Bugs are private: counted, never named. */
export function releaseDraftTemplate(locale: Locale, d: { tag: string; slug: string; ideas: Pick<Item, "number" | "title">[]; bugs: number }) {
  const t = translator(locale, "release");
  const parts: string[] = [];
  if (d.ideas.length) parts.push(t("lead", { version: d.tag }), d.ideas.map((i) => itemLine(d.slug, i)).join("\n"));
  if (d.bugs) parts.push(d.ideas.length ? t("alsoFixes", { n: d.bugs }) : t("onlyFixes", { version: d.tag, n: d.bugs }));
  parts.push(t("thanks"));
  return { title: t("title", { version: d.tag }).slice(0, 200), body: parts.join("\n\n") };
}

/** Ideas fit for a public list: not merged, queued or deleted. */
const listable = (i: Item) => !i.mergedIntoId && !i.pending && !i.deletedAt;

/**
 * Creates the release's draft entry from the items this release changed. Idempotent per tag (GitHub
 * redelivers webhooks). Returns the entry id, or null when there was nothing to draft.
 */
export async function createReleaseDraft(tx: Tx, project: Project, release: ReleaseInfo, changed: Item[], opts: { ai: boolean }): Promise<string | null> {
  const ideas = changed.filter((i) => i.kind === "idea" && listable(i));
  const bugs = changed.filter((i) => i.kind === "bug" && !i.deletedAt);
  if (ideas.length === 0 && bugs.length === 0) return null;
  const locale = boardLocales(project).fallback;
  const { title, body } = releaseDraftTemplate(locale, { tag: release.tag, slug: project.slug, ideas, bugs: bugs.length });
  const [entry] = await tx.insert(changelogEntries).values({
    projectId: project.id, title, body, authorId: null, releaseTag: release.tag, releaseUrl: release.url, aiPending: opts.ai,
  }).onConflictDoNothing({ target: [changelogEntries.projectId, changelogEntries.releaseTag] }).returning({ id: changelogEntries.id });
  if (!entry) return null;
  await tx.insert(changelogItems).values([...ideas, ...bugs].map((i) => ({ projectId: project.id, entryId: entry.id, itemId: i.id })));
  await notifyReleaseDraft(tx, project, {
    tag: release.tag, title, ideas: ideas.length, bugs: bugs.length,
    editUrl: `${projectOrigin(project)}/${project.slug}/changelog/${entry.id}/edit`,
  });
  return entry.id;
}

type Drafter = (input: ReleaseDraftInput, productName: string, locale: Locale) => Promise<{ title: string; body: string }>;

/**
 * Rewrites a pending release draft with AI. Runs outside any transaction (the model call can take a
 * while); the update applies only if the draft is still unpublished and nobody edited it meanwhile.
 * On failure the template stays and the pending flag is cleared. Returns whether the AI text landed.
 */
export async function enrichReleaseDraft(db: Db, project: Project, entryId: string, notes: string, draft: Drafter = draftReleaseChangelog): Promise<boolean> {
  const data = await withProject(db, project.id, async (tx) => {
    const entry = await tx.query.changelogEntries.findFirst({ where: eq(changelogEntries.id, entryId) });
    if (!entry || entry.publishedAt || !entry.aiPending) return null;
    const linked = (await tx.select({ item: items }).from(changelogItems).innerJoin(items, eq(items.id, changelogItems.itemId))
      .where(eq(changelogItems.entryId, entryId))).map((r) => r.item);
    const prs = linked.length ? await tx.selectDistinct({ title: itemProofs.title }).from(itemProofs)
      .where(and(inArray(itemProofs.itemId, linked.map((i) => i.id)), eq(itemProofs.kind, "pr"))).limit(30) : [];
    return { entry, linked, prs: prs.flatMap((p) => (p.title ? [p.title.slice(0, 200)] : [])) };
  });
  if (!data) return false;
  const ideas = data.linked.filter((i) => i.kind === "idea" && listable(i));
  const locale = boardLocales(project).fallback;
  let text: { title: string; body: string };
  try {
    text = await draft({
      version: data.entry.releaseTag ?? "",
      ideas: ideas.map((i) => ({ number: i.number, title: i.title, body: i.body.slice(0, 1500), votes: i.voteCount })),
      fixedBugs: data.linked.filter((i) => i.kind === "bug").length,
      pullRequests: data.prs,
      notes,
    }, project.name, locale);
    if (!text.title || text.title.length < 3) throw new Error("empty title");
  } catch (e) {
    console.warn("[ozvi] release draft AI failed", e instanceof Error ? e.message : e);
    await withProject(db, project.id, (tx) => tx.update(changelogEntries).set({ aiPending: false })
      .where(and(eq(changelogEntries.id, entryId), eq(changelogEntries.aiPending, true))));
    return false;
  }
  // The item list (with links) is ours, not the model's.
  const list = ideas.map((i) => itemLine(project.slug, i)).join("\n");
  const body = [text.body.trim(), list].filter(Boolean).join("\n\n").slice(0, 20_000);
  const done = await withProject(db, project.id, (tx) => tx.update(changelogEntries)
    .set({ title: text.title.slice(0, 200), body, aiModel: AI_MODEL(), aiPending: false, updatedAt: new Date() })
    .where(and(eq(changelogEntries.id, entryId), eq(changelogEntries.aiPending, true), isNull(changelogEntries.publishedAt)))
    .returning({ id: changelogEntries.id }));
  return done.length > 0;
}

/* ---------- "Vydané, ale neoznámené" ---------- */

/** Announced = linked to a published changelog entry. */
// "items"."id" spelled out: in a select list drizzle renders columns unqualified, which would bind to ce.id here.
const announcedSql = sql`exists (select 1 from ${changelogItems} ci join ${changelogEntries} ce on ce.id = ci.entry_id
  where ci.item_id = "items"."id" and ce.published_at is not null)`;
const inDraftSql = sql<boolean>`exists (select 1 from ${changelogItems} ci join ${changelogEntries} ce on ce.id = ci.entry_id
  where ci.item_id = "items"."id" and ce.published_at is null)`;

/** Shipped ideas and fixed/verified bugs that no published changelog entry mentions yet. */
export function unannouncedWhere(): SQL {
  return and(
    or(and(eq(items.kind, "idea"), eq(items.status, "shipped")), and(eq(items.kind, "bug"), inArray(items.status, ["fixed", "verified"]))),
    isNull(items.mergedIntoId), isNull(items.deletedAt), eq(items.pending, false), sql`not ${announcedSql}`,
  )!;
}

export async function listUnannounced(tx: Tx, limit = 50) {
  return tx.select({
    id: items.id, number: items.number, kind: items.kind, title: items.title, status: items.status,
    fixedInVersion: items.fixedInVersion, votes: items.voteCount, updatedAt: items.updatedAt, inDraft: inDraftSql,
  }).from(items).where(unannouncedWhere()).orderBy(desc(items.updatedAt)).limit(limit);
}

export async function countUnannounced(tx: Tx): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(items).where(unannouncedWhere());
  return r?.n ?? 0;
}

/** Drafts waiting for the team (release drafts first). */
export async function pendingDrafts(tx: Tx) {
  return tx.select({ id: changelogEntries.id, title: changelogEntries.title, releaseTag: changelogEntries.releaseTag, aiPending: changelogEntries.aiPending, createdAt: changelogEntries.createdAt })
    .from(changelogEntries).where(isNull(changelogEntries.publishedAt)).orderBy(desc(changelogEntries.createdAt)).limit(20);
}
