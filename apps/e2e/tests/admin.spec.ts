import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { withProject } from "@ozvi/db";
import { and, eq } from "drizzle-orm";
import { anonymous, api, backdate, createItem, openAdmin, ownerAdmin, section, seedToken, setPlan, SSO_SECRET, ssoPerson, ssoVisit } from "../lib/admin";
import { db, enableSso, projectBySlug, schema, ssoUrl } from "../lib/db";
import { email, uniq } from "../lib/env";

/** Clicks a server-action submit and waits for the action's response. */
async function submitAction(page: Page, button: Locator) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]), button.click()]);
}

// The console allows 20 sign-in codes per network an hour (lib/ratelimit.ts, keyed by X-Forwarded-For behind the
// proxy): every test signs in as a fresh owner, so each gets its own made-up client address.
test.beforeEach(async ({ context }) => {
  const b = () => 1 + Math.floor(Math.random() * 250);
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${b()}.${b()}.${b()}` });
});

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(), name);

test.describe("board settings: appearance", () => {
  test("preset, colour and logo save; 'logo contains the name' hides the name visually only", async ({ page }) => {
    const { slug } = await ownerAdmin(page, "Logo Firma");
    const look = section(page, "Vzhľad");
    await look.getByRole("button", { name: "Les" }).click();
    await expect(look.getByLabel("Hlavná farba", { exact: true })).toHaveValue("#1F7A55");
    await look.getByLabel("Hlavná farba", { exact: true }).fill("#0B5FA5");
    await look.getByLabel("Logo").fill("https://e2e.invalid/logo.svg");
    await look.getByRole("checkbox", { name: "Logo už obsahuje názov" }).check();
    await look.getByRole("button", { name: "Uložiť vzhľad" }).click();
    await expect(look.getByRole("status").filter({ hasText: "Téma je uložená" })).toBeVisible();

    await page.goto(`/${slug}/ideas`);
    expect(await cssVar(page, "--oz-accent")).toBe("#0B5FA5");
    const brand = page.getByRole("banner").getByRole("link").first();
    await expect(brand.locator("img")).toHaveAttribute("src", "https://e2e.invalid/logo.svg");
    // The name is there for screen readers (accessible name of the home link) but not visible.
    await expect(brand).toHaveAccessibleName("Logo Firma");
    await expect(brand.getByText("Logo Firma")).toHaveClass(/sr-only/);

    // Unticked: the name shows next to the logo again.
    await openAdmin(page, slug);
    await section(page, "Vzhľad").getByRole("checkbox", { name: "Logo už obsahuje názov" }).uncheck();
    await section(page, "Vzhľad").getByRole("button", { name: "Uložiť vzhľad" }).click();
    await expect(section(page, "Vzhľad").getByRole("status").filter({ hasText: "Téma je uložená" })).toBeVisible();
    await page.goto(`/${slug}/ideas`);
    await expect(page.getByRole("banner").getByText("Logo Firma")).toBeVisible();
  });

  test("an invalid colour is explained and cannot be saved", async ({ page }) => {
    await ownerAdmin(page);
    const look = section(page, "Vzhľad");
    await look.getByLabel("Text", { exact: true }).fill("#12");
    await expect(look.getByRole("alert")).toHaveText("Farba „Text“ musí byť v tvare #RRGGBB.");
    await expect(look.getByRole("button", { name: "Uložiť vzhľad" })).toBeDisabled();
  });

  // Regression: the theme schema drops a non-https logo for stored themes; the editor checks what is typed (isLogoUrl).
  test("an http:// logo is refused with an explanation instead of silently dropped", async ({ page }) => {
    await ownerAdmin(page);
    const look = section(page, "Vzhľad");
    await look.getByLabel("Logo").fill("http://e2e.invalid/logo.png");
    await expect(look.getByRole("alert")).toHaveText("Logo musí byť celá adresa začínajúca https://.");
    await expect(look.getByRole("button", { name: "Uložiť vzhľad" })).toBeDisabled();
  });
});

test.describe("board settings: project", () => {
  test("name, public ideas and e-mail sign-in take effect for visitors", async ({ page, browser, request }) => {
    const { slug, owner } = await ownerAdmin(page, "Pôvodný názov");
    const token = await seedToken(slug, owner);
    await createItem(request, slug, token, "Verejný nápad z API");
    const proj = section(page, "Projekt");
    await proj.getByLabel("Názov projektu").fill("Nový názov boardu");
    await proj.getByRole("switch", { name: "Nápady vidí každý" }).click();
    await expect(proj.getByRole("switch", { name: "Nápady vidí každý" })).toHaveAttribute("aria-checked", "false");
    await proj.getByRole("switch", { name: "Prihlásenie e-mailom" }).click();
    await proj.getByRole("button", { name: "Uložiť nastavenia" }).click();
    await expect(proj.getByRole("status")).toHaveText("Nastavenia sú uložené.");

    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    await expect(v.page.getByRole("heading", { level: 1, name: "Nápady vidia len prihlásení" })).toBeVisible();
    await expect(v.page.getByText("Verejný nápad z API")).toHaveCount(0);
    await expect(v.page.getByRole("banner")).toContainText("Nový názov boardu");
    await expect(v.page).toHaveTitle(/Nový názov boardu/);
    // No e-mail sign-in and no host-app login URL: nowhere to sign in on the board.
    await expect(v.page.getByRole("banner").getByRole("link", { name: "Prihlásiť sa" })).toHaveCount(0);
    expect((await v.page.goto(`/${slug}/login`))!.status()).toBe(404);
    // The widget API refuses private boards to anonymous callers too.
    expect((await request.get(`/${slug}/api/widget/ideas`)).status()).toBe(401);

    // Back on: visitors read ideas without signing in, e-mail sign-in is offered.
    await page.reload();
    await section(page, "Projekt").getByRole("switch", { name: "Nápady vidí každý" }).click();
    await section(page, "Projekt").getByRole("switch", { name: "Prihlásenie e-mailom" }).click();
    await section(page, "Projekt").getByRole("button", { name: "Uložiť nastavenia" }).click();
    await expect(section(page, "Projekt").getByRole("status")).toHaveText("Nastavenia sú uložené.");
    await v.page.goto(`/${slug}/ideas`);
    await expect(v.page.getByRole("link", { name: "Verejný nápad z API" })).toBeVisible();
    await expect(v.page.getByRole("banner").getByRole("link", { name: "Prihlásiť sa" })).toHaveAttribute("href", new RegExp(`^/${slug}/login`));
    await v.ctx.close();
  });

  test("board address: validated, changed after a tick, the admin stays signed in and the old address is gone", async ({ page, request }) => {
    const { slug } = await ownerAdmin(page);
    const proj = section(page, "Projekt");
    const field = proj.getByLabel("Adresa boardu");
    const save = proj.getByRole("button", { name: "Zmeniť adresu" });
    await expect(field).toHaveValue(slug);
    await expect(save).toBeDisabled();

    // Reserved word: refused by the server.
    await field.fill("admin");
    await proj.getByRole("checkbox", { name: "Rozumiem, stará adresa prestane fungovať." }).click();
    await save.click();
    await expect(proj.getByRole("alert")).toHaveText("Adresa smie mať malé písmená, číslice a pomlčky (2–41 znakov) a nesmie byť vyhradená.");

    // A new address: the admin lands on the new settings, still signed in; the old address is gone.
    const next = `${slug}-nova`;
    await field.fill(next);
    // The form resets after a refused try: the tick has to be given again.
    await proj.getByRole("checkbox", { name: "Rozumiem, stará adresa prestane fungovať." }).click();
    await save.click();
    await page.waitForURL(new RegExp(`/${next}/admin`));
    await expect(page.getByRole("heading", { level: 1, name: "Nastavenia boardu" })).toBeVisible();
    await expect(section(page, "Projekt").getByLabel("Adresa boardu")).toHaveValue(next);
    expect((await request.get(`/${slug}/ideas`)).status()).toBe(404);
    expect((await request.get(`/${next}/ideas`)).status()).toBe(200);
  });

  test("saving settings after the board session ended goes back to the sign-in gate, not a crash", async ({ page }) => {
    const { slug } = await ownerAdmin(page);
    // The board session cookie goes (signed out in another tab, expired): the open form still posts.
    await page.context().clearCookies({ name: `ozvi_${slug}` });
    await section(page, "Projekt").getByRole("button", { name: "Uložiť nastavenia" }).click();
    await page.waitForURL(new RegExp(`/${slug}/admin`));
    await expect(page.getByRole("heading", { name: "Nastavenia boardu sú len pre adminov" })).toBeVisible();
  });

  test("login URL and app origins: validated, saved, and used by the board and the widget API", async ({ page, browser, request }) => {
    const { slug } = await ownerAdmin(page);
    const proj = section(page, "Projekt");
    await proj.getByLabel("Adresy vašej aplikácie").fill("https://app.firma.sk/dashboard");
    await proj.getByRole("button", { name: "Uložiť nastavenia" }).click();
    await expect(proj.getByRole("alert")).toHaveText("„https://app.firma.sk/dashboard“ nie je platný pôvod. Použite tvar https://app.example.com bez cesty.");

    await proj.getByLabel("Kam poslať ľudí na prihlásenie").fill("https://app.firma.sk/feedback-login");
    await proj.getByLabel("Adresy vašej aplikácie").fill("https://app.firma.sk/\nhttps://beta.firma.sk");
    await proj.getByRole("button", { name: "Uložiť nastavenia" }).click();
    await expect(proj.getByRole("status")).toHaveText("Nastavenia sú uložené.");
    await page.reload();
    // Trailing slash dropped, one origin per line.
    await expect(section(page, "Projekt").getByLabel("Adresy vašej aplikácie")).toHaveValue("https://app.firma.sk\nhttps://beta.firma.sk");

    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    const signIn = v.page.getByRole("banner").getByRole("link", { name: "Prihlásiť sa" });
    await expect(signIn).toHaveAttribute("href", /^https:\/\/app\.firma\.sk\/feedback-login\?ozvi_return=/);
    await v.ctx.close();

    // Reads are public ("*"); credentials (CORS with the origin echoed) and writes only for the app's origins.
    const allowed = await request.get(`/${slug}/api/widget/ideas`, { headers: { origin: "https://beta.firma.sk" } });
    expect(allowed.headers()["access-control-allow-origin"]).toBe("https://beta.firma.sk");
    const other = await request.get(`/${slug}/api/widget/ideas`, { headers: { origin: "https://evil.example" } });
    expect(other.headers()["access-control-allow-origin"]).toBe("*");
    const vote = (origin: string) => request.post(`/${slug}/api/widget/vote`, { headers: { origin }, data: { id: "00000000-0000-0000-0000-000000000000", weight: 1 } });
    expect((await vote("https://evil.example")).status()).toBe(403);
    expect((await vote("https://app.firma.sk")).status()).not.toBe(403);
  });

  test("approval queue: a member's idea waits until the team approves it", async ({ page, browser, request }) => {
    const { slug } = await ownerAdmin(page);
    const proj = section(page, "Projekt");
    await proj.getByRole("switch", { name: "Nové nápady schvaľuje tím" }).click();
    await proj.getByRole("button", { name: "Uložiť nastavenia" }).click();
    await expect(proj.getByRole("status")).toHaveText("Nastavenia sú uložené.");

    const secret = await enableSso(slug);
    const memberMail = email("member");
    expect(await ssoVisit(request, ssoUrl(slug, secret, { id: uniq("m"), email: memberMail, name: "Člen Boardu" }))).toBeLessThan(400);
    const memberToken = await seedToken(slug, memberMail, "write");
    await createItem(request, slug, memberToken, "Nápad na schválenie");

    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    await expect(v.page.getByRole("heading", { level: 1, name: "Nápady" })).toBeVisible();
    await expect(v.page.getByText("Nápad na schválenie")).toHaveCount(0);

    await page.goto(`/${slug}/ideas?f=queue`);
    await page.getByRole("link", { name: "Nápad na schválenie" }).click();
    await page.getByRole("button", { name: "Schváliť a zverejniť" }).click();
    await expect(page.getByText("Nápad je zverejnený")).toBeVisible();
    await v.page.reload();
    await expect(v.page.getByRole("link", { name: "Nápad na schválenie" })).toBeVisible();
    await v.ctx.close();
  });
});

test.describe("board settings: sections, voting, languages", () => {
  // Regression: the form used to be keyed by the saved sections, so the revalidation remounted it and lost the message.
  test("saving board sections confirms it", async ({ page }) => {
    await ownerAdmin(page);
    const sec = section(page, "Časti boardu");
    await sec.getByRole("switch", { name: "Novinky" }).click();
    await sec.getByRole("button", { name: "Uložiť časti" }).click();
    await expect(sec.getByRole("status")).toHaveText("Časti boardu sú uložené.");
  });

  test("switching off the roadmap removes it from the nav and its URL answers 404", async ({ page, browser }) => {
    const { slug } = await ownerAdmin(page);
    const sec = section(page, "Časti boardu");
    await sec.getByRole("switch", { name: "Roadmapa" }).click();
    await submitAction(page, sec.getByRole("button", { name: "Uložiť časti" }));
    await page.reload();
    await expect(section(page, "Časti boardu").getByRole("switch", { name: "Roadmapa" })).toHaveAttribute("aria-checked", "false");

    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    const nav = v.page.getByRole("navigation", { name: "Board" });
    await expect(nav.getByRole("link", { name: "Nápady" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Roadmapa" })).toHaveCount(0);
    expect((await v.page.goto(`/${slug}/roadmap`))!.status()).toBe(404);
    // The team does not get it either.
    expect((await page.goto(`/${slug}/roadmap`))!.status()).toBe(404);
    await v.ctx.close();
  });

  test("ideas off and on again (saved in between) brings the roadmap back", async ({ page }) => {
    const { slug } = await ownerAdmin(page);
    const save = async () => { await submitAction(page, section(page, "Časti boardu").getByRole("button", { name: "Uložiť časti" })); await page.reload(); };
    await section(page, "Časti boardu").getByRole("switch", { name: "Nápady" }).click();
    await save();
    await expect(section(page, "Časti boardu").getByRole("switch", { name: "Roadmapa" })).toBeDisabled();
    await section(page, "Časti boardu").getByRole("switch", { name: "Nápady" }).click();
    await save();
    await expect(section(page, "Časti boardu").getByRole("switch", { name: "Roadmapa" })).toHaveAttribute("aria-checked", "true");
    await page.goto(`/${slug}/ideas`);
    await expect(page.getByRole("navigation", { name: "Board" }).getByRole("link", { name: "Roadmapa" })).toBeVisible();
  });

  test("importance voting with a budget shows on the board", async ({ page, request }) => {
    const { slug, owner } = await ownerAdmin(page);
    await createItem(request, slug, await seedToken(slug, owner), "Nápad na hlasovanie");
    const vote = section(page, "Hlasovanie");
    await vote.getByRole("radio", { name: /Podľa dôležitosti/ }).click();
    await vote.getByRole("switch", { name: "Obmedziť počet hlasov" }).click();
    await vote.getByLabel("Hlasov na osobu").fill("101");
    await vote.getByRole("button", { name: "Uložiť hlasovanie" }).click();
    // Browser validation (max=100) or the server's message: either way nothing is saved.
    await vote.getByLabel("Hlasov na osobu").fill("3");
    await vote.getByRole("button", { name: "Uložiť hlasovanie" }).click();
    await expect(vote.getByRole("status")).toHaveText("Hlasovanie je uložené.");

    await page.goto(`/${slug}/ideas`);
    await expect(page.getByRole("status").filter({ hasText: "Zostávajú vám 3 hlasy" })).toBeVisible();
    await page.getByRole("button", { name: /^Hlasovať, / }).click();
    const levels = page.getByRole("group", { name: "Aké dôležité je to pre vás?" });
    await expect(levels.getByRole("button")).toHaveText([/Pekné mať\s*1 hlas/, /Dôležité\s*2 hlasy/, /Kritické\s*3 hlasy/]);
    await levels.getByRole("button", { name: /Kritické/ }).click();
    // Critical costs the whole budget of 3.
    await expect(page.getByRole("status").filter({ hasText: "Minuli ste všetky hlasy" })).toBeVisible();
  });

  test("default and offered languages drive the visitor's language and the switcher", async ({ page, browser }) => {
    const { slug } = await ownerAdmin(page);
    const lang = section(page, "Jazyky");
    await lang.getByRole("radio", { name: "English" }).click();
    await lang.getByRole("checkbox", { name: "Slovenčina" }).check();
    for (const other of ["Čeština", "Polski", "Magyar", "Deutsch"]) await lang.getByRole("checkbox", { name: other }).uncheck();
    await lang.getByRole("button", { name: "Uložiť jazyky" }).click();
    await expect(lang.getByRole("status")).toHaveText("Jazyky sú uložené.");

    // A German browser is not offered: it gets the default, English, plus the switcher.
    const ctx = await browser.newContext({ locale: "de-DE" });
    const de = await ctx.newPage();
    await de.goto(`/${slug}/ideas`);
    await expect(de.getByRole("heading", { level: 1, name: "Ideas" })).toBeVisible();
    const switcher = de.getByRole("navigation", { name: "Language" });
    await expect(switcher.getByRole("button")).toHaveText(["Slovenčina", "English"]);
    await switcher.getByRole("button", { name: "Slovenčina" }).click();
    await expect(de.getByRole("heading", { level: 1, name: "Nápady" })).toBeVisible();
    await ctx.close();

    // Only one language: no switcher at all.
    await page.reload();
    await section(page, "Jazyky").getByRole("checkbox", { name: "Slovenčina" }).uncheck();
    await section(page, "Jazyky").getByRole("button", { name: "Uložiť jazyky" }).click();
    // The admin's own language was just switched off: the answer comes in the board's new language.
    await expect(page.locator("#languages").getByRole("status")).toHaveText(/saved|uložené/i);
    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    await expect(v.page.getByRole("heading", { level: 1, name: "Ideas" })).toBeVisible();
    await expect(v.page.getByRole("navigation", { name: "Language" })).toHaveCount(0);
    await v.ctx.close();
  });
});

test.describe("board settings: tags and statuses", () => {
  test("tags: create, rename, public vs team-only on the board", async ({ page, browser, request }) => {
    const { slug, owner } = await ownerAdmin(page);
    const token = await seedToken(slug, owner);
    const n = await createItem(request, slug, token, "Nápad so štítkami");
    const tags = section(page, "Štítky");
    await expect(tags.getByText("Zatiaľ žiadne štítky.", { exact: false })).toBeVisible();

    await tags.getByRole("button", { name: "Nový štítok" }).click();
    await tags.getByLabel("Názov").fill("Mobil");
    await tags.getByRole("button", { name: "Vytvoriť štítok" }).click();
    await expect(page.getByText("Štítok „Mobil“ je vytvorený.")).toBeVisible();
    await tags.getByRole("button", { name: "Nový štítok" }).click();
    await tags.getByLabel("Názov").fill("Interné");
    await tags.getByRole("switch", { name: "Verejný štítok" }).click();
    await expect(tags.getByText("Vidí ho len tím:", { exact: false })).toBeVisible();
    await tags.getByRole("button", { name: "Vytvoriť štítok" }).click();
    await expect(page.getByText("Štítok „Interné“ je vytvorený.")).toBeVisible();
    await expect(tags.getByRole("listitem").filter({ hasText: "Interné" })).toContainText("Len pre tím");
    await expect(tags.getByRole("listitem").filter({ hasText: "Mobil" })).toContainText("Verejný");

    // Rename.
    await tags.getByRole("listitem").filter({ hasText: "Mobil" }).getByRole("button", { name: "Upraviť" }).click();
    await tags.getByRole("listitem").filter({ hasText: "Mobil" }).getByLabel("Názov").fill("Mobilná appka");
    await tags.getByRole("button", { name: "Uložiť štítok" }).click();
    await expect(page.getByText("Štítok „Mobilná appka“ je uložený.")).toBeVisible();
    await expect(tags.getByRole("listitem").filter({ hasText: "Mobilná appka" })).toContainText("Verejný · nepoužitý");

    const r = await api(request, slug, token, "PATCH", `/items/${n}`, { tags: { set: ["Mobilná appka", "Interné"] } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);

    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    const row = v.page.getByRole("listitem").filter({ has: v.page.getByRole("link", { name: "Nápad so štítkami" }) });
    await expect(row).toContainText("Mobilná appka");
    await expect(row).not.toContainText("Interné");
    await v.page.goto(`/${slug}/i/${n}`).catch(() => {});
    await expect(v.page.getByText("Interné")).toHaveCount(0);
    await v.ctx.close();
    // The team sees both.
    await page.goto(`/${slug}/ideas`);
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Nápad so štítkami" }) })).toContainText("Interné");
  });

  // Regression: rows were keyed by name and colour too, so a saved edit remounted the row before its toast fired.
  test("renaming a tag confirms it", async ({ page }) => {
    await ownerAdmin(page);
    const tags = section(page, "Štítky");
    await tags.getByRole("button", { name: "Nový štítok" }).click();
    await tags.getByLabel("Názov").fill("Export");
    await tags.getByRole("button", { name: "Vytvoriť štítok" }).click();
    await tags.getByRole("listitem").filter({ hasText: "Export" }).getByRole("button", { name: "Upraviť" }).click();
    await tags.getByRole("listitem").filter({ hasText: "Export" }).getByLabel("Názov").fill("Exporty");
    await tags.getByRole("button", { name: "Uložiť štítok" }).click();
    await expect(page.getByText("Štítok „Exporty“ je uložený.")).toBeVisible();
  });

  test("statuses: a renamed stop and a new sub-status show on the board", async ({ page, browser, request }) => {
    const { slug, owner } = await ownerAdmin(page);
    const token = await seedToken(slug, owner);
    await createItem(request, slug, token, "Nápad na zváženie");
    const planned = await createItem(request, slug, token, "Nápad v testovaní");
    const st = section(page, "Stavy");
    await st.getByPlaceholder("Navrhnuté", { exact: true }).fill("Na zváženie");
    const plannedRow = st.locator("ol > li").filter({ hasText: "Plánované" });
    await plannedRow.getByRole("button", { name: "Pridať podstav" }).click();
    await plannedRow.getByPlaceholder("napríklad V testovaní").fill("V testovaní");
    await st.getByRole("button", { name: "Uložiť stavy" }).click();
    await expect(page.getByText("Stavy sú uložené.")).toBeVisible();

    const r = await api(request, slug, token, "PATCH", `/items/${planned}`, { status: "planned", subStatus: "V testovaní" });
    expect(r.status, JSON.stringify(r.json)).toBe(200);

    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    const rowOf = (title: string) => v.page.getByRole("listitem").filter({ has: v.page.getByRole("link", { name: title }) });
    await expect(rowOf("Nápad na zváženie")).toContainText("Na zváženie");
    await expect(rowOf("Nápad na zváženie")).not.toContainText("Navrhnuté");
    await expect(rowOf("Nápad v testovaní")).toContainText("Plánované");
    await expect(rowOf("Nápad v testovaní")).toContainText("V testovaní");
    await v.ctx.close();

    // Saved: the admin form shows them again after a reload.
    await page.reload();
    await expect(section(page, "Stavy").getByPlaceholder("Navrhnuté", { exact: true })).toHaveValue("Na zváženie");
    await expect(section(page, "Stavy").getByRole("textbox", { name: "Názov podstavu (SK)" })).toHaveValue("V testovaní");
  });

  test("'Bez odpovede' after N days: a waiting report enters the team queue once N is lower", async ({ page, request }) => {
    const { slug } = await ownerAdmin(page);
    const member = await ssoPerson(request, slug, { scope: "write" });
    const n = await createItem(request, slug, member.token, "Čaká štyri dni");
    await backdate(slug, n, 4);
    await page.goto(`/${slug}/unanswered`);
    await expect(page.getByRole("link", { name: "Čaká štyri dni" })).toHaveCount(0);

    await openAdmin(page, slug);
    const form = page.locator("#unanswered");
    await expect(form.getByLabel("Čakať najviac")).toHaveValue("7");
    await form.getByLabel("Čakať najviac").fill("3");
    await form.getByRole("button", { name: "Uložiť" }).click();
    await expect(form.getByRole("status")).toHaveText("Hlásenie sa ukáže po 3 dňoch čakania.");

    await page.goto(`/${slug}/unanswered`);
    await expect(page.getByRole("link", { name: "Čaká štyri dni" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Board" }).getByRole("link", { name: /Bez odpovede/ })).toContainText("1");
  });
});

test.describe("board settings: sign-in, domain, people", () => {
  test("first steps start with the address and the widget; the widget code needs no token-url; phones jump between sections", async ({ page }) => {
    const { slug } = await ownerAdmin(page);
    const start = section(page, "Začíname");
    await expect(start.getByRole("link").first()).toContainText("Povoľte adresu aplikácie");
    await expect(start.getByRole("link").last()).toContainText("Voliteľné: prepojte prihlásenie");
    const quick = page.locator("#widget-quick");
    await expect(quick).toContainText("Widget bez úprav backendu");
    const code = await quick.locator("pre").textContent();
    expect(code).toContain(`<ozvi-widget project="${slug}"></ozvi-widget>`);
    expect(code).not.toContain("token-url");

    await page.setViewportSize({ width: 390, height: 844 });
    const jump = page.getByRole("combobox", { name: "Sekcie nastavení" });
    await expect(jump).toBeVisible();
    await jump.selectOption("data");
    await expect(page.locator("#data")).toBeInViewport();
  });

  test("SSO: the secret is shown once, the block switches to 'on' at once, rotating needs confirmation and kills the old secret", async ({ page, request }) => {
    const { slug } = await ownerAdmin(page);
    const sso = page.locator("#sso");
    await expect(sso).toContainText("SSO zatiaľ nie je zapnuté.");
    expect((await request.get(`/${slug}/sso?token=x`, { maxRedirects: 0 })).status()).toBe(400);

    await sso.getByRole("button", { name: "Zapnúť SSO" }).click();
    const box = sso.getByRole("status").filter({ hasText: "Skopírujte si ho teraz" });
    await expect(box).toContainText("SSO je zapnuté. Skopírujte si ho teraz, druhýkrát ho neuvidíte.");
    await expect(box).toContainText("Ukážeme ho len teraz, uložte si ho.");
    const first = (await box.locator("code").first().textContent())!.trim();
    expect(first.length).toBeGreaterThan(20);
    // Regression (f38770f): without a reload the block already says SSO is on and offers rotation, not "Zapnúť SSO".
    await expect(sso.getByText("Secret ukladáme len zašifrovaný, preto ho nevieme znova zobraziť.")).toBeVisible();
    await expect(sso.getByRole("button", { name: "Vygenerovať nový secret…" })).toBeVisible();
    await expect(sso.getByRole("button", { name: "Zapnúť SSO" })).toHaveCount(0);
    await expect(page.locator("#start")).toContainText("Hotovo");

    const person = { id: uniq("sso"), email: email("sso"), name: "SSO Človek" };
    expect(await ssoVisit(request, ssoUrl(slug, first, person))).toBe(307);
    expect(await ssoVisit(request, ssoUrl(slug, "wrong-secret-0123456789abcdef0123456789", person))).toBe(401);

    // Rotation asks first; "Nechať tak" changes nothing.
    await sso.getByRole("button", { name: "Vygenerovať nový secret…" }).click();
    const dialog = page.getByRole("dialog", { name: "Vygenerovať nový SSO secret?" });
    await expect(dialog).toContainText("Starý secret prestane platiť hneď.");
    await dialog.getByRole("button", { name: "Nechať tak" }).click();
    await expect(dialog).toBeHidden();
    expect(await ssoVisit(request, ssoUrl(slug, first, person))).toBe(307);

    await sso.getByRole("button", { name: "Vygenerovať nový secret…" }).click();
    await dialog.getByRole("button", { name: "Vygenerovať nový secret" }).click();
    await expect(dialog).toBeHidden();
    const box2 = sso.getByRole("status").filter({ hasText: "Nový secret je aktívny." });
    await expect(box2).toContainText("Starý secret prestal platiť.");
    const second = (await box2.locator("code").first().textContent())!.trim();
    expect(second).not.toBe(first);
    expect(await ssoVisit(request, ssoUrl(slug, first, person))).toBe(401);
    expect(await ssoVisit(request, ssoUrl(slug, second, person))).toBe(307);

    // After a reload the secret is gone for good.
    await page.reload();
    await expect(page.locator("#sso")).not.toContainText(second);
  });

  test("custom domain: free plan locked; on Pro the domain is validated, saved and DNS records shown", async ({ page }) => {
    test.slow(); // real DNS lookups (CNAME, A/AAAA, TXT) for a made-up domain; slow without a resolver
    const { slug } = await ownerAdmin(page);
    const dom = section(page, "Vlastná doména");
    await expect(dom.getByLabel("Doména")).toBeDisabled();
    await expect(dom).toContainText("Vlastná doména je v pláne Pro a Studio.");

    await setPlan(slug, "pro");
    await page.reload();
    const d = section(page, "Vlastná doména");
    await d.getByLabel("Doména").fill("nie je domena");
    await d.getByRole("button", { name: "Uložiť doménu" }).click();
    await expect(d.getByRole("alert")).toHaveText("Zadajte doménu v tvare feedback.vasafirma.sk (bez https:// a cesty).");
    // Ozvi's own cloud domain cannot be claimed.
    await d.getByLabel("Doména").fill(`${slug}.e2e.localhost`);
    await d.getByRole("button", { name: "Uložiť doménu" }).click();
    await expect(d.getByRole("alert")).toHaveText("Zadajte doménu v tvare feedback.vasafirma.sk (bez https:// a cesty).");

    const domain = `${slug}.firma-e2e.sk`;
    await d.getByLabel("Doména").fill(`https://${domain.toUpperCase()}/feedback`);
    await d.getByRole("button", { name: "Uložiť doménu" }).click();
    // The e2e server leaves simulated DNS off (OZVI_DEV_DNS=0 in scripts/e2e-server.sh), so real DNS is asked
    // and the domain stays unverified.
    await expect(d.getByRole("status")).toHaveText(`Doména ${domain} je uložená. Nastavte DNS podľa návodu a dajte „Overiť“.`, { timeout: 60_000 });
    await expect(d).toContainText("U správcu DNS nastavte dva záznamy");
    await expect(d).toContainText(`_ozvi.${domain}`);
    await expect(d.locator("code").filter({ hasText: /^ozvi-verify=/ })).toBeVisible();
    await expect(d.getByLabel("Doména")).toHaveValue(domain);
    await d.getByRole("button", { name: "Overiť doménu" }).click();
    await expect(d.getByRole("alert")).toHaveText(`CNAME pre ${domain} zatiaľ neukazuje na nás. Zmena DNS môže trvať aj hodinu.`, { timeout: 60_000 });

    // Empty removes it.
    await d.getByLabel("Doména").fill("");
    await submitAction(page, d.getByRole("button", { name: "Uložiť doménu" }));
    await page.reload();
    await expect(section(page, "Vlastná doména").getByLabel("Doména")).toHaveValue("");
    await expect(section(page, "Vlastná doména")).not.toContainText("U správcu DNS nastavte dva záznamy");
    expect((await projectBySlug(slug))!.customDomain).toBeNull();
  });

  // Regression: DomainForm used to give the last check priority over a newer save result.
  test("custom domain: saving after a failed check shows the save result, not the stale check error", async ({ page }) => {
    const { slug } = await ownerAdmin(page);
    await setPlan(slug, "pro");
    await page.reload();
    const d = section(page, "Vlastná doména");
    await d.getByLabel("Doména").fill(`${slug}.firma-e2e.sk`);
    await d.getByRole("button", { name: "Uložiť doménu" }).click();
    await d.getByRole("button", { name: "Overiť doménu" }).click();
    await expect(d.getByRole("alert")).toContainText("zatiaľ neukazuje na nás");
    await d.getByLabel("Doména").fill("");
    await d.getByRole("button", { name: "Uložiť doménu" }).click();
    await expect(d.getByRole("status")).toHaveText("Vlastná doména je odstránená.");
    await expect(d.getByRole("alert")).toHaveCount(0);
  });

  test("people: change a role; 'Odhlásiť všade' ends the person's sessions and tokens", async ({ page, browser, request }) => {
    const { slug } = await ownerAdmin(page);
    const person = await ssoPerson(request, slug, { name: "Zuzana Zákazníčka", scope: "read" });
    // The person also has a browser session on the board.
    const ctx = await browser.newContext({ locale: "sk-SK" });
    const theirs = await ctx.newPage();
    await theirs.goto(ssoUrl(slug, SSO_SECRET, { id: person.id, email: person.mail, name: "Zuzana Zákazníčka" }));
    await expect(theirs.getByRole("banner").getByRole("button", { name: /Zuzana|Účet|účet/ })).toBeVisible();
    expect((await api(request, slug, person.token, "GET", "/me")).status).toBe(200);

    await page.reload();
    const people = section(page, "Ľudia");
    await expect(people).toContainText("to ste vy");
    await people.getByText("Ostatní používatelia").click();
    const row = people.getByRole("listitem").filter({ hasText: "Zuzana Zákazníčka" });
    await row.getByRole("button", { name: "Odhlásiť všade" }).click();
    const dialog = page.getByRole("dialog", { name: "Odhlásiť Zuzana Zákazníčka všade?" });
    await dialog.getByRole("button", { name: "Odhlásiť všade" }).click();
    await expect(page.getByText("Zuzana Zákazníčka: všetky prihlásenia sú zrušené")).toBeVisible();
    expect((await api(request, slug, person.token, "GET", "/me")).status).toBe(401);
    await theirs.reload();
    await expect(theirs.getByRole("banner").getByRole("link", { name: "Prihlásiť sa" })).toBeVisible();
    await ctx.close();

    // Role: member → team; the person moves to the team list.
    await page.reload();
    await section(page, "Ľudia").getByText("Ostatní používatelia").click();
    await section(page, "Ľudia").getByRole("combobox", { name: "Rola – Zuzana Zákazníčka" }).click();
    await page.getByRole("option", { name: "Tím" }).click();
    await expect(page.getByText("Zuzana Zákazníčka: Tím")).toBeVisible();
    const p = (await projectBySlug(slug))!;
    await expect.poll(async () => (await withProject(db, p.id, (tx) => tx.query.users.findFirst({ where: eq(schema.users.email, person.mail) })))?.role).toBe("team");
    await page.reload();
    await expect(section(page, "Ľudia").getByText("Ostatní používatelia")).toHaveCount(0);
    await expect(section(page, "Ľudia").getByRole("combobox", { name: "Rola – Zuzana Zákazníčka" })).toHaveText("Tím");
  });
});

