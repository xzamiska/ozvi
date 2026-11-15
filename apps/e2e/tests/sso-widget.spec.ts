import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { signOzviToken, type OzviUser } from "@ozvi/sdk";
import { eq } from "drizzle-orm";
import { withProject } from "@ozvi/db";
import { db, schema, ssoUrl } from "../lib/db";
import { E2E, uniq } from "../lib/env";
import {
  boardWithSso, EVIL, events, expectInViewport, HOST, hostApp, attachmentsOf, itemsOf, launcher, ozvi, panel, site, startHost, stopHost, widget, type Board,
} from "../lib/widget";

/**
 * SSO from the host app (/<slug>/sso?token=…) and the embeddable widget on a host-app page.
 * One board per browser project (beforeAll); every test uses its own people (unique ids).
 */

let board: Board;
test.beforeAll(async ({ browser }) => {
  await startHost();
  board = await boardWithSso(browser);
});
test.afterAll(stopHost);

const person = (who: string, extra: Partial<OzviUser> = {}): OzviUser => {
  const id = uniq(who);
  return { id, name: `${who} ${id.slice(-6)}`, email: `${id}@e2e.test`.toLowerCase(), ...extra };
};

/** The same host-app person for every token the widget asks for. */
const fixed = (who: string) => { const u = person(who); return () => u; };

/** A fresh browser (own cookies) on the board; closed after the test. */
const extra: BrowserContext[] = [];
async function boardPage(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext(opts);
  extra.push(ctx);
  return ctx.newPage();
}
test.afterEach(async () => { await Promise.all(extra.splice(0).map((c) => c.close())); });

/** The person the board shows as signed in (null = signed out). */
async function whoAmI(page: Page, slug = board.slug): Promise<string | null> {
  await page.goto(`/${slug}/me`);
  if (!new URL(page.url()).pathname.startsWith(`/${slug}/me`)) return null;
  return (await page.locator("main p.font-semibold, p.font-semibold").first().textContent())?.trim() ?? null;
}

const unansweredTab = (page: Page) => page.getByRole("navigation", { name: "Board" }).getByRole("link", { name: /Bez odpovede/ });
const settingsLink = (page: Page) => page.getByRole("link", { name: "Nastavenia boardu" });
const accountMenu = (page: Page) => page.getByRole("button", { name: "Účet" });

