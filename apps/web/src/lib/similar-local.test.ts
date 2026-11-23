import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { loadLocalModel } from "@ozvi/db/local-embeddings";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The local embedding model end to end (worker → pgvector → findSimilar) on a Free board. Needs the model
 * (~135 MB, downloaded into OZVI_MODELS_DIR on first use), so it runs only with OZVI_TEST_LOCAL_MODEL=1.
 */
process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
const run = process.env.OZVI_TEST_LOCAL_MODEL === "1";
if (run) process.env.OZVI_EMBEDDINGS = "local";

const { embedPending, embedQuery, findSimilar, hasEmbeddingsTable } = await import("./similar");
const db = createDb(process.env.DATABASE_URL);
const up = run && (await db.execute(sql`select 1`).then(() => true, () => false)) && (await hasEmbeddingsTable(db));
const slug = `simloc-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
let items: (typeof schema.items.$inferSelect)[];

describe.skipIf(!up)("local embeddings", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "L", plan: "free" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "L", theme: presets.ozvi }).returning())[0]!;
      items = await tx.insert(schema.items).values([
        { projectId: project.id, kind: "idea", number: 1, title: "Export faktúr do CSV", body: "Účtovníčka chce doklady v Exceli.", status: "open" },
        { projectId: project.id, kind: "idea", number: 2, title: "Tmavý režim", body: "", status: "open" },
        { projectId: project.id, kind: "idea", number: 3, title: "Prihlásenie cez Google", body: "", status: "open" },
      ]).returning();
    });
  }, 600_000);
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("embeds a Free board's items and finds by meaning, labelled as the local method", { timeout: 600_000 }, async () => {
    // Loaded first: a request never waits for the model (embedQuery is null until it is ready).
    expect(await embedQuery("Export faktúr")).toBeNull();
    await loadLocalModel();
    while ((await embedPending(db)) > 0) { /* other boards' items in the test database too */ }
    const rows = (await withProject(db, project.id, (tx) => tx.execute(sql`select model, embedding::text as embedding from item_embeddings where project_id = ${project.id}`))) as unknown as { model: string; embedding: string }[];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.model === "local:multilingual-e5-small" && JSON.parse(r.embedding).length === 384)).toBe(true);
    // A vector of another model (another dimension) on the same board is ignored, not an error.
    await withSystem(db, (tx) => tx.execute(sql`update item_embeddings set model = 'other', embedding = '[1,0,0]'::vector where item_id = ${items[2]!.id}`));
    const v = await embedQuery("Stiahnuť faktúry ako tabuľku");
    expect(v).not.toBeNull();
    const found = await withProject(db, project.id, (tx) => findSimilar(tx, { text: "Stiahnuť faktúry ako tabuľku", queryVector: v, limit: 3 }));
    expect(found.map((r) => r.method)).toEqual(found.map(() => "local"));
    expect(found[0]!.number).toBe(1);
    expect(found.map((r) => r.number)).not.toContain(3);
  });
});
