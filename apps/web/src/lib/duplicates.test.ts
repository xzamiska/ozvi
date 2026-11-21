import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
// Text similarity only (the same fallback every board without an embeddings endpoint uses).
delete process.env.OZVI_EMBEDDINGS_MODEL;

const { attachDraft, cleanSimilarSeen, draftComment, duplicateStats, markAttached, similarIdeas, similarSeenOf, splitItem, strongMatch } = await import("./duplicates");
const { SIMILAR_SHOW, SIMILAR_STRONG } = await import("./similar");
const { mergeItems } = await import("./domain");
const { createItemFor } = await import("./items");

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `dups-${Date.now()}`;
type User = typeof schema.users.$inferSelect;
type Item = typeof schema.items.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let team: User, ann: User, ben: User;
let exportCsv: Item, darkMode: Item;

const byNumber = (n: number) => withProject(db, project.id, async (tx) => (await tx.query.items.findFirst({ where: eq(schema.items.number, n) }))!);

describe("similar seen (form fields)", () => {
  it("keeps valid numbers and scores, the strong match and its reason; nothing shown is null", () => {
    expect(cleanSimilarSeen(JSON.stringify([{ number: 3, score: 0.41234 }, { number: 3, score: 0.5 }, { number: -1, score: 0.4 }, { number: 4, score: 7 }, "x"]), "3", "  Iný   formát  "))
      .toEqual({ shown: [{ number: 3, score: 0.412 }], strong: 3, reason: "Iný formát" });
    expect(cleanSimilarSeen("[]", "", "")).toBeNull();
    expect(cleanSimilarSeen("{not json", "", "dôvod")).toBeNull();
    // A reason only means something next to the question it answers.
    expect(cleanSimilarSeen(JSON.stringify([{ number: 2, score: 0.3 }]), "", "dôvod")).toEqual({ shown: [{ number: 2, score: 0.3 }] });
    expect(draftComment(" Export do CSV ", "")).toBe("Export do CSV");
    expect(draftComment("Export do CSV", "Pre účtovníčku.")).toBe("Export do CSV\n\nPre účtovníčku.");
  });
  it("thresholds: the question on submit needs more than the list while writing", () => {
    for (const m of ["trigram", "embeddings"] as const) expect(SIMILAR_STRONG[m]).toBeGreaterThan(SIMILAR_SHOW[m]);
  });
});

