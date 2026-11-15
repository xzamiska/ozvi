import { createHash, randomBytes } from "node:crypto";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { withProject } from "@ozvi/db";
import { and, eq } from "drizzle-orm";
import { consoleLogin, createProject } from "./console";
import { db, enableSso, projectBySlug, schema, ssoUrl } from "./db";
import { E2E, email, uniq } from "./env";

/** Owner with a fresh project, on its board settings (/<slug>/admin). */
export async function ownerAdmin(page: Page, name = "Nastavenia E2E") {
  const owner = email("admin");
  const slug = uniq("adm").toLowerCase();
  await consoleLogin(page, owner);
  // A new account lands on /app/new; let that navigation finish before createProject navigates again (WebKit
  // otherwise reports "navigation interrupted by another navigation").
  await expect(page.getByLabel("Názov aplikácie")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await createProject(page, name, slug);
  // createProject's check can match the live address preview on the form before the project exists: wait for
  // the redirect to the new workspace, or the hand-off below may race the creation ("nemáte prístup").
  await page.waitForURL(/\/app\/w\/[0-9a-f-]{36}/);
  await openAdmin(page, slug);
  return { owner, slug };
}

/** The console's "open settings" hand-off: signs the console account in on the board as admin. */
export async function openAdmin(page: Page, slug: string) {
  await page.goto(`/app/open/${slug}?to=admin`);
  await page.waitForURL(new RegExp(`/${slug}/admin`));
  await expect(page.getByRole("heading", { level: 1, name: "Nastavenia boardu" })).toBeVisible();
}

/** One settings section (<section aria-labelledby>) by its heading. */
export const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** A visitor who is not signed in (own cookie jar). */
export async function anonymous(browser: Browser) {
  const ctx = await browser.newContext({ locale: "sk-SK" });
  return { ctx, page: await ctx.newPage() };
}

/** The board user behind a console account (created by the hand-off). */
export async function boardUser(slug: string, mail: string) {
  const p = (await projectBySlug(slug))!;
  const u = await withProject(db, p.id, (tx) => tx.query.users.findFirst({ where: and(eq(schema.users.projectId, p.id), eq(schema.users.email, mail)) }));
  if (!u) throw new Error(`no board user ${mail} in ${slug}`);
  return { project: p, user: u };
}

/** A personal access token straight in the database (same format as lib/tokens.ts), for seeding through the API. */
export async function seedToken(slug: string, mail: string, scope: "read" | "write" | "triage" = "triage") {
  const { project, user } = await boardUser(slug, mail);
  const token = `ozvi_pat_${slug}_${randomBytes(32).toString("base64url")}`;
  await withProject(db, project.id, (tx) => tx.insert(schema.apiTokens).values({
    projectId: project.id, userId: user.id, name: "e2e seed", scope,
    hash: createHash("sha256").update(token).digest("hex"), prefix: token.slice(0, 9 + slug.length + 5),
  }));
  return token;
}

/** REST API v1 call with a token; returns status and parsed JSON (or null). */
export async function api(request: APIRequestContext, slug: string, token: string | null, method: string, path: string, body?: unknown) {
  const call = () => request.fetch(`${E2E.base}/${slug}/api/v1${path}`, {
    method, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(body !== undefined ? { data: body } : {}),
  });
  // A reused keep-alive socket can be reset by the server under load: one retry (requests are idempotent here
  // or fail loudly on the status check).
  const r = await call().catch((e: Error) => (/ECONNRESET|socket hang up/.test(e.message) ? call() : Promise.reject(e)));
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status(), json, headers: r.headers() };
}

/** Creates an idea (or bug) through the REST API; returns its number. */
export async function createItem(request: APIRequestContext, slug: string, token: string, title: string, kind: "idea" | "bug" = "idea") {
  const r = await api(request, slug, token, "POST", "/items", { kind, title, body: `${title} – popis z e2e.` });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return (r.json.number ?? r.json.item?.number) as number;
}

/** Signs a host-app person in through /<slug>/sso (creates the board user); returns the HTTP status. */
export async function ssoVisit(request: APIRequestContext, path: string) {
  return (await request.get(`${E2E.base}${path}`, { maxRedirects: 0 })).status();
}

/** A host-app user (role from the SSO token) with a token of their own; SSO gets a known secret if it is off. */
export async function ssoPerson(request: APIRequestContext, slug: string, opts: { name?: string; role?: "member" | "team" | "admin"; scope?: "read" | "write" | "triage" } = {}) {
  const p = (await projectBySlug(slug))!;
  const secret = p.ssoSecretEnc ? SSO_SECRET : await enableSso(slug, SSO_SECRET);
  const mail = email("person");
  const id = uniq("ext");
  const status = await ssoVisit(request, ssoUrl(slug, secret, { id, email: mail, name: opts.name ?? "Zákazník E2E", ...(opts.role ? { role: opts.role } : {}) }));
  expect(status, "SSO sign-in redirects").toBeLessThan(400);
  return { mail, id, token: opts.scope ? await seedToken(slug, mail, opts.scope) : "" };
}
export const SSO_SECRET = "e2e-admin-sso-secret-0123456789abcdef0123456789";

/** Moves an item's creation back in time (for "waiting N days"). */
export async function backdate(slug: string, number: number, days: number) {
  const p = (await projectBySlug(slug))!;
  await withProject(db, p.id, (tx) => tx.update(schema.items).set({ createdAt: new Date(Date.now() - days * 86_400_000) })
    .where(and(eq(schema.items.projectId, p.id), eq(schema.items.number, number))));
}

/** Puts the project's workspace on a paid plan (what a Creem payment does). */
export async function setPlan(slug: string, plan: "free" | "pro" | "studio") {
  const p = (await projectBySlug(slug))!;
  await db.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, p.workspaceId));
  return p.workspaceId;
}
