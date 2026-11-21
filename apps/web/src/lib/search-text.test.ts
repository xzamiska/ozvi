import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fold, searchWords } from "./search-text";

describe("search text folding", () => {
  it("folds case and accents of sk/cs/pl/hu/de letters", () => {
    expect(fold("Tmavý režim")).toBe("tmavy rezim");
    expect(fold("Faktúr ČŘŮĽĹŇŤĎ łąśćżźę őű äöüß")).toBe("faktur crullntd lasczze ou aouss");
  });
  it("search words skip short stop-words and repeat", () => {
    expect(searchWords("Export do CSV pre Pohodu")).toEqual(["export", "csv", "pohodu"]);
    expect(searchWords("Tmavý režim, tmavy rezim!")).toEqual(["tmavy", "rezim"]);
    expect(searchWords("the and for")).toEqual([]);
  });
});

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1 from projects limit 0`).then(() => true, () => false);
const slug = `srch-${Date.now()}`;

describe.skipIf(!up)("accent-insensitive search in the database", async () => {
  const { widgetIdeas } = await import("./widget-api");
  const { listItems, textMatch } = await import("./queries");
  let projectId = "";
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Search" }).returning();
      const [p] = await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Search", theme: presets.ozvi }).returning();
      projectId = p!.id;
      await tx.insert(schema.items).values([
        { projectId, number: 1, kind: "idea", status: "open", title: "Tmavý režim", body: "", voteCount: 1 },
        { projectId, number: 2, kind: "idea", status: "open", title: "Export faktúr do CSV", body: "", voteCount: 2 },
        { projectId, number: 3, kind: "idea", status: "open", title: "Platba vopred kartou", body: "", voteCount: 50 },
        { projectId, number: 4, kind: "idea", status: "open", title: "Export kontaktov", body: "", voteCount: 30 },
        { projectId, number: 5, kind: "idea", status: "open", title: "Encyclopædia Œuvre", body: "", voteCount: 0 },
      ]);
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("board search finds accented titles typed without accents", async () => {
    const titles = (q: string) => withProject(db, projectId, (tx) => listItems(tx, textMatch(q), "top", false)).then((r) => r.map((i) => i.title));
    expect(await titles("tmavy rezim")).toEqual(["Tmavý režim"]);
    expect(await titles("faktur")).toEqual(["Export faktúr do CSV"]);
    expect(await titles("FAKTÚR")).toEqual(["Export faktúr do CSV"]);
  });

  it("board search folds in SQL with ozvi_fold, the duplicate finder's folding (letters beyond the JS map too)", async () => {
    const titles = (q: string) => withProject(db, projectId, (tx) => listItems(tx, textMatch(q), "top", false)).then((r) => r.map((i) => i.title));
    expect(await titles("encyclopaedia")).toEqual(["Encyclopædia Œuvre"]);
    expect(await titles("oeuvre")).toEqual(["Encyclopædia Œuvre"]);
  });

  it("similar ideas: accents ignored, word starts only, more matched words before more votes", async () => {
    const numbers = (q: string) => withProject(db, projectId, (tx) => widgetIdeas(tx, { q, limit: 5 })).then((r) => r.map((i) => i.number));
    expect(await numbers("tmavy rezim")).toEqual([1]);
    // "pre" is a stop-word and never matches inside "vopred".
    expect(await numbers("pre faktur")).toEqual([2]);
    // Two matched words beat a more popular idea with one.
    expect(await numbers("export faktur")).toEqual([2, 4]);
  });
});