describe.skipIf(!up)("duplicates before they happen", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "D" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Dups", theme: presets.ozvi, itemSeq: 6 }).returning())[0]!;
      [team, ann, ben] = await tx.insert(schema.users).values((["team", "ann", "ben"] as const).map((n) => ({
        projectId: project.id, externalId: `${slug}-${n}`, name: n, email: `${n}-${slug}@x.sk`, role: n === "team" ? "team" as const : "member" as const,
      }))).returning() as [User, User, User];
      [exportCsv, darkMode] = await tx.insert(schema.items).values([
        { projectId: project.id, kind: "idea", number: 1, title: "Export faktúr do CSV", status: "planned", voteCount: 4, authorId: team.id },
        { projectId: project.id, kind: "idea", number: 2, title: "Tmavý režim", status: "open", voteCount: 1, authorId: team.id },
        { projectId: project.id, kind: "bug", number: 3, title: "Export faktúr do CSV padá", status: "new", authorId: ben.id },
        { projectId: project.id, kind: "idea", number: 4, title: "Export faktúr do CSV súboru", status: "open", pending: true, pendingReason: "approval", authorId: ben.id },
        { projectId: project.id, kind: "idea", number: 5, title: "Export faktúr do CSV formátu", status: "open", deletedAt: new Date(), authorId: ben.id },
      ]).returning() as [Item, Item];
      await tx.insert(schema.votes).values({ projectId: project.id, itemId: exportCsv.id, userId: ben.id, weight: 1 });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("while writing: the team's matcher, published ideas only, with status, votes, method and the viewer's vote", async () => {
    const rows = await withProject(db, project.id, (tx) => similarIdeas(tx, { text: "export faktur csv", userId: ben.id }));
    // Not the bug (private), the queued idea or the deleted one.
    expect(rows.map((r) => r.number)).toEqual([1]);
    expect(rows[0]).toMatchObject({ title: "Export faktúr do CSV", status: "planned", votes: 4, method: "trigram", weight: 1 });
    expect(rows[0]!.score).toBeGreaterThanOrEqual(SIMILAR_SHOW.trigram);
    const anon = await withProject(db, project.id, (tx) => similarIdeas(tx, { text: "export faktur csv" }));
    expect(anon[0]!.weight).toBe(0);
    expect(await withProject(db, project.id, (tx) => similarIdeas(tx, { text: "platba kartou" }))).toEqual([]);
  });

  it("on submit: a strong match is asked about once; not after the author voted on or opened it", async () => {
    const strong = (text: string, seen: number[] = [], userId?: string) => withProject(db, project.id, (tx) => strongMatch(tx, { text, seen, userId }));
    expect(await strong("Export faktúr do CSV")).toEqual({ number: 1, title: "Export faktúr do CSV", votes: 4, status: "planned" });
    expect(await strong("export faktur do csv")).toMatchObject({ number: 1 });
    expect(await strong("Export faktúr do CSV", [1])).toBeNull();
    // Similar enough for the list, not for the question.
    const loose = await withProject(db, project.id, (tx) => similarIdeas(tx, { text: "Export kontaktov do CSV" }));
    expect(loose.map((r) => r.number)).toContain(1);
    expect(await strong("Export kontaktov do CSV")).toBeNull();
    // The author's own idea under the same title: a repeated submit, answered by createItem with that idea.
    expect(await strong("Tmavý režim", [], team.id)).toBeNull();
    expect(await strong("Tmavý režim", [], ann.id)).toMatchObject({ number: 2 });
  });

  it("created anyway: the idea keeps what its author was shown; bug context is untouched", async () => {
    const seen = cleanSimilarSeen(JSON.stringify([{ number: 1, score: 0.82 }]), "1", "Potrebujem XML, nie CSV");
    const n = await createItemFor(project, ann, { kind: "idea", title: "Export faktúr do XML", body: "", context: null, files: [], similarSeen: seen });
    const item = await byNumber(n);
    expect(item.context).toEqual({ similarSeen: { shown: [{ number: 1, score: 0.82 }], strong: 1, reason: "Potrebujem XML, nie CSV" } });
    expect(similarSeenOf(item)).toEqual({ shown: [{ number: 1, score: 0.82 }], strong: 1, reason: "Potrebujem XML, nie CSV" });
    const plain = await byNumber(await createItemFor(project, ann, { kind: "idea", title: "Štítky na faktúrach", body: "", context: null, files: [] }));
    expect(plain.context).toBeNull();
    const b = await byNumber(await createItemFor(project, ann, { kind: "bug", title: "Faktúra sa neuloží", body: "", context: { url: "/x", browser: "Firefox" }, files: [], similarSeen: seen }));
    expect(b.context).toEqual({ url: "/x", browser: "Firefox" });
    expect(similarSeenOf(b)).toBeNull();
  });

  it("attach: the author's vote and draft as their comment, counted without a person", async () => {
    const r = await withProject(db, project.id, (tx) => attachDraft(tx, project, ann, darkMode, draftComment("Tmavý režim v noci", "Oči bolia.")));
    expect(r).toEqual({ voted: true, queued: false });
    const [item, votes, comments] = await withProject(db, project.id, async (tx) => [
      await tx.query.items.findFirst({ where: eq(schema.items.id, darkMode.id) }),
      await tx.select().from(schema.votes).where(eq(schema.votes.itemId, darkMode.id)),
      await tx.select().from(schema.comments).where(eq(schema.comments.itemId, darkMode.id)),
    ] as const);
    expect(item!.voteCount).toBe(1);
    expect(votes.map((v) => [v.userId, v.weight])).toEqual([[ann.id, 1]]);
    expect(comments.map((c) => [c.authorId, c.body, c.internal])).toEqual([[ann.id, "Tmavý režim v noci\n\nOči bolia.", false]]);
    expect((item!.context as { attached: string[] }).attached).toHaveLength(1);
    // Voted already: the vote stays as it was, the text still goes there.
    const again = await withProject(db, project.id, (tx) => attachDraft(tx, project, ben, exportCsv, "Aj ja, pre Pohodu."));
    expect(again.voted).toBe(false);
    // A merged idea takes nothing (its conversation goes on at the original).
    await expect(withProject(db, project.id, (tx) => attachDraft(tx, project, ann, { ...darkMode, mergedIntoId: exportCsv.id }, "x"))).rejects.toThrow();
  });

  it("attach on an importance board without votes left: only the comment", async () => {
    const p = { ...project, voteMode: "importance", voteBudget: 2 };
    const [x, y] = await withSystem(db, (tx) => tx.insert(schema.items).values([
      { projectId: project.id, kind: "idea", number: 20, title: "Import z banky", status: "open", authorId: team.id },
      { projectId: project.id, kind: "idea", number: 21, title: "Viac mien", status: "open", authorId: team.id },
    ]).returning());
    expect((await withProject(db, project.id, (tx) => attachDraft(tx, p, ben, x!, "Prosím"))).voted).toBe(true);
    expect(await withProject(db, project.id, (tx) => attachDraft(tx, p, ben, y!, "Aj toto"))).toEqual({ voted: false, queued: false });
    const mine = await withProject(db, project.id, (tx) => tx.select({ item: schema.votes.itemId, w: schema.votes.weight }).from(schema.votes)
      .where(and(eq(schema.votes.userId, ben.id), eq(schema.votes.itemId, y!.id))));
    expect(mine).toEqual([]);
  });

  it("split: the merged item is open again with its own route; moved votes stay at the original", async () => {
    const [dup] = await withSystem(db, (tx) => tx.insert(schema.items).values(
      { projectId: project.id, kind: "idea", number: 30, title: "CSV export faktúr", status: "planned", authorId: ann.id }).returning());
    await withSystem(db, (tx) => tx.insert(schema.votes).values({ projectId: project.id, itemId: dup!.id, userId: ann.id, weight: 1 }));
    await withSystem(db, (tx) => tx.insert(schema.webhooks).values({ projectId: project.id, url: "https://hooks.example/x", secretEnc: "s", events: [] }));
    const before = (await withProject(db, project.id, (tx) => tx.select().from(schema.votes).where(eq(schema.votes.itemId, exportCsv.id)))).length;
    await withProject(db, project.id, async (tx) => mergeItems(tx, project, team, dup!, (await tx.query.items.findFirst({ where: eq(schema.items.number, 1) }))!));
    expect((await byNumber(1)).voteCount).toBe(before + 1);
    await withProject(db, project.id, async (tx) => tx.delete(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.projectId, project.id)));

    const r = await withProject(db, project.id, async (tx) => splitItem(tx, project, team, (await tx.query.items.findFirst({ where: eq(schema.items.number, 30) }))!));
    expect(r.from).toBe(1);
    const split = await byNumber(30);
    expect([split.mergedIntoId, split.status, split.voteCount]).toEqual([null, "open", 0]);
    expect((await byNumber(1)).voteCount).toBe(before + 1);
    const [route, hooks] = await withProject(db, project.id, async (tx) => [
      await tx.select({ from: schema.itemEvents.fromStatus, to: schema.itemEvents.toStatus }).from(schema.itemEvents).where(eq(schema.itemEvents.itemId, split.id)),
      await tx.select({ event: schema.webhookDeliveries.event }).from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.projectId, project.id)),
    ] as const);
    expect(route).toEqual([{ from: "declined", to: "open" }]);
    expect(hooks.map((h) => h.event)).toEqual(["item.status_changed"]);
    // Not merged (any more): nothing to split.
    await expect(withProject(db, project.id, (tx) => splitItem(tx, project, team, split))).rejects.toThrow(/nie je zlúčený/);
    // A bug goes back to the start of its route.
    const [b1, b2] = await withSystem(db, (tx) => tx.insert(schema.items).values([
      { projectId: project.id, kind: "bug", number: 31, title: "Pád pri tlači", status: "confirmed", authorId: ann.id },
      { projectId: project.id, kind: "bug", number: 32, title: "Pád pri tlačení", status: "new", authorId: ben.id },
    ]).returning());
    await withProject(db, project.id, (tx) => mergeItems(tx, project, team, b2!, b1!));
    expect((await withProject(db, project.id, async (tx) => splitItem(tx, project, team, (await tx.query.items.findFirst({ where: eq(schema.items.number, 32) }))!))).item.status).toBe("new");
  });

  it("stats: aggregate counts since a date, no person in them", async () => {
    const since = new Date(Date.now() - 60 * 60_000);
    await db.insert(schema.activity).values([
      { workspaceId: project.workspaceId, projectId: project.id, actor: "team", action: "triage.unmerged", detail: "#30 ← #1" },
      { workspaceId: project.workspaceId, projectId: project.id, actor: "team", action: "triage.merged", detail: "#30 → #1" },
    ]);
    // An attach a day ago does not count for the last hour.
    await withSystem(db, (tx) => tx.update(schema.items).set({ context: { attached: [new Date(Date.now() - 86_400_000).toISOString()] } }).where(eq(schema.items.number, 20)));
    const s = await withProject(db, project.id, (tx) => duplicateStats(tx, since));
    // Attached: #2 (ann), #1 (ben), #21 (ben, comment only); #20 attached within the hour was replaced above by an old one.
    expect(s).toEqual({ attached: 3, createdAnyway: 1, saidDifferent: 1, mergedLater: 0, split: 1 });
    const xml = await byNumber(6 + 1);
    expect(xml.title).toBe("Export faktúr do XML");
    await withProject(db, project.id, async (tx) => {
      await markAttached(tx, xml.id);
      await tx.update(schema.items).set({ mergedIntoId: exportCsv.id }).where(eq(schema.items.id, xml.id));
    });
    expect(await withProject(db, project.id, (tx) => duplicateStats(tx, since))).toEqual({ attached: 4, createdAnyway: 1, saidDifferent: 1, mergedLater: 1, split: 1 });
    expect((await withProject(db, project.id, (tx) => duplicateStats(tx, new Date(Date.now() + 60_000)))).attached).toBe(0);
  });
});
