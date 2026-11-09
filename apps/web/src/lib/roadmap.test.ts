import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

// Integration against the dev database (skipped without it).
const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1 from custom_statuses limit 0`).then(() => true, () => false);
const slug = `roadmap-${Date.now()}`;
type User = typeof schema.users.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let other: typeof schema.projects.$inferSelect;
let tm: User, mb: User;

const { createItemFor } = await import("./items");
const { changeStatus } = await import("./domain");
const tags = await import("./tags");
const { saveStatuses } = await import("./sub-statuses");
const { roadmapLanes } = await import("./roadmap");

const pages = { pl: 1, ip: 1, sh: 1 };

describe.skipIf(!up)("roadmap lanes: tags, sub-status and the tag filter", () => {
  let a: number, b: number, c: number;

  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Roadmap" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Roadmap test", theme: presets.ozvi }).returning())[0]!;
      other = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug: `${slug}-o`, name: "Other", theme: presets.ozvi }).returning())[0]!;
      [tm, mb] = (await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "t", name: "Tím", email: "t@x.sk", role: "team" },
        { projectId: project.id, externalId: "m", name: "Člen", email: "m@x.sk" },
      ]).returning()) as [User, User];
    });
    a = await createItemFor(project, mb, { kind: "idea", title: "Export do Pohody", body: "", context: null, files: [] });
    b = await createItemFor(project, mb, { kind: "idea", title: "Tmavý režim", body: "", context: null, files: [] });
    c = await createItemFor(project, mb, { kind: "idea", title: "Ešte len návrh", body: "", context: null, files: [] });
    await withProject(db, project.id, (tx) => saveStatuses(tx, project.id, {
      labels: {}, subs: [{ kind: "idea", stage: "in_progress", labels: { sk: "V testovaní", en: "In testing" } }],
    }));
    await withProject(db, project.id, async (tx) => {
      const [sub] = await tx.select().from(schema.customStatuses);
      const pub = await tags.createTag(tx, project, { name: "Faktúry", color: "accent", public: true });
      const priv = await tags.createTag(tx, project, { name: "Churn risk", color: "red", public: false });
      const item = async (n: number) => (await tx.query.items.findFirst({ where: eq(schema.items.number, n) }))!;
      await changeStatus(tx, project, tm, await item(a), "in_progress", undefined, { subStatusId: sub!.id });
      await changeStatus(tx, project, tm, await item(b), "planned");
      await tags.setItemTags(tx, project, tm, await item(a), [pub.id, priv.id]);
      await tags.setItemTags(tx, project, tm, await item(b), [priv.id]);
      await tags.setItemTags(tx, project, tm, await item(c), [pub.id]);
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  const lanes = (team: boolean, tag?: string, locale: "sk" | "en" = "sk", id = project.id) =>
    withProject(db, id, (tx) => roadmapLanes(tx, project, locale, { team, tag, pages }));

  it("cards carry public tags for everybody, team-only tags only for the team, and the localized sub-status", async () => {
    const member = await lanes(false, undefined, "en");
    const [planned, inProgress, shipped] = member.lanes;
    expect(planned!.rows.map((r) => r.number)).toEqual([b]);
    expect(planned!.rows[0]!.tags).toEqual([]);
    expect(inProgress!.rows[0]).toMatchObject({ number: a, subLabel: "In testing" });
    expect(inProgress!.rows[0]!.tags.map((t) => t.name)).toEqual(["Faktúry"]);
    expect(shipped!.rows).toEqual([]);
    expect(member.allTags.map((t) => t.name)).toEqual(["Faktúry"]);
    // Open ideas are not on the roadmap, even when they carry the tag.
    expect(member.lanes.flatMap((l) => l.rows.map((r) => r.number))).not.toContain(c);

    const team = await lanes(true);
    expect(team.lanes[1]!.rows[0]!.subLabel).toBe("V testovaní");
    expect(team.lanes[1]!.rows[0]!.tags.map((t) => t.name)).toEqual(["Faktúry", "Churn risk"]);
    expect(team.lanes[0]!.rows[0]!.tags.map((t) => t.name)).toEqual(["Churn risk"]);
  });

  it("filters by ?tag=<name> like the ideas list; a team-only tag is unknown to members", async () => {
    const pub = await lanes(false, "faktúry");
    expect(pub.tag?.name).toBe("Faktúry");
    expect(pub.lanes.map((l) => l.rows.map((r) => r.number))).toEqual([[], [a], []]);
    expect(pub.lanes.map((l) => l.total)).toEqual([0, 1, 0]);

    // Members: the private tag doesn't resolve, so nothing is filtered and nothing leaks.
    const sneaky = await lanes(false, "Churn risk");
    expect(sneaky.tag).toBeNull();
    expect(sneaky.lanes.flatMap((l) => l.rows.map((r) => r.number)).sort()).toEqual([a, b].sort());

    const team = await lanes(true, "churn RISK");
    expect(team.tag?.name).toBe("Churn risk");
    expect(team.lanes.flatMap((l) => l.rows.map((r) => r.number)).sort()).toEqual([a, b].sort());
  });

  it("stays inside the project (RLS): another project sees no cards or tags", async () => {
    const r = await lanes(true, "Faktúry", "sk", other.id);
    expect(r.allTags).toEqual([]);
    expect(r.tag).toBeNull();
    expect(r.lanes.every((l) => l.rows.length === 0)).toBe(true);
  });
});
