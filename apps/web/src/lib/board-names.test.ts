import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncBoardNames } from "./board-names";

const db = createDb();
const tag = `bn-${Date.now().toString(36)}`;
const email = `${tag}@firma.test`;
let accountId = "", boards: string[] = [];

describe("console name on the boards (DB)", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug: tag, name: tag }).returning();
      const [other] = await tx.insert(schema.workspaces).values({ slug: `${tag}-x`, name: "x" }).returning();
      boards = (await tx.insert(schema.projects).values([
        { workspaceId: w!.id, slug: `${tag}-a`, name: "A", theme: presets.ozvi },
        { workspaceId: w!.id, slug: `${tag}-b`, name: "B", theme: presets.ozvi },
        { workspaceId: other!.id, slug: `${tag}-c`, name: "C", theme: presets.ozvi },
      ]).returning()).map((p) => p.id);
      const [a] = await tx.insert(schema.accounts).values({ email }).returning();
      accountId = a!.id;
      await tx.insert(schema.workspaceMembers).values({ workspaceId: w!.id, accountId, role: "member" });
      await tx.insert(schema.users).values([
        { projectId: boards[0]!, externalId: `email:${email}`, email, role: "team" },
        { projectId: boards[1]!, externalId: `email:${email}`, email, role: "admin", name: "old" },
        // Same address as a customer of the host app, and a board of a workspace she is not in: untouched.
        { projectId: boards[1]!, externalId: "app-42", email, role: "member", name: "Customer" },
        { projectId: boards[2]!, externalId: `email:${email}`, email, role: "team" },
      ]);
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.name, tag)));
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, `${tag}-x`)));
  });

  it("a rename in the console reaches the team account on every board of her workspaces, nothing else", async () => {
    expect(await syncBoardNames(db, { id: accountId, email, name: " Zuzana Dev " })).toBe(2);
    const names = async (b: string) => (await withProject(db, b, (tx) => tx.select({ x: schema.users.externalId, name: schema.users.name }).from(schema.users)))
      .map((r) => `${r.x}=${r.name}`).sort();
    expect(await names(boards[0]!)).toEqual([`email:${email}=Zuzana Dev`]);
    expect(await names(boards[1]!)).toEqual(["app-42=Customer", `email:${email}=Zuzana Dev`]);
    expect(await names(boards[2]!)).toEqual([`email:${email}=null`]);
    // Clearing the name clears it on the boards too (they then say "Team member").
    await syncBoardNames(db, { id: accountId, email, name: null });
    expect(await names(boards[0]!)).toEqual([`email:${email}=null`]);
  });
});
