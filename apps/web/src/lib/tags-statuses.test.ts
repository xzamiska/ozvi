import { createDb, encryptSecret, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanLabels, overridesFor, parseStatusLabels, subAfterStageChange, subFits, subLabel, stagesOf } from "./statuses";
import { cleanTagName, sortTags, tagFromParam, visibleTags, type Tag } from "./tag-rules";
import { clampDays, isUnanswered, waitingSince } from "./unanswered";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const pub: Tag = { id: "1", name: "Faktúry", color: "accent", public: true };
const priv: Tag = { id: "2", name: "Churn risk", color: "red", public: false };

describe("tag visibility rules", () => {
  it("team sees all tags, everybody else only public ones", () => {
    expect(visibleTags([pub, priv], true)).toEqual([pub, priv]);
    expect(visibleTags([pub, priv], false)).toEqual([pub]);
  });
  it("a team-only tag in the URL is unknown for non-team (no filtering, no leak)", () => {
    expect(tagFromParam([pub, priv], "churn RISK", false)).toBeNull();
    expect(tagFromParam([pub, priv], "churn risk", true)).toBe(priv);
    expect(tagFromParam([pub, priv], "faktúry", false)).toBe(pub);
    expect(tagFromParam([pub, priv], "", true)).toBeNull();
  });
  it("names are single-line and bounded; public tags sort first", () => {
    expect(cleanTagName("  Mobil\n  <b>app</b> ")).toBe("Mobil b app /b");
    expect(cleanTagName("   ")).toBeNull();
    expect(cleanTagName("x".repeat(80))).toHaveLength(40);
    expect(sortTags([priv, pub]).map((t) => t.id)).toEqual(["1", "2"]);
  });
});

describe("custom statuses map onto fixed stages", () => {
  it("stage renames: per locale, default-locale fallback, unknown statuses and locales dropped", () => {
    const map = parseStatusLabels({ planned: { sk: "Na pláne", en: "On the plan", fr: "x" }, bogus: { sk: "x" }, in_progress: { cs: "" } });
    expect(map).toEqual({ planned: { sk: "Na pláne", en: "On the plan" } });
    expect(overridesFor(map, "en", "sk")).toEqual({ planned: "On the plan" });
    expect(overridesFor(map, "cs", "sk")).toEqual({ planned: "Na pláne" });
    expect(overridesFor(map, "cs", "en")).toEqual({ planned: "On the plan" });
  });
  it("sub-status names fall back to the default locale, then to any name", () => {
    expect(subLabel({ labels: { sk: "V testovaní", en: "In testing" } }, "en", "sk")).toBe("In testing");
    expect(subLabel({ labels: { sk: "V testovaní" } }, "cs", "sk")).toBe("V testovaní");
    expect(subLabel({ labels: { en: "In testing" } }, "cs", "sk")).toBe("In testing");
    expect(cleanLabels({ sk: "  a\tb ", xx: "y", en: 3 })).toEqual({ sk: "a b" });
  });
  it("a sub-status belongs to one stage of one kind and is dropped when the stage moves", () => {
    expect(subFits({ kind: "bug", stage: "in_progress" }, "bug")).toBe(true);
    expect(subFits({ kind: "bug", stage: "in_progress" }, "idea")).toBe(false);
    expect(subFits({ kind: "idea", stage: "fixed" }, "idea")).toBe(false);
    expect(subAfterStageChange({ id: "s", stage: "in_progress" }, "in_progress")).toBe("s");
    expect(subAfterStageChange({ id: "s", stage: "in_progress" }, "fixed")).toBeNull();
    expect(stagesOf("idea")).toEqual(["open", "planned", "in_progress", "shipped", "declined"]);
    expect(stagesOf("bug")).toEqual(["new", "confirmed", "in_progress", "fixed", "verified", "wont_fix"]);
  });
});

describe("unanswered computation", () => {
  const d = (day: number) => new Date(Date.UTC(2026, 10, day));
  it("waits from the first outside activity after the team's last touch", () => {
    expect(waitingSince({ at: d(1), team: false }, [])).toEqual(d(1));
    expect(waitingSince({ at: d(1), team: false }, [{ at: d(3), team: true }])).toBeNull();
    expect(waitingSince({ at: d(1), team: false }, [{ at: d(3), team: true }, { at: d(5), team: false }, { at: d(6), team: false }])).toEqual(d(5));
    // Posted by the team itself: nobody waits until someone else writes.
    expect(waitingSince({ at: d(1), team: true }, [])).toBeNull();
  });
  it("only active stages, strictly longer than N days; days clamp to 1–90", () => {
    const now = d(20);
    expect(isUnanswered("open", d(12), 7, now)).toBe(true);
    expect(isUnanswered("open", d(13), 7, now)).toBe(false);
    expect(isUnanswered("shipped", d(1), 7, now)).toBe(false);
    expect(isUnanswered("wont_fix", d(1), 7, now)).toBe(false);
    expect(isUnanswered("confirmed", null, 7, now)).toBe(false);
    expect(clampDays(0)).toBe(1);
    expect(clampDays(500)).toBe(90);
    expect(clampDays("x")).toBe(7);
  });
});

