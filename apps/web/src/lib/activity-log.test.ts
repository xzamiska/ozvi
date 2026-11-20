import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { mcpBackend } = await import("./mcp-backend");
const { saveEntry, publishEntry } = await import("./changelog");

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `activity-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
let tm: typeof schema.users.$inferSelect;

const logged = (action: string) => withSystem(db, (tx) => tx.select({ actor: schema.activity.actor, detail: schema.activity.detail }).from(schema.activity)
  .where(and(eq(schema.activity.workspaceId, project.workspaceId), eq(schema.activity.action, action))));

describe.skipIf(!up)("console activity records what reaches customers", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "A" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Activity test", theme: presets.ozvi }).returning())[0]!;
      tm = (await tx.insert(schema.users).values({ projectId: project.id, externalId: "email:t@x.sk", name: "Tím", email: "t@x.sk", role: "team" }).returning())[0]!;
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("publishing tells whether it was the first time", async () => {
    const r = await withProject(db, project.id, async (tx) => {
      const e = await saveEntry(tx, project, tm, { title: "Verzia 2.0", body: "Novinky.", itemIds: [] });
      return [await publishEntry(tx, project, tm, e.id), await publishEntry(tx, project, tm, e.id)];
    });
    expect(r.map((x) => x.fresh)).toEqual([true, false]);
  });

  it("an update published by an agent's token is in the Activity once, even when the confirm repeats", async () => {
    const b = await mcpBackend({ project, user: tm, scope: "triage", tokenId: "a1" });
    await b.publishUpdate({ title: "Export do Pohody", body: "Pridali sme export.", items: [] });
    await b.publishUpdate({ title: "Export do Pohody", body: "Pridali sme export.", items: [] });
    expect(await logged("changelog.published")).toEqual([{ actor: "Tím", detail: "Export do Pohody (0, MCP)" }]);
  });
});

describe("export lines in the Activity read in the reader's language", async () => {
  const { activityDetail } = await import("./activity");
  it("names the list and counts the rows; anything else stays as stored", () => {
    expect(activityDetail("data.exported", "ideas (1)", "sk")).toBe("Nápady (CSV) · 1 riadok");
    expect(activityDetail("data.exported", "comments_bug #12 (3)", "en")).toBe("Comments (CSV) #12 · 3 rows");
    expect(activityDetail("data.exported", "JSON", "de")).toBe("JSON");
  });
});
