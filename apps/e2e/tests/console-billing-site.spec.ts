import { expect, test, type Browser, type Page } from "@playwright/test";
import { consoleLogin, createProject, workspaceId } from "../lib/console";
import { email, uniq } from "../lib/env";
import { codeIn, lastMail, linkIn } from "../lib/mail";
import { db, schema } from "../lib/db";
import { expectHeading, horizontalOverflow, overflowingElements, watchErrors } from "../lib/site";
import { withProject } from "@ozvi/db";
import { and, eq } from "drizzle-orm";

/* ---------- helpers ---------- */

/**
 * The console's sign-in is limited to 20 codes an hour per client IP (lib/ratelimit.ts loginIp), and all specs
 * share one machine. With no proxy in front, the server takes the last X-Forwarded-For entry as the client IP
 * (lib/client-ip.ts, OZVI_TRUSTED_PROXIES defaults to 1), so each test presents its own address.
 */
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const newCtx = (browser: Browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
test.beforeEach(async ({ context }) => { await context.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() }); });

/** Signs in a new account and creates its first project (= its free workspace). */
async function freeWorkspace(page: Page, who = email("owner"), name = "Konzola E2E") {
  await consoleLogin(page, who);
  // A new account is sent on to /app/new; let that navigation land before createProject opens it again (WebKit).
  await page.waitForURL(/\/app\/new/);
  await expect(page.getByLabel("Názov aplikácie")).toBeVisible();
  const slug = await createProject(page, name, uniq("cb").toLowerCase());
  return { ws: workspaceId(page), slug, who };
}

/** Tries to add a project from /app/new; returns the page so the caller can check the outcome. */
async function tryProject(page: Page, ws: string | null, name: string, slug: string) {
  await page.goto(ws ? `/app/new?w=${ws}` : "/app/new");
  await page.getByLabel("Názov aplikácie").fill(name);
  await page.getByLabel("Adresa boardu").fill(slug);
  await page.getByRole("button", { name: "Založiť projekt" }).click();
}

/**
 * The state a verified Creem webhook leaves behind (lib/creem.ts applyCreemEvent): a quick way to a paying
 * workspace. The simulated checkout itself (OZVI_DEV_BILLING, allowed on the *.localhost e2e server) has its own test.
 */
async function setPaidPlan(ws: string, plan: "pro" | "studio", status = "active") {
  await db.update(schema.workspaces).set({
    plan, planStatus: status, planInterval: "year", planPeriodEnd: new Date(Date.now() + 365 * 86_400_000),
    creemSubscriptionId: `e2e_sub_${ws}`, creemCustomerId: `e2e_cus_${ws.slice(0, 8)}`, planSource: "creem", planUntil: null,
  }).where(eq(schema.workspaces.id, ws));
}

const wsRow = (id: string) => db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, id) });
const accountByEmail = (e: string) => db.query.accounts.findFirst({ where: eq(schema.accounts.email, e) });

/** A Gmail address unique to this run, plus the same mailbox written another way (dots, +tag, googlemail). */
function gmailPair() {
  const local = uniq("e2e").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const dotted = local.split("").join(".");
  return { plain: `${local}@gmail.com`, alias: `${dotted}+ozvi@gmail.com`, googlemail: `${local}+x@googlemail.com` };
}

async function invite(page: Page, ws: string, to: string) {
  await page.goto(`/app/w/${ws}/people`);
  await page.getByLabel("E-mail").fill(to);
  await page.getByRole("button", { name: "Poslať pozvánku" }).click();
  await expect(page.getByText(`Pozvánka odišla na ${to}`)).toBeVisible();
}

/** The invitee accepts in their own browser. */
async function acceptInBrowser(browser: Browser, ws: string, to: string) {
  const link = linkIn((await lastMail(to, { subject: /Pozvánka/ })).text, /\/app\/invite\?t=/)!;
  const ctx = await newCtx(browser);
  const p = await ctx.newPage();
  await p.goto(link);
  await p.getByRole("button", { name: "Prijať pozvánku" }).click();
  await p.waitForURL(new RegExp(`/app/w/${ws}`));
  return ctx;
}

/* ---------- console: overview, plan, limits ---------- */

