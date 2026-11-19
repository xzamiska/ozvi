import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, isNull } from "drizzle-orm";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
// translationEnabled() needs a provider; the model itself is mocked and never called.
process.env.ANTHROPIC_API_KEY = "test-key-not-used";

const tr = await import("./translate");
const { translateTitlesFor, cachedTitles, titleTarget, sourceHash, newBoardTranslationMode, PIVOT } = tr;
const { AiError } = await import("./ai");
const { notifyComment, notifyStatusChange } = await import("./email/notify");
const { translateMails, TRANSLATE_WAIT_MS } = await import("./email/translate-mail");
const { tick } = await import("./email/worker");

const db = createDb();
const slug = `tre-${Date.now().toString(36)}`;
let project: typeof schema.projects.$inferSelect;
let author: string, other: string, team: string, idea: string, bug: string, idea2: string, polish: string;

const viewer = (userId: string | null, isTeam = false) => ({ userId, isTeam });
const titles = () => vi.fn(async (list: string[], target: string) => list.map((t) => `[${target}] ${t}`));
const run = (v: { userId: string | null; isTeam: boolean }, ids: string[], translate = titles(), key = "k", p = project) =>
  translateTitlesFor(db, { project: p, plan: "self", viewer: v, target: "sk", rateKey: key, ids, deps: { translate, model: () => "claude-test" } })
    .then((r) => ({ r, translate }));

beforeAll(async () => {
  await withSystem(db, async (tx) => {
    const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Translate everywhere" }).returning();
    project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Everywhere", theme: presets.ozvi, translationMode: "auto", locales: ["sk", "cs", "en", "pl"] }).returning())[0]!;
    const us = await tx.insert(schema.users).values([
      { projectId: project.id, externalId: "a", name: "Autor", email: `a-${slug}@x.sk`, locale: "sk" },
      { projectId: project.id, externalId: "o", name: "Iný", email: `o-${slug}@x.sk` },
      { projectId: project.id, externalId: "t", name: "Tím", role: "team", email: `t-${slug}@x.sk`, locale: "sk" },
      { projectId: project.id, externalId: "p", name: "Polak", email: `p-${slug}@x.pl`, locale: "pl" },
    ]).returning();
    [author, other, team, polish] = us.map((u) => u.id) as [string, string, string, string];
    const its = await tx.insert(schema.items).values([
      { projectId: project.id, kind: "idea", number: 1, title: "Eksport faktur do CSV", body: "Byłoby świetnie, gdyby to działało.", status: "open", authorId: author },
      { projectId: project.id, kind: "bug", number: 2, title: "Faktura się nie zapisuje", body: "Po kliknięciu nic się nie dzieje.", status: "new", authorId: author },
      { projectId: project.id, kind: "idea", number: 3, title: "Ciemny motyw aplikacji", body: "Byłoby miło mieć ciemny motyw wieczorem.", status: "open", authorId: polish },
    ]).returning();
    [idea, bug, idea2] = its.map((i) => i.id) as [string, string, string];
  });
});
afterAll(async () => {
  await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
});