test.describe("board settings: integrations", () => {
  test("webhooks: cloud refuses private addresses, a JSON hook gets a secret, test send and the delivery log", async ({ page, request }) => {
    // A real local receiver: in cloud mode Ozvi must never call it (SSRF guard).
    const hits: string[] = [];
    const server = createServer((req, res) => { hits.push(req.url ?? ""); res.end("ok"); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const { slug, owner } = await ownerAdmin(page);
      const hooks = page.locator("#webhooky");
      const add = async (url: string, format?: string) => {
        await hooks.getByLabel("Adresa webhooku").fill(url);
        if (format) await hooks.getByRole("radio", { name: new RegExp(format) }).click();
        await hooks.getByRole("button", { name: "Pridať webhook" }).click();
      };
      // A refused address keeps what was filled in (it used to clear the URL and the ticked events).
      await hooks.getByRole("checkbox", { name: "Zmena stavu" }).check();
      await add(`http://127.0.0.1:${port}/hook`);
      await expect(hooks.getByRole("alert")).toHaveText("Adresa musí začínať https://.");
      await expect(hooks.getByLabel("Adresa webhooku")).toHaveValue(`http://127.0.0.1:${port}/hook`);
      await expect(hooks.getByRole("checkbox", { name: "Zmena stavu" })).toBeChecked();
      await hooks.getByRole("checkbox", { name: "Zmena stavu" }).uncheck();
      await add(`https://127.0.0.1:${port}/hook`);
      await expect(hooks.getByRole("alert")).toHaveText("Adresa nemôže smerovať do internej siete.");
      await add(`https://localhost:${port}/hook`);
      await expect(hooks.getByRole("alert")).toHaveText("Adresa nemôže smerovať do internej siete.");
      await add("https://[::1]/hook");
      await expect(hooks.getByRole("alert")).toHaveText("Adresa nemôže smerovať do internej siete.");
      await add("https://user:pass@hooks.example.com/x");
      await expect(hooks.getByRole("alert")).toHaveText("Adresa nesmie obsahovať meno a heslo.");

      await add("https://hooks.e2e.invalid/ozvi", "JSON s podpisom");
      const box = hooks.getByRole("status").filter({ hasText: "Webhook je pridaný." });
      await expect(box).toContainText("Podpis overíte týmto secretom");
      expect(((await box.locator("code").first().textContent()) ?? "").length).toBeGreaterThan(20);
      const row = hooks.getByRole("listitem").filter({ hasText: "hooks.e2e.invalid/ozvi" });
      await expect(row).toContainText("JSON · všetky udalosti · zatiaľ nič neodišlo");
      await row.getByRole("button", { name: "Poslať test" }).click();
      await expect(row).toContainText("Nedoručené:");

      // A real event queues a delivery; the console's delivery log shows the call.
      await createItem(request, slug, await seedToken(slug, owner), "Nápad pre webhook");
      const ws = (await projectBySlug(slug))!.workspaceId;
      await page.goto(`/app/w/${ws}/delivery?t=webhooks`);
      const log = page.locator("table");
      await expect(log).toContainText("hooks.e2e.invalid");
      await expect(log).toContainText("item.created");

      // Remove asks first.
      await openAdmin(page, slug);
      const row2 = page.locator("#webhooky").getByRole("listitem").filter({ hasText: "hooks.e2e.invalid/ozvi" });
      await row2.getByRole("button", { name: "Odstrániť" }).click();
      await page.getByRole("dialog", { name: "Odstrániť webhook?" }).getByRole("button", { name: "Odstrániť webhook" }).click();
      await expect(page.getByText("Webhook je odstránený")).toBeVisible();
      await expect(row2).toHaveCount(0);
      expect(hits, "the local server was never called").toEqual([]);
    } finally {
      server.close();
    }
  });

  test("webhooks: a host that only resolves to a private address is still never called (delivery-time guard)", async ({ page }) => {
    let connections = 0;
    const server = createNetServer((sock) => { connections++; sock.destroy(); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const { slug } = await ownerAdmin(page);
      // Saving refuses "foo.localhost." now (test below); a row stored before that (or written around the form)
      // resolves to 127.0.0.1/::1, and delivery must still refuse to connect and say why.
      const project = (await projectBySlug(slug))!;
      await withProject(db, project.id, (tx) => tx.insert(schema.webhooks).values({
        projectId: project.id, url: `https://foo.localhost.:${port}/x`, format: "slack", secretEnc: "unused-for-slack",
      }));
      await page.reload();
      const hooks = page.locator("#webhooky");
      const row = hooks.getByRole("listitem").filter({ hasText: "foo.localhost." });
      await row.getByRole("button", { name: "Poslať test" }).click();
      await expect(row).toContainText("Nedoručené: Adresa nemôže smerovať do internej siete.");
      expect(connections).toBe(0);
    } finally {
      server.close();
    }
  });

  // checkUrl strips a trailing dot before the checks (lib/net.ts urlProblem): "foo.localhost." is "foo.localhost".
  test("webhooks: a trailing-dot localhost name is refused when saving", async ({ page }) => {
    await ownerAdmin(page);
    const hooks = page.locator("#webhooky");
    await hooks.getByLabel("Adresa webhooku").fill("https://foo.localhost./x");
    await hooks.getByRole("button", { name: "Pridať webhook" }).click();
    await expect(hooks.getByRole("alert")).toHaveText("Adresa nemôže smerovať do internej siete.");
  });

  test("API tokens: create on /tokens, use the REST API, scope is enforced, revoke → 401; MCP needs a token", async ({ page, request }) => {
    const { slug } = await ownerAdmin(page);
    await expect(page.locator("#mcp")).toContainText("Zatiaľ nikto nemá aktívny token.");
    expect((await api(request, slug, null, "GET", "/items")).status).toBe(401);
    const mcpAnon = await request.post(`/${slug}/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, headers: { accept: "application/json, text/event-stream" } });
    expect(mcpAnon.status()).toBe(401);
    expect(mcpAnon.headers()["www-authenticate"]).toMatch(/^Bearer/);

    await page.goto(`/${slug}/tokens`);
    await page.getByLabel("Názov").fill("E2E čítanie");
    await page.getByRole("button", { name: "Vytvoriť token" }).click();
    const box = page.getByRole("status").filter({ hasText: "Token „E2E čítanie“ je vytvorený." });
    await expect(box).toBeVisible();
    const token = (await box.locator("code").first().textContent())!.trim();
    expect(token).toMatch(new RegExp(`^ozvi_pat_${slug}_`));

    const me = await api(request, slug, token, "GET", "/me");
    expect(me.status).toBe(200);
    const list = await api(request, slug, token, "GET", "/items?kind=idea");
    expect(list.status).toBe(200);
    // A read token cannot write.
    const write = await api(request, slug, token, "POST", "/items", { kind: "idea", title: "Nesmie vzniknúť" });
    expect(write.status).toBe(403);
    expect(write.json.type ?? write.json.code).toMatch(/insufficient[-_]scope/);
    const mcp = await request.post(`/${slug}/mcp`, {
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
      headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream" },
    });
    expect(mcp.status()).toBe(200);

    // The admin sees everyone's tokens.
    await openAdmin(page, slug);
    await expect(page.locator("#mcp").getByRole("listitem").filter({ hasText: "E2E čítanie" })).toContainText("čítať");

    await page.goto(`/${slug}/tokens`);
    await page.getByRole("button", { name: "Zrušiť token" }).click();
    await page.getByRole("dialog", { name: "Zrušiť token „E2E čítanie“?" }).getByRole("button", { name: "Zrušiť token" }).click();
    await expect(page.getByText("Token „E2E čítanie“ je zrušený")).toBeVisible();
    const after = await api(request, slug, token, "GET", "/items");
    expect(after.status).toBe(401);
    expect(after.json.detail ?? "").not.toBe("");
  });

  test("E-maily a limity shows the plan and its usage @mobile", async ({ page }) => {
    const { slug } = await ownerAdmin(page);
    const lim = section(page, "E-maily a limity");
    await expect(lim).toContainText("Plán");
    await expect(lim).toContainText("free");
    await expect(lim).toContainText(/Odoslané e-maily\s*0\s*\/\s*200/);
    await expect(lim).toContainText(/Prílohy\s*0,0 MB\s*\/\s*250 MB/);
    await setPlan(slug, "pro");
    await page.reload();
    await expect(section(page, "E-maily a limity")).toContainText(/Odoslané e-maily\s*0\s*\/\s*1\s?500/);
  });
});

test.describe("board settings: import, data, deletion", () => {
  test("CSV import: preview, import, items on the board, undo removes them", async ({ page, browser }, info) => {
    const { slug } = await ownerAdmin(page);
    const tag = uniq("csv");
    const csv = `Názov;Popis;Štítky\nImport A ${tag};Prvý riadok;Import\nImport B ${tag};Druhý riadok;Import\n;bez názvu;\n`;
    const file = info.outputPath("napady.csv");
    writeFileSync(file, csv);

    const imp = section(page, "Import");
    await imp.getByLabel("Súbor CSV").setInputFiles(file);
    const preview = imp.getByRole("region", { name: "Náhľad (nič sa zatiaľ neuložilo)" });
    await expect(preview).toContainText("3 riadky v súbore");
    await expect(preview).toContainText(`Import A ${tag}`);
    await expect(imp).toContainText("Chýba názov");
    // Nothing is stored by the preview.
    const v = await anonymous(browser);
    await v.page.goto(`/${slug}/ideas`);
    await expect(v.page.getByText(`Import A ${tag}`)).toHaveCount(0);

    await imp.getByRole("button", { name: "Importovať 2 príspevky" }).click();
    await expect(page.getByText("Import beží. Priebeh vidíte nižšie.")).toBeVisible();
    const run = imp.getByRole("listitem").filter({ hasText: "CSV" }).first();
    await expect(run).toContainText("Hotovo", { timeout: 30_000 });
    await expect(run).toContainText("2 príspevky");

    await v.page.reload();
    await expect(v.page.getByRole("link", { name: `Import A ${tag}` })).toBeVisible();
    await expect(v.page.getByRole("link", { name: `Import B ${tag}` })).toBeVisible();

    // Importing the same file again creates nothing new.
    await imp.getByLabel("Súbor CSV").setInputFiles(file);
    await expect(imp.getByRole("button", { name: "Nič nové na import" })).toBeDisabled();

    await run.getByRole("button", { name: "Vrátiť späť" }).click();
    const dialog = page.getByRole("dialog", { name: "Vrátiť import späť?" });
    await dialog.getByRole("button", { name: "Zmazať importované" }).click();
    await expect(page.getByText("Import je vrátený späť, zmazali sme 2 príspevky.")).toBeVisible();
    await expect(run).toContainText("Vrátené späť");
    await v.page.reload();
    await expect(v.page.getByText(`Import A ${tag}`)).toHaveCount(0);
    await v.ctx.close();
  });

  test("Fider backup.zip import (fixture) brings posts, keeps numbers", async ({ page }, info) => {
    const fixture = fileURLToPath(new URL("../../web/src/lib/import/fixtures/fider-backup", import.meta.url));
    const zip = info.outputPath("backup.zip");
    execFileSync("zip", ["-qj", zip, ...readdirSync(fixture).map((f) => `${fixture}/${f}`)]);
    const { slug } = await ownerAdmin(page);
    const imp = section(page, "Import");
    await imp.getByRole("tab", { name: "Fider" }).click();
    await imp.getByLabel("Záloha (backup.zip)").setInputFiles(zip);
    const start = imp.getByRole("button", { name: /^Importovať \d+ príspev/ });
    await expect(start).toBeEnabled({ timeout: 20_000 });
    const n = Number((await start.textContent())!.match(/\d+/)![0]);
    await start.click();
    await expect(page.getByText("Import beží. Priebeh vidíte nižšie.")).toBeVisible();
    await expect(imp.getByRole("listitem").filter({ hasText: "Fider" }).first()).toContainText("Hotovo", { timeout: 30_000 });
    await page.goto(`/${slug}/ideas?f=all`);
    // Fider's #1 keeps its number on an empty board.
    await expect(page.getByRole("link", { name: "Export do Pohody" })).toHaveAttribute("href", /\/1$/);
    expect(n).toBeGreaterThan(0);
  });

  test("data: CSV and JSON exports download; retention settings save", async ({ page, request }) => {
    const { slug, owner } = await ownerAdmin(page);
    await createItem(request, slug, await seedToken(slug, owner), "Nápad na export");
    const data = section(page, "Dáta projektu");

    await data.getByRole("button", { name: "Nápady" }).click();
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Nápady (CSV)" }).click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const csvText = readFileSync((await csv.path())!, "utf8");
    expect(csvText).toContain("Nápad na export");
    expect(csvText.split("\n")[0]).toContain(";"); // Slovak Excel separator by default

    const [json] = await Promise.all([page.waitForEvent("download"), data.getByRole("link", { name: "Stiahnuť export" }).click()]);
    expect(json.suggestedFilename()).toMatch(new RegExp(`^${slug}-export-\\d{4}-\\d{2}-\\d{2}\\.json$`));
    const dump = readFileSync((await json.path())!, "utf8");
    expect(() => JSON.parse(dump)).not.toThrow();
    expect(dump).toContain("Nápad na export");
    // Not for anyone else.
    expect((await request.get(`/${slug}/admin/export`)).status()).toBe(403);
    // Both downloads carry customers' data: the console Activity says who took what.
    const project = (await projectBySlug(slug))!;
    const exported = await db.select({ detail: schema.activity.detail }).from(schema.activity)
      .where(and(eq(schema.activity.projectId, project.id), eq(schema.activity.action, "data.exported")));
    expect(exported.map((r) => r.detail).sort()).toEqual(["JSON", "ideas (1)"]);

    const ret = page.locator("#retention");
    await ret.getByRole("combobox", { name: "Záznam z hlásenia chyby" }).click();
    await page.getByRole("option", { name: "30 dní" }).click();
    await ret.getByRole("combobox", { name: "Neaktívne kontakty" }).click();
    await page.getByRole("option", { name: "Nemazať" }).click();
    await ret.getByRole("button", { name: "Uložiť uchovávanie" }).click();
    await expect(ret.getByRole("status")).toHaveText("Uložené. Mazanie podľa nového nastavenia prebehne najbližšiu noc.");
    await page.reload();
    await expect(page.locator("#retention").getByRole("combobox", { name: "Záznam z hlásenia chyby" })).toHaveText("30 dní");
    await expect(page.locator("#retention").getByRole("combobox", { name: "Neaktívne kontakty" })).toHaveText("Nemazať");
  });

  test("delete project: the typed slug is required, a board admin who is not the owner cannot, then the board is gone", async ({ page, browser, request }) => {
    const { slug } = await ownerAdmin(page);
    // A board admin from the host app (not the workspace owner) is refused.
    const boss = await ssoPerson(request, slug, { name: "Admin z appky", role: "admin" });
    const ctx = await browser.newContext({ locale: "sk-SK" });
    const other = await ctx.newPage();
    await other.goto(ssoUrl(slug, SSO_SECRET, { id: boss.id, email: boss.mail, name: "Admin z appky", role: "admin" }));
    await other.goto(`/${slug}/admin`);
    await other.getByRole("button", { name: "Zmazať projekt…" }).click();
    await other.getByLabel("Na potvrdenie napíšte").fill(slug);
    await other.getByRole("button", { name: "Natrvalo zmazať projekt" }).click();
    await expect(other.getByRole("dialog").getByRole("alert")).toContainText("Celý projekt môže zmazať len vlastník pracovného priestoru");
    await ctx.close();

    await page.reload();
    await page.getByRole("button", { name: "Zmazať projekt…" }).click();
    const dialog = page.getByRole("dialog", { name: `Natrvalo zmazať projekt ${slug}?` });
    const confirm = dialog.getByRole("button", { name: "Natrvalo zmazať projekt" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Na potvrdenie napíšte").fill(`${slug}x`);
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("button", { name: "Nechať tak" }).click();
    expect((await request.get(`/${slug}/ideas`)).status()).toBe(200);

    await page.getByRole("button", { name: "Zmazať projekt…" }).click();
    await dialog.getByLabel("Na potvrdenie napíšte").fill(slug);
    await confirm.click();
    await page.waitForURL(/\/app(\/|$)/);
    expect((await request.get(`/${slug}/ideas`)).status()).toBe(404);
    const gone = await projectBySlug(slug);
    expect(gone).toBeUndefined();
    // The workspace keeps a line about it (the project's own rows went with it).
    const deleted = await db.select({ detail: schema.activity.detail }).from(schema.activity).where(eq(schema.activity.action, "project.deleted"));
    expect(deleted.map((r) => r.detail)).toContainEqual(expect.stringContaining(`(/${slug})`));
  });
});
