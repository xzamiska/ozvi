import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { assignItem, assigneeFilter, assignableTeam } = await import("./assign");
const { DomainError } = await import("./domain");

const db = createDb();
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `assign-${Date.now().toString(36)}`;
type User = typeof schema.users.$inferSelect;
type Item = typeof schema.items.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let u: Record<"anna" | "boris" | "customer", User>;
let bug: Item;

const mails = (to: string) => withProject(db, project.id, (tx) => tx.select({ subject: schema.emails.subject }).from(schema.emails)
  .where(and(eq(schema.emails.kind, "assigned"), sql`${schema.emails.to} like ${`${to}@%`}`)));
const fresh = async () => (await withProject(db, project.id, (tx) => tx.query.items.findFirst({ where: eq(schema.items.id, bug.id) })))!;

describe.skipIf(!up)("assignee", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: slug }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Assign", theme: presets.ozvi, itemSeq: 1 }).returning())[0]!;
      const rows = await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "anna", name: "Anna", email: "anna@x.sk", role: "admin" as const },
        { projectId: project.id, externalId: "boris", name: "Boris", email: "boris@x.sk", role: "team" as const },
        { projectId: project.id, externalId: "customer", name: "Zákazník", email: "customer@x.sk", role: "member" as const },
      ]).returning();
      u = Object.fromEntries(rows.map((r) => [r.externalId, r])) as typeof u;
      bug = (await tx.insert(schema.items).values({ projectId: project.id, kind: "bug", number: 1, title: "Faktúra", status: "new", authorId: u.customer.id }).returning())[0]!;
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("the team gives an item to a colleague, who gets one e-mail; taking it yourself sends none", async () => {
    await withProject(db, project.id, (tx) => assignItem(tx, project, u.anna, bug, u.boris.id));
    expect((await fresh()).assigneeId).toBe(u.boris.id);
    expect((await mails("boris")).map((m) => m.subject)).toEqual(["Pridelené vám: Faktúra"]);
    // Same assignee again: nothing changes, no second e-mail.
    expect(await withProject(db, project.id, async (tx) => assignItem(tx, project, u.anna, await fresh(), u.boris.id))).toBeNull();
    await withProject(db, project.id, async (tx) => assignItem(tx, project, u.anna, await fresh(), u.anna.id));
    expect(await mails("anna")).toEqual([]);
    await withProject(db, project.id, async (tx) => assignItem(tx, project, u.boris, await fresh(), null));
    expect((await fresh()).assigneeId).toBeNull();
  });

  it("only the team assigns, and only to the team", async () => {
    await expect(withProject(db, project.id, async (tx) => assignItem(tx, project, u.customer, await fresh(), u.anna.id))).rejects.toBeInstanceOf(DomainError);
    await expect(withProject(db, project.id, async (tx) => assignItem(tx, project, u.anna, await fresh(), u.customer.id))).rejects.toBeInstanceOf(DomainError);
    await expect(withProject(db, project.id, async (tx) => assignItem(tx, project, u.anna, await fresh(), "00000000-0000-4000-8000-000000000000"))).rejects.toBeInstanceOf(DomainError);
    expect((await fresh()).assigneeId).toBeNull();
  });

  it("the list filter: me, nobody, a colleague; anything else is no filter", async () => {
    const team = await withProject(db, project.id, (tx) => assignableTeam(tx));
    expect(team.map((x) => x.label)).toEqual(["Anna", "Boris"]);
    expect(assigneeFilter("me", u.anna.id, team).who).toBe("me");
    expect(assigneeFilter("none", u.anna.id, team).who).toBe("none");
    expect(assigneeFilter(u.boris.id, u.anna.id, team).who).toBe(u.boris.id);
    expect(assigneeFilter(u.customer.id, u.anna.id, team)).toEqual({ who: "", where: [] });
    expect(assigneeFilter("'; drop table items", u.anna.id, team)).toEqual({ who: "", where: [] });
    await withProject(db, project.id, async (tx) => assignItem(tx, project, u.anna, await fresh(), u.boris.id));
    const count = async (who: string, me: string) => withProject(db, project.id, async (tx) =>
      (await tx.select({ id: schema.items.id }).from(schema.items).where(and(eq(schema.items.kind, "bug"), ...assigneeFilter(who, me, team).where))).length);
    expect(await count("me", u.boris.id)).toBe(1);
    expect(await count("me", u.anna.id)).toBe(0);
    expect(await count("none", u.anna.id)).toBe(0);
  });

  it("a removed colleague's items become unassigned (the column is ON DELETE SET NULL)", async () => {
    await withProject(db, project.id, (tx) => tx.delete(schema.users).where(eq(schema.users.id, u.boris.id)));
    expect((await fresh()).assigneeId).toBeNull();
  });
});
