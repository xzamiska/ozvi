import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { consoleLogin, createProject } from "./console";
import { db, enableSso, schema, ssoUrl } from "./db";
import { email, uniq } from "./env";

/**
 * Board helpers: an owner with a fresh project (signed in to its board as admin, like "Open board"
 * in the console) and host-app users signed in through SSO, each in their own browser.
 */

/**
 * The shared e2e server rate-limits sign-in per client IP (20 an hour) and parallel specs all come from
 * 127.0.0.1. With OZVI_TRUSTED_PROXIES=1 (default) the last X-Forwarded-For entry is the client IP, so each
 * browser here gets its own address, as people on different networks would have.
 */
export async function ownIp(ctx: BrowserContext) {
  const r = () => 1 + Math.floor(Math.random() * 250);
  await ctx.setExtraHTTPHeaders({ "x-forwarded-for": `10.${r()}.${r()}.${r()}` });
  return ctx;
}

export interface Board { slug: string; name: string; owner: string; secret: string }

/** Console sign-in, a new project, then the board opened from the console (admin on the board). */
export async function ownerBoard(page: Page, opts: { name?: string } = {}): Promise<Board> {
  await ownIp(page.context());
  const owner = email("owner");
  await consoleLogin(page, owner);
  // The console may still be finishing its post-login redirect (WebKit): let it settle before the next goto.
  await page.waitForLoadState("networkidle");
  const name = opts.name ?? uniq("Board").replace(/-/g, " ");
  const slug = uniq("b").toLowerCase();
  await createProject(page, name, slug);
  // The form lands on the new workspace (/app/w/<id>?created=…); let that navigation finish first.
  await page.waitForURL(/\/app\/w\/[0-9a-f-]{36}/);
  await page.waitForLoadState("networkidle");
  await page.goto(`/app/open/${slug}?to=admin`);
  await page.waitForURL(new RegExp(`/${slug}/admin`), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Nastavenia boardu" })).toBeVisible();
  const secret = await enableSso(slug);
  return { slug, name, owner, secret };
}

export interface BoardUser { ctx: BrowserContext; page: Page; email: string; name: string; id: string }

/** A person from the host app, signed in to the board via an SSO link in a browser of their own. */
export async function boardUser(browser: Browser, b: Board, who: string, opts: { role?: "member" | "team" | "admin"; returnTo?: string } = {}): Promise<BoardUser> {
  const ctx = await ownIp(await browser.newContext());
  const page = await ctx.newPage();
  const mail = email(who);
  const name = `${who[0]!.toUpperCase()}${who.slice(1)} ${uniq("x").split("-")[2]}`;
  const id = uniq(`ext-${who}`);
  await page.goto(ssoUrl(b.slug, b.secret, { id, email: mail, name, ...(opts.role ? { role: opts.role } : {}) }, opts.returnTo));
  await page.waitForURL(new RegExp(`/${b.slug}/`));
  return { ctx, page, email: mail, name, id };
}

/** Fills the "new idea / bug" form and returns the new item's number (the form lands on its page). */
export async function createItem(page: Page, slug: string, kind: "idea" | "bug", title: string, body = "") {
  await page.goto(`/${slug}/new?kind=${kind}`);
  await page.getByLabel(kind === "bug" ? "Čo nefunguje?" : "Čo by vám pomohlo?").fill(title);
  if (body) await page.getByLabel(kind === "bug" ? /Čo ste robili/ : /Prečo to potrebujete/).fill(body);
  await page.getByRole("button", { name: kind === "bug" ? "Nahlásiť chybu" : "Navrhnúť nápad" }).click();
  await page.waitForURL(new RegExp(`/${slug}/i/\\d+$`));
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return Number(page.url().match(/\/i\/(\d+)$/)![1]);
}

/** Team: moves an item to a stop on its route from the item page ("Pre tím" → Stav). */
export async function moveTo(page: Page, slug: string, n: number, label: string, version?: string) {
  await page.goto(`/${slug}/i/${n}`);
  await page.getByRole("radiogroup", { name: "Stav" }).getByRole("radio", { name: new RegExp(`^${label}`) }).click();
  if (version) await page.getByLabel("Opravené vo verzii").fill(version);
  await page.getByRole("button", { name: `Posunúť na ${label}` }).click();
  await expect(page.getByText(`Stav: ${label}`)).toBeVisible();
}

export async function addComment(page: Page, text: string) {
  await page.getByLabel("Komentár", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Pridať komentár" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: text }).last()).toBeVisible();
}

export const projectRow = async (slug: string) => (await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) }))!;

/** Project settings an admin changes in the board settings, set directly where the UI is not under test. */
export async function setProject(slug: string, values: Partial<typeof schema.projects.$inferInsert>) {
  await db.update(schema.projects).set(values).where(eq(schema.projects.slug, slug));
}

export async function itemRow(slug: string, n: number) {
  const p = await projectRow(slug);
  // Tenant tables have RLS: read inside the project's context like the app does.
  const rows = await withProject(db, p.id, (tx) => tx.select().from(schema.items).where(eq(schema.items.number, n)));
  return rows[0];
}

/** Clicks and waits until the server action behind the click answered (optimistic UI updates before that). */
export async function act(page: Page, click: () => Promise<unknown>) {
  const done = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await click();
  await done;
}

export async function userByEmail(slug: string, mail: string) {
  const p = await projectRow(slug);
  const rows = await withProject(db, p.id, (tx) => tx.select().from(schema.users));
  return rows.find((u) => u.email === mail);
}