describe("titles in lists (automatic mode)", () => {
  it("one model call for the page; cached afterwards under title:<locale>, apart from posts and pivots", async () => {
    const first = await run(viewer(other), [idea, idea2]);
    expect(first.translate).toHaveBeenCalledTimes(1);
    expect(first.r.translations.map((x) => x.title).sort()).toEqual(["[sk] Ciemny motyw aplikacji", "[sk] Eksport faktur do CSV"]);
    const second = await run(viewer(null), [idea, idea2]);
    expect(second.translate).not.toHaveBeenCalled();
    expect(second.r.translations).toHaveLength(2);
    const rows = await withProject(db, project.id, (tx) => tx.select().from(schema.contentTranslations).where(eq(schema.contentTranslations.subjectId, idea)));
    expect(rows.map((r) => r.targetLocale)).toEqual([titleTarget("sk")]);
    expect(titleTarget("en")).not.toBe(PIVOT);
  });

  it("a private bug's title never reaches the model for someone else; its reporter and the team get it", async () => {
    const others = await run(viewer(other), [bug], titles(), "o2");
    expect(others.translate).not.toHaveBeenCalled();
    expect(others.r.translations).toEqual([]);
    const anon = await run(viewer(null), [bug], titles(), "anon");
    expect(anon.translate).not.toHaveBeenCalled();
    const mine = await run(viewer(author), [bug], titles(), "mine");
    expect(mine.translate).toHaveBeenCalledWith(["Faktura się nie zapisuje"], "sk");
    // Now cached, but still only for those who may read the bug.
    const later = await run(viewer(other), [bug], titles(), "o3");
    expect(later.r.translations).toEqual([]);
  });

  it("reuses a whole-post translation of the current version (no model call)", async () => {
    await withProject(db, project.id, (tx) => tx.insert(schema.contentTranslations).values({
      projectId: project.id, subject: "item", subjectId: idea2, sourceHash: sourceHash("Ciemny motyw aplikacji", "Byłoby miło mieć ciemny motyw wieczorem."),
      targetLocale: "cs", sourceLocale: "pl", title: "Tmavý motiv", body: "…", model: "claude-test",
    }));
    const r = await translateTitlesFor(db, { project, plan: "self", viewer: viewer(other), target: "cs", rateKey: "cs", ids: [idea2], deps: { translate: titles(), model: () => "x" } });
    expect(r.translations).toEqual([expect.objectContaining({ id: idea2, title: "Tmavý motiv" })]);
  });

  it("a new title is a new version", async () => {
    await withProject(db, project.id, (tx) => tx.update(schema.items).set({ title: "Eksport faktur do XLSX" }).where(eq(schema.items.id, idea)));
    const { r, translate } = await run(viewer(other), [idea], titles(), "v2");
    expect(translate).toHaveBeenCalledWith(["Eksport faktur do XLSX"], "sk");
    expect(r.translations[0]?.title).toBe("[sk] Eksport faktur do XLSX");
  });

  it("only in automatic mode, and within the monthly allowance", async () => {
    await expect(run(viewer(other), [idea], titles(), "m", { ...project, translationMode: "on_demand" })).rejects.toBeInstanceOf(AiError);
    process.env.OZVI_TRANSLATE_MONTHLY_CAP = "0";
    try {
      await withProject(db, project.id, (tx) => tx.update(schema.items).set({ title: "Eksport faktur do PDF" }).where(eq(schema.items.id, idea)));
      const { r, translate } = await run(viewer(other), [idea, idea2], titles(), "cap");
      expect(translate).not.toHaveBeenCalled();
      expect(r.errors).toEqual([{ id: idea, code: "cap" }]);
      expect(r.translations.map((x) => x.id)).toEqual([idea2]); // cached ones still come back
    } finally {
      delete process.env.OZVI_TRANSLATE_MONTHLY_CAP;
    }
  });

  it("a model failure caches nothing", async () => {
    const translate = vi.fn(async () => { throw new AiError("overloaded"); });
    const { r } = await run(viewer(other), [idea], translate as never, "fail");
    expect(r.errors).toEqual([{ id: idea, code: "overloaded" }]);
    const rows = await withProject(db, project.id, (tx) => cachedTitles(tx, [{ subject: "item", id: idea, title: "Eksport faktur do PDF", body: "" }], "sk"));
    expect(rows.size).toBe(0);
  });
});

describe("new boards", () => {
  it("start with translation on request where the plan includes it", () => {
    expect(newBoardTranslationMode("free")).toBe("off");
    expect(newBoardTranslationMode("pro")).toBe("on_demand");
    expect(newBoardTranslationMode("studio")).toBe("on_demand");
    expect(newBoardTranslationMode("self")).toBe("on_demand");
  });
});

