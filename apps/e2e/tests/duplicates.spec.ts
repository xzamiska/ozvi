import { expect, test } from "@playwright/test";
import { withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { act, boardUser, createItem, itemRow, moveTo, ownerBoard, projectRow } from "../lib/board";
import { db, schema } from "../lib/db";
import { uniq } from "../lib/env";
import { lastMail } from "../lib/mail";
import { attachmentsOf } from "../lib/widget";

/** 1×1 transparent PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** ADR-0015 phase 1: similar ideas while writing, attaching to an existing idea, splitting a merge. @tablet runs these on iPad too. */
test.describe("duplicates before they happen @tablet", () => {
  test("while writing: vote on a similar idea in place, add my text as its comment; the draft survives a reload", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const tag = uniq("x");
    const orig = `Tmavý režim aplikácie ${tag}`;
    const n = await createItem(ann.page, b.slug, "idea", orig, "V noci to svieti do očí.");

    const ben = await boardUser(browser, b, "ben");
    await ben.page.goto(`/${b.slug}/new?kind=idea`);
    // Typed without diacritics, as people do.
    await ben.page.getByLabel("Čo by vám pomohlo?").fill(`tmavy rezim aplikacie ${tag}`);
    await ben.page.getByLabel(/Prečo to potrebujete/).fill("Pracujem večer a biela ma oslepuje.");
    const similar = ben.page.getByRole("region", { name: "Podobné nápady" });
    await expect(similar).toContainText(orig);

    // The draft is kept in this tab: a reload (or opening a suggestion and coming back) loses nothing.
    await ben.page.reload();
    await expect(ben.page.getByLabel("Čo by vám pomohlo?")).toHaveValue(`tmavy rezim aplikacie ${tag}`);
    await expect(ben.page.getByLabel(/Prečo to potrebujete/)).toHaveValue("Pracujem večer a biela ma oslepuje.");
    // "Zobraziť" opens in a new tab, never in place of the form.
    await expect(similar.getByRole("link", { name: /Zobraziť/ }).first()).toHaveAttribute("target", "_blank");

    await act(ben.page, () => similar.getByRole("button", { name: /^Hlasovať/ }).first().click());
    await expect(similar).toContainText(`Váš hlas je pri #${n}.`);
    expect((await itemRow(b.slug, n))!.voteCount).toBe(1);
    await similar.getByRole("button", { name: `Pridať môj text ako komentár k #${n}` }).click();
    await expect(ben.page.getByText(`Váš text je pri #${n} ako komentár.`)).toBeVisible();
    // No second idea; the text is a comment on the original, and the draft is gone.
    const p = await projectRow(b.slug);
    const ideas = await withProject(db, p.id, (tx) => tx.select({ title: schema.items.title }).from(schema.items));
    expect(ideas.filter((i) => i.title.includes(tag))).toHaveLength(1);
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await expect(ben.page.getByText("Pracujem večer a biela ma oslepuje.")).toBeVisible();
    await ben.page.goto(`/${b.slug}/new?kind=idea`);
    await expect(ben.page.getByLabel("Čo by vám pomohlo?")).toHaveValue("");
    await ann.ctx.close(); await ben.ctx.close();
  });

  test("on submit a strong match asks once: attach my vote and text, or create it anyway with a reason the team sees", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const tag = uniq("y");
    const orig = `Export faktúr do Pohody ${tag}`;
    const n = await createItem(ann.page, b.slug, "idea", orig);

    // 1) Attach: the vote and the text go to the original.
    const ben = await boardUser(browser, b, "ben");
    await ben.page.goto(`/${b.slug}/new?kind=idea`);
    await ben.page.getByLabel("Čo by vám pomohlo?").fill(`Export faktúr do Pohody ${tag}`);
    await ben.page.getByLabel(/Prečo to potrebujete/).fill("Účtovníčka to chce každý mesiac.");
    await ben.page.getByRole("button", { name: "Navrhnúť nápad" }).click();
    await expect(ben.page.getByText(`Nie je to #${n}?`)).toBeVisible();
    // Below the fold on a tablet: the question is brought into view and focused, not left unnoticed.
    await expect(ben.page.getByText(`Nie je to #${n}?`)).toBeInViewport();
    await expect(ben.page.getByRole("group", { name: `Nie je to #${n}?` })).toBeFocused();
    await ben.page.getByRole("button", { name: `Pridať hlas a môj popis k #${n}` }).click();
    await ben.page.waitForURL(new RegExp(`/${b.slug}/i/${n}`));
    await expect(ben.page.getByText("Váš hlas a popis sú pri tomto nápade.")).toBeVisible();
    await expect(ben.page.getByText("Účtovníčka to chce každý mesiac.")).toBeVisible();
    expect((await itemRow(b.slug, n))!.voteCount).toBe(1);

    // 2) Something else: created, with the reason kept for the team.
    const cyril = await boardUser(browser, b, "cyril");
    await cyril.page.goto(`/${b.slug}/new?kind=idea`);
    await cyril.page.getByLabel("Čo by vám pomohlo?").fill(`Export faktúr do Pohody ${tag} cez API`);
    // A sketch attached before the question must still be there after it.
    await cyril.page.getByLabel(/Obrázok alebo náčrt/).setInputFiles({ name: "nacrt.png", mimeType: "image/png", buffer: PNG });
    await cyril.page.getByRole("button", { name: "Navrhnúť nápad" }).click();
    await expect(cyril.page.getByText(`Nie je to #${n}?`)).toBeVisible();
    await expect(cyril.page.getByRole("list", { name: /Priložené|priložené/ })).toContainText("nacrt.png");
    await cyril.page.getByLabel("V čom je to iné?").fill("Chcem automatický prenos, nie súbor.");
    await cyril.page.getByRole("button", { name: "Je to niečo iné, vytvoriť nový nápad" }).click();
    await cyril.page.waitForURL(new RegExp(`/${b.slug}/i/\\d+$`));
    const m = Number(cyril.page.url().match(/\/i\/(\d+)$/)![1]);
    expect(m).not.toBe(n);
    expect((await attachmentsOf((await projectRow(b.slug)).id, (await itemRow(b.slug, m))!.id)).map((f) => f.mime)).toEqual(["image/png"]);

    await page.goto(`/${b.slug}/i/${m}`);
    await expect(page.getByText(`Autor videl #${n} a označil to za iné`)).toBeVisible();
    await expect(page.getByText("Chcem automatický prenos, nie súbor.")).toBeVisible();
    // The customer does not see the team's note.
    await cyril.page.reload();
    await expect(cyril.page.getByText(`Autor videl #${n}`)).toHaveCount(0);
    await ann.ctx.close(); await ben.ctx.close(); await cyril.ctx.close();
  });

  test("the team splits a merge done by mistake; the item is on its own again", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const tag = uniq("z");
    const a = await createItem(ann.page, b.slug, "idea", `Kalendár rezervácií ${tag}`);
    const c = await createItem(ann.page, b.slug, "idea", `Platba kartou vopred ${tag}`);
    // Merged by mistake (as the team's merge leaves it: closed, pointing at the original).
    const [ia, ic] = [(await itemRow(b.slug, a))!, (await itemRow(b.slug, c))!];
    const p = await projectRow(b.slug);
    await withProject(db, p.id, (tx) => tx.update(schema.items).set({ mergedIntoId: ia.id, status: "declined" }).where(eq(schema.items.id, ic.id)));

    await page.goto(`/${b.slug}/i/${c}`);
    await page.getByRole("button", { name: "Oddeliť" }).click();
    const dialog = page.getByRole("dialog", { name: `Oddeliť #${c} od #${a}?` });
    await expect(dialog).toContainText(`zostanú pri #${a}`);
    await dialog.getByRole("button", { name: `Oddeliť #${c}` }).click();
    await expect.poll(async () => (await itemRow(b.slug, c))!.mergedIntoId).toBeNull();
    expect((await itemRow(b.slug, c))!.status).toBe("open");
    await page.reload();
    await expect(page.getByRole("button", { name: /^Hlasovať/ })).toBeVisible();
    await ann.ctx.close();
  });
});

