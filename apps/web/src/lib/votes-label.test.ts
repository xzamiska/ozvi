import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { votesLabel } from "./votes";

describe("vote count in words", () => {
  it("importance mode counts points from people, as on the board's button", () => {
    expect(votesLabel("sk", "importance", 2, 1)).toBe("2 body od 1 človeka");
    expect(votesLabel("en", "importance", 5, 2)).toBe("5 points from 2 people");
  });
  it("simple mode counts votes", () => {
    expect(votesLabel("sk", "simple", 2, 2)).toBe("2 hlasy");
  });
});

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1 from projects limit 0`).then(() => true, () => false);
const slug = `vlabel-${Date.now()}`;

describe.skipIf(!up)("roadmap cards know how many people voted", async () => {
  const { roadmapLanes } = await import("./roadmap");
  let project: typeof schema.projects.$inferSelect;
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Labels" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Labels", theme: presets.ozvi, voteMode: "importance" }).returning())[0]!;
      const [u] = await tx.insert(schema.users).values({ projectId: project.id, externalId: "v", name: "V" }).returning();
      const [i] = await tx.insert(schema.items).values({ projectId: project.id, number: 1, kind: "idea", status: "planned", title: "Tmavý režim", body: "", voteCount: 2 }).returning();
      await tx.insert(schema.votes).values({ projectId: project.id, itemId: i!.id, userId: u!.id, weight: 2 });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });
  it("2 points from 1 person", async () => {
    const { lanes } = await withProject(db, project.id, (tx) => roadmapLanes(tx, project, "sk", { team: false, pages: { pl: 1, ip: 1, sh: 1 } }));
    const card = lanes[0]!.rows[0]!;
    expect(votesLabel("sk", "importance", card.votes, card.voters)).toBe("2 body od 1 človeka");
  });
});
