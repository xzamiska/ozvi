import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withProject, withSystem } from "./index";
import { items, projects, workspaces } from "./schema";

// Integration test against the local compose Postgres (pnpm dev:infra). Skipped when it is not running.
const url = process.env.DATABASE_URL ?? "postgres://ozvi:ozvi@localhost:5446/ozvi";
const db = createDb(url);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `rls-${Date.now()}`;
let a = "", b = "";

describe.skipIf(!up)("row-level security", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(workspaces).values({ slug, name: "RLS" }).returning();
      const [pa, pb] = await tx.insert(projects).values([
        { workspaceId: w!.id, slug: "a", name: "A", theme: {} },
        { workspaceId: w!.id, slug: "b", name: "B", theme: {} },
      ]).returning();
      a = pa!.id; b = pb!.id;
      await tx.insert(items).values([
        { projectId: a, kind: "idea", number: 1, title: "A1", status: "open" },
        { projectId: b, kind: "idea", number: 1, title: "B1", status: "open" },
      ]);
    });
  });

  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(workspaces).where(eq(workspaces.slug, slug)));
    await db.$client.end();
  });

  it("the connection role cannot bypass RLS", async () => {
    const [r] = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("sees only its own project, even without a WHERE clause", async () => {
    const rows = await withProject(db, a, (tx) => tx.select({ title: items.title }).from(items));
    expect(rows.map((r) => r.title)).toEqual(["A1"]);
  });

  it("sees nothing without a project context", async () => {
    const rows = await db.select().from(items).where(eq(items.title, "B1"));
    expect(rows).toEqual([]);
  });

  it("cannot write into another project", async () => {
    await expect(withProject(db, a, (tx) =>
      tx.insert(items).values({ projectId: b, kind: "idea", number: 2, title: "sneaky", status: "open" }),
    )).rejects.toThrow();
    const n = await withProject(db, a, (tx) => tx.update(items).set({ title: "x" }).where(eq(items.projectId, b)).returning());
    expect(n).toEqual([]);
  });

  it("does not leak context to the next transaction on the same connection", async () => {
    await withProject(db, a, async () => {});
    const rows = await db.transaction((tx) => tx.select().from(items));
    expect(rows.filter((r) => r.projectId === a || r.projectId === b)).toEqual([]);
  });
});