/** ADR-0015 phase 3: the team publishes a bug as a known issue; others join it instead of reporting it again. */
test.describe("known issues @tablet", () => {
  test("the team publishes a known issue; a reporter joins it from the list or while typing and hears about the fix", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const tag = uniq("k");
    // Anna's own words name a customer: the public title the team writes must not.
    const original = `Faktúra pre Novák s.r.o. sa nestiahne ${tag}`;
    const n = await createItem(ann.page, b.slug, "bug", original, "Klient Novák, IČO 12345678.");
    const known = `Faktúra v PDF sa nestiahne ${tag}`;

    await page.goto(`/${b.slug}/i/${n}`);
    await page.getByRole("button", { name: "Zverejniť ako známu chybu" }).click();
    await expect(page.getByText(/Zákazníci uvidia len názov a poznámku/)).toBeVisible();
    await expect(page.getByLabel("Verejný názov")).toHaveValue(original);
    await page.getByLabel("Verejný názov").fill(known);
    await page.getByLabel(/Poznámka pre zákazníkov/).fill("Zatiaľ ju otvorte v náhľade a uložte odtiaľ.");
    await act(page, () => page.getByRole("button", { name: "Zverejniť", exact: true }).click());
    await expect(page.getByText("Zverejnená ako známa chyba. Zatiaľ sa nikto nepripojil.")).toBeVisible();

    // From the list of bugs: only the public title and note, never Anna's report.
    const ben = await boardUser(browser, b, "ben");
    await ben.page.goto(`/${b.slug}/bugs`);
    const list = ben.page.getByRole("region", { name: "Chyby, ktoré už riešime" });
    await expect(list).toContainText(known);
    await expect(list).toContainText("Zatiaľ ju otvorte v náhľade");
    await expect(ben.page.locator("body")).not.toContainText("Novák");
    await list.getByRole("link", { name: "Mám ten istý problém" }).click();
    await expect(ben.page.getByRole("status", { name: "Pripojenie k známej chybe" })).toContainText(known);
    await ben.page.getByLabel("Čo nefunguje?").fill("Nestiahne sa mi faktúra");
    await ben.page.getByLabel(/Čo ste robili/).fill("Klikol som na Stiahnuť PDF, nič sa nestalo.");
    await ben.page.getByRole("button", { name: "Nahlásiť chybu" }).click();
    await ben.page.waitForURL(new RegExp(`/${b.slug}/i/\\d+$`));
    const nBen = Number(ben.page.url().match(/\/i\/(\d+)$/)![1]);
    await expect(ben.page.getByText(`Patrí k známej chybe „${known}“`)).toBeVisible();
    await expect(ben.page.getByText("Pripojené k známej chybe").filter({ visible: true })).toBeVisible();
    expect((await itemRow(b.slug, nBen))!.mergedIntoId).toBe((await itemRow(b.slug, n))!.id);

    // While typing: the known issue is suggested by its public title (typed without diacritics).
    const carl = await boardUser(browser, b, "carl");
    await carl.page.goto(`/${b.slug}/new?kind=bug`);
    await carl.page.getByLabel("Čo nefunguje?").fill(`faktura v pdf sa nestiahne ${tag}`);
    const suggested = carl.page.getByRole("region", { name: "Známe chyby podobné vášmu hláseniu" });
    await expect(suggested).toContainText(known);
    await expect(suggested).toContainText("Hlásili 2 ľudia");
    await suggested.getByRole("button", { name: "Mám ten istý problém" }).click();
    await carl.page.getByRole("button", { name: "Nahlásiť chybu" }).click();
    await carl.page.waitForURL(new RegExp(`/${b.slug}/i/\\d+$`));
    await expect(carl.page.getByText(`Patrí k známej chybe „${known}“`)).toBeVisible();

    // The fix reaches everyone who joined, about their own report only.
    await page.goto(`/${b.slug}/i/${n}`);
    await expect(page.getByText("Zverejnená ako známa chyba. Pripojili sa 2 ľudia.")).toBeVisible();
    await moveTo(page, b.slug, n, "Opravené", "3.2.0");
    const mail = await lastMail(ben.email, { subject: /^Opravené:/ });
    expect(mail.text).toContain("3.2.0");
    expect(`${mail.Subject} ${mail.text}`).not.toContain("Novák");
    await lastMail(carl.email, { subject: /^Opravené:/ });
    await ann.ctx.close(); await ben.ctx.close(); await carl.ctx.close();
  });
});
