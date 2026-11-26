import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { joinable, knownByNumber, listKnown, matchKnown, publishKnown, unpublishKnown, KnownIssueError } = await import("./known-issues");
const { createItemFor } = await import("./items");

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `known-${Date.now()}`;
type User = typeof schema.users.$inferSelect;
type Item = typeof schema.items.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let ann: User, ben: User;
let pdf: Item, secret: Item, idea: Item;

const tx = <T>(f: Parameters<typeof withProject<T>>[2]) => withProject(db, project.id, f);
const byNumber = (n: number) => tx(async (t) => (await t.query.items.findFirst({ where: eq(schema.items.number, n) }))!);

describe.skipIf(!up)("known issues (ADR-0015 phase 3)", () => {
  beforeAll(async () => {
    await withSystem(db, async (t) => {
      const [w] = await t.insert(schema.workspaces).values({ slug, name: "K" }).returning();
      project = (await t.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Known", theme: presets.ozvi, itemSeq: 3 }).returning())[0]!;
      [, ann, ben] = await t.insert(schema.users).values((["team", "ann", "ben"] as const).map((n) => ({
        projectId: project.id, externalId: `${slug}-${n}`, name: n, email: `${n}-${slug}@x.sk`, role: n === "team" ? "team" as const : "member" as const,
      }))).returning() as [User, User, User];
      [pdf, secret, idea] = await t.insert(schema.items).values([
        // The reporter's own words name a customer; the team publishes it under a neutral title.
        { projectId: project.id, kind: "bug", number: 1, title: "Faktúra pre Novák s.r.o. sa nedá stiahnuť", body: "Klient Novák, IČO 12345678", status: "confirmed", authorId: ben.id },
        { projectId: project.id, kind: "bug", number: 2, title: "Tajné heslo administrátora v exporte", status: "new", authorId: ben.id },
        { projectId: project.id, kind: "idea", number: 3, title: "PDF faktúry", status: "open", authorId: ben.id },
      ]).returning() as [Item, Item, Item];
    });
  });
  afterAll(async () => {
    await withSystem(db, (t) => t.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("only a bug, with a title of 3–200 characters, becomes a known issue", async () => {
    await expect(tx((t) => publishKnown(t, idea, { title: "PDF", body: "" }))).rejects.toBeInstanceOf(KnownIssueError);
    await expect(tx((t) => publishKnown(t, pdf, { title: "  ", body: "" }))).rejects.toThrow("title");
    await expect(tx((t) => publishKnown(t, pdf, { title: "PDF", body: "x".repeat(2001) }))).rejects.toThrow("body");
    const row = await tx((t) => publishKnown(t, pdf, { title: "  Faktúra   v PDF sa nestiahne ", body: "Zatiaľ ju otvorte v náhľade." }));
    expect(row).toMatchObject({ knownTitle: "Faktúra v PDF sa nestiahne", knownBody: "Zatiaľ ju otvorte v náhľade." });
    expect(joinable(row)).toBe(true);
    // The database refuses a known idea too.
    await expect(tx((t) => t.update(schema.items).set({ knownTitle: "PDF", knownAt: new Date() }).where(eq(schema.items.id, idea.id)))).rejects.toThrow();
  });

  it("reporters see and match only the public title and note, never the report", async () => {
    const list = await tx((t) => listKnown(t));
    expect(list).toEqual([expect.objectContaining({ number: 1, title: "Faktúra v PDF sa nestiahne", body: "Zatiaľ ju otvorte v náhľade.", affected: 1 })]);
    expect(JSON.stringify(list)).not.toContain("Novák");
    expect((await tx((t) => matchKnown(t, "faktura v pdf sa nestiahne")))[0]?.number).toBe(1);
    // The report's own words find nothing: typing cannot probe private reports.
    expect(await tx((t) => matchKnown(t, "Novák s.r.o. IČO 12345678"))).toEqual([]);
    expect(await tx((t) => matchKnown(t, "Tajné heslo administrátora"))).toEqual([]);
    expect(await tx((t) => knownByNumber(t, 2))).toBeNull();
  });

  it("\"Mám ten istý problém\" files the reporter's own report, merged into the known issue", async () => {
    const n = await createItemFor(project, ann, { kind: "bug", title: "Nejde mi stiahnuť faktúru", body: "Chrome, Windows", context: { url: "/faktury/7" }, files: [], joinKnown: 1 });
    const mine = await byNumber(n);
    expect(mine).toMatchObject({ authorId: ann.id, mergedIntoId: pdf.id, body: "Chrome, Windows" });
    expect(mine.context).toMatchObject({ url: "/faktury/7" });
    expect((await tx((t) => listKnown(t)))[0]?.affected).toBe(2);
    const [stat] = await tx((t) => t.select().from(schema.duplicateStats).where(and(eq(schema.duplicateStats.projectId, project.id), eq(schema.duplicateStats.kind, "joined_known"))));
    expect(stat?.n).toBe(1);
  });

  it("a number that is not an open known issue gives an ordinary report", async () => {
    const a = await createItemFor(project, ann, { kind: "bug", title: "Iná chyba v exporte", body: "", context: {}, files: [], joinKnown: 2 });
    expect((await byNumber(a)).mergedIntoId).toBeNull();
    await tx((t) => t.update(schema.items).set({ status: "fixed" }).where(eq(schema.items.id, pdf.id)));
    const b = await createItemFor(project, ann, { kind: "bug", title: "Faktúra sa stále nestiahne", body: "", context: {}, files: [], joinKnown: 1 });
    expect((await byNumber(b)).mergedIntoId).toBeNull();
    await tx((t) => t.update(schema.items).set({ status: "confirmed" }).where(eq(schema.items.id, pdf.id)));
  });

  it("taken off the list: gone for reporters, joined reports stay merged", async () => {
    await tx(async (t) => unpublishKnown(t, (await t.query.items.findFirst({ where: eq(schema.items.id, pdf.id) }))!));
    expect(await tx((t) => listKnown(t))).toEqual([]);
    expect(await tx((t) => matchKnown(t, "Faktúra v PDF sa nestiahne"))).toEqual([]);
    const joined = await tx((t) => t.select().from(schema.items).where(eq(schema.items.mergedIntoId, pdf.id)));
    expect(joined).toHaveLength(1);
  });
});
