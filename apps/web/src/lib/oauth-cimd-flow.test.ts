import { createHash } from "node:crypto";
import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
process.env.PUBLIC_URL = "https://feedback.example.com";

/**
 * The authorize → consent → token flow for a Client ID Metadata Document client, against the real
 * DB, with the network (metadata fetch) and the Next request context mocked.
 */

const ORIGIN = "https://feedback.example.com";
const CLIENT = "https://mcp-client.example.com/oauth/client.json";
const REDIRECT = "https://mcp-client.example.com/callback";

const ctx = vi.hoisted(() => ({ value: undefined as unknown }));
const fetched = vi.hoisted(() => ({ calls: [] as { url: string; mode?: string }[], doc: undefined as unknown }));

vi.mock("./net", async (orig) => ({
  ...(await orig<typeof import("./net")>()),
  safeFetch: async (url: string, _init: RequestInit, mode?: string) => {
    fetched.calls.push({ url, mode });
    return new Response(JSON.stringify(fetched.doc), { headers: { "content-type": "application/json", "cache-control": "max-age=300" } });
  },
}));
vi.mock("./project", async (orig) => ({ ...(await orig<typeof import("./project")>()), getCtx: async () => ctx.value }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "feedback.example.com" }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));

const { decideOAuth } = await import("./oauth-actions");
const { clearCimdCache } = await import("./oauth-cimd");
const { authenticateToken } = await import("./tokens");
const { POST: tokenPost } = await import("../app/[project]/oauth/token/route");

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `cimd-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
let other: typeof schema.projects.$inferSelect;
let user: typeof schema.users.$inferSelect;

const verifier = "v".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

async function consent(p: { clientId?: string; redirectUri?: string; decision?: string; scope?: string } = {}) {
  try {
    await decideOAuth(slug, { clientId: p.clientId ?? CLIENT, redirectUri: p.redirectUri ?? REDIRECT, state: "st", challenge }, form({ decision: p.decision ?? "allow", scope: p.scope ?? "write" }));
  } catch (e) {
    if ((e as { url?: string }).url) return new URL((e as { url: string }).url);
    throw e;
  }
  throw new Error("expected a redirect");
}

const reuseLog = async () => (await db.select().from(schema.activity).where(eq(schema.activity.projectId, project.id))).filter((a) => a.action === "token.oauth_reuse");

const token = (s: string, body: Record<string, string>) => tokenPost(
  new NextRequest(`${ORIGIN}/${s}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() }),
  { params: Promise.resolve({ project: s }) },
);

