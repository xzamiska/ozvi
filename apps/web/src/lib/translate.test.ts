import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { detectLanguage } from "./lang-detect";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
// aiAvailable() needs a key; the model itself is mocked below and never called.
process.env.ANTHROPIC_API_KEY = "test-key-not-used";

const tr = await import("./translate");
const { commentReadable, changelogReadable, itemReadable, sourceHash, translateFor, translationEnabled, pivotQuery, _resetPivotCache } = tr;
const { AiError } = await import("./ai");

describe("language detection", () => {
  it.each([
    ["Bolo by super, keby sa dali faktúry exportovať aj do Pohody, ďakujem", "sk"],
    ["Bylo by skvělé, kdyby šly faktury exportovat i do Pohody, děkuji", "cs"],
    ["Byłoby świetnie, gdyby faktury można było eksportować do CSV, dziękuję", "pl"],
    ["Szeretném, ha a számlákat CSV formátumban is lehetne exportálni, köszönöm", "hu"],
    ["Es wäre schön, wenn man die Rechnungen auch als CSV exportieren könnte, danke", "de"],
    ["It would be great if invoices could also be exported to CSV, thanks", "en"],
  ])("%s → %s", (text, lang) => expect(detectLanguage(text)).toBe(lang));
  it("is unsure about very short or neutral text", () => {
    expect(detectLanguage("OK")).toBeNull();
    expect(detectLanguage("https://example.com/x 404")).toBeNull();
  });
});

const viewer = (userId: string | null, isTeam = false) => ({ userId, isTeam });

describe("who may have what translated (same rules as reading)", () => {
  const idea = { kind: "idea", authorId: "a", pending: false, deletedAt: null };
  const bug = { ...idea, kind: "bug" };
  it("bugs: only the reporter and the team", () => {
    expect(itemReadable(bug, { ideasPublic: true }, viewer(null))).toBe(false);
    expect(itemReadable(bug, { ideasPublic: true }, viewer("b"))).toBe(false);
    expect(itemReadable(bug, { ideasPublic: true }, viewer("a"))).toBe(true);
    expect(itemReadable(bug, { ideasPublic: true }, viewer("t", true))).toBe(true);
  });
  it("ideas: public boards for anyone, private boards for signed-in people; queued only author and team; deleted never", () => {
    expect(itemReadable(idea, { ideasPublic: true }, viewer(null))).toBe(true);
    expect(itemReadable(idea, { ideasPublic: false }, viewer(null))).toBe(false);
    expect(itemReadable({ ...idea, pending: true }, { ideasPublic: true }, viewer("b"))).toBe(false);
    expect(itemReadable({ ...idea, pending: true }, { ideasPublic: true }, viewer("a"))).toBe(true);
    expect(itemReadable({ ...idea, deletedAt: new Date() }, { ideasPublic: true }, viewer("t", true))).toBe(false);
  });
  it("team notes only for the team; queued comments for their author and the team", () => {
    const c = { authorId: "a", internal: false, pending: false, deletedAt: null };
    expect(commentReadable({ ...c, internal: true }, viewer("a"))).toBe(false);
    expect(commentReadable({ ...c, internal: true }, viewer("t", true))).toBe(true);
    expect(commentReadable({ ...c, pending: true }, viewer("b"))).toBe(false);
    expect(commentReadable({ ...c, pending: true }, viewer("a"))).toBe(true);
    expect(commentReadable({ ...c, deletedAt: new Date() }, viewer("t", true))).toBe(false);
  });
  it("changelog drafts only for the team", () => {
    expect(changelogReadable({ publishedAt: null }, { ideasPublic: true }, viewer("b"))).toBe(false);
    expect(changelogReadable({ publishedAt: null }, { ideasPublic: true }, viewer("t", true))).toBe(true);
    expect(changelogReadable({ publishedAt: new Date() }, { ideasPublic: false }, viewer(null))).toBe(false);
  });
  it("needs both the board setting and AI", () => {
    expect(translationEnabled({ translationMode: "off" }, "self")).toBe(false);
    expect(translationEnabled({ translationMode: "on_demand" }, "self")).toBe(true);
    expect(translationEnabled({ translationMode: "auto" }, "free")).toBe(false);
    expect(translationEnabled({ translationMode: "bogus" }, "self")).toBe(false);
  });
});

const db = createDb();
const slug = `tr-${Date.now().toString(36)}`;
let project: typeof schema.projects.$inferSelect;
let author: string, other: string, team: string, idea: string, bug: string, note: string, pub: string, draft: string;