describe("e-mails quote replies in the recipient's language", () => {
  const sent: { to: string; text: string; html: string }[] = [];
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const send = transport.sendMail.bind(transport);
  transport.sendMail = (async (m: { to: string; text: string; html: string }) => { sent.push(m); return send(m as never); }) as never;
  const scope = () => ({ projectIds: [project.id], now: new Date(Date.now() + 2 * 3600_000) });
  const mailTo = (to: string) => withSystem(db, (tx) => tx.select().from(schema.emails)
    .where(and(eq(schema.emails.projectId, project.id), eq(schema.emails.userId, to))));
  const reply = "Ďakujeme, export do CSV pridáme v ďalšej verzii aplikácie, ozveme sa vám.";

  async function teamReply(text: string) {
    return withProject(db, project.id, async (tx) => {
      const item = (await tx.select().from(schema.items).where(eq(schema.items.id, idea2)))[0]!;
      const [c] = await tx.insert(schema.comments).values({ projectId: project.id, itemId: idea2, authorId: team, body: text }).returning();
      await notifyComment(tx, project, item, { authorId: team, authorName: "Tím", body: text, commentId: c!.id, audience: "all" });
      return c!.id;
    });
  }
  const clear = () => withSystem(db, (tx) => tx.delete(schema.emails).where(eq(schema.emails.projectId, project.id)));

  it("marks only mails whose quote is in another language than the recipient's", async () => {
    await clear();
    await teamReply(reply);
    const [pl] = await mailTo(polish);
    expect(pl?.translate).toMatchObject({ subject: "comment", target: "pl" });
    // Off on the board: nothing to translate.
    await withProject(db, project.id, async (tx) => {
      const item = (await tx.select().from(schema.items).where(eq(schema.items.id, idea2)))[0]!;
      await notifyComment(tx, { ...project, translationMode: "off" }, item, { authorId: team, authorName: "Tím", body: reply, commentId: pl!.id, audience: "all" });
    });
    const all = await mailTo(polish);
    expect(all).toHaveLength(2);
    expect(all.filter((m) => m.translate)).toHaveLength(1);
    // Keep only the marked one for the worker test below.
    await withSystem(db, (tx) => tx.delete(schema.emails).where(and(eq(schema.emails.projectId, project.id), isNull(schema.emails.translate))));
  });

  it("the worker translates the quote, labels it and keeps the original under it", async () => {
    const translate = vi.fn(async (input: { title: string | null; body: string }, target: string) => ({ title: null, body: `[${target}] Dziękujemy, eksport do CSV dodamy.` }));
    expect(await translateMails(db, { projectIds: [project.id], deps: { translate, model: () => "claude-test" } })).toBe(1);
    expect(translate).toHaveBeenCalledWith({ title: null, body: reply }, "pl");
    const [pl] = await mailTo(polish);
    expect(pl!.translate).toBeNull();
    expect(pl!.text).toContain("[pl] Dziękujemy, eksport do CSV dodamy.");
    expect(pl!.text).toContain("Przetłumaczone przez AI (model claude-test)");
    expect(pl!.text).toContain("Tekst oryginalny");
    expect(pl!.text).toContain("export do CSV pridáme");
    expect(pl!.html).toContain('data-ai-generated="true"');
    await tick(db, transport, scope());
    expect(sent.find((m) => m.to === `p-${slug}@x.pl`)?.text).toContain("[pl] Dziękujemy");
  });

  it("an AI failure sends the original, never blocks the mail", async () => {
    await clear();
    sent.length = 0;
    await teamReply("Opravili sme to v novej verzii aplikácie, skúste to prosím znova a dajte vedieť.");
    const translate = vi.fn(async () => { throw new AiError("overloaded"); });
    expect(await translateMails(db, { projectIds: [project.id], deps: { translate, model: () => "x" } })).toBe(0);
    const [pl] = await mailTo(polish);
    expect(pl!.translate).toBeNull();
    expect(pl!.text).not.toContain("Tekst oryginalny");
    await tick(db, transport, scope());
    expect(sent.some((m) => m.to === `p-${slug}@x.pl`)).toBe(true);
  });

  it("the send step holds a mail whose translation has not run yet, then sends it untranslated after the wait", async () => {
    await clear();
    sent.length = 0;
    // More waiting mails than one translation batch (10): the rest must not go out before their turn.
    const job = { subject: "comment" as const, id: idea2, target: "pl", mail: {} };
    await withSystem(db, (tx) => tx.insert(schema.emails).values(Array.from({ length: 12 }, (_, i) => ({
      projectId: project.id, userId: polish, to: `p-${slug}@x.pl`, kind: "comment", subject: `s${i}`, summary: "", html: "<p>x</p>", text: "x",
      sendAfter: new Date(0), translate: job,
    }))));
    // No model in this run (the test key would reach the real API): the translation step clears its batch at once.
    process.env.OZVI_AI_PROVIDER = "off";
    try {
      const now = new Date(Date.now() + 1000);
      await tick(db, transport, { projectIds: [project.id], now });
      expect(sent).toHaveLength(10);
      const waiting = (await mailTo(polish)).filter((m) => m.status === "queued");
      expect(waiting).toHaveLength(2);
      expect(waiting.every((m) => m.translate)).toBe(true);
      // Past the wait the send step no longer holds them (whatever the translation step did).
      await withSystem(db, (tx) => tx.update(schema.emails).set({ createdAt: new Date(Date.now() - TRANSLATE_WAIT_MS - 1000) })
        .where(and(eq(schema.emails.projectId, project.id), eq(schema.emails.status, "queued"))));
      await tick(db, transport, { projectIds: [project.id], now });
      expect(sent).toHaveLength(12);
    } finally {
      delete process.env.OZVI_AI_PROVIDER;
    }
  });

  it("the status mail's note (the team's words, also a comment) is translated too", async () => {
    await clear();
    const note = "Pridali sme to do plánu na budúci mesiac, ďakujeme za skvelý nápad pre aplikáciu.";
    await withProject(db, project.id, async (tx) => {
      const item = (await tx.select().from(schema.items).where(eq(schema.items.id, idea2)))[0]!;
      const [c] = await tx.insert(schema.comments).values({ projectId: project.id, itemId: idea2, authorId: team, body: note }).returning();
      await notifyStatusChange(tx, project, { ...item, status: "planned" }, team, null, note, c!.id);
    });
    const [pl] = await mailTo(polish);
    expect(pl?.translate).toMatchObject({ subject: "comment", target: "pl" });
  });
});
