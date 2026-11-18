import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { signOzviToken, type OzviUser } from "@ozvi/sdk";
import { eq } from "drizzle-orm";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { withProject } from "@ozvi/db";
import { consoleLogin, createProject } from "./console";
import { db, enableSso, schema } from "./db";
import { E2E, email, uniq } from "./env";

/**
 * A fake host app (the customer's product) for widget and SSO tests: a real HTTP server on loopback, reached as
 * http://app.localhost:<port> (allowed origin) and http://evil.localhost:<port2> (not allowed). Both are cross-site
 * to the Ozvi instance (e2e.localhost), like a customer app is to ozvi.io. A real server (not page.route) because
 * Chromium blocks requests from a "public" routed page to the loopback Ozvi instance (Private Network Access).
 */
/** ownerState: the console owner's signed-in browser state (for /app/open/<slug>). */
export interface Board { slug: string; secret: string; owner: string; projectId: string; ownerState: Awaited<ReturnType<BrowserContext["storageState"]>> }

export interface HostOpts {
  /** Who the host app signs in (null = the token endpoint answers 401, signed out). */
  user: () => OzviUser | null;
  /** Extra attributes on <ozvi-widget>, e.g. `launcher="none" position="bottom-left"`. */
  attrs?: string;
  /** Page content (the app's own UI). */
  body?: string;
  head?: string;
  /** Serve from the origin that is NOT allowed. */
  evil?: boolean;
  /** Delay for widget-shot.js (simulates a slow network / a big page), ms. */
  shotDelay?: number;
  /** Hold widget-shot.js until `releaseShot()` (deterministic "the screenshot is still being taken"). */
  holdShot?: boolean;
  /** No token-url at all: an app without any Ozvi backend code (ADR-0014, e-mail verification in the widget). */
  noToken?: boolean;
}

interface Site { board: Board; o: HostOpts; tokenCalls: string[] }
const sites = new Map<string, Site>();
let servers: Server[] = [];
export let HOST = "";
export let EVIL = "";

function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  // /h/<id>/            the page
  // /h/<id>/api/token   {"token": signOzviToken(user)} (what a real backend does with @ozvi/sdk)
  // /h/<id>/api/fail    a failing request (500) for the network log; /api/ok a successful one
  const m = url.pathname.match(/^\/h\/([^/]+)\/(.*)$/);
  const site = m && sites.get(m[1]!);
  const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
  if (!site) return send(404, "text/plain", "no such page");
  const rest = m![2]!;
  if (rest === "api/token") {
    const u = site.o.user();
    site.tokenCalls.push(u?.id ?? "-");
    if (!u) return send(401, "text/plain", "");
    return send(200, "application/json", JSON.stringify({ token: signOzviToken(u, site.board.secret) }));
  }
  if (rest === "api/fail") return send(500, "application/json", '{"error":"boom"}');
  if (rest === "api/ok") return send(200, "application/json", '{"ok":true}');
  if (rest.startsWith("go")) {
    // A plain link page (for SSO tests): /h/<id>/go?to=<url>&noref=1
    const to = url.searchParams.get("to") ?? "";
    return send(200, "text/html; charset=utf-8", `<!doctype html><meta charset="utf-8"><a id="go" href="${to.replace(/"/g, "&quot;")}"${url.searchParams.get("noref") ? ' rel="noreferrer"' : ""}>Spätná väzba</a>`);
  }
  const { o, board } = site;
  return send(200, "text/html; charset=utf-8", `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hostiteľská appka</title><style>body{margin:0;padding:16px;font:16px system-ui;background:#fff;color:#111}</style>${o.head ?? ""}</head>
<body>${o.body ?? "<h1>Faktúry</h1><p>Hostiteľská aplikácia</p>"}
<script>window.__ev=[];</script>
<script src="${E2E.base}/widget.js" defer></script>
<ozvi-widget project="${board.slug}"${o.noToken ? "" : ' token-url="api/token"'} app-version="2.15.0-e2e" ${o.attrs ?? ""}></ozvi-widget>
<script>addEventListener("DOMContentLoaded",function(){["open","close","submit","submitted","error"].forEach(function(n){Ozvi.on(n,function(d){window.__ev.push({name:n,detail:d})})})});</script>
</body></html>`);
}

const listen = () => new Promise<Server>((resolve) => { const s = createServer(handle); s.listen(0, "127.0.0.1", () => resolve(s)); });

