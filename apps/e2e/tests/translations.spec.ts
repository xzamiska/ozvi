import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { withProject } from "@ozvi/db";
import { eq, sql } from "drizzle-orm";
import { act, addComment, boardUser, createItem, ownerBoard, projectRow, setProject, userByEmail, type Board } from "../lib/board";
import { db, schema } from "../lib/db";
import { uniq } from "../lib/env";
import { lastMail } from "../lib/mail";

/**
 * AI translation of posts (lib/translate.ts) against the fake model of scripts/e2e-ai-mock.mjs: it "translates"
 * by prefixing the target language ("[sk] …") and logs every text it was sent (GET /log), so the specs can check
 * both what people see and what never reached the model.
 */
const MOCK = "http://127.0.0.1:3419/log";
const sentToModel = async (): Promise<string[]> => (await fetch(MOCK)).json();

/** A board on a plan with translations (Pro), Polish among its languages, in the given mode. */
async function translating(b: Board, mode: "on_demand" | "auto") {
  const p = await projectRow(b.slug);
  await db.update(schema.workspaces).set({ plan: "pro" }).where(eq(schema.workspaces.id, p.workspaceId));
  await setProject(b.slug, { translationMode: mode, locales: ["sk", "cs", "en", "pl"] });
}

const POLISH = "Byłoby świetnie, gdyby faktury można było eksportować do CSV, dziękuję bardzo.";

async function polishIdea(page: Page, slug: string) {
  const title = `Eksport faktur do pliku CSV ${uniq("p")}`;
  const n = await createItem(page, slug, "idea", title, POLISH);
  return { n, title };
}

