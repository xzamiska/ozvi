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

  /**
   * Catalog guard: every table with a project_id has RLS enabled and forced, with a policy that calls
   * ozvi_project_ok(project_id). A new tenant table that forgets its RLS migration fails here (ADR-0004).
   * Deliberate exceptions, read and written only through withSystem / without a project scope:
   */
  const NO_RLS = new Set([
    "activity", // the workspace activity log, written for console and board events (project_id may be null)
    "login_codes", // sign-in codes, looked up by keyed hash before any project is known (project_id null = console)
  ]);

  it("every table with a project_id has forced RLS and the tenant policy", async () => {
    const rows = await db.execute<{ t: string; rls: boolean; forced: boolean; policy: boolean }>(sql`
      select c.relname as t, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
        exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
          and p.qual like '%ozvi_project_ok(project_id)%' and p.with_check like '%ozvi_project_ok(project_id)%') as policy
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from information_schema.columns col where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'project_id')
      order by 1`);
    const tenant = [...rows].filter((r) => !NO_RLS.has(r.t));
    expect(tenant.length).toBeGreaterThan(20);
    expect(tenant.filter((r) => !r.rls || !r.forced || !r.policy).map((r) => r.t)).toEqual([]);
    // The exceptions still exist (a renamed table must be looked at again, not silently dropped from the list).
    expect([...rows].map((r) => r.t)).toEqual(expect.arrayContaining([...NO_RLS]));
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
