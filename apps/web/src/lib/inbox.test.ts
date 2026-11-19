import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { inboxActivity, inboxSince, markInboxRead, INBOX_DEFAULT_DAYS } = await import("./inbox");
const { addCommentTo, changeStatus } = await import("./domain");

const db = createDb();
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `inbox-${Date.now().toString(36)}`;
type User = typeof schema.users.$inferSelect;
type Item = typeof schema.items.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let u: Record<"anna" | "boris" | "jana", User>;
let idea: Item, bug: Item, old: Item;
const kinds = ["idea", "bug"] as const;
const tx = <T>(f: (t: Parameters<Parameters<typeof withProject>[2]>[0]) => Promise<T>) => withProject(db, project.id, f);

describe.skipIf(!up)("team inbox", () => {
  const before = new Date(Date.now() - 60_000);
  beforeAll(async () => {
    await withSystem(db, async (t) => {
      const [w] = await t.insert(schema.workspaces).values({ slug, name: slug }).returning();
      project = (await t.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Inbox", theme: presets.ozvi, itemSeq: 3 }).returning())[0]!;
      const rows = await t.insert(schema.users).values([
        { projectId: project.id, externalId: "anna", name: "Anna", email: "anna@x.sk", role: "admin" as const },
        { projectId: project.id, externalId: "boris", name: "Boris", email: "boris@x.sk", role: "team" as const },
        { projectId: project.id, externalId: "jana", name: "Jana", email: "jana@x.sk", role: "member" as const },
      ]).returning();
      u = Object.fromEntries(rows.map((r) => [r.externalId, r])) as typeof u;
      // An old item (before `before`), and two new ones: Jana's idea and Anna's own bug.
      [old, idea, bug] = (await t.insert(schema.items).values([
        { projectId: project.id, kind: "idea", number: 1, title: "Staré", status: "open", authorId: u.jana.id, createdAt: new Date(Date.now() - 30 * 86_400_000) },
        { projectId: project.id, kind: "idea", number: 2, title: "Export", status: "open", authorId: u.jana.id },
        { projectId: project.id, kind: "bug", number: 3, title: "Faktúra", status: "new", authorId: u.anna.id },
      ]).returning()) as [Item, Item, Item];
    });
  });
  afterAll(async () => {
    await withSystem(db, (t) => t.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("new items by others count; my own item does not; old items do not", async () => {
    const news = await tx((t) => inboxActivity(t, u.anna.id, before, kinds));
    expect(news.map((n) => n.itemId)).toEqual([idea.id]);
    expect(news[0]).toMatchObject({ created: true, comments: 0, statuses: 0 });
  });

  it("others' comments (internal notes too) and status changes count; mine do not", async () => {
    await tx((t) => addCommentTo(t, project, u.jana, old, "Stále to chcem.", false));
    await tx((t) => addCommentTo(t, project, u.boris, bug, "Pozriem sa na to.", true));
    await tx((t) => addCommentTo(t, project, u.anna, idea, "Vďaka.", false));
    await tx(async (t) => changeStatus(t, project, u.boris, (await t.query.items.findFirst({ where: eq(schema.items.id, old.id) }))!, "planned"));
    const news = await tx((t) => inboxActivity(t, u.anna.id, before, kinds));
    const by = new Map(news.map((n) => [n.itemId, n]));
    expect(by.get(old.id)).toMatchObject({ created: false, comments: 1, statuses: 1 });
    expect(by.get(bug.id)).toMatchObject({ created: false, comments: 1 });
    expect(by.get(idea.id)).toMatchObject({ created: true, comments: 0 });
    // Newest activity first: the status change on the old item was the last thing that happened.
    expect(news[0]!.itemId).toBe(old.id);
    // Boris sees Anna's comment and Anna's bug, not his own note or status change.
    const boris = new Map((await tx((t) => inboxActivity(t, u.boris.id, before, kinds))).map((n) => [n.itemId, n]));
    expect(boris.get(idea.id)).toMatchObject({ comments: 1 });
    expect(boris.get(bug.id)).toMatchObject({ created: true, comments: 0 });
    expect(boris.get(old.id)).toMatchObject({ comments: 1, statuses: 0 });
  });

  it("switched-off sections, deleted and merged items stay out", async () => {
    expect((await tx((t) => inboxActivity(t, u.anna.id, before, ["idea"]))).some((n) => n.itemId === bug.id)).toBe(false);
    await tx((t) => t.update(schema.items).set({ deletedAt: new Date() }).where(eq(schema.items.id, idea.id)));
    expect((await tx((t) => inboxActivity(t, u.anna.id, before, kinds))).some((n) => n.itemId === idea.id)).toBe(false);
    await tx((t) => t.update(schema.items).set({ deletedAt: null }).where(eq(schema.items.id, idea.id)));
  });

  it("mark as read: per person, only what happened before the mark; without a mark the last 7 days", async () => {
    const now = new Date();
    expect(inboxSince(null, now).getTime()).toBe(now.getTime() - INBOX_DEFAULT_DAYS * 86_400_000);
    await tx((t) => markInboxRead(t, u.anna.id));
    const anna = (await tx((t) => t.query.users.findFirst({ where: eq(schema.users.id, u.anna.id) })))!;
    expect(await tx((t) => inboxActivity(t, u.anna.id, inboxSince(anna.inboxSeenAt), kinds))).toEqual([]);
    // Boris has not marked anything: his news are still there.
    expect((await tx((t) => inboxActivity(t, u.boris.id, inboxSince(null), kinds))).length).toBeGreaterThan(0);
    await tx((t) => addCommentTo(t, project, u.jana, idea, "Ešte jedna vec.", false));
    expect((await tx((t) => inboxActivity(t, u.anna.id, inboxSince(anna.inboxSeenAt), kinds))).map((n) => n.itemId)).toEqual([idea.id]);
  });
});