/** Starts the fake host app (two origins). Call in beforeAll; stopHost in afterAll. */
export async function startHost() {
  servers = [await listen(), await listen()];
  const port = (s: Server) => (s.address() as AddressInfo).port;
  HOST = `http://app.localhost:${port(servers[0]!)}`;
  EVIL = `http://evil.localhost:${port(servers[1]!)}`;
}
export async function stopHost() { await Promise.all(servers.map((s) => new Promise((r) => s.close(r)))); }

/** Console owner → new project with SSO on and the fake host app allowed (admin → Widget → allowed origins). */
export async function boardWithSso(browser: Browser, name = "Widget E2E"): Promise<Board> {
  // The console's sign-in is rate limited per network (IP from X-Forwarded-For, one trusted proxy); specs running
  // side by side against one instance share 127.0.0.1, so this browser says it comes from its own address.
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await ctx.newPage();
  const owner = email("owner");
  await consoleLogin(page, owner);
  const slug = await createProject(page, name, uniq("w").toLowerCase());
  const ownerState = await ctx.storageState();
  await ctx.close();
  const secret = await enableSso(slug);
  const [p] = await db.update(schema.projects).set({ allowedOrigins: [HOST] }).where(eq(schema.projects.slug, slug)).returning({ id: schema.projects.id });
  return { slug, secret, owner, projectId: p!.id, ownerState };
}

/** A host-app page for this board; returns its URL base and the token endpoint calls. */
export function site(board: Board, o: HostOpts) {
  const id = uniq("s");
  const s: Site = { board, o, tokenCalls: [] };
  sites.set(id, s);
  const base = `${o.evil ? EVIL : HOST}/h/${id}/`;
  return { base, tokenCalls: s.tokenCalls };
}

/** Opens a host-app page that embeds the widget and waits for window.Ozvi. */
export async function hostApp(page: Page, board: Board, o: HostOpts) {
  const s = site(board, o);
  // The screenshot chunk always goes through here, uncacheable: WebKit may otherwise reuse a copy from an earlier
  // page and skip the (delayed) route. `shotLoads` proves the delay really applied.
  let shotLoads = 0;
  let releaseShot = () => {};
  const held = o.holdShot ? new Promise<void>((r) => { releaseShot = r; }) : null;
  await page.route(`${E2E.base}/widget-shot.js`, async (route) => {
    shotLoads++;
    if (held) await held;
    if (o.shotDelay) await new Promise((r) => setTimeout(r, o.shotDelay));
    const r = await route.fetch();
    await route.fulfill({ response: r, headers: { ...r.headers(), "cache-control": "no-store" } });
  });
  await page.goto(s.base);
  await page.waitForFunction(() => !!(window as unknown as { Ozvi?: { __?: unknown } }).Ozvi?.__);
  return { ...s, shotLoads: () => shotLoads, releaseShot: () => releaseShot() };
}

/** The widget's shadow root content (Playwright locators pierce open shadow roots). */
export const widget = (page: Page) => page.locator("ozvi-widget");
export const panel = (page: Page) => widget(page).locator(".panel");
export const launcher = (page: Page) => widget(page).locator("button.launch");

export const ozvi = (page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(([m, a]) => (window as unknown as { Ozvi: Record<string, (...x: unknown[]) => unknown> }).Ozvi[m as string]!(...(a as unknown[])), [method, args] as const);

export const events = (page: Page) => page.evaluate(() => (window as unknown as { __ev: { name: string; detail: Record<string, unknown> }[] }).__ev);

/** Inside the viewport (a 1 px tolerance for sub-pixel layout). */
export async function expectInViewport(page: Page, loc: Locator) {
  const box = (await loc.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x, "left edge").toBeGreaterThanOrEqual(-1);
  expect(box.y, "top edge").toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, "right edge").toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height, "bottom edge").toBeLessThanOrEqual(vp.height + 1);
  return box;
}

/** Items of a project, newest first (inside the project's RLS scope, like the app reads them). */
export const itemsOf = (projectId: string) =>
  withProject(db, projectId, (tx) => tx.query.items.findMany({ where: eq(schema.items.projectId, projectId), orderBy: (i, { desc }) => [desc(i.number)] }));

export const attachmentsOf = async (projectId: string, itemId: string) =>
  withProject(db, projectId, (tx) => tx.query.attachments.findMany({ where: eq(schema.attachments.itemId, itemId) }));