describe("translateFor (cache, permissions, limits; Claude mocked)", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Translate" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Translate test", theme: presets.ozvi, translationMode: "on_demand" }).returning())[0]!;
      const us = await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "a", name: "Autor" },
        { projectId: project.id, externalId: "o", name: "Iný" },
        { projectId: project.id, externalId: "t", name: "Tím", role: "team" },
      ]).returning();
      [author, other, team] = us.map((u) => u.id) as [string, string, string];
      const its = await tx.insert(schema.items).values([
        { projectId: project.id, kind: "idea", number: 1, title: "Eksport faktur do CSV", body: "Byłoby świetnie, gdyby to działało.", status: "open", authorId: author },
        { projectId: project.id, kind: "bug", number: 2, title: "Faktura się nie zapisuje", body: "Po kliknięciu nic się nie dzieje.", status: "new", authorId: author },
      ]).returning();
      [idea, bug] = its.map((i) => i.id) as [string, string];
      note = (await tx.insert(schema.comments).values({ projectId: project.id, itemId: idea, authorId: team, body: "Interná poznámka pre tím", internal: true }).returning())[0]!.id;
      const es = await tx.insert(schema.changelogEntries).values([
        { projectId: project.id, title: "Nowy eksport", body: "Teraz można eksportować.", publishedAt: new Date() },
        { projectId: project.id, title: "Szkic", body: "Jeszcze nie." },
      ]).returning();
      [pub, draft] = es.map((e) => e.id) as [string, string];
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  const mock = () => vi.fn(async (input: { title: string | null; body: string }, target: string) =>
    ({ title: input.title === null ? null : `[${target}] ${input.title}`, body: `[${target}] ${input.body}` }));
  const run = (v: { userId: string | null; isTeam: boolean }, wanted: { subject: "item" | "comment" | "changelog"; id: string }[], translate = mock(), key = "k") =>
    translateFor(db, { project, plan: "self", viewer: v, target: "sk", rateKey: key, wanted, deps: { translate, model: () => "claude-test" } }).then((r) => ({ r, translate }));

  it("translates once per version and serves the cache after that", async () => {
    const first = await run(viewer(other), [{ subject: "item", id: idea }]);
    expect(first.translate).toHaveBeenCalledTimes(1);
    expect(first.r.translations[0]).toMatchObject({ id: idea, title: "[sk] Eksport faktur do CSV", model: "claude-test" });
    const second = await run(viewer(null), [{ subject: "item", id: idea }]);
    expect(second.translate).not.toHaveBeenCalled();
    expect(second.r.translations[0]?.body).toBe("[sk] Byłoby świetnie, gdyby to działało.");
    const [row] = await withProject(db, project.id, (tx) => tx.select().from(schema.contentTranslations).where(eq(schema.contentTranslations.subjectId, idea)));
    expect(row).toMatchObject({ subject: "item", targetLocale: "sk", sourceLocale: "pl", sourceHash: sourceHash("Eksport faktur do CSV", "Byłoby świetnie, gdyby to działało.") });
  });

  it("an edit is a new version: the old translation is not shown for it", async () => {
    await withProject(db, project.id, (tx) => tx.update(schema.items).set({ body: "Byłoby świetnie, gdyby to działało szybciej." }).where(eq(schema.items.id, idea)));
    const { r, translate } = await run(viewer(other), [{ subject: "item", id: idea }]);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(r.translations[0]?.body).toContain("szybciej");
  });

  it("never sends a private bug, a team note or a draft to the model for people who may not read them", async () => {
    const { r, translate } = await run(viewer(other), [{ subject: "item", id: bug }, { subject: "comment", id: note }, { subject: "changelog", id: draft }]);
    expect(translate).not.toHaveBeenCalled();
    expect(r.translations).toEqual([]);
    const anon = await run(viewer(null), [{ subject: "item", id: bug }]);
    expect(anon.translate).not.toHaveBeenCalled();
  });

  it("the reporter and the team may translate what they can read", async () => {
    const mine = await run(viewer(author), [{ subject: "item", id: bug }]);
    expect(mine.translate).toHaveBeenCalledTimes(1);
    const teamRun = await run(viewer(team, true), [{ subject: "comment", id: note }, { subject: "changelog", id: draft }, { subject: "changelog", id: pub }]);
    expect(teamRun.r.translations.map((x) => x.id).sort()).toEqual([note, draft, pub].sort());
  });

  it("is off when the board has translation off", async () => {
    await expect(translateFor(db, { project: { ...project, translationMode: "off" }, plan: "self", viewer: viewer(team, true), target: "sk", rateKey: "k", wanted: [{ subject: "item", id: idea }] }))
      .rejects.toBeInstanceOf(AiError);
  });

  it("caps the daily number of new translations per project", async () => {
    process.env.OZVI_TRANSLATE_DAILY_CAP = "0";
    try {
      const { r, translate } = await run(viewer(team, true), [{ subject: "changelog", id: pub }], mock(), "cap");
      // Cached translations still come back; only new ones are refused.
      expect(translate).not.toHaveBeenCalled();
      expect(r.translations).toHaveLength(1);
      await withProject(db, project.id, (tx) => tx.update(schema.changelogEntries).set({ body: "Teraz można eksportować do CSV." }).where(eq(schema.changelogEntries.id, pub)));
      const again = await run(viewer(team, true), [{ subject: "changelog", id: pub }], mock(), "cap");
      expect(again.r.errors).toEqual([{ id: pub, code: "cap" }]);
    } finally {
      delete process.env.OZVI_TRANSLATE_DAILY_CAP;
    }
  });

  it("rate-limits each viewer (cache misses only)", async () => {
    const translate = vi.fn(async () => { throw new AiError("overloaded"); });
    let rate = 0;
    for (let i = 0; i < 65; i++) {
      const { r } = await run(viewer(other), [{ subject: "changelog", id: pub }], translate as never, "busy-viewer");
      if (r.errors[0]?.code === "rate") rate++;
    }
    expect(rate).toBe(5);
    expect(translate).toHaveBeenCalledTimes(60);
  });

  it("model failures are reported per post, nothing is cached", async () => {
    const { r } = await run(viewer(author), [{ subject: "item", id: idea }], vi.fn(async () => { throw new AiError("refused"); }) as never, "fail");
    // The idea's current version was translated earlier, so it comes from the cache.
    expect(r.errors).toEqual([]);
    await withProject(db, project.id, (tx) => tx.update(schema.items).set({ title: "Eksport faktur do XLSX" }).where(eq(schema.items.id, idea)));
    const { r: r2 } = await run(viewer(author), [{ subject: "item", id: idea }], vi.fn(async () => { throw new AiError("refused"); }) as never, "fail");
    expect(r2.errors).toEqual([{ id: idea, code: "refused" }]);
  });

  it("deleting a comment forgets its translations", async () => {
    await run(viewer(team, true), [{ subject: "comment", id: note }]);
    await withProject(db, project.id, (tx) => tr.forgetTranslations(tx, [note]));
    const rows = await withProject(db, project.id, (tx) => tx.select().from(schema.contentTranslations).where(eq(schema.contentTranslations.subjectId, note)));
    expect(rows).toEqual([]);
  });

  it("pivots typed titles in other languages to English, once, for boards with translation", async () => {
    _resetPivotCache();
    const pivot = vi.fn(async (titles: string[]) => titles.map(() => "Export invoices to CSV"));
    expect(await pivotQuery("Eksport faktur do CSV proszę", { project, plan: "self", rateKey: "p", pivot })).toBe("Export invoices to CSV");
    expect(await pivotQuery("Eksport faktur do CSV proszę", { project, plan: "self", rateKey: "p", pivot })).toBe("Export invoices to CSV");
    expect(pivot).toHaveBeenCalledTimes(1);
    expect(await pivotQuery("Export invoices to CSV please", { project, plan: "self", rateKey: "p", pivot })).toBeNull();
    expect(await pivotQuery("Eksport faktur do CSV proszę", { project: { ...project, translationMode: "off" }, plan: "self", rateKey: "p", pivot })).toBeNull();
  });

  it("worker pivots public ideas only (never bugs) and duplicate search finds them across languages", async () => {
    const { findSimilar } = await import("./similar");
    const pivot = vi.fn(async (titles: string[]) => titles.map(() => "Export invoices to XLSX"));
    await tr.pivotPending(db, 50, { pivot, model: () => "claude-test" });
    const sent = pivot.mock.calls.flatMap((c) => c[0]);
    expect(sent).toContain("Eksport faktur do XLSX");
    expect(sent).not.toContain("Faktura się nie zapisuje");
    const rows = await withProject(db, project.id, (tx) => findSimilar(tx, { text: "Export invoices to XLSX", limit: 5 }));
    expect(rows.map((r) => r.id)).toContain(idea);
    expect(await withProject(db, project.id, (tx) => tr.titlePivot(tx, idea, "Eksport faktur do XLSX"))).toBe("Export invoices to XLSX");
  });
});