describe.skipIf(!up)("CIMD authorize flow", () => {
  beforeAll(async () => {
    clearCimdCache();
    fetched.doc = { client_id: CLIENT, client_name: "Example Agent", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" };
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "CIMD", plan: "free" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "CIMD", theme: presets.ozvi }).returning())[0]!;
      other = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug: `${slug}-b`, name: "CIMD B", theme: presets.ozvi }).returning())[0]!;
      user = (await tx.insert(schema.users).values({ projectId: project.id, externalId: "u", name: "Člen", role: "member" }).returning())[0]!;
    });
    ctx.value = { project, user, locale: "en" };
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("refuses a redirect_uri the metadata document doesn't list, before writing anything", async () => {
    await expect(consent({ redirectUri: "https://mcp-client.example.com/other" })).rejects.toThrow("invalid");
    const rows = await withProject(db, project.id, (tx) => tx.select().from(schema.oauthClients).where(eq(schema.oauthClients.clientId, CLIENT)));
    expect(rows).toHaveLength(0);
  });

  it("denial redirects back with access_denied and iss", async () => {
    const back = await consent({ decision: "deny" });
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("iss")).toBe(`${ORIGIN}/${slug}`);
    expect(back.searchParams.get("state")).toBe("st");
  });

  it("consent → code → token → MCP, with SSRF-guarded fetch, audience binding and rotation", async () => {
    const back = await consent();
    expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
    expect(back.searchParams.get("iss")).toBe(`${ORIGIN}/${slug}`);
    const code = back.searchParams.get("code")!;
    expect(code).toBeTruthy();
    // Fetched through safeFetch in "cloud" mode (no internal addresses) even on a self-hosted instance.
    expect(fetched.calls.length).toBeGreaterThan(0);
    expect(fetched.calls.every((c) => c.url === CLIENT && c.mode === "cloud")).toBe(true);

    const base = { grant_type: "authorization_code", code, client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: verifier };
    // RFC 8707: a resource that isn't this board's MCP server is refused before the code is touched.
    const wrong = await token(slug, { ...base, resource: `${ORIGIN}/${other.slug}/mcp` });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toBe("invalid_target");

    const ok = await token(slug, { ...base, resource: `${ORIGIN}/${slug}/mcp` });
    expect(ok.status).toBe(200);
    const t = await ok.json();
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "write" });

    const auth = await authenticateToken(`Bearer ${t.access_token}`);
    expect(auth).toMatchObject({ oauth: true, scope: "write" });
    expect(auth!.project.id).toBe(project.id);
    const row = await withProject(db, project.id, (tx) => tx.query.apiTokens.findFirst({ where: eq(schema.apiTokens.id, auth!.tokenId) }));
    expect(row!.name).toBe("Example Agent (OAuth, mcp-client.example.com)");

    // The code is single-use.
    expect((await token(slug, base)).status).toBe(400);

    // Refresh rotates: the old refresh token dies with its access token.
    const r = await token(slug, { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: CLIENT });
    expect(r.status).toBe(200);
    expect((await token(slug, { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: CLIENT })).status).toBe(400);
    expect(await authenticateToken(`Bearer ${t.access_token}`)).toBeNull();
  });

  it("refresh token reuse revokes the whole family and is logged (RFC 9700 §4.14.2)", async () => {
    const before = (await reuseLog()).length;
    const back = await consent();
    const t1 = await (await token(slug, { grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: verifier })).json();
    const t2 = await (await token(slug, { grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: CLIENT })).json();
    const t3 = await (await token(slug, { grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: CLIENT })).json();
    expect(await authenticateToken(`Bearer ${t3.access_token}`)).not.toBeNull();
    // A separate grant (another connection of the same client) must survive.
    const other = await consent();
    const o1 = await (await token(slug, { grant_type: "authorization_code", code: other.searchParams.get("code")!, client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: verifier })).json();

    const replay = await token(slug, { grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: CLIENT });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant", error_description: expect.stringMatching(/already used/) });
    expect(await authenticateToken(`Bearer ${t3.access_token}`)).toBeNull();
    expect((await token(slug, { grant_type: "refresh_token", refresh_token: t3.refresh_token, client_id: CLIENT })).status).toBe(400);
    expect(await authenticateToken(`Bearer ${o1.access_token}`)).not.toBeNull();

    const log = await reuseLog();
    expect(log).toHaveLength(before + 1);
    expect(log.at(-1)).toMatchObject({ detail: "Example Agent (OAuth, mcp-client.example.com)", actor: "Člen" });
  });

  it("a token revoked by its owner just stops refreshing (no reuse alarm)", async () => {
    const before = (await reuseLog()).length;
    const back = await consent();
    const t1 = await (await token(slug, { grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: verifier })).json();
    const auth = await authenticateToken(`Bearer ${t1.access_token}`);
    await withProject(db, project.id, (tx) => tx.update(schema.apiTokens).set({ revokedAt: new Date() }).where(eq(schema.apiTokens.id, auth!.tokenId)));
    const res = await token(slug, { grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: CLIENT });
    expect(await res.json()).toMatchObject({ error: "invalid_grant", error_description: expect.stringMatching(/invalid, revoked or expired/) });
    expect(await reuseLog()).toHaveLength(before);
  });

  it("the same client_id URL can be used on several boards (client rows are per project)", async () => {
    ctx.value = { project: other, user: (await withSystem(db, (tx) => tx.insert(schema.users).values({ projectId: other.id, externalId: "u", name: "B", role: "member" }).returning()))[0], locale: "en" };
    try {
      await expect(decideOAuth(other.slug, { clientId: CLIENT, redirectUri: REDIRECT, state: "", challenge }, form({ decision: "allow" })))
        .rejects.toMatchObject({ url: expect.stringContaining("code=") });
      const a = await withProject(db, project.id, (tx) => tx.select().from(schema.oauthClients).where(eq(schema.oauthClients.clientId, CLIENT)));
      const b = await withProject(db, other.id, (tx) => tx.select().from(schema.oauthClients).where(eq(schema.oauthClients.clientId, CLIENT)));
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
      expect(a[0]!.id).not.toBe(b[0]!.id);
    } finally {
      ctx.value = { project, user, locale: "en" };
    }
  });

  it("legacy DCR clients still work", async () => {
    const { registerClient } = await import("./oauth");
    const reg = await registerClient(project, { client_name: "Old client", redirect_uris: ["http://127.0.0.1:9999/cb"] });
    expect(reg.client_id).toMatch(/^ozvi_client_/);
    const back = await consent({ clientId: reg.client_id, redirectUri: "http://127.0.0.1:9999/cb" });
    const res = await token(slug, { grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: reg.client_id, redirect_uri: "http://127.0.0.1:9999/cb", code_verifier: verifier });
    expect(res.status).toBe(200);
  });
});