// Integration against the dev database (skipped without it or before migration 0020).
const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1 from tags limit 0`).then(() => true, () => false);
const slug = `tags-${Date.now()}`;
type User = typeof schema.users.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let tm: User, mb: User;

const { createItemFor } = await import("./items");
const { addCommentTo, changeStatus, DomainError } = await import("./domain");
const tags = await import("./tags");
const { mcpBackend } = await import("./mcp-backend");
const { listItems, countItems } = await import("./queries");
const { unansweredWhere } = await import("./unanswered");
const { saveStatuses } = await import("./sub-statuses");
const { statusMails } = await import("./email/notify");
const { translator } = await import("@/i18n/messages");

describe.skipIf(!up)("tags, statuses and unanswered against the database", () => {
  const byNumber = (n: number) => withProject(db, project.id, async (tx) => (await tx.query.items.findFirst({ where: eq(schema.items.number, n) }))!);
  let ideaN: number, bugN: number, pubTag: Tag, privTag: Tag;

  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Tags" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Tags test", theme: presets.ozvi }).returning())[0]!;
      [tm, mb] = (await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "t", name: "Tím", email: "t@x.sk", role: "team" },
        { projectId: project.id, externalId: "m", name: "Člen", email: "m@x.sk" },
      ]).returning()) as [User, User];
      await tx.insert(schema.webhooks).values({ projectId: project.id, url: "https://hooks.example.com/x", secretEnc: encryptSecret("s"), includeBugs: true });
    });
    ideaN = await createItemFor(project, mb, { kind: "idea", title: "Export do Pohody", body: "", context: null, files: [] });
    bugN = await createItemFor(project, mb, { kind: "bug", title: "Faktúra sa neuloží", body: "", context: null, files: [] });
    [pubTag, privTag] = await withProject(db, project.id, async (tx) => [
      await tags.createTag(tx, project, { name: "Faktúry", color: "accent", public: true }),
      await tags.createTag(tx, project, { name: "Churn risk", color: "red", public: false }),
    ]);
    await withProject(db, project.id, async (tx) => {
      await tags.setItemTags(tx, project, tm, await tx.query.items.findFirst({ where: eq(schema.items.number, ideaN) }) as never, [pubTag.id, privTag.id]);
      await tags.setItemTags(tx, project, tm, await tx.query.items.findFirst({ where: eq(schema.items.number, bugN) }) as never, [privTag.id]);
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("members never get team-only tags: lists, filters, MCP", async () => {
    const idea = await byNumber(ideaN);
    const asMember = await withProject(db, project.id, (tx) => tags.tagsByItem(tx, [idea.id], false));
    expect(asMember.get(idea.id)?.map((t) => t.name)).toEqual(["Faktúry"]);
    const asTeam = await withProject(db, project.id, (tx) => tags.tagsByItem(tx, [idea.id], true));
    expect(asTeam.get(idea.id)?.map((t) => t.name)).toEqual(["Faktúry", "Churn risk"]);
    expect((await withProject(db, project.id, (tx) => tags.listTags(tx, false))).map((t) => t.name)).toEqual(["Faktúry"]);
    // Filtering by a team-only tag through the list query is only possible once the page resolved it for the team.
    const rows = await withProject(db, project.id, (tx) => listItems(tx, [tags.hasTag(privTag.id)], "new", true, { team: true }));
    expect(rows.map((r) => r.number).sort()).toEqual([ideaN, bugN].sort());

    const member = await mcpBackend({ project, user: mb, scope: "write", tokenId: "tm1" });
    expect((await member.get(ideaN))?.item.tags).toEqual(["Faktúry"]);
    expect((await member.get(bugN))?.item.tags).toEqual([]);
    expect((await member.search({ sort: "new", limit: 20 })).flatMap((i) => i.tags ?? [])).not.toContain("Churn risk");
    expect(await member.search({ sort: "new", limit: 20, tag: "churn risk" })).toEqual([]);
    expect((await member.search({ sort: "new", limit: 20, tag: "faktúry" })).map((i) => i.number)).toEqual([ideaN]);
    expect((await member.tags()).map((t) => t.name)).toEqual(["Faktúry"]);
    await expect(member.setTags(ideaN, ["Faktúry"], "set")).rejects.toThrow();
    // A team member with a read token is treated like the public, too (team data needs the triage scope).
    const teamRead = await mcpBackend({ project, user: tm, scope: "read", tokenId: "tm2" });
    expect((await teamRead.get(ideaN))?.item.tags).toEqual(["Faktúry"]);
    const triage = await mcpBackend({ project, user: tm, scope: "triage", tokenId: "tm3" });
    expect((await triage.get(ideaN))?.item.tags).toEqual(["Faktúry", "Churn risk"]);
    expect((await triage.search({ sort: "new", limit: 20, tag: "Churn risk" })).length).toBe(2);
    expect(await triage.setTags(ideaN, ["churn risk"], "remove")).toEqual(["Faktúry"]);
    expect(await triage.setTags(ideaN, ["Churn risk"], "add")).toEqual(["Faktúry", "Churn risk"]);
  });

  it("webhook payloads carry public tags only", async () => {
    await withProject(db, project.id, async (tx) => changeStatus(tx, project, tm, (await tx.query.items.findFirst({ where: eq(schema.items.number, ideaN) }))!, "planned"));
    await withProject(db, project.id, async (tx) => changeStatus(tx, project, tm, (await tx.query.items.findFirst({ where: eq(schema.items.number, bugN) }))!, "confirmed"));
    const rows = await withProject(db, project.id, (tx) => tx.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.event, "item.status_changed")));
    const byN = new Map(rows.map((r) => [(r.payload as { item: { number: number } }).item.number, r.payload as { item: { tags: string[] } }]));
    expect(byN.get(ideaN)?.item.tags).toEqual(["Faktúry"]);
    expect(byN.get(bugN)?.item.tags).toEqual([]);
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toContain("Churn risk");
  });

  it("only the team assigns tags; merge keeps one copy; delete removes it everywhere", async () => {
    const idea = await byNumber(ideaN);
    await expect(withProject(db, project.id, (tx) => tags.setItemTags(tx, project, mb, idea, [pubTag.id]))).rejects.toBeInstanceOf(DomainError);
    await expect(withProject(db, project.id, (tx) => tags.createTag(tx, project, { name: "faktúry", color: "green", public: true }))).rejects.toBeInstanceOf(DomainError);
    const extra = await withProject(db, project.id, (tx) => tags.createTag(tx, project, { name: "Účtovníctvo", color: "nope", public: true }));
    expect(extra.color).toBe("neutral");
    await withProject(db, project.id, (tx) => tags.setItemTags(tx, project, tm, idea, [pubTag.id, extra.id]));
    await withProject(db, project.id, (tx) => tags.mergeTags(tx, extra.id, pubTag.id));
    const after = await withProject(db, project.id, (tx) => tags.tagsByItem(tx, [idea.id], true));
    expect(after.get(idea.id)?.map((t) => t.name)).toEqual(["Faktúry"]);
    expect((await withProject(db, project.id, (tx) => tags.listTags(tx, true))).map((t) => t.name)).not.toContain("Účtovníctvo");
  });

  it("sub-statuses map onto a stage: choosing one sets its stage, moving the stage clears it", async () => {
    await withProject(db, project.id, (tx) => saveStatuses(tx, project.id, {
      labels: { in_progress: { sk: "Robíme na tom" } },
      subs: [{ kind: "idea", stage: "in_progress", labels: { sk: "V testovaní", en: "In testing" } }, { kind: "bug", stage: "in_progress", labels: { sk: "Čaká na review" } }],
    }));
    const subs = await withProject(db, project.id, (tx) => tx.select().from(schema.customStatuses));
    const ideaSub = subs.find((s) => s.kind === "idea")!;
    const bugSub = subs.find((s) => s.kind === "bug")!;
    let idea = await byNumber(ideaN);
    // A bug's sub-status can't go on an idea; a sub-status of another stage is refused.
    await expect(withProject(db, project.id, (tx) => changeStatus(tx, project, tm, idea, "in_progress", undefined, { subStatusId: bugSub.id }))).rejects.toBeInstanceOf(DomainError);
    await expect(withProject(db, project.id, (tx) => changeStatus(tx, project, tm, idea, "planned", undefined, { subStatusId: ideaSub.id }))).rejects.toBeInstanceOf(DomainError);
    await withProject(db, project.id, (tx) => changeStatus(tx, project, tm, idea, "in_progress", undefined, { subStatusId: ideaSub.id }));
    idea = await byNumber(ideaN);
    expect(idea).toMatchObject({ status: "in_progress", subStatusId: ideaSub.id });
    const events = await withProject(db, project.id, (tx) => tx.select().from(schema.itemEvents).where(eq(schema.itemEvents.itemId, idea.id)));
    expect(events.at(-1)).toMatchObject({ toStatus: "in_progress", subStatusId: ideaSub.id });
    // Same stage, no sub: back to the plain stage (no new status e-mail, still a dated stop).
    await withProject(db, project.id, (tx) => changeStatus(tx, project, tm, idea, "in_progress", undefined, { subStatusId: null }));
    expect((await byNumber(ideaN)).subStatusId).toBeNull();
    await withProject(db, project.id, async (tx) => changeStatus(tx, project, tm, await byNumber(ideaN), "in_progress", undefined, { subStatusId: ideaSub.id }));
    expect((await byNumber(ideaN)).subStatusId).toBe(ideaSub.id);
    // GitHub/changelog automation works on stages and drops the sub-status.
    await withProject(db, project.id, async (tx) => changeStatus(tx, project, null, (await tx.query.items.findFirst({ where: eq(schema.items.number, ideaN) }))!, "shipped"));
    expect(await byNumber(ideaN)).toMatchObject({ status: "shipped", subStatusId: null });
    // Removing a sub-status leaves items on their stage.
    const bug = await byNumber(bugN);
    await withProject(db, project.id, (tx) => changeStatus(tx, project, tm, bug, "in_progress", undefined, { subStatusId: bugSub.id }));
    await withProject(db, project.id, (tx) => saveStatuses(tx, project.id, { labels: {}, subs: [{ id: ideaSub.id, kind: "idea", stage: "in_progress", labels: { sk: "V testovaní" } }] }));
    expect(await byNumber(bugN)).toMatchObject({ status: "in_progress", subStatusId: null });
  });

  it("renamed stops reach e-mails; stage keys stay the same", () => {
    const board = { defaultLocale: "sk", locales: ["sk", "en"], statusLabels: { planned: { sk: "Na pláne" } } };
    const item = { number: 1, title: "Export", status: "planned", fixedInVersion: null } as never;
    const sk = statusMails.idea(translator("sk", "email"), "sk", item, "https://x", board);
    expect(sk.subject).toBe("Na pláne: Export");
    const en = statusMails.idea(translator("en", "email"), "en", item, "https://x", board);
    expect(en.subject).toBe("Na pláne: Export");
    const plain = statusMails.idea(translator("en", "email"), "en", item, "https://x");
    expect(plain.subject).toBe("Planned: Export");
  });

  it("unanswered: waiting from the first outside activity, cleared by a public team reply, not by internal notes", async () => {
    const n = await createItemFor(project, mb, { kind: "idea", title: "Tmavý režim", body: "", context: null, files: [] });
    const item = await byNumber(n);
    const age = (days: number) => withSystem(db, async (tx) => {
      await tx.update(schema.items).set({ createdAt: sql`now() - make_interval(days => ${days})` }).where(eq(schema.items.id, item.id));
    });
    const queue = async (days = 7) => (await withProject(db, project.id, (tx) => listItems(tx, [unansweredWhere(days)], "waiting", true, { team: true }))).map((r) => r.number);
    expect(await queue()).not.toContain(n);
    await age(10);
    expect(await queue()).toContain(n);
    expect(await queue(14)).not.toContain(n);
    // Member's view never orders by waiting (falls back to top) and has no waitingSince.
    const [asMember] = await withProject(db, project.id, (tx) => listItems(tx, [eq(schema.items.number, n)], "waiting", false));
    expect(asMember && "waitingSince" in asMember).toBe(false);
    const [row] = await withProject(db, project.id, (tx) => listItems(tx, [eq(schema.items.number, n)], "waiting", true, { team: true }));
    expect(row?.waitingSince).toBeInstanceOf(Date);

    await withProject(db, project.id, (tx) => addCommentTo(tx, project, tm, item, "Interná poznámka", true));
    expect(await queue()).toContain(n);
    const reply = await withProject(db, project.id, (tx) => addCommentTo(tx, project, tm, item, "Pozrieme sa na to.", false));
    expect(await queue()).not.toContain(n);
    // The member answers back; ten days later it waits again.
    const c = await withProject(db, project.id, (tx) => addCommentTo(tx, project, mb, item, "Ďakujem, kedy to bude?", false));
    await withSystem(db, async (tx) => {
      await tx.update(schema.comments).set({ createdAt: sql`now() - interval '9 days'` }).where(eq(schema.comments.id, reply.id));
      await tx.update(schema.comments).set({ createdAt: sql`now() - interval '8 days'` }).where(eq(schema.comments.id, c.id));
    });
    expect(await queue()).toContain(n);
    // A status change by the team counts as an answer too.
    await withProject(db, project.id, async (tx) => changeStatus(tx, project, tm, (await tx.query.items.findFirst({ where: eq(schema.items.id, item.id) }))!, "planned"));
    expect(await queue()).not.toContain(n);
    expect(await withProject(db, project.id, (tx) => countItems(tx, [unansweredWhere(7)]))).toBe((await queue()).length);

    // MCP filter: team with triage only.
    const member = await mcpBackend({ project, user: mb, scope: "write", tokenId: "tm4" });
    await expect(member.search({ sort: "new", limit: 10, unanswered: true })).rejects.toThrow();
  });
});
