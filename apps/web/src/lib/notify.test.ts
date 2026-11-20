import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { addCommentTo, changeStatus, mergeItems } = await import("./domain");
const { notifyChangelog, notifyNewBug, notifyNewIdea } = await import("./email/notify");
const { applyVote } = await import("./votes");

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

  it("a nameless author is named like on the board: team member or user, never \"someone\"", async () => {
    const [anonTeam, anonMember] = await withSystem(db, (tx) => tx.insert(schema.users).values([
      { projectId: project.id, externalId: "anon-team", name: null, email: "anon-team@x.sk", role: "team" as const },
      { projectId: project.id, externalId: "anon-member", name: null, email: "anon-member@x.sk", role: "member" as const },
    ]).returning()) as [User, User];
    const text = async () => withProject(db, project.id, async (tx) => {
      const rows = await tx.select({ to: schema.emails.to, text: schema.emails.text }).from(schema.emails).where(eq(schema.emails.projectId, project.id));
      await tx.delete(schema.emails).where(eq(schema.emails.projectId, project.id));
      return rows;
    });
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, anonTeam, bug, "Pozreli sme sa na to.", false));
    const toAuthor = (await text()).find((r) => r.to === "author@x.sk")!;
    expect(toAuthor.text).toContain("Člen tímu pri hlásení #2");
    expect(toAuthor.text).not.toContain("Niekto");
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, anonMember, idea, "Aj mne by to pomohlo.", false));
    expect((await text()).find((r) => r.to === "team@x.sk")!.text).toContain("Používateľ pri nápade");
    await withSystem(db, (tx) => tx.delete(schema.users).where(inArray(schema.users.id, [anonTeam.id, anonMember.id])));
  });

  it("internal notes go to the team only", async () => {
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, u.team, bug, "Asi font", true));
    expect(await sent("comment_internal")).toEqual(["team2"]);
  });

  it("a bug status change tells the reporter and the team members following it", async () => {
    await withProject(db, project.id, (tx) => changeStatus(tx, project, u.team2, bug, "confirmed"));
    expect(await sent("bug_status")).toEqual(["author", "team"]);
  });

  it("each team member chooses their team e-mails; conversations they are in still reach them", async () => {
    await withProject(db, project.id, (tx) => tx.update(schema.users).set({ teamMail: { newBug: false, comments: false } }).where(eq(schema.users.id, u.team2.id)));
    await withProject(db, project.id, (tx) => notifyNewBug(tx, project, bug));
    expect(await sent("new_bug")).toEqual(["team"]);
    await withProject(db, project.id, (tx) => notifyNewIdea(tx, project, idea));
    expect(await sent("new_idea")).toEqual(["team", "team2"]);
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, u.stranger, idea, "Pridávam sa.", false));
    expect(await sent("comment")).toEqual(["author", "talker", "team"]);
    await withProject(db, project.id, (tx) => tx.update(schema.users).set({ teamMail: {} }).where(eq(schema.users.id, u.team2.id)));
  });

  it("a team member who wants summaries: team mail waits for the summary, customers' mail does not", async () => {
    await withProject(db, project.id, (tx) => tx.update(schema.users).set({ teamMail: { pace: "hourly" } }).where(eq(schema.users.id, u.team2.id)));
    // Even a customer asking for it (stale data) never gets their mail held.
    await withProject(db, project.id, (tx) => tx.update(schema.users).set({ teamMail: { pace: "daily" } }).where(eq(schema.users.id, u.author.id)));
    const before = Date.now();
    await withProject(db, project.id, (tx) => notifyNewBug(tx, project, bug));
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, u.stranger, idea, "Ešte jedna vec.", false));
    const rows = await withProject(db, project.id, (tx) => tx.select({ to: schema.emails.to, kind: schema.emails.kind, status: schema.emails.status, at: schema.emails.sendAfter })
      .from(schema.emails).where(eq(schema.emails.projectId, project.id)));
    const of = (who: string, kind: string) => rows.find((r) => r.to === `${who}@x.sk` && r.kind === kind)!;
    expect(of("team2", "new_bug").status).toBe("deferred");
    expect(of("team2", "new_bug").at.getTime() - before).toBeGreaterThanOrEqual(3600_000 - 1000);
    expect(of("team2", "comment").status).toBe("deferred");
    expect(of("team", "new_bug").status).toBe("queued");
    expect(of("author", "comment").status).toBe("queued");
    await sent("new_bug");
    await withProject(db, project.id, (tx) => tx.update(schema.users).set({ teamMail: {} }).where(inArray(schema.users.id, [u.team2.id, u.author.id])));
  });

  it("merging: earlier duplicates follow to the original; a merge into a fixed bug tells the reporter at once", async () => {
    const [x, y, o] = await withSystem(db, (t) => t.insert(schema.items).values([
      { projectId: project.id, kind: "bug", number: 10, title: "Chyba X", status: "new", authorId: u.stranger.id },
      { projectId: project.id, kind: "bug", number: 11, title: "Chyba Y", status: "new", authorId: u.talker.id },
      { projectId: project.id, kind: "bug", number: 12, title: "Chyba O", status: "fixed", fixedInVersion: "2.0", authorId: u.author.id },
    ]).returning()) as [Item, Item, Item];
    await withProject(db, project.id, (t) => mergeItems(t, project, u.team, x, y));
    await sent("bug_status");
    await withProject(db, project.id, async (t) => mergeItems(t, project, u.team, (await t.query.items.findFirst({ where: eq(schema.items.id, y.id) }))!, o));
    const rows = await withProject(db, project.id, (t) => t.select({ n: schema.items.number, m: schema.items.mergedIntoId }).from(schema.items).where(sql`${schema.items.number} in (10, 11)`));
    expect(rows.every((r) => r.m === o.id)).toBe(true);
    // No stored auto-comment (it was in one language and read as a team reply); the page says "Merged into".
    const notes = await withProject(db, project.id, (t) => t.select({ id: schema.comments.id }).from(schema.comments).where(sql`${schema.comments.itemId} in (${x.id}, ${y.id})`));
    expect(notes).toEqual([]);
    // Y's reporter hears about O's fix right away, about their own report.
    const mails = await withProject(db, project.id, (t) => t.select({ to: schema.emails.to, subject: schema.emails.subject }).from(schema.emails).where(eq(schema.emails.kind, "bug_status")));
    expect(mails.map((m) => [m.to.split("@")[0], m.subject])).toEqual([["talker", "Opravené: #11 Chyba Y"]]);
    await sent("bug_status");
  });

  it("the team's own words travel with the status e-mail; a quiet move e-mails nobody", async () => {
    const fresh = await withProject(db, project.id, (tx) => tx.query.items.findFirst({ where: eq(schema.items.id, bug.id) }));
    await withProject(db, project.id, (tx) => changeStatus(tx, project, u.team2, fresh!, "in_progress", null, { note: "Opravujeme, oprava príde v piatok." }));
    const mails = await withProject(db, project.id, (tx) => tx.select({ to: schema.emails.to, text: schema.emails.text }).from(schema.emails)
      .where(and(eq(schema.emails.projectId, project.id), eq(schema.emails.kind, "bug_status"))));
    expect(mails.find((m) => m.to.startsWith("author"))?.text).toContain("Opravujeme, oprava príde v piatok.");
    await sent("bug_status");
    const moved = await withProject(db, project.id, (tx) => tx.query.items.findFirst({ where: eq(schema.items.id, bug.id) }));
    await withProject(db, project.id, (tx) => changeStatus(tx, project, u.team2, moved!, "confirmed", null, { notify: false }));
    expect(await sent("bug_status")).toEqual([]);
  });

  it("a merged idea's author and commenters hear once where it went, then follow the original", async () => {
    const [dup, orig] = await withSystem(db, (t) => t.insert(schema.items).values([
      { projectId: project.id, kind: "idea", number: 20, title: "Tmavý režim", status: "open", authorId: u.stranger.id },
      { projectId: project.id, kind: "idea", number: 21, title: "Dark mode", status: "open", authorId: u.voter.id },
    ]).returning()) as [Item, Item];
    await withProject(db, project.id, (t) => addCommentTo(t, project, u.talker, dup, "Áno, prosím!", false));
    await sent("comment");
    await withProject(db, project.id, (t) => mergeItems(t, project, u.team, dup, orig));
    const mails = await withProject(db, project.id, (t) => t.select({ to: schema.emails.to, subject: schema.emails.subject }).from(schema.emails)
      .where(and(eq(schema.emails.projectId, project.id), eq(schema.emails.kind, "idea_status"))));
    expect(mails.map((m) => m.to.split("@")[0]).sort()).toEqual(["stranger", "talker"]);
    expect(mails[0]!.subject).toBe("Sledujeme to pod #21: Tmavý režim");
    await sent("idea_status");
    // The original's status changes and its changelog reach them too.
    const fresh = (await withProject(db, project.id, (t) => t.query.items.findFirst({ where: eq(schema.items.id, orig.id) })))!;
    await withProject(db, project.id, (t) => changeStatus(t, project, u.team, fresh, "planned"));
    expect(await sent("idea_status")).toEqual(["stranger", "talker", "voter"]);
    await withProject(db, project.id, (t) => notifyChangelog(t, project, { title: "Novinka", body: "", url: "https://x" }, [fresh], u.team.id));
    expect(await sent("changelog")).toEqual(["stranger", "talker", "voter"]);
    // The duplicate takes no more votes or comments: they belong to the original.
    const merged = (await withProject(db, project.id, (t) => t.query.items.findFirst({ where: eq(schema.items.id, dup.id) })))!;
    await expect(withProject(db, project.id, (t) => addCommentTo(t, project, u.author, merged, "Ešte ja", false))).rejects.toThrow("#21");
    expect(await withProject(db, project.id, (t) => applyVote(t, project, u.author.id, dup.id, 1))).toEqual({ ok: false, reason: "missing" });
  });
});