test.describe("SSO from the host app", () => {
  test("a valid token signs in and lands on the return path", async ({ page }) => {
    const jana = person("jana");
    await page.goto(ssoUrl(board.slug, board.secret, jana, `/${board.slug}/ideas?sort=new`));
    await expect(page).toHaveURL(new RegExp(`/${board.slug}/ideas\\?sort=new$`));
    await expect(accountMenu(page)).toBeVisible();
    expect(await whoAmI(page)).toBe(jana.name);
    // The token is not left in the address bar (history, screenshots, referer).
    expect(page.url()).not.toContain("token=");
  });

  test("expired and forged tokens: a Slovak message, nobody signed in", async ({ page }) => {
    const p = person("late");
    const expired = signOzviToken(p, board.secret, { now: () => Date.now() - 3_600_000 });
    let r = await page.goto(`/${board.slug}/sso?token=${encodeURIComponent(expired)}&return=/${board.slug}/ideas`);
    expect(r!.status()).toBe(401);
    await expect(page.getByText("Prihlasovací odkaz vypršal. Vráťte sa do aplikácie a otvorte spätnú väzbu znova.")).toBeVisible();

    const forged = signOzviToken({ ...p, role: "admin" }, "attacker-secret-0123456789abcdef0123456789");
    r = await page.goto(`/${board.slug}/sso?token=${encodeURIComponent(forged)}`);
    expect(r!.status()).toBe(401);
    await expect(page.getByText("Prihlásenie sa nepodarilo overiť. Vráťte sa do aplikácie a skúste to znova.")).toBeVisible();

    // Tampered payload with the original signature (role escalation attempt).
    const good = signOzviToken(p, board.secret);
    const [h, , s] = good.split(".");
    const evilBody = Buffer.from(JSON.stringify({ ...p, role: "admin", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    r = await page.goto(`/${board.slug}/sso?token=${encodeURIComponent(`${h}.${evilBody}.${s}`)}`);
    expect(r!.status()).toBe(401);
    expect(await whoAmI(page)).toBeNull();
  });

  test("return path outside /<slug>/ falls back to the board (no open redirect)", async ({ page }) => {
    for (const ret of ["https://evil.example/phish", "//evil.example/phish", "/\\evil.example", "/app/w", `/${board.slug}evil/ideas`, "javascript:alert(1)"]) {
      await page.goto(ssoUrl(board.slug, board.secret, person("redir"), ret));
      const u = new URL(page.url());
      expect(u.origin, `return=${ret}`).toBe(E2E.base);
      expect(u.pathname, `return=${ret}`).toMatch(new RegExp(`^/${board.slug}(/|$)`));
    }
  });

  // safeReturn resolves dot segments (also %2e) and requires the result to stay under /<slug>/.
  test("return path with ../ cannot leave the board", async ({ page }) => {
    await page.goto(ssoUrl(board.slug, board.secret, person("dots"), `/${board.slug}/../app/login`));
    expect(new URL(page.url()).pathname).toMatch(new RegExp(`^/${board.slug}(/|$)`));
  });

  test("role from the token: member, team (triage tab), admin (settings)", async ({ browser }) => {
    const member = await boardPage(browser);
    await member.goto(ssoUrl(board.slug, board.secret, person("member", { role: "member" })));
    await expect(accountMenu(member)).toBeVisible();
    await expect(unansweredTab(member)).toHaveCount(0);
    await expect(settingsLink(member)).toHaveCount(0);
    await member.goto(`/${board.slug}/unanswered`);
    await expect(member.getByText("Bez odpovede vidí len tím")).toBeVisible();

    const team = await boardPage(browser);
    await team.goto(ssoUrl(board.slug, board.secret, person("team", { role: "team" })));
    await expect(unansweredTab(team)).toBeVisible();
    await expect(settingsLink(team)).toHaveCount(0);
    await team.goto(`/${board.slug}/admin`);
    await expect(team.getByRole("heading", { name: "Nastavenia boardu sú len pre adminov" })).toBeVisible();

    const admin = await boardPage(browser);
    await admin.goto(ssoUrl(board.slug, board.secret, person("admin", { role: "admin" })));
    await expect(unansweredTab(admin)).toBeVisible();
    await settingsLink(admin).first().click();
    await expect(admin.getByRole("heading", { name: "Nastavenia boardu", exact: true })).toBeVisible();
  });

  test("a later token with a lower role signs out the person's other sessions", async ({ browser }) => {
    const p = person("demoted");
    const laptop = await boardPage(browser);
    await laptop.goto(ssoUrl(board.slug, board.secret, { ...p, role: "team" }));
    await expect(unansweredTab(laptop)).toBeVisible();

    // The host app took the team role away; the next SSO (another device) says so.
    const phone = await boardPage(browser);
    await phone.goto(ssoUrl(board.slug, board.secret, { ...p, role: "member" }));
    await expect(accountMenu(phone)).toBeVisible();
    await expect(unansweredTab(phone)).toHaveCount(0);

    await laptop.reload();
    await expect(accountMenu(laptop)).toHaveCount(0);
    await expect(unansweredTab(laptop)).toHaveCount(0);
    // The new session stays.
    await phone.reload();
    await expect(accountMenu(phone)).toBeVisible();
  });

  test("the widget's token (a lower role) also ends the team session on the board", async ({ browser, page }) => {
    const p = person("wdemoted");
    const laptop = await boardPage(browser);
    await laptop.goto(ssoUrl(board.slug, board.secret, { ...p, role: "team" }));
    await expect(unansweredTab(laptop)).toBeVisible();
    await hostApp(page, board, { user: () => ({ ...p, role: "member" }) });
    await ozvi(page, "open", "ideas");
    await expect(panel(page).getByRole("button", { name: "Navrhnúť nový nápad" })).toBeVisible();
    await expect(panel(page).getByText("Zatiaľ tu nie sú žiadne nápady.").or(panel(page).locator(".oi-row").first())).toBeVisible();
    await laptop.reload();
    await expect(unansweredTab(laptop)).toHaveCount(0);
    await expect(accountMenu(laptop)).toHaveCount(0);
  });

  test("login CSRF: a cross-site link without referer asks first; “Zostať prihlásený” keeps the old user", async ({ browser }) => {
    test.slow(); // many full page loads (WebKit is slow at them)
    const page = await boardPage(browser);
    const anna = person("anna"), mallory = person("mallory");
    await page.goto(ssoUrl(board.slug, board.secret, anna));
    expect(await whoAmI(page)).toBe(anna.name);

    // A page that is not the host app links to an SSO URL for someone else (e.g. the attacker's own account).
    const evil = site(board, { user: () => null, evil: true });
    const link = (u: OzviUser, base = evil.base, noref = true) =>
      `${base}go?to=${encodeURIComponent(E2E.base + ssoUrl(board.slug, board.secret, u))}${noref ? "&noref=1" : ""}`;
    await page.goto(link(mallory));
    await page.locator("#go").click();
    await expect(page.getByRole("heading", { name: `Prepnúť na účet ${mallory.name}?` })).toBeVisible();
    await page.getByRole("link", { name: "Zostať prihlásený" }).click();
    await expect(page).toHaveURL(new RegExp(`/${board.slug}`));
    expect(await whoAmI(page)).toBe(anna.name);

    // Choosing to switch works.
    await page.goto(link(mallory));
    await page.locator("#go").click();
    await page.getByRole("link", { name: "Prepnúť" }).click();
    await expect(page).toHaveURL(new RegExp(`/${board.slug}/ideas`));
    expect(await whoAmI(page)).toBe(mallory.name);

    // Not signed in yet: a cross-site link still asks.
    const fresh = await boardPage(browser);
    await fresh.goto(link(person("nobody")));
    await fresh.locator("#go").click();
    await expect(fresh.getByRole("heading", { name: /^Prihlásiť sa ako / })).toBeVisible();
    await fresh.getByRole("link", { name: "Nie, ďakujem" }).click();
    expect(await whoAmI(fresh)).toBeNull();

    // From the host app itself (an allowed origin, with referer) it goes straight through.
    const app = site(board, { user: () => null });
    const carl = person("carl");
    await page.goto(link(carl, app.base, false));
    await page.locator("#go").click();
    await expect(page).toHaveURL(new RegExp(`/${board.slug}/ideas`));
    expect(await whoAmI(page)).toBe(carl.name);
  });

  // Login CSRF: a URL parameter an attacker can add must never skip the "switch account?" question.
  test("login CSRF: a cross-site link that already carries confirm=1 still asks", async ({ browser }) => {
    const page = await boardPage(browser);
    const anna = person("anna2"), mallory = person("mallory2");
    await page.goto(ssoUrl(board.slug, board.secret, anna));
    const evil = site(board, { user: () => null, evil: true });
    await page.goto(`${evil.base}go?noref=1&to=${encodeURIComponent(`${E2E.base}${ssoUrl(board.slug, board.secret, mallory)}&confirm=1`)}`);
    await page.locator("#go").click();
    await expect(page.getByRole("heading", { name: `Prepnúť na účet ${mallory.name}?` })).toBeVisible();
    expect(await whoAmI(page)).toBe(anna.name);
  });

  test("console owner opening the board via /app/open/<slug>?to=admin becomes admin", async ({ browser }) => {
    const page = await boardPage(browser, { storageState: board.ownerState });
    await page.goto(`/app/open/${board.slug}?to=admin`);
    await expect(page).toHaveURL(new RegExp(`/${board.slug}/admin`));
    await expect(page.getByRole("heading", { name: "Nastavenia boardu", exact: true })).toBeVisible();
    await page.goto(`/${board.slug}/ideas`);
    await expect(unansweredTab(page)).toBeVisible();
    await expect(settingsLink(page).first()).toBeVisible();
    const u = await withProject(db, board.projectId, (tx) => tx.query.users.findFirst({ where: eq(schema.users.email, board.owner) }));
    expect(u?.role).toBe("admin");
    // Someone without the console session is sent to the console login, not to the board.
    const stranger = await boardPage(browser);
    await stranger.goto(`/app/open/${board.slug}?to=admin`);
    await expect(stranger).toHaveURL(/\/app\/login/);
  });

  test("locale claim forces the board language; one the board doesn't offer is ignored", async ({ browser }) => {
    const en = await boardPage(browser); // the browser itself asks for Slovak (sk-SK)
    await en.goto(ssoUrl(board.slug, board.secret, person("eng", { locale: "en" })));
    await expect(en.locator("html")).toHaveAttribute("lang", "en");
    await expect(en.getByRole("navigation", { name: "Board" }).getByRole("link", { name: "Ideas" })).toBeVisible();
    // Stays English on the next visit (stored on the person, not just the request).
    await en.goto(`/${board.slug}/roadmap`);
    await expect(en.locator("html")).toHaveAttribute("lang", "en");

    const de = await boardPage(browser);
    await de.goto(ssoUrl(board.slug, board.secret, { ...person("deu"), locale: "de" as never }));
    await expect(de.locator("html")).toHaveAttribute("lang", "sk");
    await expect(de.getByRole("navigation", { name: "Board" }).getByRole("link", { name: "Nápady" })).toBeVisible();
  });
});

/** Pixel statistics of the widget's screenshot preview over page rectangles (CSS px of the viewport). */
async function shotStats(page: Page, ids: string[]) {
  return page.evaluate(async (ids) => {
    const img = document.querySelector("ozvi-widget")!.shadowRoot!.querySelector<HTMLImageElement>(".shot img")!;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const k = img.naturalWidth / innerWidth;
    const out: Record<string, { red: number; box: number; total: number }> = {};
    for (const id of ids) {
      const [name, from] = id.split(":");
      const r = document.getElementById(name!)!.getBoundingClientRect();
      const x0 = Math.round((r.left + (from ? Number(from) : 0)) * k), y0 = Math.round(r.top * k);
      const w = Math.max(1, Math.round(r.right * k) - x0), h = Math.max(1, Math.round(r.height * k));
      const d = g.getImageData(x0, y0, w, h).data;
      let red = 0, box = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [R, G, B] = [d[i]!, d[i + 1]!, d[i + 2]!];
        if (R > 150 && G < 100 && B < 100) red++;
        if (Math.abs(R - 58) < 30 && Math.abs(G - 57) < 30 && Math.abs(B - 70) < 30) box++;
      }
      out[id] = { red, box, total: w * h };
    }
    return out;
  }, ids);
}

test.describe("widget in the host app", () => {
  test("Ozvi.open('bug') opens the form at once with a placeholder; the screenshot follows", async ({ page }) => {
    const host = await hostApp(page, board, { user: fixed("fast"), holdShot: true });
    await expect(launcher(page)).toBeVisible();
    // Regression (1.2.18): the form used to wait for the screenshot, hosts without a launcher saw nothing for seconds.
    // Measured in the page (Playwright round trips are slow on a busy machine): open() → the form is in the panel.
    const ms = await page.evaluate(() => new Promise<number>((resolve) => {
      const root = document.querySelector("ozvi-widget")!.shadowRoot!;
      const t0 = performance.now();
      const done = () => root.querySelector(".panel form input#oz-t") && root.querySelector(".panel .skel");
      new MutationObserver((_, ob) => { if (done()) { ob.disconnect(); resolve(performance.now() - t0); } }).observe(root, { subtree: true, childList: true });
      (window as unknown as { Ozvi: { open(t: string): void } }).Ozvi.open("bug");
    }));
    expect(ms, "form with the screenshot placeholder shown within 1 s").toBeLessThan(1000);
    // The screenshot chunk is still held back: the form is there anyway, with the placeholder.
    await expect(panel(page).getByRole("heading", { name: "Nahlásiť chybu" })).toBeVisible();
    await expect(panel(page).getByText("Pripravujem screenshot…")).toBeVisible();
    await expect(panel(page).getByLabel("Čo nefunguje?")).toBeFocused();
    // (Typing while the chunk is still held hangs WebKit's input dispatch in Playwright, so release first;
    // the screenshot itself is still being drawn while we type.)
    host.releaseShot();
    await page.keyboard.type("Píšem počas screenshotu");
    await expect(panel(page).getByRole("img", { name: "Screenshot, ktorý sa priloží" })).toBeVisible({ timeout: 15_000 });
    await expect(panel(page).getByText("Pripravujem screenshot…")).toHaveCount(0);
    await expect(panel(page).getByLabel("Čo nefunguje?")).toHaveValue("Píšem počas screenshotu");
    expect(host.shotLoads(), "the screenshot chunk went through the held route").toBe(1);
  });

  test("screenshot masking: phone, e-mail, form values and [data-ozvi-mask] are boxed", async ({ page }) => {
    const big = "font-size:36px;line-height:44px;color:#ff0000;margin:0 0 8px;font-weight:700";
    await hostApp(page, board, {
      user: fixed("mask"),
      body: `<p id="plain" style="${big}">Viditeľné WWW</p>
<p id="phone" style="${big}">+421 905 123 456</p>
<p id="mail" style="${big}">jana.kovacova@example.com</p>
<input id="field" value="WWWWWWWWWWWWWWWW" style="${big};width:640px;border:0;padding:0;background:#fff">
<input id="typed" style="${big};width:640px;border:0;padding:0;background:#fff">
<div id="priv" data-ozvi-mask style="${big}">Jana Kováčová, diagnóza</div>`,
    });
    await page.locator("#typed").fill("WWWWWWWWWWWWWWWW");
    await ozvi(page, "open", "bug");
    await expect(panel(page).getByRole("img", { name: "Screenshot, ktorý sa priloží" })).toBeVisible({ timeout: 15_000 });
    // Form fields show at most "•••••" at the start: nothing red beyond the first 200 px.
    const s = await shotStats(page, ["plain", "phone", "mail", "field:200", "typed:200", "priv"]);
    expect(s.plain!.red, "control: unmasked text is drawn").toBeGreaterThan(100);
    for (const id of ["phone", "mail", "priv"]) {
      expect(s[id]!.red, `${id}: no red text pixels`).toBeLessThan(10);
      expect(s[id]!.box, `${id}: covered by the box`).toBeGreaterThan(s[id]!.total * 0.15);
    }
    expect(s["field:200"]!.red, "input value hidden").toBeLessThan(10);
    expect(s["typed:200"]!.red, "typed value hidden").toBeLessThan(10);
    // The page itself is untouched.
    await expect(page.locator("#field")).toHaveValue("WWWWWWWWWWWWWWWW");
    await expect(page.locator("#phone")).toHaveText("+421 905 123 456");
  });

  test("a bug report reaches the team with context; console error and failed request masked; private", async ({ page, browser }) => {
    const reporter = person("reporter");
    await hostApp(page, board, { user: () => reporter });
    await page.evaluate(async () => {
      console.error("Chyba e2e: faktúra 42 sa neuložila, napíšte jana@example.com");
      await fetch("api/fail?api_key=SECRET-KEY-123&invoice=42").catch(() => {});
      await fetch("api/ok");
    });
    await ozvi(page, "open", "bug");
    const title = `Faktúra sa neuloží ${uniq("t")}`;
    await panel(page).getByLabel("Čo nefunguje?").fill(title);
    await panel(page).getByLabel(/Čo ste robili/).fill("Klikol som na Uložiť.");
    await expect(panel(page).getByRole("img", { name: "Screenshot, ktorý sa priloží" })).toBeVisible({ timeout: 15_000 });
    await expect(panel(page).getByLabel("Priložiť záznam požiadaviek a krokov")).toBeChecked();
    await panel(page).getByRole("button", { name: "Nahlásiť chybu" }).click();
    await expect(panel(page).getByRole("heading", { name: "Ďakujeme" })).toBeVisible();
    await expect(panel(page).getByText("Hlásenie sme dostali.")).toBeVisible();

    const ev = await events(page);
    const sent = ev.find((e) => e.name === "submitted")!;
    expect(sent.detail).toMatchObject({ kind: "bug", pending: null });
    expect(String(sent.detail.url)).toBe(`${E2E.base}/${board.slug}/i/${sent.detail.number}`);
    expect(ev.findIndex((e) => e.name === "submit")).toBeLessThan(ev.findIndex((e) => e.name === "submitted"));

    const item = (await itemsOf(board.projectId)).find((i) => i.title === title)!;
    expect(item.kind).toBe("bug");
    expect(item.number).toBe(sent.detail.number);
    const ctx = item.context as Record<string, unknown>;
    expect(String(ctx.url)).toContain(HOST);
    expect(ctx.appVersion).toBe("2.15.0-e2e");
    expect(String(ctx.browser)).toMatch(/Mozilla/);
    const json = JSON.stringify(ctx);
    expect(json).toContain("faktúra 42");
    expect(json).not.toContain("SECRET-KEY-123");
    expect(json).not.toContain("jana@example.com");
    expect(json).toContain("api_key=***");
    // The token endpoint (its answer is a token) is never in the network log.
    expect(json).not.toContain("api/token");
    const files = await attachmentsOf(board.projectId, item.id);
    expect(files.map((f) => f.mime)).toContain("image/jpeg");

    // The team sees it on the board with the context.
    const team = await boardPage(browser);
    await team.goto(ssoUrl(board.slug, board.secret, person("triage", { role: "team" }), `/${board.slug}/bugs`));
    await team.getByRole("link", { name: title }).first().click();
    await expect(team).toHaveURL(new RegExp(`/${board.slug}/i/${item.number}`));
    await expect(team.getByText("2.15.0-e2e")).toBeVisible();
    await expect(team.getByText(/faktúra 42 sa neuložila/).first()).toBeVisible();
    await expect(team.getByText("Požiadavky na server")).toBeVisible();
    await expect(team.getByText(/api_key=\*\*\*/).first()).toBeVisible();
    await expect(team.getByText("SECRET-KEY-123")).toHaveCount(0);
    await expect(team.locator(`img[src*="/files/"], img[src*="screenshot"]`).first()).toBeVisible();

    // Another customer does not see it (bug reports are private).
    const other = await boardPage(browser);
    await other.goto(ssoUrl(board.slug, board.secret, person("other"), `/${board.slug}/i/${item.number}`));
    await expect(other.getByText(title)).toHaveCount(0);
  });

  test("sending before the screenshot is ready waits for it and attaches it", async ({ page }) => {
    await hostApp(page, board, { user: fixed("hasty"), shotDelay: 3000 });
    await ozvi(page, "open", "bug");
    const title = `Rýchle odoslanie ${uniq("t")}`;
    await panel(page).getByLabel("Čo nefunguje?").fill(title);
    const post = page.waitForRequest((r) => r.url().includes(`/${board.slug}/api/widget/items`) && r.method() === "POST");
    await panel(page).getByRole("button", { name: "Nahlásiť chybu" }).click();
    expect((await post).postDataBuffer()?.toString("latin1")).toContain('filename="screenshot.jpg"');
    await expect(panel(page).getByRole("heading", { name: "Ďakujeme" })).toBeVisible();
    const item = (await itemsOf(board.projectId)).find((i) => i.title === title)!;
    const files = await attachmentsOf(board.projectId, item.id);
    expect(files.map((f) => f.mime)).toContain("image/jpeg");
  });

  // The button is disabled from the first click, even while the submit still waits for the screenshot.
  test("clicking send twice while the screenshot is taken files one report", async ({ page }) => {
    await hostApp(page, board, { user: fixed("double"), shotDelay: 3000 });
    await ozvi(page, "open", "bug");
    const title = `Dvojklik ${uniq("t")}`;
    await panel(page).getByLabel("Čo nefunguje?").fill(title);
    const send = panel(page).locator("button.btn");
    await send.click();
    await expect(send).toBeDisabled({ timeout: 500 });
    await send.click({ force: true }).catch(() => {});
    await expect(panel(page).getByRole("heading", { name: "Ďakujeme" })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    expect((await itemsOf(board.projectId)).filter((i) => i.title === title)).toHaveLength(1);
  });

  test("ideas: list, suggest a new one, vote", async ({ page }) => {
    let who = person("ideas");
    await hostApp(page, board, { user: () => who });
    await ozvi(page, "open", "ideas");
    const p = panel(page);
    await expect(p.getByRole("heading", { name: "Nápady" })).toBeVisible();
    await p.getByRole("button", { name: "Navrhnúť nový nápad" }).click();
    const title = `Export do Pohody ${uniq("i")}`;
    await p.getByLabel("Názov nápadu").fill(title);
    await p.getByLabel(/Čo by vám to uľahčilo/).fill("Účtujeme v Pohode.");
    await p.getByRole("button", { name: "Navrhnúť nápad" }).click();
    await expect(p.getByText("Nápad je na boarde.")).toBeVisible();
    const sent = (await events(page)).find((e) => e.name === "submitted")!;
    expect(sent.detail).toMatchObject({ kind: "idea", pending: null });

    await p.getByRole("button", { name: "Späť na nápady" }).click();
    await p.getByLabel("Hľadať v nápadoch").fill(title.split(" ").slice(-1)[0]!);
    const row = p.locator(".oi-row").filter({ hasText: title });
    await expect(row).toBeVisible();
    const vote = row.locator("button.oi-vote");
    const before = Number(await vote.locator("span").first().textContent());
    const pressed = (await vote.getAttribute("aria-pressed")) === "true";
    await vote.click();
    await expect(vote).toHaveAttribute("aria-pressed", String(!pressed));
    await expect(vote.locator("span").first()).toHaveText(String(before + (pressed ? -1 : 1)));

    // Someone else votes too.
    who = person("voter");
    await ozvi(page, "logout");
    await ozvi(page, "close");
    await p.waitFor({ state: "detached" });
    await ozvi(page, "open", "ideas");
    await expect(p.getByLabel("Hľadať v nápadoch")).toBeVisible();
    await p.getByLabel("Hľadať v nápadoch").fill(title.split(" ").slice(-1)[0]!);
    await expect(row.locator("button.oi-vote")).toHaveAttribute("aria-pressed", "false");
    const n = Number(await row.locator("button.oi-vote span").first().textContent());
    await row.locator("button.oi-vote").click();
    await expect(row.locator("button.oi-vote")).toHaveAttribute("aria-pressed", "true");
    await expect(row.locator("button.oi-vote span").first()).toHaveText(String(n + 1));
    const item = (await itemsOf(board.projectId)).find((i) => i.title === title)!;
    expect(item.voteCount).toBe(n + 1);
  });

  test("launcher='none': no floating button, Ozvi.open() still works; open/close events", async ({ page }) => {
    await hostApp(page, board, { user: fixed("nolaunch"), attrs: 'launcher="none"' });
    await page.waitForTimeout(300);
    await expect(launcher(page)).toHaveCount(0);
    await ozvi(page, "open");
    await expect(panel(page)).toBeVisible();
    for (const name of ["Nahlásiť chybu", "Navrhnúť nápad", "Moje hlásenia"]) await expect(panel(page).getByRole("button", { name })).toBeVisible();
    // Focus moves into the panel (WCAG 2.4.3), so Escape closes it.
    await expect(panel(page).getByRole("button", { name: "Nahlásiť chybu" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(launcher(page)).toHaveCount(0);
    await expect.poll(async () => (await events(page)).map((e) => e.name)).toEqual(["open", "close"]);
  });

  test("position='bottom-left': launcher on the left, the opened panel stays inside the viewport", async ({ page }) => {
    await hostApp(page, board, { user: fixed("left"), attrs: 'position="bottom-left"' });
    const vp = page.viewportSize()!;
    const b = (await launcher(page).boundingBox())!;
    expect(b.x).toBeLessThan(40);
    expect(b.y + b.height).toBeGreaterThan(vp.height - 40);
    await launcher(page).click();
    const box = await expectInViewport(page, panel(page));
    expect(box.x).toBeLessThan(40);
    await panel(page).getByRole("button", { name: "Nahlásiť chybu" }).click();
    await expect(panel(page).getByRole("img", { name: "Screenshot, ktorý sa priloží" })).toBeVisible({ timeout: 15_000 });
    await expectInViewport(page, panel(page));
  });

  test("::part(launcher) and ::part(launcher-label) style the button from the host page", async ({ page }) => {
    await hostApp(page, board, {
      user: fixed("part"),
      head: `<style>ozvi-widget::part(launcher){background:rgb(255, 0, 128);width:48px;height:48px;padding:0;justify-content:center}ozvi-widget::part(launcher-label){display:none}</style>`,
    });
    await expect(launcher(page)).toHaveCSS("background-color", "rgb(255, 0, 128)");
    await expect(launcher(page)).toHaveCSS("width", "48px");
    await expect(widget(page).locator("[part=launcher-label]")).toBeHidden();
    // Hidden label: the button keeps its accessible name.
    await expect(page.getByRole("button", { name: "Spätná väzba" })).toBeVisible();
  });

  test("the panel does not jump when its content grows (scrollbar-gutter: stable)", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 520 });
    await hostApp(page, board, { user: fixed("gutter"), shotDelay: 800 });
    await ozvi(page, "open", "bug");
    await expect(panel(page)).toHaveCSS("scrollbar-gutter", "stable");
    const measure = () => panel(page).evaluate((el) => ({ left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width, inner: el.clientWidth, scroll: el.scrollHeight > el.clientHeight }));
    const settle = () => panel(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)).then(() => {}));
    await settle();
    const before = await measure();
    await expect(panel(page).getByRole("img", { name: "Screenshot, ktorý sa priloží" })).toBeVisible({ timeout: 15_000 });
    await panel(page).getByLabel(/Čo ste robili/).fill("riadok\n".repeat(30));
    const after = await measure();
    expect(after.scroll, "content overflows now").toBe(true);
    expect(after.left).toBe(before.left);
    expect(after.width).toBe(before.width);
    expect(after.inner).toBe(before.inner);
  });

  test("@mobile the widget opens and the panel fits the screen", async ({ page }) => {
    await hostApp(page, board, { user: fixed("mobile") });
    await expect(launcher(page)).toBeVisible();
    await expectInViewport(page, launcher(page));
    await launcher(page).click();
    await expectInViewport(page, panel(page));
    await panel(page).getByRole("button", { name: "Nahlásiť chybu" }).click();
    await expect(panel(page).getByLabel("Čo nefunguje?")).toBeVisible();
    await expect(panel(page).getByRole("img", { name: "Screenshot, ktorý sa priloží" })).toBeVisible({ timeout: 20_000 });
    await expectInViewport(page, panel(page));
    await panel(page).getByRole("button", { name: "Zavrieť" }).click();
    await panel(page).waitFor({ state: "detached" });
    await ozvi(page, "open", "ideas");
    await expect(panel(page).getByRole("button", { name: "Navrhnúť nový nápad" })).toBeVisible();
    await expectInViewport(page, panel(page));
  });

  test("on an origin that is not allowed the widget cannot file reports", async ({ page }) => {
    await hostApp(page, board, { user: fixed("evil"), evil: true });
    expect(EVIL).not.toBe(HOST);
    await ozvi(page, "open", "bug");
    const title = `Z cudzej stránky ${uniq("t")}`;
    await panel(page).getByLabel("Čo nefunguje?").fill(title);
    await panel(page).getByRole("button", { name: "Nahlásiť chybu" }).click();
    await expect(panel(page).getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(panel(page).getByRole("heading", { name: "Ďakujeme" })).toHaveCount(0);
    expect((await itemsOf(board.projectId)).filter((i) => i.title === title)).toHaveLength(0);
    expect((await events(page)).some((e) => e.name === "error")).toBe(true);

    // Directly (not a browser): the server refuses the origin too.
    const r = await fetch(`${E2E.base}/${board.slug}/api/widget/items`, {
      method: "POST", headers: { origin: EVIL, authorization: `Bearer ${signOzviToken(person("evil2"), board.secret)}` },
      body: (() => { const f = new FormData(); f.set("title", title); f.set("kind", "bug"); return f; })(),
    });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("Táto stránka nemá povolené posielať spätnú väzbu. Pridajte ju v nastaveniach projektu.");
  });

  // /api/widget/config tells the widget the origin is not allowed, so it explains it instead of a raw fetch error.
  test("on an origin that is not allowed the widget explains it in Slovak", async ({ page }) => {
    await hostApp(page, board, { user: fixed("evil3"), evil: true });
    await ozvi(page, "open", "bug");
    await panel(page).getByLabel("Čo nefunguje?").fill("Z cudzej stránky");
    await panel(page).getByRole("button", { name: "Nahlásiť chybu" }).click();
    await expect(panel(page).getByRole("alert")).toContainText("nemá povolené");
  });
});
