import { readFile } from "node:fs/promises";
import { devices, expect, test } from "@playwright/test";
import { act, addComment, addCommentOn, boardUser, createItem, itemRow, moveTo, ownerBoard, ownIp, projectRow, setProject, userByEmail } from "../lib/board";
import { E2E, email, uniq } from "../lib/env";
import { codeIn, lastMail, linkIn, mailCount } from "../lib/mail";
import { db, schema } from "../lib/db";
import { and, eq } from "drizzle-orm";

test.describe("public board", () => {
  test("ideas: create, list, search, sort and filter, vote and unvote, comment, detail page", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const t1 = uniq("Export do CSV"), t2 = uniq("Tmavý režim");
    const n1 = await createItem(ann.page, b.slug, "idea", t1, "Potrebujem dáta v Exceli.");
    const n2 = await createItem(ben.page, b.slug, "idea", t2);
    expect(n2).toBe(n1 + 1);

    // Detail page: number, status, author, body, vote button.
    await ann.page.goto(`/${b.slug}/i/${n1}`);
    await expect(ann.page.getByText(`Nápad #${n1}`)).toBeVisible();
    await expect(ann.page.getByText("Potrebujem dáta v Exceli.")).toBeVisible();
    await expect(ann.page.getByText(ann.name).first()).toBeVisible();

    // Ben votes for Anna's idea, then takes the vote back.
    await ben.page.goto(`/${b.slug}/i/${n1}`);
    await act(ben.page, () => ben.page.getByRole("button", { name: /^Hlasovať, 0 hlasov/ }).click());
    await expect(ben.page.getByRole("button", { name: /^Zrušiť hlas, 1 hlas/ })).toHaveAttribute("aria-pressed", "true");
    await ben.page.reload();
    await expect(ben.page.getByRole("button", { name: /^Zrušiť hlas, 1 hlas/ })).toBeVisible();
    await act(ben.page, () => ben.page.getByRole("button", { name: /^Zrušiť hlas/ }).click());
    await expect(ben.page.getByRole("button", { name: /^Hlasovať, 0 hlasov/ })).toBeVisible();
    await ben.page.reload();
    await expect(ben.page.getByRole("button", { name: /^Hlasovať, 0 hlasov/ })).toBeVisible();
    await act(ben.page, () => ben.page.getByRole("button", { name: /^Hlasovať/ }).click());
    await expect(ben.page.getByRole("button", { name: /^Zrušiť hlas, 1 hlas/ })).toBeVisible();

    // Comment.
    await addComment(ben.page, "Aj mne by to pomohlo.");
    await ben.page.reload();
    await expect(ben.page.getByRole("listitem").filter({ hasText: "Aj mne by to pomohlo." })).toContainText(ben.name);

    // List: most wanted first; newest first on request.
    const rows = (p: typeof page) => p.getByRole("main").locator("ul").first().getByRole("link").filter({ hasText: /Export do CSV|Tmavý režim/ });
    await page.goto(`/${b.slug}/ideas`);
    await expect(rows(page)).toHaveText([t1, t2]);
    await page.getByRole("group", { name: "Poradie" }).getByRole("link", { name: /Najnovšie/ }).click();
    await expect(page).toHaveURL(/sort=new/);
    await expect(rows(page)).toHaveText([t2, t1]);

    // Search by a word and by number; nothing found offers to clear.
    await page.getByRole("textbox", { name: "Hľadať v nápadoch" }).fill("Tmavý");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=Tmav/);
    await expect(rows(page)).toHaveText([t2]);
    await page.goto(`/${b.slug}/ideas?q=%23${n1}`);
    await expect(rows(page)).toHaveText([t1]);
    await page.goto(`/${b.slug}/ideas?q=neexistuje-nic`);
    await expect(page.getByText("Nič pre „neexistuje-nic“")).toBeVisible();
    await page.getByRole("link", { name: "Zrušiť hľadanie" }).click();
    await expect(rows(page)).toHaveCount(2);

    // Filters: nothing shipped yet.
    await page.getByRole("group", { name: "Stav" }).getByRole("link", { name: "Vydané" }).click();
    await expect(page.getByText("Zatiaľ nič vydané")).toBeVisible();
    await page.getByRole("link", { name: "Zobraziť všetky" }).click();
    await expect(rows(page)).toHaveCount(2);

    // Typing a similar title suggests the existing idea.
    await ben.page.goto(`/${b.slug}/new?kind=idea`);
    await ben.page.getByLabel("Čo by vám pomohlo?").fill("Export CSV súborov");
    await expect(ben.page.getByRole("region", { name: "Podobné nápady" })).toContainText(t1);
    await ann.ctx.close(); await ben.ctx.close();
  });

  test("a guest on a phone reads an idea; voting and commenting ask to sign in @mobile", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const title = uniq("Mobilná appka");
    const n = await createItem(ann.page, b.slug, "idea", title, "Na telefóne by sa to hodilo.");
    const guest = await ownIp(await browser.newContext({ ...devices["iPhone 15"] }));
    const g = await guest.newPage();
    await g.goto(`/${b.slug}`);
    await expect(g).toHaveURL(new RegExp(`/${b.slug}/ideas$`));
    await expect(g.getByRole("heading", { level: 1, name: "Nápady" })).toBeVisible();
    await g.getByRole("link", { name: title }).click();
    await expect(g.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(g.getByText("Na telefóne by sa to hodilo.")).toBeVisible();
    // New cloud boards sign people in by e-mail: commenting and voting lead to the board's sign-in.
    const thread = g.getByRole("region", { name: /Komentáre/ });
    await expect(thread.getByText("Komentovať môžu prihlásení.")).toBeVisible();
    await expect(thread.getByRole("link", { name: "Prihlásiť sa" })).toHaveAttribute("href", `/${b.slug}/login?return=${encodeURIComponent(`/${b.slug}/i/${n}`)}`);
    await expect(g.getByRole("button", { name: /^Hlasovať/ })).toHaveCount(0);
    // A tooltip never shows on a phone: the vote button says it under itself.
    await expect(g.getByRole("link", { name: /0 hlasov\. Na hlasovanie sa prihláste\./ }).getByText("Prihláste sa", { exact: true })).toBeVisible();
    // The header scrolls away on a phone (it took a sixth of the screen when it stuck).
    expect(await g.evaluate(() => getComputedStyle(document.querySelector("header")!).position)).toBe("static");
    await g.getByRole("link", { name: /0 hlasov\. Na hlasovanie sa prihláste\./ }).click();
    await expect(g.getByRole("heading", { name: "Prihláste sa" })).toBeVisible();
    await g.goBack();
    // The page fits the phone: no sideways scrolling.
    expect(await g.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await guest.close(); await ann.ctx.close();
  });

  test("approval queue: the setting holds new ideas; author sees a note, others nothing; team approves or rejects", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    // The admin turns on "Nové nápady schvaľuje tím" in the board settings.
    await page.getByRole("switch", { name: "Nové nápady schvaľuje tím" }).click();
    await act(page, () => page.getByRole("button", { name: "Uložiť nastavenia" }).click());
    expect((await projectRow(b.slug)).moderateIdeas).toBe(true);

    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const t1 = uniq("Čakajúci nápad"), t2 = uniq("Zamietnutý nápad");
    const n1 = await createItem(ann.page, b.slug, "idea", t1);
    await expect(ann.page.getByText("Čaká na schválenie.")).toBeVisible();
    await expect(ann.page.getByText(/Tím nové nápady pred zverejnením schvaľuje/)).toBeVisible();
    await expect(ann.page.getByRole("button", { name: /^Hlasovať/ })).toHaveCount(0);

    // Another user and a guest: not in the list, the direct link is a plain 404.
    await ben.page.goto(`/${b.slug}/ideas?f=all`);
    await expect(ben.page.getByText(t1)).toHaveCount(0);
    await ben.page.goto(`/${b.slug}/i/${n1}`);
    await expect(ben.page.getByText("Táto stránka tu nie je")).toBeVisible();
    await expect(ben.page.getByText(t1)).toHaveCount(0);
    const guest = await ownIp(await browser.newContext());
    const r = await guest.request.get(`/${b.slug}/i/${n1}`);
    expect(r.status()).toBe(404);
    expect(await r.text()).not.toContain(t1);

    // Team: the queue segment counts it; approve publishes it.
    await page.goto(`/${b.slug}/ideas`);
    await page.getByRole("link", { name: /Na schválenie\s*1/ }).click();
    await page.getByRole("link", { name: t1 }).click();
    await expect(page.getByText("Projekt schvaľuje nové nápady. Ostatní ho uvidia až po schválení.")).toBeVisible();
    await page.getByRole("button", { name: "Schváliť a zverejniť" }).click();
    await expect(page.getByText("Nápad je zverejnený")).toBeVisible();
    await ben.page.goto(`/${b.slug}/ideas`);
    await expect(ben.page.getByRole("link", { name: t1 })).toBeVisible();

    // Reject with a message: the author gets an e-mail and sees the message, others still a 404.
    const n2 = await createItem(ann.page, b.slug, "idea", t2);
    await page.goto(`/${b.slug}/i/${n2}`);
    await page.getByRole("button", { name: "Zamietnuť" }).click();
    const dlg = page.getByRole("alertdialog");
    await expect(dlg.getByRole("heading", { name: "Zamietnuť nápad?" })).toBeVisible();
    await dlg.getByLabel(/Správa pre autora/).fill(`Toto už riešime v nápade #${n1}.`);
    await dlg.getByRole("button", { name: "Zamietnuť" }).click();
    await expect(page.getByText("Nápad je zamietnutý")).toBeVisible();
    await expect(page.getByText("Zamietnuté.")).toBeVisible();
    const mail = await lastMail(ann.email, { subject: /Nápad nezverejnený/ });
    expect(mail.Subject).toContain(t2);
    expect(mail.text).toContain(`Toto už riešime v nápade #${n1}.`);
    await ann.page.goto(`/${b.slug}/i/${n2}`);
    await expect(ann.page.getByRole("heading", { name: "Tento nápad tím nezverejnil" })).toBeVisible();
    await expect(ann.page.getByText(`Toto už riešime v nápade #${n1}.`)).toBeVisible();
    await ben.page.goto(`/${b.slug}/i/${n2}`);
    await expect(ben.page.getByText("Táto stránka tu nie je")).toBeVisible();

    // The team's own ideas skip the queue.
    const n3 = await createItem(page, b.slug, "idea", uniq("Tímový nápad"));
    await expect(page.getByText("Čaká na schválenie.")).toHaveCount(0);
    expect((await itemRow(b.slug, n3))!.pending).toBe(false);
    await guest.close(); await ann.ctx.close(); await ben.ctx.close();
  });

  test("importance voting with a vote budget: weights, the picker and an exhausted budget", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    await setProject(b.slug, { voteMode: "importance", voteBudget: 3 });
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const n1 = await createItem(ben.page, b.slug, "idea", uniq("Prvý nápad"));
    const n2 = await createItem(ben.page, b.slug, "idea", uniq("Druhý nápad"));
    const p = ann.page;

    await p.goto(`/${b.slug}/i/${n1}`);
    await p.getByRole("button", { name: /^Hlasovať, 0 bodov od 0 ľudí/ }).click();
    const picker = p.getByRole("group", { name: "Aké dôležité je to pre vás?" });
    await expect(p.getByText("Zostávajú vám 3 hlasy")).toBeVisible();
    await act(p, () => picker.getByRole("button", { name: /Kritické/ }).click());
    await expect(p.getByRole("button", { name: /^Zmeniť hlas, 3 body od 1 človeka/ })).toBeVisible();
    expect((await itemRow(b.slug, n1))!.voteCount).toBe(3);

    // Budget spent: every level of the second idea is unavailable and the picker says why.
    await p.goto(`/${b.slug}/i/${n2}`);
    await p.getByRole("button", { name: /^Hlasovať/ }).click();
    await expect(p.getByText(/Minuli ste všetky hlasy/)).toBeVisible();
    await expect(picker.getByRole("button", { name: /Pekné mať/ })).toBeDisabled();
    await p.keyboard.press("Escape");

    // Lower the first vote to "Dôležité": one point is free for the second idea.
    await p.goto(`/${b.slug}/i/${n1}`);
    await p.getByRole("button", { name: /^Zmeniť hlas/ }).click();
    await act(p, () => picker.getByRole("button", { name: /Dôležité/ }).click());
    await expect(p.getByRole("button", { name: /^Zmeniť hlas, 2 body od 1 človeka/ })).toBeVisible();
    await p.goto(`/${b.slug}/i/${n2}`);
    await p.getByRole("button", { name: /^Hlasovať/ }).click();
    await expect(picker.getByRole("button", { name: /Dôležité/ })).toBeDisabled();
    await act(p, () => picker.getByRole("button", { name: /Pekné mať/ }).click());
    await expect(p.getByRole("button", { name: /^Zmeniť hlas, 1 bod od 1 človeka/ })).toBeVisible();

    // Remove the vote.
    await p.getByRole("button", { name: /^Zmeniť hlas/ }).click();
    await act(p, () => p.getByRole("button", { name: "Odobrať hlas" }).click());
    await expect(p.getByRole("button", { name: /^Hlasovať, 0 bodov/ })).toBeVisible();
    expect((await itemRow(b.slug, n2))!.voteCount).toBe(0);
    await ann.ctx.close(); await ben.ctx.close();
  });

  test("status change e-mails the author and commenters; the roadmap shows planned and in progress", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const carl = await boardUser(browser, b, "carl");
    const t1 = uniq("Plánovaný nápad"), t2 = uniq("Rozpracovaný nápad");
    const n1 = await createItem(ann.page, b.slug, "idea", t1);
    const n2 = await createItem(ann.page, b.slug, "idea", t2);
    await carl.page.goto(`/${b.slug}/i/${n1}`);
    await addComment(carl.page, "Sledujem.");

    await moveTo(page, b.slug, n1, "Plánované");
    await expect(page.getByText("Autor a ľudia z diskusie dostanú e-mail. Hlasujúci sa to dozvedia zo zverejnenej novinky.")).toBeVisible();
    const mail = await lastMail(ann.email, { subject: /^Plánované:/ });
    expect(mail.Subject).toBe(`Plánované: ${t1}`);
    expect(mail.text).toContain("Nápad, ktorý sledujete, je teraz: Plánované");
    expect(linkIn(mail.text, new RegExp(`/${b.slug}/i/${n1}`))).not.toBeNull();
    await lastMail(carl.email, { subject: /^Plánované:/ });

    await moveTo(page, b.slug, n2, "Rozpracované");
    await lastMail(ann.email, { subject: new RegExp(`^Rozpracované: ${t2}`) });

    // The item's route and the public roadmap.
    await ann.page.goto(`/${b.slug}/i/${n1}`);
    await expect(ann.page.locator("header").getByText("Plánované").first()).toBeVisible();
    await ann.page.goto(`/${b.slug}/roadmap`);
    await expect(ann.page.getByRole("region", { name: /^Plánované/ })).toContainText(t1);
    await expect(ann.page.getByRole("region", { name: /^Rozpracované/ })).toContainText(t2);
    await expect(ann.page.getByRole("region", { name: /^Nedávno vydané/ })).toContainText("Ešte sme nič nevydali.");
    await ann.ctx.close(); await carl.ctx.close();
  });

  // Voting alone does not subscribe: a status change mails the author and commenters (notifyStatusChange), voters
  // hear about it from a published changelog entry. The toast says exactly that.
  test("the status toast tells the truth: the author gets the e-mail, a voter waits for the changelog", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const n = await createItem(ann.page, b.slug, "idea", uniq("Hlasovaný nápad"));
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await act(ben.page, () => ben.page.getByRole("button", { name: /^Hlasovať/ }).click());
    await moveTo(page, b.slug, n, "Plánované");
    await expect(page.getByText("Autor a ľudia z diskusie dostanú e-mail. Hlasujúci sa to dozvedia zo zverejnenej novinky.")).toBeVisible();
    await lastMail(ann.email, { subject: /^Plánované:/ });
    expect(await mailCount(ben.email)).toBe(0);
    await ann.ctx.close(); await ben.ctx.close();
  });

  test("a move with the team's own words: one e-mail quoting them, the words as a comment; a quiet move e-mails nobody", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const n = await createItem(ann.page, b.slug, "idea", uniq("Nápad so správou"));
    const before = await mailCount(ann.email);
    const words = `Plánujeme na december ${uniq("m")}`;

    await page.goto(`/${b.slug}/i/${n}`);
    await page.getByRole("radiogroup", { name: "Stav" }).getByRole("radio", { name: /^Plánované/ }).click();
    // Who hears about it is said before the move, and can be switched off.
    await expect(page.getByRole("checkbox", { name: /Poslať e-mail/ })).toBeChecked();
    await page.getByLabel("Správa k zmene").fill(words);
    await page.getByRole("button", { name: "Posunúť na Plánované" }).click();
    await expect(page.getByText("Stav: Plánované")).toBeVisible();
    const mail = await lastMail(ann.email, { subject: /^Plánované:/ });
    expect(mail.text).toContain(words);
    await expect(page.getByRole("listitem").filter({ hasText: words }).first()).toBeVisible();
    // The words did not send a second ("new comment") e-mail.
    await page.waitForTimeout(1500);
    expect(await mailCount(ann.email)).toBe(before + 1);

    await page.getByRole("radiogroup", { name: "Stav" }).getByRole("radio", { name: /^Rozpracované/ }).click();
    await page.getByRole("checkbox", { name: /Poslať e-mail/ }).click();
    await page.getByRole("button", { name: "Posunúť na Rozpracované" }).click();
    await expect(page.getByText("Stav: Rozpracované")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await mailCount(ann.email)).toBe(before + 1);

    // "Team only" stays on for the next note (it used to reset to public after each one).
    await page.getByRole("switch", { name: /Len pre tím/ }).click();
    await addComment(page, `Interná poznámka ${uniq("i")}`);
    await expect(page.getByRole("switch", { name: /Len pre tím/ })).toBeChecked();
    await ann.ctx.close();
  });

  test("team e-mails: a team member switches off new bug e-mails on My data; a new bug then e-mails nobody on the team", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    await page.goto(`/${b.slug}/admin#people`);
    await page.getByRole("link", { name: "Moje údaje → E-maily pre tím" }).click();
    await expect(page.getByRole("heading", { name: "E-maily pre tím" })).toBeVisible();
    const box = page.getByRole("checkbox", { name: /Nové hlásenie chyby/ });
    await expect(box).toBeChecked();
    await box.click();
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText("Uložené")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /Nové hlásenie chyby/ })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Pondelňajší súhrn/ })).toBeChecked();

    const ann = await boardUser(browser, b, "anna");
    const before = await mailCount(b.owner);
    await createItem(ann.page, b.slug, "bug", uniq("Chyba bez e-mailu"));
    await page.waitForTimeout(1500);
    expect(await mailCount(b.owner)).toBe(before);
    await ann.ctx.close();
  });

  test("team e-mails as a summary: a team member picks the daily summary; a new bug then waits for it instead of arriving now", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    await page.goto(`/${b.slug}/me#emaily-timu`);
    await expect(page.getByRole("radio", { name: /Hneď/ })).toBeChecked();
    await page.getByRole("radio", { name: /Súhrn raz denne ráno/ }).click();
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText("Uložené")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("radio", { name: /Súhrn raz denne ráno/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Nové hlásenie chyby/ })).toBeChecked();

    const ann = await boardUser(browser, b, "anna");
    const before = await mailCount(b.owner);
    await createItem(ann.page, b.slug, "bug", uniq("Chyba do súhrnu"));
    await page.waitForTimeout(1500);
    expect(await mailCount(b.owner)).toBe(before);
    await page.goto(`/${b.slug}/admin#limits`);
    await expect(page.locator("dl > div").filter({ hasText: "Čaká na súhrn" }).locator("dd")).toHaveText("1");
    await ann.ctx.close();
  });

  test("assignee: the team gives a bug to a colleague, who gets an e-mail and finds it under “Rieši: Ja”; customers never see it", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const boris = await boardUser(browser, b, "boris", { role: "team" });
    const ann = await boardUser(browser, b, "anna");
    const title = uniq("Pridelená chyba");
    const n = await createItem(ann.page, b.slug, "bug", title);

    await page.goto(`/${b.slug}/i/${n}`);
    const team = page.getByRole("region", { name: "Pre tím" });
    await expect(team.getByRole("combobox", { name: "Rieši" })).toHaveText("Nikto");
    await team.getByRole("combobox", { name: "Rieši" }).click();
    await page.getByRole("option", { name: boris.name }).click();
    await expect(page.getByText(`Rieši: ${boris.name}`)).toBeVisible();
    const mail = await lastMail(boris.email, { subject: /^Pridelené vám:/ });
    expect(mail.Subject).toBe(`Pridelené vám: ${title}`);
    expect(linkIn(mail.text, new RegExp(`/${b.slug}/i/${n}`))).not.toBeNull();

    // Boris finds it under "Me"; the owner's "Me" is empty, "Nobody" does not list it.
    await boris.page.goto(`/${b.slug}/bugs?s=all&who=me`);
    await expect(boris.page.getByRole("link", { name: title })).toBeVisible();
    await page.goto(`/${b.slug}/bugs?s=all&who=me`);
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
    await page.goto(`/${b.slug}/bugs?s=all&who=none`);
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
    await page.goto(`/${b.slug}/bugs?s=all`);
    await expect(page.locator("li").filter({ hasText: title }).getByText(boris.name)).toBeVisible();

    // "Assign to me" in one click; the reporter sees no trace of who handles it.
    await page.goto(`/${b.slug}/i/${n}`);
    await page.getByRole("region", { name: "Pre tím" }).getByRole("button", { name: "Vezmem si to" }).click();
    await expect(page.getByText(/^Rieši: /)).toBeVisible();
    await ann.page.goto(`/${b.slug}/i/${n}`);
    await expect(ann.page.getByText(title).first()).toBeVisible();
    await expect(ann.page.getByText("Rieši")).toHaveCount(0);
    await expect(ann.page.getByText(boris.name)).toHaveCount(0);
    await boris.ctx.close(); await ann.ctx.close();
  });

  test("team inbox “Nové”: what others did since I last looked, with a badge; mark as read; customers never see it", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const title = uniq("Nápad do schránky");
    const n = await createItem(ann.page, b.slug, "idea", title);

    await page.goto(`/${b.slug}/ideas`);
    const tab = page.getByRole("navigation", { name: "Board" }).getByRole("link", { name: /^Nové/ });
    await expect(tab.getByLabel(/1 záznam s novinkami/)).toBeVisible();
    await tab.click();
    await expect(page).toHaveURL(new RegExp(`/${b.slug}/inbox$`));
    const row = page.locator("li").filter({ hasText: title });
    await expect(row.getByText("Nové", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Označiť ako prečítané" }).click();
    await expect(page.getByText("Nič nové")).toBeVisible();
    await expect(tab.getByLabel(/s novinkami/)).toHaveCount(0);

    // Anna comments: back in the inbox with what happened; my own comment would not count.
    await ann.page.goto(`/${b.slug}/i/${n}`);
    await addComment(ann.page, "Ešte doplním: aj do XLSX.");
    await page.goto(`/${b.slug}/inbox`);
    await expect(page.locator("li").filter({ hasText: title }).getByText("1 komentár")).toBeVisible();
    await addCommentOn(page, b.slug, n, "Ďakujeme, pozrieme sa.");
    await page.goto(`/${b.slug}/inbox`);
    await expect(page.locator("li").filter({ hasText: title }).getByText("1 komentár")).toBeVisible();

    // Customers: no tab, and the page is closed.
    await expect(ann.page.getByRole("navigation", { name: "Board" }).getByRole("link", { name: /^Nové/ })).toHaveCount(0);
    await ann.page.goto(`/${b.slug}/inbox`);
    await expect(ann.page.getByText("Nové vidí len tím")).toBeVisible();
    await ann.ctx.close();
  });

  test("@mobile the team on a phone: the tab row shows there is more and keeps the current tab in view; the bulk bar stays compact", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const n1 = await createItem(ann.page, b.slug, "bug", uniq("Mobil A"));
    await createItem(ann.page, b.slug, "bug", uniq("Mobil B"));
    await ann.ctx.close();
    await page.setViewportSize({ width: 390, height: 844 }); // also on the desktop projects
    await page.goto(`/${b.slug}/ideas`);
    const nav = page.getByRole("navigation", { name: "Board" });
    await expect(nav).toHaveAttribute("data-more", "true");
    await page.goto(`/${b.slug}/unanswered`);
    await expect(nav.getByRole("link", { name: /Bez odpovede/ })).toBeInViewport({ ratio: 1 });
    await page.goto(`/${b.slug}/bugs?s=all`);
    await page.getByRole("checkbox", { name: `Vybrať #${n1}` }).check();
    const bar = page.locator("form#bulk");
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    expect(box.height).toBeLessThan(page.viewportSize()!.height * 0.25); // it took about a third before
    await expect(bar.getByRole("button", { name: "Zmeniť vybrané" })).toBeInViewport({ ratio: 1 });
    await expect(bar.getByRole("combobox", { name: "Rieši" })).toBeInViewport({ ratio: 1 });
  });

  test("team lists: select all on the page, then none; dense rows hide excerpts and stay on after a reload", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    for (const x of ["Výber A", "Výber B", "Výber C"]) await createItem(ann.page, b.slug, "bug", uniq(x), "Popis, ktorý husté riadky skryjú.");
    await ann.ctx.close();
    await page.goto(`/${b.slug}/bugs?s=all`);
    const all = page.getByRole("checkbox", { name: /^Vybrať všetky na stránke/ });
    await all.check();
    const bar = page.locator("form#bulk");
    await expect(bar.getByRole("status")).toHaveText("3 vybrané");
    await page.getByRole("checkbox", { name: /^Vybrať #/ }).first().uncheck();
    await expect(bar.getByRole("status")).toHaveText("2 vybrané");
    expect(await all.evaluate((x: HTMLInputElement) => x.indeterminate)).toBe(true);
    await all.check();
    await all.uncheck();
    await expect(bar).toBeHidden();

    const excerpt = page.getByText("Popis, ktorý husté riadky skryjú.").first();
    await expect(excerpt).toBeVisible();
    await page.getByRole("button", { name: "Husté riadky" }).click();
    await expect(page.getByRole("button", { name: "Husté riadky" })).toHaveAttribute("aria-pressed", "true");
    await expect(excerpt).toBeHidden();
    await page.reload();
    await expect(page.getByText("Popis, ktorý husté riadky skryjú.").first()).toBeHidden();
    await page.getByRole("button", { name: "Husté riadky" }).click();
    await expect(page.getByText("Popis, ktorý husté riadky skryjú.").first()).toBeVisible();
  });

  test("bulk: the team ticks several bugs and moves them and assigns them at once; e-mails only when asked", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const [t1, t2, t3] = [uniq("Hromadná A"), uniq("Hromadná B"), uniq("Hromadná C")];
    const [n1, n2, n3] = [await createItem(ann.page, b.slug, "bug", t1), await createItem(ann.page, b.slug, "bug", t2), await createItem(ann.page, b.slug, "bug", t3)];
    const before = await mailCount(ann.email);

    await page.goto(`/${b.slug}/bugs?s=all`);
    const bar = page.locator("form#bulk");
    await expect(bar).toBeHidden();
    await page.getByRole("checkbox", { name: `Vybrať #${n1}` }).check();
    await page.getByRole("checkbox", { name: `Vybrať #${n2}` }).check();
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("status")).toHaveText("2 vybrané");
    await bar.getByRole("combobox", { name: "Stav" }).selectOption("confirmed");
    await bar.getByRole("combobox", { name: "Rieši" }).selectOption({ index: 2 });
    await bar.getByRole("button", { name: "Zmeniť vybrané" }).click();
    await expect(page.getByText("Zmenené 2 záznamy")).toBeVisible();
    await expect(bar).toBeHidden();
    // The header box follows the cleared rows (it used to stay ticked).
    await expect(page.getByRole("checkbox", { name: /^Vybrať všetky/ })).not.toBeChecked();

    expect((await itemRow(b.slug, n1))!.status).toBe("confirmed");
    expect((await itemRow(b.slug, n2))!.status).toBe("confirmed");
    expect((await itemRow(b.slug, n3))!.status).toBe("new");
    expect((await itemRow(b.slug, n1))!.assigneeId).not.toBeNull();
    // The lead can audit it: one Activity row for the whole batch.
    const p = await projectRow(b.slug);
    const log = await db.select().from(schema.activity).where(and(eq(schema.activity.projectId, p.id), eq(schema.activity.action, "triage.bulk")));
    expect(log).toHaveLength(1);
    expect(log[0]!.detail).toMatch(/→ Potvrdené · Rieši: /);
    expect(log[0]!.detail!.split(" ").filter((w) => w.startsWith("#")).sort()).toEqual([`#${n1}`, `#${n2}`].sort());
    // "Send status e-mails" was left off: the reporter got nothing.
    await page.waitForTimeout(1500);
    expect(await mailCount(ann.email)).toBe(before);

    // With e-mails on, the reporter hears about the move.
    await page.goto(`/${b.slug}/bugs?s=all`);
    await page.getByRole("checkbox", { name: `Vybrať #${n3}` }).check();
    await bar.getByRole("combobox", { name: "Stav" }).selectOption("in_progress");
    await bar.getByLabel("Poslať e-maily o zmene stavu").check();
    await bar.getByRole("button", { name: "Zmeniť vybrané" }).click();
    await lastMail(ann.email, { subject: new RegExp(`^Rozpracované: ${t3}`) });
    // Customers get no checkboxes.
    await ann.page.goto(`/${b.slug}/bugs`);
    await expect(ann.page.getByRole("checkbox", { name: /^Vybrať/ })).toHaveCount(0);
    await ann.ctx.close();
  });

  test("keyboard on team lists: j/k move, x selects, Enter opens, / searches, ? explains; never while typing", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const [t1, t2] = [uniq("Klávesy A"), uniq("Klávesy B")];
    await createItem(ann.page, b.slug, "bug", t1);
    const n2 = await createItem(ann.page, b.slug, "bug", t2);
    await page.goto(`/${b.slug}/bugs?s=all`);
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("j");
    await expect(page.getByRole("link", { name: t2 })).toBeFocused();
    await page.keyboard.press("j");
    await expect(page.getByRole("link", { name: t1 })).toBeFocused();
    await page.keyboard.press("k");
    await expect(page.getByRole("link", { name: t2 })).toBeFocused();
    await page.keyboard.press("x");
    await expect(page.getByRole("checkbox", { name: `Vybrať #${n2}` })).toBeChecked();
    await expect(page.locator("form#bulk")).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Klávesové skratky" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("/");
    await expect(page.getByPlaceholder(/Hľadať/)).toBeFocused();
    // Typing "j" in the search field types it, nothing moves.
    await page.keyboard.type("jk");
    await expect(page.getByPlaceholder(/Hľadať/)).toHaveValue("jk");
    await page.getByRole("link", { name: t2 }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${b.slug}/i/${n2}$`));
    await ann.ctx.close();
  });

  test("changelog: a published entry ships the idea, e-mails voters, appears on /changelog and in the RSS feed", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const idea = uniq("Export do PDF"), entry = uniq("PDF export je tu");
    const n = await createItem(ann.page, b.slug, "idea", idea);
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await act(ben.page, () => ben.page.getByRole("button", { name: /^Hlasovať/ }).click());
    await moveTo(page, b.slug, n, "Rozpracované");

    // From the idea: "Napísať novinku" opens the form with the idea already picked.
    await page.getByRole("link", { name: "Napísať novinku" }).click();
    await expect(page).toHaveURL(new RegExp(`/${b.slug}/changelog/new\\?item=${n}`));
    await expect(page.getByRole("checkbox", { name: new RegExp(idea) })).toBeChecked();
    await page.getByLabel("Nadpis").fill(entry);
    await page.getByLabel("Text", { exact: true }).fill("Faktúry si teraz stiahnete aj ako **PDF**.");
    await page.getByRole("button", { name: "Zverejniť a poslať e-maily" }).click();
    await page.waitForURL(new RegExp(`/${b.slug}/changelog\\?published=`));
    await expect(page.getByText("Zverejnené.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: entry })).toBeVisible();

    // The voter and the author get one e-mail with the entry; the idea is shipped.
    for (const who of [ben.email, ann.email]) {
      const m = await lastMail(who, { subject: /^Novinka:/ });
      expect(m.Subject).toBe(`Novinka: ${entry}`);
      expect(m.text).toContain("Faktúry si teraz stiahnete aj ako");
    }
    expect((await itemRow(b.slug, n))!.status).toBe("shipped");

    // Everybody sees it: changelog, shipped filter, roadmap, RSS.
    const guest = await ownIp(await browser.newContext());
    const g = await guest.newPage();
    await g.goto(`/${b.slug}/changelog`);
    await expect(g.getByRole("heading", { level: 2, name: entry })).toBeVisible();
    await expect(g.locator("strong", { hasText: "PDF" })).toBeVisible();
    await g.goto(`/${b.slug}/ideas?f=shipped`);
    await expect(g.getByRole("link", { name: idea }).first()).toBeVisible();
    await g.goto(`/${b.slug}/roadmap`);
    await expect(g.getByRole("region", { name: /^Nedávno vydané/ })).toContainText(idea);
    const feed = await guest.request.get(`/${b.slug}/changelog/feed.xml`);
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toContain("application/rss+xml");
    const xml = await feed.text();
    expect(xml).toContain(`<title>${entry}</title>`);
    expect(xml).toContain("&lt;strong&gt;PDF&lt;/strong&gt;");
    await guest.close(); await ann.ctx.close(); await ben.ctx.close();
  });

  // Every link to an entry (RSS, e-mail, redirect after publishing, widget, MCP) uses lib/changelog-anchor.ts.
  test("links to a changelog entry (RSS, e-mail) point at the entry on the page", async ({ page }) => {
    const b = await ownerBoard(page);
    const entry = uniq("Kotva novinky");
    await page.goto(`/${b.slug}/changelog/new`);
    await page.getByLabel("Nadpis").fill(entry);
    await page.getByRole("button", { name: "Zverejniť novinku" }).click();
    await page.waitForURL(new RegExp(`/${b.slug}/changelog\\?published=`));
    const xml = await (await page.request.get(`/${b.slug}/changelog/feed.xml`)).text();
    const link = xml.match(/<link>([^<]*changelog#[^<]+)<\/link>/)![1]!;
    await page.goto(link);
    const hash = decodeURIComponent(new URL(link).hash.slice(1));
    await expect(page.locator(`[id="${hash}"]`)).toContainText(entry);
  });

  test("private bug reports: only the reporter and the team see them; statuses and the 'does it work?' loop", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const title = uniq("Faktúra sa neuloží"), secret = "Tajný popis s IBAN SK0011";
    const n = await createItem(ann.page, b.slug, "bug", title, secret);
    await expect(ann.page.getByText("Vidí len autor a tím")).toBeVisible();
    await expect(ann.page.getByText(secret)).toBeVisible();
    // The team hears about it.
    await lastMail(b.owner, { subject: new RegExp(`Nové hlásenie: ${title}`) });

    // Another signed-in user: a "private" page without title or text, nothing in lists or search.
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await expect(ben.page.getByRole("heading", { name: "Toto hlásenie vidí len jeho autor a tím" })).toBeVisible();
    await expect(ben.page.getByRole("link", { name: "Moje hlásenia chýb" })).toBeVisible();
    for (const path of [`/i/${n}`, "/bugs?s=all", `/ideas?f=all&q=${encodeURIComponent("neuloží")}`, `/ideas?q=%23${n}`, `/search?q=${encodeURIComponent("Faktúra neuloží")}`, "/roadmap", "/changelog"]) {
      const html = await (await ben.page.request.get(`/${b.slug}${path}`)).text();
      expect(html, path).not.toContain(title);
      expect(html, path).not.toContain(secret);
    }
    await ben.page.goto(`/${b.slug}/bugs`);
    await expect(ben.page.getByText("Zatiaľ ste nič nenahlásili")).toBeVisible();
    expect(await ben.page.title()).toMatch(new RegExp(`^Chyby`));
    // A guest: the same, and the tab title carries only the number.
    const guest = await ownIp(await browser.newContext());
    const g = await guest.newPage();
    await g.goto(`/${b.slug}/i/${n}`);
    await expect(g.getByRole("heading", { name: "Toto hlásenie vidí len jeho autor a tím" })).toBeVisible();
    expect(await g.title()).toBe(`#${n} – ${b.name}`);
    expect(await g.content()).not.toContain(title);

    // The team: list, statuses; each change e-mails the reporter.
    await page.goto(`/${b.slug}/bugs`);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await moveTo(page, b.slug, n, "Potvrdené");
    await expect(page.getByText("Autor hlásenia dostane e-mail.")).toBeVisible();
    expect((await lastMail(ann.email, { subject: /^Potvrdené:/ })).Subject).toBe(`Potvrdené: ${title}`);
    await moveTo(page, b.slug, n, "Opravené", "2.1.0");
    const fixed = await lastMail(ann.email, { subject: /^Opravené:/ });
    expect(fixed.text).toContain("2.1.0");
    expect(fixed.text).toContain("Potvrdiť opravu");

    // "Still broken" sends it back to the team with a comment.
    await ann.page.goto(linkIn(fixed.text, new RegExp(`/${b.slug}/i/${n}`))!);
    const confirm = ann.page.getByRole("region", { name: "Overenie opravy" });
    await expect(confirm).toContainText("Opravili sme to vo verzii 2.1.0.");
    await confirm.getByRole("button", { name: "Stále nefunguje" }).click();
    await confirm.getByLabel("Čo presne stále nefunguje? (nepovinné)").fill("Export stále padá.");
    await act(ann.page, () => confirm.getByRole("button", { name: "Vrátiť tímu" }).click());
    await ann.page.reload();
    await expect(ann.page.getByRole("region", { name: "Overenie opravy" })).toHaveCount(0);
    await expect(ann.page.getByText("Vo verzii 2.1.0 to stále nefunguje.")).toBeVisible();
    await expect(ann.page.getByText("Export stále padá.")).toBeVisible();
    expect((await itemRow(b.slug, n))!.status).toBe("confirmed");
    // Ben still cannot see the thread.
    expect(await (await ben.page.request.get(`/${b.slug}/i/${n}`)).text()).not.toContain("Vo verzii 2.1.0 to");

    // Fixed again, "Yes, it works" closes it as verified.
    await moveTo(page, b.slug, n, "Opravené", "2.1.1");
    await ann.page.goto(`/${b.slug}/i/${n}`);
    await act(ann.page, () => ann.page.getByRole("button", { name: "Áno, funguje" }).click());
    await expect.poll(async () => (await itemRow(b.slug, n))!.status).toBe("verified");
    await ann.page.goto(`/${b.slug}/bugs?s=fixed`);
    await expect(ann.page.getByRole("link", { name: title })).toBeVisible();
    await guest.close(); await ann.ctx.close(); await ben.ctx.close();
  });

  test("text typed before the page has finished loading stays in the new idea form", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const p = ann.page;
    // A slow phone: the form is on screen (server-rendered, focused) well before its JavaScript runs.
    let release!: () => void;
    const loaded = new Promise<void>((r) => { release = r; });
    await p.route("**/_next/static/chunks/**", async (route) => { await loaded; await route.continue(); });
    // The page's scripts are held back, so "domcontentloaded" never comes: wait for the server-rendered field.
    await p.goto(`/${b.slug}/new?kind=idea`, { waitUntil: "commit" });
    const title = uniq("Písané pred načítaním");
    await p.locator("#f-title").pressSequentially(title);
    await p.locator("#f-body").pressSequentially("Aj popis.");
    release();
    await p.waitForLoadState("load");
    await p.waitForLoadState("networkidle");
    await expect(p.getByLabel("Čo by vám pomohlo?")).toHaveValue(title);
    await expect(p.locator("#f-body")).toHaveValue("Aj popis.");
    await p.unroute("**/_next/static/chunks/**");
  });

  test("moderation: authors edit and delete their own posts and comments until the team answers; the team deletes and restores", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const p = ann.page;
    const title = uniq("Preklep v nápade"), fixedTitle = uniq("Opravený nápad");
    const n = await createItem(p, b.slug, "idea", title);

    // Edit own post in place.
    await p.getByRole("button", { name: "Možnosti príspevku" }).click();
    await p.getByRole("menuitem", { name: "Upraviť" }).click();
    const form = p.getByRole("form", { name: "Úprava príspevku" });
    await form.getByLabel("Názov").fill(fixedTitle);
    await form.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(p.getByText("Zmeny sú uložené")).toBeVisible();
    await expect(p.getByRole("heading", { level: 1, name: fixedTitle })).toBeVisible();
    // goto, not reload: in Playwright's WebKit a reload of a page reached through the form's redirect crashes
    // the next navigation ("Page crashed"); reported separately.
    await p.goto(`/${b.slug}/i/${n}`);
    await expect(p.getByRole("heading", { level: 1, name: fixedTitle })).toBeVisible();
    await expect(p.getByText("· upravené").first()).toBeVisible();

    // Own comment: edit, then delete (a placeholder stays).
    await addComment(p, "Prvá verzia komentára");
    const mine = p.getByRole("listitem").filter({ hasText: "Prvá verzia komentára" });
    await mine.getByRole("button", { name: "Možnosti komentára" }).click();
    await p.getByRole("menuitem", { name: "Upraviť" }).click();
    await p.getByLabel("Text komentára").fill("Opravený komentár");
    await act(p, () => p.getByRole("button", { name: "Uložiť zmeny" }).click());
    const edited = p.getByRole("listitem").filter({ hasText: "Opravený komentár" });
    await expect(edited).toBeVisible();
    await edited.getByRole("button", { name: "Možnosti komentára" }).click();
    await p.getByRole("menuitem", { name: "Zmazať" }).click();
    await expect(p.getByRole("alertdialog")).toContainText("Zmazať komentár?");
    await act(p, () => p.getByRole("alertdialog").getByRole("button", { name: "Zmazať" }).click());
    await expect(p.getByText("Komentár bol odstránený")).toBeVisible();
    await expect(p.getByText("Opravený komentár")).toHaveCount(0);

    // Someone else cannot edit it; once the team answers publicly, neither can the author.
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await expect(ben.page.getByRole("button", { name: "Možnosti príspevku" })).toHaveCount(0);
    await page.goto(`/${b.slug}/i/${n}`);
    await addComment(page, "Dobrý nápad, pozrieme sa na to.");
    await p.goto(`/${b.slug}/i/${n}`);
    await expect(p.getByRole("button", { name: "Možnosti príspevku" })).toHaveCount(0);

    // Deleting own idea: gone from the list and the link.
    const bt = uniq("Omylom pridaný");
    const bn = await createItem(ben.page, b.slug, "idea", bt);
    await ben.page.getByRole("button", { name: "Možnosti príspevku" }).click();
    await ben.page.getByRole("menuitem", { name: "Zmazať" }).click();
    await expect(ben.page.getByRole("alertdialog")).toContainText("Zmazať tento nápad?");
    await ben.page.getByRole("alertdialog").getByRole("button", { name: "Zmazať" }).click();
    await ben.page.waitForURL(new RegExp(`/${b.slug}/ideas$`));
    await expect(ben.page.getByRole("link", { name: bt })).toHaveCount(0);
    await ben.page.goto(`/${b.slug}/i/${bn}`);
    await expect(ben.page.getByText("Táto stránka tu nie je")).toBeVisible();

    // The team deletes someone's comment and post, and restores the post.
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await addComment(ben.page, "Nevhodný komentár");
    await page.goto(`/${b.slug}/i/${n}`);
    await page.getByRole("listitem").filter({ hasText: "Nevhodný komentár" }).getByRole("button", { name: "Možnosti komentára" }).click();
    await page.getByRole("menuitem", { name: "Zmazať" }).click();
    await act(page, () => page.getByRole("alertdialog").getByRole("button", { name: "Zmazať" }).click());
    await ben.page.reload();
    await expect(ben.page.getByText("Nevhodný komentár")).toHaveCount(0);

    await page.getByRole("button", { name: "Možnosti príspevku" }).click();
    await page.getByRole("menuitem", { name: "Zmazať" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Tím ho môže neskôr obnoviť");
    await page.getByRole("alertdialog").getByRole("button", { name: "Zmazať" }).click();
    await expect(page.getByText("Zmazané.")).toBeVisible();
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await expect(ben.page.getByText("Táto stránka tu nie je")).toBeVisible();
    await ben.page.goto(`/${b.slug}/ideas`);
    await expect(ben.page.getByRole("link", { name: fixedTitle })).toHaveCount(0);
    await page.getByRole("button", { name: "Obnoviť" }).click();
    await expect(page.getByText("Obnovené")).toBeVisible();
    await ben.page.goto(`/${b.slug}/ideas`);
    await expect(ben.page.getByRole("link", { name: fixedTitle })).toBeVisible();
    await ann.ctx.close(); await ben.ctx.close();
  });

  // A rejected idea was never public; one the team deleted after publishing was: its author is told so.
  test("the author of a deleted (not rejected) idea is not told it was never published", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const n = await createItem(ann.page, b.slug, "idea", uniq("Zverejnený a zmazaný"));
    await page.goto(`/${b.slug}/i/${n}`);
    await page.getByRole("button", { name: "Možnosti príspevku" }).click();
    await page.getByRole("menuitem", { name: "Zmazať" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Zmazať" }).click();
    await expect(page.getByText("Zmazané.")).toBeVisible();
    await ann.page.goto(`/${b.slug}/i/${n}`);
    await expect(ann.page.getByText("Tento nápad tím nezverejnil")).toHaveCount(0);
    await expect(ann.page.getByRole("heading", { name: "Tento nápad tím zmazal" })).toBeVisible();
    await ann.ctx.close();
  });

  test("merge duplicates: votes move to the original, the duplicate points there and leaves the list", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const carl = await boardUser(browser, b, "carl");
    const orig = uniq("Export do Excelu"), dup = uniq("XLSX export");
    const n1 = await createItem(ann.page, b.slug, "idea", orig);
    const n2 = await createItem(ben.page, b.slug, "idea", dup);
    for (const u of [ann, carl]) {
      await u.page.goto(`/${b.slug}/i/${n2}`);
      await act(u.page, () => u.page.getByRole("button", { name: /^Hlasovať/ }).click());
    }
    // Ann voted for both: still one vote on the original after the merge.
    await ann.page.goto(`/${b.slug}/i/${n1}`);
    await act(ann.page, () => ann.page.getByRole("button", { name: /^Hlasovať/ }).click());

    await page.goto(`/${b.slug}/i/${n2}`);
    await page.getByLabel("Číslo pôvodného záznamu").fill(`#${n1}`);
    await page.getByRole("button", { name: "Zlúčiť…" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toContainText(`Hlasy sa presunú do #${n1}`);
    await dlg.getByRole("button", { name: `Zlúčiť do #${n1}` }).click();
    await page.waitForURL(new RegExp(`/${b.slug}/i/${n1}$`));
    await expect(page.getByRole("button", { name: /2 hlasy/ })).toBeVisible();
    // The original lists what was merged into it.
    await expect(page.getByText("Zlúčené sem:")).toBeVisible();
    await expect(page.getByRole("link", { name: `#${n2}`, exact: true })).toBeVisible();
    expect((await itemRow(b.slug, n1))!.voteCount).toBe(2);
    const merges = await db.select().from(schema.activity).where(and(eq(schema.activity.projectId, (await projectRow(b.slug)).id), eq(schema.activity.action, "triage.merged")));
    expect(merges.map((r) => r.detail)).toEqual([`#${n2} → #${n1}`]);

    // The duplicate is nobody's work any more: no assignee control there.
    await page.goto(`/${b.slug}/i/${n2}`);
    await expect(page.getByRole("region", { name: "Pre tím" }).getByRole("combobox", { name: "Rieši" })).toHaveCount(0);
    await carl.page.goto(`/${b.slug}/i/${n1}`);
    await expect(carl.page.getByRole("button", { name: /^Zrušiť hlas, 2 hlasy/ })).toBeVisible();
    await ben.page.goto(`/${b.slug}/i/${n2}`);
    await expect(ben.page.getByRole("note").first()).toContainText(`Toto je duplicita. Pokračuje v #${n1} ${orig}, hlasy sa presunuli tam.`);
    // The author reads "Merged into #n", not "Declined", and no team-reply stop from an auto-comment.
    await expect(ben.page.getByText("Zlúčené", { exact: true })).toBeVisible();
    await expect(ben.page.getByRole("link", { name: `Zlúčené do #${n1}` }).first()).toBeVisible();
    await expect(ben.page.getByText("Zamietnuté")).toHaveCount(0);
    await expect(ben.page.getByText("Odpoveď tímu")).toHaveCount(0);
    // The vote box is gone; voting and the discussion continue at the original.
    await expect(ben.page.getByRole("note").nth(1)).toContainText(`Hlasovanie a diskusia pokračujú pri #${n1}.`);
    await ben.page.getByRole("note").first().getByRole("link").click();
    await expect(ben.page).toHaveURL(new RegExp(`/${b.slug}/i/${n1}$`));
    await ben.page.goto(`/${b.slug}/ideas?f=all`);
    await expect(ben.page.getByRole("link", { name: dup })).toHaveCount(0);
    await expect(ben.page.getByRole("link", { name: orig })).toBeVisible();
    await ann.ctx.close(); await ben.ctx.close(); await carl.ctx.close();
  });

  test("merge suggestions point the right way: the older item with votes stays the original", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const base = uniq("Export faktúr do Pohody");
    const older = await createItem(ann.page, b.slug, "idea", base);
    const newer = await createItem(ann.page, b.slug, "idea", `${base} prosím`);
    await page.goto(`/${b.slug}/i/${newer}`);
    const team = page.getByRole("region", { name: "Pre tím" });
    await expect(team.getByRole("button", { name: `Zlúčiť do #${older}` })).toBeVisible();
    await page.goto(`/${b.slug}/i/${older}`);
    await team.getByRole("button", { name: `Zlúčiť #${newer} sem` }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toContainText(`Hlasy z #${newer} sa presunú sem`);
    await dlg.getByRole("button", { name: `Zlúčiť #${newer} sem` }).click();
    await expect(page.getByText("Zlúčené sem:")).toBeVisible();
    expect((await itemRow(b.slug, newer))!.mergedIntoId).toBe((await itemRow(b.slug, older))!.id);
    await ann.ctx.close();
  });

  test("a duplicate bug's reporter hears about the fix of the original, about their own report only", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const tA = uniq("Faktúra sa neuloží"), tB = uniq("Neviem uložiť faktúru");
    const nA = await createItem(ann.page, b.slug, "bug", tA);
    const nB = await createItem(ben.page, b.slug, "bug", tB);
    await page.goto(`/${b.slug}/i/${nB}`);
    await page.getByLabel("Číslo pôvodného záznamu").fill(`#${nA}`);
    await page.getByRole("button", { name: "Zlúčiť…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: `Zlúčiť do #${nA}` }).click();
    await page.waitForURL(new RegExp(`/${b.slug}/i/${nA}$`));
    await moveTo(page, b.slug, nA, "Opravené", "3.1.0");

    const mail = await lastMail(ben.email, { subject: /^Opravené:/ });
    expect(mail.Subject).toBe(`Opravené: #${nB} ${tB}`);
    expect(mail.text).toContain("3.1.0");
    // Bugs are private: nothing of Anna's report reaches Ben.
    expect(`${mail.Subject} ${mail.text}`).not.toContain(tA);
    expect(linkIn(mail.text, new RegExp(`/${b.slug}/i/${nB}`))).not.toBeNull();
    expect(linkIn(mail.text, new RegExp(`/${b.slug}/i/${nA}\\b`))).toBeNull();
    await ann.ctx.close(); await ben.ctx.close();
  });

  test("unsubscribe: the e-mail link (two steps) and the one-click header stop further e-mails", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const n = await createItem(ann.page, b.slug, "idea", uniq("Odhlásenie"));
    await ben.page.goto(`/${b.slug}/i/${n}`);
    await addComment(ben.page, "Sledujem aj ja.");

    await moveTo(page, b.slug, n, "Plánované");
    const mail = await lastMail(ann.email, { subject: /^Plánované:/ });
    expect(mail.text).toContain("Odhlásiť sa z e-mailov");
    const link = linkIn(mail.text, new RegExp(`/${b.slug}/unsubscribe\\?u=`))!;

    // Opening the link alone changes nothing (mail scanners); the button does.
    const reader = await ownIp(await browser.newContext());
    const r = await reader.newPage();
    await r.goto(link);
    await expect(r.getByRole("heading", { name: "Odhlásiť sa z e-mailov?" })).toBeVisible();
    expect((await userByEmail(b.slug, ann.email))?.emailOptOut).toBe(false);
    await r.getByRole("button", { name: "Odhlásiť sa z e-mailov" }).click();
    await expect(r.getByRole("heading", { name: "Hotovo, e-maily vám už posielať nebudeme" })).toBeVisible();
    expect((await userByEmail(b.slug, ann.email))?.emailOptOut).toBe(true);
    // A tampered link is refused.
    await r.goto(link.replace(/s=[^&]+/, "s=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"));
    await expect(r.getByRole("heading", { name: "Odkaz nie je platný" })).toBeVisible();

    // "Moje údaje" shows it and can switch it back.
    await ann.page.goto(`/${b.slug}/me`);
    await expect(ann.page.getByText(/E-maily sú vypnuté/)).toBeVisible();
    await expect(ann.page.getByRole("button", { name: "Zapnúť e-maily" })).toBeVisible();

    // One-click (RFC 8058) from Ben's mail header.
    const benMail = await lastMail(ben.email, { subject: /^Plánované:/ });
    const headers = (await (await fetch(`${E2E.mailpit}/api/v1/message/${benMail.ID}/headers`)).json()) as Record<string, string[]>;
    expect(headers["List-Unsubscribe-Post"]?.[0]).toBe("List-Unsubscribe=One-Click");
    const oneClick = headers["List-Unsubscribe"]![0]!.replace(/^<|>$/g, "");
    expect(oneClick).toContain(`/${b.slug}/unsubscribe/one-click?`);
    expect((await reader.request.post(oneClick.replace(/s=[^&]+/, "s=x"))).status()).toBe(400);
    const res = await reader.request.post(oneClick);
    expect(res.status()).toBe(200);
    expect((await userByEmail(b.slug, ben.email))?.emailOptOut).toBe(true);

    // Next change: a fresh commenter gets the mail, Ann and Ben do not.
    const carl = await boardUser(browser, b, "carl");
    await carl.page.goto(`/${b.slug}/i/${n}`);
    await addComment(carl.page, "Carl tiež čaká.");
    const before = { ann: await mailCount(ann.email), ben: await mailCount(ben.email) };
    await moveTo(page, b.slug, n, "Rozpracované");
    await lastMail(carl.email, { subject: /^Rozpracované:/ });
    expect(await mailCount(ann.email)).toBe(before.ann);
    expect(await mailCount(ben.email)).toBe(before.ben);
    await reader.close(); await ann.ctx.close(); await ben.ctx.close(); await carl.ctx.close();
  });

  test("Moje údaje: download a JSON export, then erase my data", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const ben = await boardUser(browser, b, "ben");
    const p = ann.page;
    const ideaT = uniq("Annin nápad"), bugT = uniq("Annina chyba"), benT = uniq("Benov nápad");
    const idea = await createItem(p, b.slug, "idea", ideaT);
    const bug = await createItem(p, b.slug, "bug", bugT);
    const benIdea = await createItem(ben.page, b.slug, "idea", benT);
    await p.goto(`/${b.slug}/i/${benIdea}`);
    await act(p, () => p.getByRole("button", { name: /^Hlasovať/ }).click());
    await addComment(p, "Annin komentár");

    // Through the account menu.
    await p.getByRole("button", { name: "Účet" }).click();
    await p.getByRole("menuitem", { name: "Moje údaje" }).click();
    await expect(p.getByRole("heading", { level: 1, name: "Moje údaje" })).toBeVisible();
    await expect(p.getByText(`E-maily chodia na ${ann.email}`)).toBeVisible();
    await expect(p.getByText(ann.name).first()).toBeVisible();
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Stiahnuť moje údaje" }).click()]);
    // The name follows the board's language (Slovak here), not the download request's Accept-Language.
    expect(download.suggestedFilename()).toBe(`${b.slug}-moje-udaje.json`);
    const data = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(data.profile.email).toBe(ann.email);
    expect(data.items.map((i: { title: string }) => i.title).sort()).toEqual([bugT, ideaT].sort());
    expect(data.comments.map((c: { body: string }) => c.body)).toEqual(["Annin komentár"]);
    expect(data.votes.map((v: { item: number }) => v.item)).toEqual([benIdea]);
    // Signed out, the export is refused.
    const anon = await ownIp(await browser.newContext());
    expect((await anon.request.get(`/${b.slug}/me/export`)).status()).toBe(401);
    await anon.close();

    // Erase: confirm dialog, signed out, vote/comment/bug gone, the idea stays without a name.
    await p.getByRole("button", { name: "Zmazať moje údaje…" }).click();
    await expect(p.getByRole("dialog")).toContainText("Natrvalo zmazať vaše údaje?");
    await p.getByRole("dialog").getByRole("button", { name: "Zmazať moje údaje" }).click();
    await p.waitForURL(new RegExp(`/${b.slug}/ideas\\?erased=1`));
    await expect(p.getByRole("button", { name: "Účet" })).toHaveCount(0);
    expect(await userByEmail(b.slug, ann.email)).toBeUndefined();
    expect((await itemRow(b.slug, benIdea))!.voteCount).toBe(0);
    expect(await itemRow(b.slug, bug))!.toBeUndefined();
    await page.goto(`/${b.slug}/i/${benIdea}`);
    await expect(page.getByText("Annin komentár")).toHaveCount(0);
    // Her idea stays, without her name (see the test below).
    void idea;

    // The board admin cannot erase themselves.
    await page.goto(`/${b.slug}/me`);
    await page.getByRole("button", { name: "Zmazať moje údaje…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zmazať moje údaje" }).click();
    await expect(page.getByRole("dialog")).toContainText("Admin projektu sa nemôže zmazať sám.");
    await ann.ctx.close(); await ben.ctx.close();
  });

  // The text says what eraseIn (lib/privacy.ts) does: every idea of the person stays on the board, without the author.
  test("erasing my data keeps my ideas on the board without my name, as the page says", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    const title = uniq("Len môj nápad");
    const n = await createItem(ann.page, b.slug, "idea", title);
    await ann.page.goto(`/${b.slug}/me`);
    await expect(ann.page.getByText("Vaše nápady zostanú na boarde aj s textom a hlasmi, ale bez vášho mena.")).toBeVisible();
    await ann.page.getByRole("button", { name: "Zmazať moje údaje…" }).click();
    await ann.page.getByRole("dialog").getByRole("button", { name: "Zmazať moje údaje" }).click();
    await ann.page.waitForURL(/erased=1/);
    await page.goto(`/${b.slug}/i/${n}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(ann.name)).toHaveCount(0);
    expect((await itemRow(b.slug, n))!.authorId).toBeNull();
    await ann.ctx.close();
  });

  // After erasing, the person lands on /<slug>/ideas?erased=1 and the page confirms it.
  test("after erasing my data the board confirms it", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const ann = await boardUser(browser, b, "anna");
    await ann.page.goto(`/${b.slug}/me`);
    await ann.page.getByRole("button", { name: "Zmazať moje údaje…" }).click();
    await ann.page.getByRole("dialog").getByRole("button", { name: "Zmazať moje údaje" }).click();
    await ann.page.waitForURL(/erased=1/);
    await expect(ann.page.getByRole("status").filter({ hasText: /zmazan/i })).toBeVisible();
    await ann.ctx.close();
  });

  test("e-mail sign-in on the board when the project allows it", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    // Start from a board without e-mail sign-in: no way in for a guest.
    await setProject(b.slug, { emailLogin: false });
    const before = await ownIp(await browser.newContext());
    const bp = await before.newPage();
    expect((await bp.goto(`/${b.slug}/login`))!.status()).toBe(404);
    await bp.goto(`/${b.slug}/ideas`);
    await expect(bp.getByRole("link", { name: /Prihlásiť sa/ })).toHaveCount(0);
    await before.close();
    await page.reload();
    await page.getByRole("switch", { name: "Prihlásenie e-mailom" }).click();
    await act(page, () => page.getByRole("button", { name: "Uložiť nastavenia" }).click());
    expect((await projectRow(b.slug)).emailLogin).toBe(true);

    const ctx = await ownIp(await browser.newContext());
    const g = await ctx.newPage();
    const who = email("visitor");
    await g.goto(`/${b.slug}/ideas`);
    await g.getByRole("link", { name: "Prihlásiť sa a navrhnúť" }).click();
    await expect(g).toHaveURL(new RegExp(`/${b.slug}/login\\?return=`));
    await expect(g.getByRole("heading", { name: "Prihláste sa" })).toBeVisible();
    await g.getByLabel("E-mail").fill(who);
    await g.getByRole("button", { name: "Poslať kód" }).click();
    await expect(g.getByText(`Poslali sme kód na ${who}`)).toBeVisible();
    const mail = await lastMail(who, { subject: /prihlásenie do/ });
    expect(mail.Subject).toContain(b.name);
    await g.getByLabel("Kód z e-mailu").fill(codeIn(mail.text)!);
    // Back on the form the visitor came to sign in for, not the list.
    await g.waitForURL(new RegExp(`/${b.slug}/new\\?kind=idea$`));
    await expect(g.getByRole("button", { name: "Účet" })).toBeVisible();
    const n = await createItem(g, b.slug, "idea", uniq("Nápad cez e-mail"));
    expect(n).toBeGreaterThan(0);
    // Sign out from the account menu.
    await g.getByRole("button", { name: "Účet" }).click();
    await g.getByRole("menuitem", { name: "Odhlásiť sa" }).click();
    await expect(g.getByRole("link", { name: "Prihlásiť sa" }).first()).toBeVisible();
    await ctx.close();
  });

  test("board language: <html lang> follows the browser and the footer switch", async ({ page, browser }) => {
    const b = await ownerBoard(page);
    const cs = await ownIp(await browser.newContext({ locale: "cs-CZ" }));
    const c = await cs.newPage();
    await c.goto(`/${b.slug}/ideas`);
    await expect(c.locator("html")).toHaveAttribute("lang", "cs");

    const ctx = await ownIp(await browser.newContext());
    const g = await ctx.newPage();
    await g.goto(`/${b.slug}/ideas`);
    await expect(g.locator("html")).toHaveAttribute("lang", "sk");
    const nav = g.getByRole("navigation", { name: "Jazyk" });
    await expect(nav.getByRole("button", { name: "Slovenčina" })).toHaveAttribute("aria-current", "true");
    await nav.getByRole("button", { name: "English" }).click();
    await expect(g.getByRole("heading", { level: 1, name: "Ideas" })).toBeVisible();
    await expect(g.locator("html")).toHaveAttribute("lang", "en");
    await g.reload();
    await expect(g.getByRole("heading", { level: 1, name: "Ideas" })).toBeVisible();
    await g.getByRole("navigation", { name: "Language" }).getByRole("button", { name: "Slovenčina" }).click();
    await expect(g.getByRole("heading", { level: 1, name: "Nápady" })).toBeVisible();
    await expect(g.locator("html")).toHaveAttribute("lang", "sk");
    await cs.close(); await ctx.close();
  });

  test("the board is noindex; legacy Fider links redirect 301 to the board", async ({ page, request }) => {
    const b = await ownerBoard(page);
    const n = await createItem(page, b.slug, "idea", uniq("Indexovanie"));
    for (const path of [`/${b.slug}/ideas`, `/${b.slug}/i/${n}`, `/${b.slug}/roadmap`, `/${b.slug}/changelog`]) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(200);
      expect(r.headers()["x-robots-tag"], path).toContain("noindex");
    }
    for (const path of [`/${b.slug}/posts/12/stary-nazov`, `/${b.slug}/posts/12`]) {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status(), path).toBe(301);
      expect(new URL(r.headers()["location"]!, E2E.base).pathname, path).toBe(`/${b.slug}`);
    }
    expect((await request.get(`/${uniq("nikto")}/posts/1/x`, { maxRedirects: 0 })).status()).toBe(404);
  });
});
