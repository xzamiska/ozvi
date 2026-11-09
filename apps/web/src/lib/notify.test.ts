import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { addCommentTo, changeStatus } = await import("./domain");
const { notifyNewIdea } = await import("./email/notify");

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `notify-${Date.now()}`;
type User = typeof schema.users.$inferSelect;
type Item = typeof schema.items.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let u: Record<"team" | "team2" | "author" | "voter" | "talker" | "stranger", User>;
let idea: Item;
let bug: Item;

/** Recipients of mails of one kind, sorted, then the outbox is cleared for the next case. */
async function sent(kind: string) {
  return withProject(db, project.id, async (tx) => {
    const rows = await tx.select({ to: schema.emails.to }).from(schema.emails)
      .where(and(eq(schema.emails.projectId, project.id), eq(schema.emails.kind, kind)));
    await tx.delete(schema.emails).where(eq(schema.emails.projectId, project.id));
    return rows.map((r) => r.to.split("@")[0]).sort();
  });
}

describe.skipIf(!up)("notifications follow the item", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "N" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "N test", theme: presets.ozvi, itemSeq: 2 }).returning())[0]!;
      const rows = await tx.insert(schema.users).values(
        (["team", "team2", "author", "voter", "talker", "stranger"] as const).map((n) => ({
          projectId: project.id, externalId: n, name: n, email: `${n}@x.sk`, role: n.startsWith("team") ? "team" as const : "member" as const,
        })),
      ).returning();
      u = Object.fromEntries(rows.map((r) => [r.externalId, r])) as typeof u;
      [idea, bug] = (await tx.insert(schema.items).values([
        { projectId: project.id, kind: "idea", number: 1, title: "Nápad", status: "open", authorId: u.author.id },
        { projectId: project.id, kind: "bug", number: 2, title: "Chyba", status: "new", authorId: u.author.id },
      ]).returning()) as [Item, Item];
      await tx.insert(schema.votes).values({ projectId: project.id, itemId: idea.id, userId: u.voter.id });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("a new idea reaches the team", async () => {
    await withProject(db, project.id, (tx) => notifyNewIdea(tx, project, idea));
    expect(await sent("new_idea")).toEqual(["team", "team2"]);
  });

  it("a comment on an idea reaches its author and the team, not voters or the commenter", async () => {
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, u.talker, idea, "Aj ja by som to chcel", false));
    expect(await sent("comment")).toEqual(["author", "team", "team2"]);
  });

  it("every status change reaches the author and commenters, not voters", async () => {
    await withProject(db, project.id, (tx) => changeStatus(tx, project, u.team, idea, "planned"));
    expect(await sent("idea_status")).toEqual(["author", "talker"]);
  });

  it("bug comments stay with the reporter and the team", async () => {
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, u.team, bug, "Pozrieme sa na to", false));
    expect(await sent("comment")).toEqual(["author", "team2"]);
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, u.author, bug, "Ďakujem", false));
    expect(await sent("comment")).toEqual(["team", "team2"]);
  });

  it("internal notes go to the team only", async () => {
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, u.team, bug, "Asi font", true));
    expect(await sent("comment_internal")).toEqual(["team2"]);
  });

  it("a bug status change tells the reporter and the team members following it", async () => {
    await withProject(db, project.id, (tx) => changeStatus(tx, project, u.team2, bug, "confirmed"));
    expect(await sent("bug_status")).toEqual(["author", "team"]);
  });
});