test.describe("console overview and plan limits", () => {
  test("overview counts what is on the board; plan card and plan page show usage against Free limits", async ({ page }) => {
    const { ws, slug } = await freeWorkspace(page);
    const project = (await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) }))!;
    // Board content as the widget and the board would create it.
    await withProject(db, project.id, async (tx) => {
      const [u] = await tx.insert(schema.users).values({ projectId: project.id, externalId: "sso:e2e-1", email: "user1@e2e.test", name: "Používateľ" }).returning();
      await tx.insert(schema.items).values([
        { projectId: project.id, kind: "bug", number: 1, title: "Padá uloženie", status: "new", authorId: u!.id },
        { projectId: project.id, kind: "bug", number: 2, title: "Zlé dátumy", status: "new", authorId: u!.id },
        { projectId: project.id, kind: "bug", number: 3, title: "Opravené", status: "fixed", authorId: u!.id },
        { projectId: project.id, kind: "idea", number: 4, title: "Tmavý režim", status: "open", authorId: u!.id },
        { projectId: project.id, kind: "idea", number: 5, title: "Hotové", status: "shipped", authorId: u!.id },
      ]);
      await tx.insert(schema.emails).values({ projectId: project.id, to: "user1@e2e.test", kind: "bug_status", subject: "Stav hlásenia", summary: "s", html: "<p>x</p>", text: "x", status: "sent", sentAt: new Date() });
    });

    await page.goto(`/app/w/${ws}`);
    await expect(page.getByText("Plán Free, 1 projekt.")).toBeVisible();
    const card = page.locator("article").filter({ hasText: "Konzola E2E" });
    await expect(card.getByRole("link", { name: /Nové chyby/ })).toContainText("2");
    await expect(card.getByRole("link", { name: /Nápady na rozhodnutie/ })).toContainText("1");
    await expect(card.getByText("Používatelia").locator("..")).toContainText("1");
    // At the Free project limit the header offers the upgrade instead of "Nový projekt".
    await expect(page.getByRole("link", { name: "Viac projektov vo vyššom pláne" })).toBeVisible();
    await expect(page.getByRole("meter", { name: "Projekty" })).toHaveAttribute("aria-valuemax", "1");
    await expect(page.getByRole("meter", { name: "E-maily tento mesiac" })).toHaveAttribute("aria-valuenow", "1");

    await page.goto(`/app/w/${ws}/plan`);
    await expect(page.getByRole("heading", { level: 1, name: "Plán a využitie" })).toBeVisible();
    await expect(page.getByRole("meter", { name: "E-maily" })).toHaveAttribute("aria-valuemax", "200");
    await expect(page.getByRole("meter", { name: "E-maily" })).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByRole("meter", { name: "Prílohy" })).toHaveAttribute("aria-valuemax", String(250 * 1024 ** 2));
    await expect(page.getByRole("meter", { name: "Projekty" })).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByText("Ďalší projekt pridáte vo vyššom pláne.")).toBeVisible();
    const free = page.locator('[aria-labelledby="plan-free"]');
    await expect(free).toHaveAttribute("aria-current", "true");
    await expect(free).toContainText("1 projekt");
    await expect(free).toContainText("200 e-mailov mesačne");
    await expect(free).toContainText("Adresa na ozvi.io");
    await expect(page.locator('[aria-labelledby="plan-pro"]')).toContainText("3 projekty");
    await expect(page.locator('[aria-labelledby="plan-studio"]')).toContainText("Neobmedzené projekty");
    // Prices are yearly by default, quarterly on the switch.
    await expect(page.locator('[aria-labelledby="plan-pro"]')).toContainText(/19\s€/);
    await page.getByRole("link", { name: "Štvrťročne" }).click();
    await expect(page.locator('[aria-labelledby="plan-pro"]')).toContainText(/6\s€/);
    await expect(page.locator('[aria-labelledby="plan-studio"]')).toContainText(/15\s€/);
  });

  test("Free has one project: a second one is refused with the plan message", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    const slug = uniq("second").toLowerCase();
    await tryProject(page, ws, "Druhý projekt", slug);
    await expect(page.getByText("Plán Free má 1 projekt. Prejdite na vyšší plán v Pláne a využití.")).toBeVisible();
    expect(await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) })).toBeUndefined();
  });

  test("one free workspace per person: the same Gmail mailbox (dots, +tag, googlemail) cannot start another", async ({ page, browser }) => {
    const g = gmailPair();
    await freeWorkspace(page, g.plain);
    for (const other of [g.alias, g.googlemail]) {
      const ctx = await newCtx(browser);
      const p = await ctx.newPage();
      await consoleLogin(p, other);
      await expect(p).toHaveURL(/\/app\/new/);
      const slug = uniq("dup").toLowerCase();
      await tryProject(p, null, "Ďalší free", slug);
      // The free workspace belongs to the other account, so the message says so (not "you already have one").
      await expect(p.getByText("Pre túto e-mailovú schránku už existuje bezplatný priestor pod iným účtom", { exact: false })).toBeVisible();
      expect(await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) })).toBeUndefined();
      await ctx.close();
    }
    // A different mailbox is a different person.
    const ctx = await newCtx(browser);
    const p = await ctx.newPage();
    await freeWorkspace(p, `x${g.plain}`);
    await ctx.close();
  });

  test("Pro: 3 projects and a custom domain; the 4th project is refused", async ({ page }) => {
    const { ws, slug } = await freeWorkspace(page);
    // On Free the domain field is locked and says why.
    await page.goto(`/app/open/${slug}?to=admin`);
    await expect(page.locator("#dom")).toBeDisabled();
    await expect(page.getByText("Vlastná doména je v pláne Pro a Studio.")).toBeVisible();

    await setPaidPlan(ws, "pro");
    await page.goto(`/app/w/${ws}/plan`);
    await expect(page.locator('[aria-labelledby="plan-pro"]')).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { name: "Vaše predplatné" })).toBeVisible();
    await expect(page.getByText(/^Pro · ročne/)).toBeVisible();
    await expect(page.getByText(/Ďalšia platba .*: 19\s€ ročne \+ DPH/)).toBeVisible();
    await expect(page.getByRole("meter", { name: "Projekty" })).toHaveAttribute("aria-valuemax", "3");
    await expect(page.getByRole("meter", { name: "E-maily" })).toHaveAttribute("aria-valuemax", "1500");
    // Moving to Studio is confirmed first, with what it costs now.
    await page.locator('[aria-labelledby="plan-studio"]').getByRole("button", { name: "Prejsť na Studio" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toContainText("Prejsť na Studio (ročne)?");
    await expect(dlg).toContainText(/Z plánu Pro \(19\s€ ročne\) na Studio \(49\s€ ročne\)/);
    await expect(dlg).toContainText(/približne (30|29,9\d)\s€ \+ DPH/);
    await expect(dlg.getByRole("button", { name: "Zaplatiť a prejsť na Studio" })).toBeVisible();
    await dlg.getByRole("button", { name: "Späť" }).click();

    await createProject(page, "Pro dva", uniq("pro2").toLowerCase());
    await createProject(page, "Pro tri", uniq("pro3").toLowerCase());
    const fourth = uniq("pro4").toLowerCase();
    await tryProject(page, ws, "Pro štyri", fourth);
    await expect(page.getByText("Plán Pro má 3 projekty. Prejdite na vyšší plán v Pláne a využití.")).toBeVisible();

    // Custom domain is now allowed: saving it shows the DNS records to set.
    await page.goto(`/app/open/${slug}?to=admin`);
    await expect(page.locator("#dom")).toBeEnabled();
    const domain = `${uniq("fb").toLowerCase()}.example.com`;
    await page.locator("#dom").fill(domain);
    await page.getByRole("button", { name: "Uložiť doménu" }).click();
    await expect(page.getByText("U správcu DNS nastavte dva záznamy")).toBeVisible();
    await expect.poll(async () => (await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) }))?.customDomain).toBe(domain);
  });

  test("Studio: projects without a limit", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    await setPaidPlan(ws, "studio");
    await page.goto(`/app/w/${ws}/plan`);
    await expect(page.locator('[aria-labelledby="plan-studio"]')).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("meter", { name: "Projekty" })).toHaveCount(0);
    await expect(page.locator("section[aria-labelledby=usage-h]")).toContainText("bez limitu");
    for (const n of [2, 3, 4]) await createProject(page, `Studio ${n}`, uniq(`st${n}`).toLowerCase());
    await page.goto(`/app/w/${ws}`);
    await expect(page.getByText("Plán Studio, 4 projekty.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Nový projekt" }).first()).toBeVisible();
  });

  test("a scheduled cancellation shows until when the plan lasts and offers resume; Free is not offered twice", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    await setPaidPlan(ws, "pro", "scheduled_cancel");
    await page.goto(`/app/w/${ws}/plan`);
    await expect(page.getByText(/Zrušené\. Pro platí do .+, potom prejdete na Free\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Obnoviť predplatné" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zrušiť predplatné" })).toHaveCount(0);
    await expect(page.locator('[aria-labelledby="plan-studio"]')).toContainText("Predplatné je zrušené. Ak chcete zmeniť plán, najprv ho obnovte.");
    await expect(page.locator('[aria-labelledby="plan-free"]')).toContainText(/Od \d/);
  });

  // The e2e server is a production build on e2e.localhost: lib/dev-flags.ts lets OZVI_DEV_BILLING work there.
  test("simulated checkout: Prejsť na Pro → simulation → paid → Pro limits", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    await page.goto(`/app/w/${ws}/plan`);
    await page.getByRole("button", { name: "Prejsť na Pro" }).click();
    await page.waitForURL(new RegExp(`/app/billing/${ws}/simulate\\?plan=pro&i=year`));
    await page.getByRole("button", { name: "Zaplatiť Pro (ročne)" }).click();
    await page.waitForURL(new RegExp(`/app/w/${ws}/plan\\?paid=1`));
    await expect(page.getByText("Ďakujeme za platbu")).toBeVisible();
    await expect(page.locator('[aria-labelledby="plan-pro"]')).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("meter", { name: "Projekty" })).toHaveAttribute("aria-valuemax", "3");
  });

  // Dev billing answers cancel/resume/plan changes with the same subscription id (lib/creem.ts devSubscription).
  test("cancel and resume a subscription from the console", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    await setPaidPlan(ws, "pro");
    await page.goto(`/app/w/${ws}/plan`);
    await page.getByRole("button", { name: "Zrušiť predplatné" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zrušiť predplatné" }).click();
    await page.waitForURL(/done=canceled/);
    await expect(page.getByText("Predplatné je zrušené", { exact: true })).toBeVisible();
    await expect.poll(async () => (await wsRow(ws))?.planStatus).toBe("scheduled_cancel");
    await page.getByRole("button", { name: "Obnoviť predplatné" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Obnoviť predplatné" }).click();
    await page.waitForURL(/done=resumed/);
    await expect(page.getByText("Predplatné pokračuje", { exact: true })).toBeVisible();
    await expect.poll(async () => (await wsRow(ws))?.planStatus).toBe("active");
    expect((await wsRow(ws))?.creemSubscriptionId).toBe(`e2e_sub_${ws}`);
  });

  test("a paying workspace moves Pro → Studio on the same subscription", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    await setPaidPlan(ws, "pro");
    await page.goto(`/app/w/${ws}/plan`);
    await page.locator('[aria-labelledby="plan-studio"]').getByRole("button", { name: "Prejsť na Studio" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zaplatiť a prejsť na Studio" }).click();
    await page.waitForURL(/done=studio-year/);
    await expect(page.locator('[aria-labelledby="plan-studio"]')).toHaveAttribute("aria-current", "true");
    const row = await wsRow(ws);
    expect(row?.plan).toBe("studio");
    expect(row?.creemSubscriptionId).toBe(`e2e_sub_${ws}`);
  });

  // The menu item opens /app/new?workspace=new, which sends no workspace, so createProject founds a new one.
  test("\"Nový priestor\" creates a new workspace", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    await setPaidPlan(ws, "pro");
    await page.goto(`/app/w/${ws}`);
    await page.getByRole("button", { name: /Prepnúť priestor/ }).click();
    await page.getByRole("menuitem", { name: "Nový priestor" }).click();
    const slug = uniq("neww").toLowerCase();
    await page.getByLabel("Názov aplikácie").fill("Nový priestor");
    await page.getByLabel("Adresa boardu").fill(slug);
    await page.getByRole("button", { name: "Založiť projekt" }).click();
    await expect(page.getByText(`e2e.localhost:3410/${slug}`).first()).toBeVisible();
    const p = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
    expect(p?.workspaceId).not.toBe(ws);
  });
});

/* ---------- console: workspace settings ---------- */

test.describe("workspace settings", () => {
  test("rename: saved, shown in the console and logged in the activity", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    const name = `Premenovaný ${uniq("ws")}`;
    await page.goto(`/app/w/${ws}/settings`);
    // Two letters for the browser, one after the server collapses the spaces.
    await page.locator("#ws-name").fill("  a ");
    await page.getByRole("button", { name: "Uložiť názov" }).click();
    await expect(page.getByText("Názov musí mať 2 až 60 znakov.")).toBeVisible();
    await page.locator("#ws-name").fill(`  ${name}  `);
    await page.getByRole("button", { name: "Uložiť názov" }).click();
    await expect.poll(async () => (await wsRow(ws))?.name).toBe(name);
    await expect(page.locator("#ws-name")).toHaveValue(name);
    await page.goto(`/app/w/${ws}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.goto(`/app/w/${ws}/activity`);
    await expect(page.getByText("Premenovaný priestor")).toBeVisible();
    await expect(page.getByText(`Konzola E2E → ${name}`)).toBeVisible();
  });

  // Regression: the form was keyed on the name, so the revalidated page remounted it and dropped the message.
  test("rename: the saved confirmation is shown", async ({ page }) => {
    const { ws } = await freeWorkspace(page);
    await page.goto(`/app/w/${ws}/settings`);
    await page.locator("#ws-name").fill("Potvrdený názov");
    await page.getByRole("button", { name: "Uložiť názov" }).click();
    await expect(page.getByText("Názov priestoru je uložený.")).toBeVisible();
  });

  test("delete: a paying workspace is refused; a free one goes after typing its name", async ({ page }) => {
    const { ws, slug } = await freeWorkspace(page);
    await setPaidPlan(ws, "pro");
    await page.goto(`/app/w/${ws}/settings`);
    await expect(page.getByText("Priestor má platené predplatné. Najprv ho zrušte v časti Plán a využitie; po skončení obdobia priestor zmažete.")).toBeVisible();
    await expect(page.locator("#ws-confirm")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Zmazať priestor natrvalo" })).toBeDisabled();

    await db.update(schema.workspaces).set({ plan: "free", planStatus: "expired" }).where(eq(schema.workspaces.id, ws));
    await page.reload();
    const btn = page.getByRole("button", { name: "Zmazať priestor natrvalo" });
    await page.locator("#ws-confirm").fill("Konzola");
    await expect(btn).toBeDisabled();
    await page.locator("#ws-confirm").fill("Konzola E2E");
    await expect(btn).toBeEnabled();
    await btn.click();
    // No workspace left → the console asks for a new first project.
    await page.waitForURL(/\/app\/new/);
    expect(await wsRow(ws)).toBeUndefined();
    expect(await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) })).toBeUndefined();
    expect((await page.request.get(`/${slug}`)).status()).toBe(404);
  });
});

/* ---------- console: account ---------- */

test.describe("account", () => {
  test("rename the account", async ({ page }) => {
    const { ws, who } = await freeWorkspace(page);
    await page.goto(`/app/w/${ws}`);
    await expect(page.getByText("Doplňte svoje meno.")).toBeVisible();
    await page.goto("/app/account");
    // Angle brackets are refused with a reason, not silently stripped.
    await page.locator("#acc-name").fill("Jana <b>Testová</b>");
    await page.getByRole("button", { name: "Uložiť meno" }).click();
    await expect(page.getByText("Meno nesmie obsahovať znaky < a >.", { exact: false })).toBeVisible();
    expect((await accountByEmail(who))?.name).toBeNull();
    await page.locator("#acc-name").fill("Jana Testová");
    await page.getByRole("button", { name: "Uložiť meno" }).click();
    await expect(page.getByText("Meno je uložené.")).toBeVisible();
    expect((await accountByEmail(who))?.name).toBe("Jana Testová");
    await page.goto(`/app/w/${ws}`);
    await expect(page.getByText("Doplňte svoje meno.")).toHaveCount(0);
    // The rename is in the activity of the account's workspaces.
    await page.goto(`/app/w/${ws}/activity`);
    await expect(page.getByText("Zmenené meno účtu")).toBeVisible();
  });

  test("e-mail change: link goes to the NEW address, the address changes only after the confirmation", async ({ page, request }) => {
    const { who } = await freeWorkspace(page);
    const next = email("newaddr");
    await page.goto("/app/account");
    await page.getByLabel("Nový e-mail").fill(who);
    await page.getByRole("button", { name: "Poslať potvrdzovací odkaz" }).click();
    await expect(page.getByText("Toto je váš súčasný e-mail.")).toBeVisible();
    await page.getByLabel("Nový e-mail").fill(next);
    await page.getByRole("button", { name: "Poslať potvrdzovací odkaz" }).click();
    await expect(page.getByText(`Poslali sme odkaz na ${next}. E-mail sa zmení, keď naň kliknete.`)).toBeVisible();
    const link = linkIn((await lastMail(next)).text, /\/app\/account\/email\?t=/);
    expect(link, "confirmation link in the mail to the new address").not.toBeNull();
    // Nothing changed yet, and a scanner's GET does not change it either.
    expect((await request.get(link!)).status()).toBe(200);
    expect(await accountByEmail(who)).toBeDefined();
    expect(await accountByEmail(next)).toBeUndefined();

    await page.goto(link!);
    await expect(page.getByRole("heading", { name: "Potvrdiť nový e-mail" })).toBeVisible();
    await expect(page.getByText(next)).toBeVisible();
    await page.getByRole("button", { name: "Zmeniť e-mail" }).click();
    await page.waitForURL(/\/app\/account\?changed=1/);
    await expect(page.getByText("E-mail je zmenený")).toBeVisible();
    expect(await accountByEmail(next)).toBeDefined();
    expect(await accountByEmail(who)).toBeUndefined();
    // The old address is told.
    const notice = await lastMail(who, { subject: /bol zmenený/ });
    expect(notice.text).toContain(next);
    // The link works once.
    await page.goto(link!);
    await expect(page.getByText("Odkaz už neplatí")).toBeVisible();
  });

  test("e-mail change link opened while signed out: sign in, then back to the confirmation", async ({ page, browser }) => {
    const { who } = await freeWorkspace(page);
    const next = email("later");
    await page.goto("/app/account");
    await page.getByLabel("Nový e-mail").fill(next);
    await page.getByRole("button", { name: "Poslať potvrdzovací odkaz" }).click();
    await expect(page.getByText(`Poslali sme odkaz na ${next}.`, { exact: false })).toBeVisible();
    const link = linkIn((await lastMail(next)).text, /\/app\/account\/email\?t=/)!;
    const ctx = await newCtx(browser);
    const p = await ctx.newPage();
    await p.goto(link);
    await p.waitForURL(/\/app\/login\?next=/);
    await p.getByLabel("E-mail").fill(who);
    const sentAt = Date.now() - 1_000;
    await p.getByRole("button", { name: "Poslať kód" }).click();
    await expect(p.getByText(`Poslali sme kód na ${who}`)).toBeVisible();
    // The sign-in mail from freeWorkspace is older: wait for the new one.
    let code: string | null = null;
    await expect.poll(async () => {
      const m = await lastMail(who, { subject: /kód|prihlás/i });
      code = new Date(m.Created).getTime() >= sentAt ? codeIn(m.text) : null;
      return code;
    }).not.toBeNull();
    await p.getByLabel("Kód z e-mailu").fill(code!);
    await p.waitForURL(/\/app\/account\/email\?t=/, { timeout: 5_000 }).catch(async () => {
      await p.getByRole("button", { name: "Prihlásiť sa" }).click();
      await p.waitForURL(/\/app\/account\/email\?t=/);
    });
    await expect(p.getByRole("heading", { name: "Potvrdiť nový e-mail" })).toBeVisible();
    await ctx.close();
  });

  test("\"Odhlásiť sa všade\" ends the other sessions too", async ({ page, browser }) => {
    const { ws, who } = await freeWorkspace(page);
    const ctx = await newCtx(browser);
    const other = await ctx.newPage();
    await consoleLogin(other, who);
    await other.goto(`/app/w/${ws}`);
    await expect(other).toHaveURL(new RegExp(`/app/w/${ws}`));

    await page.goto("/app/account");
    await page.getByRole("button", { name: "Odhlásiť sa všade" }).click();
    await page.waitForURL(/\/app\/login/);
    await other.goto(`/app/w/${ws}`);
    await expect(other).toHaveURL(/\/app\/login/);
    await ctx.close();
  });

  test("delete account: blocked while sole owner of a shared workspace", async ({ page, browser }) => {
    const { ws } = await freeWorkspace(page, email("shared"), "Zdieľaný");
    const member = email("member");
    await invite(page, ws, member);
    const ctx = await acceptInBrowser(browser, ws, member);
    await page.goto("/app/account");
    await expect(page.getByText("Účet zatiaľ nemôžete zrušiť")).toBeVisible();
    await expect(page.getByText("V priestore Zdieľaný ste jediný vlastník.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Natrvalo zrušiť účet" })).toHaveCount(0);

    // The member can delete theirs: they just leave, the workspace stays.
    const mp = ctx.pages()[0]!;
    await mp.goto("/app/account");
    await expect(mp.getByText("Z priestorov Zdieľaný odídete, ostatní v nich pokračujú.")).toBeVisible();
    await ctx.close();
  });

  test("delete account: blocked with an active subscription", async ({ page }) => {
    const { ws } = await freeWorkspace(page, email("payer"), "Platený");
    await setPaidPlan(ws, "pro");
    await page.goto("/app/account");
    await expect(page.getByText("Účet zatiaľ nemôžete zrušiť")).toBeVisible();
    await expect(page.getByText("Priestor Platený má aktívne predplatné.", { exact: false })).toBeVisible();
  });

  test("delete account: lists what goes, needs the typed e-mail, then removes account and workspace", async ({ page }) => {
    const { ws, slug, who } = await freeWorkspace(page, email("leaver"), "Na zmazanie");
    await page.goto("/app/account");
    // The workspace (named after its first project) and its projects are listed before anything goes.
    await expect(page.locator("li").filter({ hasText: "Na zmazanie" })).toHaveText("Na zmazanie: Na zmazanie");
    const btn = page.getByRole("button", { name: "Natrvalo zrušiť účet" });
    await expect(btn).toBeDisabled();
    await page.locator("#acc-confirm").fill(who);
    await btn.click();
    await page.waitForURL((u) => u.pathname === "/" && u.searchParams.get("deleted") === "1");
    expect(await accountByEmail(who)).toBeUndefined();
    expect(await wsRow(ws)).toBeUndefined();
    expect(await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) })).toBeUndefined();
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/login/);
  });
});

/* ---------- console: activity and delivery ---------- */

test.describe("activity and delivery logs", () => {
  test("activity lists project creation, invitation and rename by the person who did them", async ({ page }) => {
    const { ws, slug, who } = await freeWorkspace(page);
    const invitee = email("inv");
    await invite(page, ws, invitee);
    await page.goto(`/app/w/${ws}/settings`);
    await page.locator("#ws-name").fill("Aktivita E2E");
    await page.getByRole("button", { name: "Uložiť názov" }).click();
    await expect.poll(async () => (await wsRow(ws))?.name).toBe("Aktivita E2E");

    await page.goto(`/app/w/${ws}/activity`);
    const log = page.locator("main");
    await expect(log.getByText("Nový projekt")).toBeVisible();
    await expect(log.getByText(`/${slug}`, { exact: false })).toBeVisible();
    await expect(log.getByText("Pozvánka pre")).toBeVisible();
    await expect(log.getByText(invitee, { exact: false })).toBeVisible();
    await expect(log.getByText("Premenovaný priestor")).toBeVisible();
    await expect(log.getByText(who, { exact: false }).first()).toBeVisible();
    // The overview shows the latest entries too.
    await page.goto(`/app/w/${ws}`);
    await expect(page.getByRole("heading", { name: "Posledná aktivita" }).locator("..").locator("..")).toContainText("Premenovaný priestor");
  });

  test("delivery lists the e-mails the projects sent, with status and the message itself", async ({ page }) => {
    const { ws, slug } = await freeWorkspace(page);
    await page.goto(`/app/w/${ws}/delivery`);
    await expect(page.getByText("Zatiaľ žiadne e-maily")).toBeVisible();
    const project = (await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) }))!;
    await withProject(db, project.id, (tx) => tx.insert(schema.emails).values([
      { projectId: project.id, to: "ok@e2e.test", kind: "new_bug", subject: "Nové hlásenie: Padá uloženie", summary: "s", html: "<p>Telo e-mailu</p>", text: "Telo e-mailu", status: "sent", sentAt: new Date() },
      { projectId: project.id, to: "bad@e2e.test", kind: "comment", subject: "Nový komentár", summary: "s", html: "<p>x</p>", text: "x", status: "failed", lastError: "550 mailbox unavailable" },
    ]));
    await page.reload();
    const table = page.locator("main");
    await expect(table.getByText("ok@e2e.test").filter({ visible: true }).first()).toBeVisible();
    await expect(table.getByText("Nové hlásenie").filter({ visible: true }).first()).toBeVisible();
    await expect(table.getByText("Odoslaný").filter({ visible: true }).first()).toBeVisible();
    await expect(table.getByText("bad@e2e.test").filter({ visible: true }).first()).toBeVisible();
    await expect(table.getByText("Nedoručený").filter({ visible: true }).first()).toBeVisible();
    // Problems only.
    await page.getByRole("link", { name: "Len problémy" }).click();
    await expect(table.getByText("bad@e2e.test").filter({ visible: true }).first()).toBeVisible();
    await expect(table.getByText("ok@e2e.test")).toHaveCount(0);
    // The failure shows in the console navigation badge.
    await expect(page.getByLabel("1 zlyhanie za 7 dní").first()).toBeAttached();
    // The message as the recipient got it.
    await page.getByRole("link", { name: "Všetko" }).click();
    await page.getByRole("link", { name: /Nové hlásenie: Padá uloženie/ }).click();
    await expect(page.getByText("Presne to, čo dostal príjemca.")).toBeVisible();
  });
});

/* ---------- public site ---------- */

const LANDINGS = [
  { path: "/", lang: "sk", demo: "/demo" },
  { path: "/en", lang: "en", demo: "/en/demo" },
  { path: "/cs", lang: "cs", demo: "/cs/demo" },
  { path: "/de", lang: "de", demo: "/de/demo" },
  { path: "/pl", lang: "pl", demo: "/pl/demo" },
  { path: "/hu", lang: "hu", demo: "/hu/demo" },
];

test.describe("public site", () => {
  for (const l of LANDINGS) {
    test(`landing ${l.path} (${l.lang}): lang, heading, CTAs, no console errors`, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(l.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", l.lang);
      await expectHeading(page);
      await expect(page.locator('main a[href="/app/login"]').filter({ visible: true }).first()).toBeVisible();
      await expect(page.locator(`main a[href="${l.demo}"]`).filter({ visible: true }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }

  test("main CTA leads to the console sign-in, the demo CTA to the demo", async ({ page }) => {
    await page.goto("/");
    await page.locator('main a[href="/app/login"]').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await page.goto("/");
    await page.locator('main a[href="/demo"]').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/demo$/);
  });

  test("a Czech browser arriving at / gets /cs; the language menu and in-site links do not bounce back", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "cs-CZ", extraHTTPHeaders: { "accept-language": "cs-CZ,cs;q=0.9" } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/cs$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "cs");
    // Coming from the site itself (e.g. choosing Slovak in the menu) stays on the Slovak landing.
    await page.goto("/", { referer: `${new URL(page.url()).origin}/cs` });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "sk");
    await ctx.close();
  });

  test("landing explains Ozvi next to error monitoring and answers the common questions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "Monitoring zachytí, čo spadne. Ozvi to, čo vám povedia ľudia." })).toBeVisible();
    await page.getByRole("link", { name: "Ako sa Ozvi líši od monitoringu chýb" }).click();
    await expect(page).toHaveURL(/\/vs\/sentry$/);
    await page.goto("/");
    const q = page.locator("#faq summary", { hasText: "Je Ozvi náhrada za Sentry?" });
    await q.click();
    await expect(page.locator("#faq details[open]").getByText(/^Nie\. Sentry zachytí/)).toBeVisible();
  });

  test("/demo: the widget opens", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/demo");
    await expectHeading(page);
    const launcher = page.locator("ozvi-widget").locator("button.launch");
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.locator("ozvi-widget").locator('[role="dialog"]')).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  const PAGES = ["/docs", "/docs/widget", "/docs/api", "/docs/webhooks", "/docs/automation", "/blog", "/releases", "/terms", "/privacy", "/dpa", "/subprocessors",
    "/accessibility", "/vs/canny", "/vs/featurebase", "/vs/sentry", "/en/vs/canny", "/en/vs/sentry", "/alternativa-k-fideru", "/en/fider-alternative"];
  test("public pages load with a heading and no console errors", async ({ page }) => {
    const errors = watchErrors(page);
    for (const p of PAGES) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(200);
      await expectHeading(page);
      // Let link prefetches finish: a navigation cancelling them is not an error of the page.
      await page.waitForLoadState("networkidle");
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("blog posts from the index open", async ({ page }) => {
    await page.goto("/blog");
    const hrefs = await page.locator('main a[href^="/blog/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      expect((await page.goto(h))?.status(), h).toBe(200);
      await expectHeading(page);
    }
  });

  test("robots.txt and sitemap.xml are valid and list only public pages", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const r = await robots.text();
    expect(r).toMatch(/^User-agent: \*/m);
    for (const d of ["/app", "/api/", "/mcp", "/dev/", "/demo/"]) expect(r).toContain(`Disallow: ${d}\n`);
    expect(r).toContain("Sitemap: http://e2e.localhost:3410/sitemap.xml");

    const sm = await request.get("/sitemap.xml");
    expect(sm.status()).toBe(200);
    expect(sm.headers()["content-type"]).toContain("xml");
    const xml = await sm.text();
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.length).toBeGreaterThan(20);
    expect(new Set(locs).size).toBe(locs.length);
    for (const u of locs) {
      expect(u.startsWith("http://e2e.localhost:3410/")).toBe(true);
      expect(u).not.toMatch(/\/app|\/api\//);
      const res = await request.get(u, { maxRedirects: 0 });
      expect(res.status(), u).toBe(200);
      expect(res.headers()["x-robots-tag"], `${u} must be indexable`).toBeUndefined();
    }
  });

  test("public pages are indexable; boards and the console send X-Robots-Tag noindex", async ({ page, request }) => {
    for (const p of ["/", "/en", "/docs/widget", "/blog", "/releases", "/terms", "/vs/canny", "/demo"]) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      expect(res.headers()["x-robots-tag"], p).toBeUndefined();
    }
    for (const p of ["/app/login", "/app", "/demo/ideas"]) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect(res.headers()["x-robots-tag"], p).toContain("noindex");
    }
    const { slug } = await freeWorkspace(page);
    for (const p of [`/${slug}`, `/${slug}/ideas`, `/${slug}/roadmap`]) {
      const res = await request.get(p);
      expect(res.headers()["x-robots-tag"], p).toContain("noindex");
    }
  });

  test("an unknown address shows the 404 page", async ({ page }) => {
    const res = await page.goto(`/${uniq("nope")}/xyz`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Táto stránka neexistuje" })).toBeVisible();
    await page.getByRole("link", { name: "Na úvod" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("landing has no horizontal overflow at iPhone width @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const p of ["/", "/en", "/demo"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      const over = await horizontalOverflow(page);
      expect(over, `${p}: ${(await overflowingElements(page)).join(", ")}`).toBeLessThanOrEqual(0);
    }
  });
});
