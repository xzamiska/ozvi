import { expect, test } from "@playwright/test";
import { withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { act, boardUser, createItem, itemRow, ownerBoard, projectRow } from "../lib/board";
import { db, schema } from "../lib/db";
import { uniq } from "../lib/env";
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