test.describe("AI translation of posts", () => {
  test("on request: Translate shows a labelled translation with the original one click away; the monthly allowance ends it", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    await translating(b, "on_demand");
    const pl = await boardUser(browser, b, "polak");
    const { n, title } = await polishIdea(pl.page, b.slug);

    await page.goto(`/${b.slug}/i/${n}`);
    await expect(page.getByText("Napísané v inom jazyku")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    // On request: lists stay in the original.
    await act(page, () => page.getByRole("button", { name: "Preložiť" }).first().click());
    await expect(page.getByRole("heading", { level: 1, name: `[sk] ${title}` })).toBeVisible();
    await expect(page.getByText(`[sk] ${POLISH}`)).toBeVisible();
    await expect(page.getByText("Preložené s pomocou AI").first()).toBeVisible();
    await expect(page.locator('[data-ai-model="e2e-mock"]').first()).toBeAttached();
    await page.getByRole("button", { name: "zobraziť originál" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.goto(`/${b.slug}/ideas`);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await expect(page.getByText("Názvy sú preložené s pomocou AI")).toHaveCount(0);

    // The workspace used its 500 translations this month: the original stays, with the reason.
    const p = await projectRow(b.slug);
    await withProject(db, p.id, (tx) => tx.insert(schema.contentTranslations).values(Array.from({ length: 500 }, () => ({
      projectId: p.id, subject: "comment" as const, subjectId: randomUUID(), sourceHash: "x", targetLocale: "sk", title: null, body: "x", model: "e2e-mock",
    }))));
    const next = await polishIdea(pl.page, b.slug);
    await page.goto(`/${b.slug}/i/${next.n}`);
    await act(page, () => page.getByRole("button", { name: "Preložiť" }).first().click());
    await expect(page.getByText("Mesačný počet AI prekladov je vyčerpaný").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: next.title })).toBeVisible();
    await pl.ctx.close();
  });

  test("automatic: list titles and the post are shown translated; a private bug never reaches the model for others", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    await translating(b, "auto");
    const pl = await boardUser(browser, b, "polka");
    const reader = await boardUser(browser, b, "citatel");
    const { n, title } = await polishIdea(pl.page, b.slug);
    const bugTitle = `Faktura nie zapisuje się po kliknięciu ${uniq("b")}`;
    await createItem(pl.page, b.slug, "bug", bugTitle, "Po kliknięciu przycisku zapisz nic się nie dzieje, dane znikają.");
    // The reporter may read their bug: automatic mode translates it for them on its page.
    await expect(pl.page.getByRole("heading", { level: 1, name: `[sk] ${bugTitle}` })).toBeVisible();
    await pl.ctx.close();
    await fetch(MOCK, { method: "DELETE" });
    // An idea nobody has opened yet (imported, say): only the list will ask for its title.
    const p = await projectRow(b.slug);
    const unread = `Ciemny motyw dla całej aplikacji ${uniq("u")}`;
    await withProject(db, p.id, async (tx) => {
      const [row] = await tx.select({ n: sql<number>`coalesce(max(${schema.items.number}), 0)::int` }).from(schema.items);
      await tx.insert(schema.items).values({ projectId: p.id, kind: "idea", number: (row?.n ?? 0) + 1, title: unread, body: "Byłoby miło pracować wieczorem w ciemnym motywie, oczy by mniej bolały.", status: "open" });
    });

    // A reader: the ideas list shows the translated titles, marked, with one switch back to the originals.
    await reader.page.goto(`/${b.slug}/ideas`);
    await expect(reader.page.getByRole("link", { name: `[sk] ${unread}` })).toBeVisible();
    expect(await sentToModel()).toEqual([unread]); // one call, the title only
    await expect(reader.page.getByRole("link", { name: `[sk] ${title}` })).toBeVisible();
    await expect(reader.page.getByText("Názvy sú preložené s pomocou AI")).toBeVisible();
    await reader.page.getByRole("button", { name: "zobraziť originály" }).click();
    await expect(reader.page.getByRole("link", { name: title, exact: true })).toBeVisible();
    // The post itself, translated straight away.
    await reader.page.goto(`/${b.slug}/i/${n}`);
    await expect(reader.page.getByRole("heading", { level: 1, name: `[sk] ${title}` })).toBeVisible();
    await expect(reader.page.getByRole("button", { name: "zobraziť originál" }).first()).toBeVisible();
    // Nothing the reader did sent the bug to the model (their list of reports holds only their own).
    await reader.page.goto(`/${b.slug}/bugs`);
    await expect(reader.page.getByRole("link", { name: new RegExp(bugTitle) })).toHaveCount(0);
    const sent = await sentToModel();
    expect(sent.join("\n")).not.toContain(bugTitle);
    expect(sent.join("\n")).not.toContain("dane znikają");

    // The team may read it: its list title comes from the translation already made for the reporter (no new call).
    await page.goto(`/${b.slug}/bugs`);
    await expect(page.getByRole("link", { name: `[sk] ${bugTitle}` })).toBeVisible();
    expect((await sentToModel()).join("\n")).not.toContain(bugTitle);
    await reader.ctx.close();
  });

  test("a deleted comment's translation is deleted with it", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    await translating(b, "on_demand");
    const pl = await boardUser(browser, b, "polski");
    const { n } = await polishIdea(pl.page, b.slug);
    const words = `Też bym tego bardzo potrzebował w mojej firmie, dziękuję ${uniq("c")}`;
    await addComment(pl.page, words);

    await page.goto(`/${b.slug}/i/${n}`);
    const comment = page.getByRole("listitem").filter({ hasText: words });
    await act(page, () => comment.getByRole("button", { name: "Preložiť" }).click());
    await expect(page.getByText(`[sk] ${words}`)).toBeVisible();
    const p = await projectRow(b.slug);
    const rows = () => withProject(db, p.id, (tx) => tx.select().from(schema.contentTranslations).where(eq(schema.contentTranslations.subject, "comment")));
    expect((await rows()).some((r) => r.body === `[sk] ${words}`)).toBe(true);

    await page.getByRole("listitem").filter({ hasText: `[sk] ${words}` }).getByRole("button", { name: "Možnosti komentára" }).click();
    await page.getByRole("menuitem", { name: "Zmazať" }).click();
    await act(page, () => page.getByRole("alertdialog").getByRole("button", { name: "Zmazať" }).click());
    await expect(page.getByText(`[sk] ${words}`)).toHaveCount(0);
    expect((await rows()).some((r) => r.body === `[sk] ${words}`)).toBe(false);
    await pl.ctx.close();
  });

  test("e-mail: the team's reply reaches a Polish customer in Polish, labelled, with the original below", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    await translating(b, "on_demand");
    const pl = await boardUser(browser, b, "klient");
    const { n } = await polishIdea(pl.page, b.slug);
    // The customer reads in Polish (what the host app's SSO token would say with locale: "pl").
    const u = await userByEmail(b.slug, pl.email);
    const p = await projectRow(b.slug);
    await withProject(db, p.id, (tx) => tx.update(schema.users).set({ locale: "pl" }).where(eq(schema.users.id, u!.id)));

    const reply = `Ďakujeme, export do CSV pridáme v ďalšej verzii, dáme vám vedieť ${uniq("r")}`;
    await page.goto(`/${b.slug}/i/${n}`);
    await addComment(page, reply);
    const mail = await lastMail(pl.email, { subject: /komentarz/i, timeout: 40_000 });
    expect(mail.text).toContain(`[pl] ${reply}`);
    expect(mail.text).toContain("Przetłumaczone przez AI (model e2e-mock)");
    expect(mail.text).toContain("Tekst oryginalny");
    expect(mail.text).toContain(reply);
    expect(mail.html).toContain('data-ai-generated="true"');
    await pl.ctx.close();
  });
});
