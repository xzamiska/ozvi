import { schema, withProject, type Tx } from "@ozvi/db";
import { aiLabel } from "./changelog";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { discard } from "./attachments";
import { db } from "./db";
import type { Project, User } from "./project";

/**
 * GDPR: a person's own data (export, erase) and a whole project (export, delete).
 * Erasing a person deletes their votes, comments, e-mails and sessions; their ideas stay without
 * an author (other people voted on them), their bug reports are deleted with attachments.
 */

const { items, comments, votes, attachments, users, emails } = schema;

export async function exportMine(project: Project, user: User) {
  return withProject(db, project.id, async (tx) => {
    const myItems = await tx.select({ number: items.number, kind: items.kind, title: items.title, body: items.body, status: items.status, createdAt: items.createdAt, context: items.context })
      .from(items).where(eq(items.authorId, user.id)).orderBy(asc(items.number));
    const myComments = await tx.select({ item: items.number, body: comments.body, createdAt: comments.createdAt })
      .from(comments).innerJoin(items, eq(items.id, comments.itemId)).where(eq(comments.authorId, user.id));
    const myVotes = await tx.select({ item: items.number, title: items.title, weight: votes.weight, createdAt: votes.createdAt })
      .from(votes).innerJoin(items, eq(items.id, votes.itemId)).where(eq(votes.userId, user.id));
    return {
      exportedAt: new Date().toISOString(), project: project.name,
      profile: { email: user.email, name: user.name, avatarUrl: user.avatarUrl, traits: user.traits, role: user.role, createdAt: user.createdAt, emailOptOut: user.emailOptOut },
      items: myItems, comments: myComments, votes: myVotes,
    };
  });
}

async function eraseIn(tx: Tx, userId: string): Promise<string[]> {
  const bugIds = (await tx.select({ id: items.id }).from(items).where(and(eq(items.authorId, userId), eq(items.kind, "bug")))).map((i) => i.id);
  const keys = bugIds.length ? (await tx.select({ k: attachments.storageKey }).from(attachments).where(inArray(attachments.itemId, bugIds))).map((r) => r.k) : [];
  if (bugIds.length) await tx.delete(items).where(inArray(items.id, bugIds));
  // Their votes disappear: recount the ideas they were on.
  const voted = (await tx.select({ id: votes.itemId }).from(votes).where(eq(votes.userId, userId))).map((v) => v.id);
  await tx.delete(votes).where(eq(votes.userId, userId));
  if (voted.length) {
    await tx.update(items).set({ voteCount: sql`(select coalesce(sum(${votes.weight}), 0) from ${votes} where ${votes.itemId} = ${items.id})` })
      .where(inArray(items.id, voted));
  }
  // Their ideas stay (others voted on them) but lose the author and the captured technical context.
  await tx.update(items).set({ context: null }).where(eq(items.authorId, userId));
  await tx.delete(comments).where(eq(comments.authorId, userId));
  await tx.delete(emails).where(eq(emails.userId, userId));
  await tx.delete(users).where(eq(users.id, userId));
  return keys;
}

export async function eraseMe(project: Project, user: User) {
  const keys = await withProject(db, project.id, (tx) => eraseIn(tx, user.id));
  await discard(keys);
}

export async function exportProject(project: Project) {
  return withProject(db, project.id, async (tx) => ({
    exportedAt: new Date().toISOString(),
    project: { slug: project.slug, name: project.name, theme: project.theme },
    users: await tx.select({ id: users.id, externalId: users.externalId, email: users.email, name: users.name, role: users.role, traits: users.traits, createdAt: users.createdAt }).from(users),
    items: await tx.select().from(items).orderBy(asc(items.number)),
    comments: await tx.select().from(comments).orderBy(asc(comments.createdAt)),
    votes: await tx.select().from(votes),
    attachments: await tx.select({ id: attachments.id, itemId: attachments.itemId, name: attachments.name, mime: attachments.mime, bytes: attachments.bytes }).from(attachments),
    // With the machine-readable AI label (EU AI Act art. 50): null = written by people.
    changelog: (await tx.select({ e: schema.changelogEntries, reviewer: users.name }).from(schema.changelogEntries)
      .leftJoin(users, eq(users.id, schema.changelogEntries.reviewedById))).map(({ e, reviewer }) => ({ ...e, ai: aiLabel(e, reviewer) })),
    // Tags (public and team-only: this is the admin's export), where they are used, and custom statuses.
    tags: await tx.select().from(schema.tags).orderBy(asc(schema.tags.name)),
    itemTags: await tx.select({ itemId: schema.itemTags.itemId, tagId: schema.itemTags.tagId, createdAt: schema.itemTags.createdAt }).from(schema.itemTags),
    statuses: { labels: project.statusLabels, subStatuses: await tx.select().from(schema.customStatuses) },
  }));
}

/** Deletes the project and everything in it, including stored files. */
export async function deleteProject(project: Project) {
  const keys = await withProject(db, project.id, async (tx) => (await tx.select({ k: attachments.storageKey }).from(attachments)).map((r) => r.k));
  await db.delete(schema.projects).where(eq(schema.projects.id, project.id));
  await discard(keys);
}
