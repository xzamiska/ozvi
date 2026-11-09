import { createDb, encryptSecret, schema, withProject, withSystem } from "@ozvi/db";
import { signOzviToken } from "@ozvi/sdk";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clampLimit, parseVote, readCors, searchWords, writeAllowed } from "./widget-rules";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

describe("widget read API rules", () => {
  it("search words: 3+ letters, lowercased, at most 6", () => {
    expect(searchWords("Export do CSV a PDF")).toEqual(["export", "csv", "pdf"]);
    expect(searchWords("a b")).toEqual([]);
    expect(searchWords("one two six ten abc def ghi")).toHaveLength(6);
    expect(searchWords(null)).toEqual([]);
  });
  it("limits stay within bounds", () => {
    expect(clampLimit("7", 5, 20)).toBe(7);
    expect(clampLimit("999", 5, 20)).toBe(20);
    expect(clampLimit("-3", 5, 20)).toBe(1);
    expect(clampLimit("x", 5, 20)).toBe(5);
    expect(clampLimit(null, 5, 20)).toBe(5);
  });
  it("CORS: trusted origins may send the token, everybody else reads public data only", () => {
    const allowed = ["https://app.acme.sk"];
    const own = ["https://feedback.acme.sk"];
    const t = readCors(allowed, own, "https://app.acme.sk");
    expect(t.trusted).toBe(true);
    expect(t.headers["access-control-allow-origin"]).toBe("https://app.acme.sk");
    expect(t.headers["access-control-allow-headers"]).toContain("authorization");
    const o = readCors(allowed, own, "https://evil.example");
    expect(o.trusted).toBe(false);
    expect(o.headers["access-control-allow-origin"]).toBe("*");
    expect(o.headers["access-control-allow-headers"]).toBeUndefined();
    expect(writeAllowed(allowed, own, "https://evil.example")).toBe(false);
    expect(writeAllowed(allowed, own, "https://feedback.acme.sk")).toBe(true);
    expect(writeAllowed(allowed, own, null)).toBe(true);
  });
  it("vote body needs an item id and a numeric weight", () => {
    const id = "0f3c2a9d-1111-4222-8333-444455556666";
    expect(parseVote({ id, weight: 2 })).toEqual({ id, weight: 2 });
    expect(parseVote({ id, weight: "2" })).toBeNull();
    expect(parseVote({ id: "1; drop", weight: 1 })).toBeNull();
    expect(parseVote(null)).toBeNull();
  });
});

// Integration against the dev database (skipped without it): the route handlers themselves.
const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1 from projects limit 0`).then(() => true, () => false);
const slug = `wapi-${Date.now()}`;
const secret = "widget-api-test-secret-0123456789";
const origin = "https://app.wapi.test";

describe.skipIf(!up)("widget ideas, vote, roadmap and changelog routes", async () => {
  const { createItemFor } = await import("./items");
  const ideas = await import("@/app/[project]/api/widget/ideas/route");
  const vote = await import("@/app/[project]/api/widget/vote/route");
  const roadmap = await import("@/app/[project]/api/widget/roadmap/route");
  const changelog = await import("@/app/[project]/api/widget/changelog/route");
  let project: typeof schema.projects.$inferSelect;
  let a: number, pendingNo: number;
  const params = { params: Promise.resolve({ project: slug }) };
  const tok = (id: string) => signOzviToken({ id, name: id }, secret);
  const req = (path: string, init: { token?: string; origin?: string; method?: string; body?: unknown } = {}) =>
    new NextRequest(`http://localhost:3300/${slug}/api/widget/${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.origin && { origin: init.origin }),
        ...(init.token && { authorization: `Bearer ${init.token}` }),
        ...(init.body !== undefined && { "content-type": "application/json" }),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  beforeAll(async () => {
    const [author, team] = await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Widget API" }).returning();
      project = (await tx.insert(schema.projects).values({
        workspaceId: w!.id, slug, name: "Widget API", theme: presets.ozvi, ssoSecretEnc: encryptSecret(secret),
        allowedOrigins: [origin], voteBudget: 2, moderateIdeas: true,
      }).returning())[0]!;
      return tx.insert(schema.users).values([
        { projectId: project.id, externalId: "author", name: "Autor" },
        { projectId: project.id, externalId: "team", name: "Tím", role: "team" },
      ]).returning();
    });
    // Team ideas skip the moderation queue; the member's idea waits for approval.
    a = await createItemFor(project, team!, { kind: "idea", title: "Export faktúr do CSV", body: "", context: null, files: [] });
    await createItemFor(project, team!, { kind: "idea", title: "Tmavý režim", body: "", context: null, files: [] });
    pendingNo = await createItemFor(project, author!, { kind: "idea", title: "Export do Pohody čaká", body: "", context: null, files: [] });
    await createItemFor(project, author!, { kind: "bug", title: "Export padá", body: "", context: null, files: [] });
    await withProject(db, project.id, async (tx) => {
      await tx.insert(schema.changelogEntries).values({ projectId: project.id, title: "Nový export", body: "**Hotovo** <script>x</script>", publishedAt: new Date() });
      await tx.insert(schema.changelogEntries).values({ projectId: project.id, title: "Koncept", body: "draft" });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("lists active ideas to anyone on a public board, never bugs or others' queued ideas", async () => {
    const r = await ideas.GET(req("ideas", { origin: "https://elsewhere.example" }), params);
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const d = await r.json();
    expect(d.ideas.map((i: { title: string }) => i.title).sort()).toEqual(["Export faktúr do CSV", "Tmavý režim"]);
    expect(d.signedIn).toBe(false);
    expect(d.budget).toEqual({ total: 2, left: null });
  });

  it("search finds similar ideas; the author also sees their own queued idea", async () => {
    const anon = await (await ideas.GET(req("ideas?q=export"), params)).json();
    expect(anon.ideas.map((i: { number: number }) => i.number)).toEqual([a]);
    const mine = await (await ideas.GET(req("ideas?q=export", { token: tok("author"), origin }), params)).json();
    expect(mine.ideas.map((i: { number: number }) => i.number).sort()).toEqual([a, pendingNo].sort());
    expect(mine.ideas.find((i: { number: number }) => i.number === pendingNo).pending).toBe(true);
  });

  it("votes with the SSO token, respects the budget, and rejects other origins and bad tokens", async () => {
    const list = await (await ideas.GET(req("ideas", { token: tok("voter"), origin }), params)).json();
    const [x, y] = list.ideas as { id: string }[];
    const ok = await vote.POST(req("vote", { method: "POST", token: tok("voter"), origin, body: { id: x!.id, weight: 5 } }), params);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ weight: 1, votes: 1, left: 1 });
    await vote.POST(req("vote", { method: "POST", token: tok("voter"), origin, body: { id: y!.id, weight: 1 } }), params);
    const after = await (await ideas.GET(req("ideas", { token: tok("voter"), origin }), params)).json();
    expect(after.budget.left).toBe(0);
    expect(after.ideas.every((i: { weight: number }) => i.weight === 1)).toBe(true);
    // Budget spent: a third active idea would not fit (re-voting the same idea is fine).
    const again = await vote.POST(req("vote", { method: "POST", token: tok("voter"), origin, body: { id: x!.id, weight: 1 } }), params);
    expect(again.status).toBe(200);

    const foreign = await vote.POST(req("vote", { method: "POST", token: tok("voter"), origin: "https://evil.example", body: { id: x!.id, weight: 0 } }), params);
    expect(foreign.status).toBe(403);
    const anon = await vote.POST(req("vote", { method: "POST", origin, body: { id: x!.id, weight: 1 } }), params);
    expect(anon.status).toBe(401);
    const forged = await vote.POST(req("vote", { method: "POST", token: signOzviToken({ id: "x" }, "wrong-secret-wrong-secret-0123456789"), origin, body: { id: x!.id, weight: 1 } }), params);
    expect(forged.status).toBe(401);
  });

  it("private boards answer only to a signed-in person", async () => {
    await db.update(schema.projects).set({ ideasPublic: false }).where(eq(schema.projects.id, project.id));
    try {
      expect((await roadmap.GET(req("roadmap"), params)).status).toBe(401);
      expect((await changelog.GET(req("changelog", { token: tok("author"), origin }), params)).status).toBe(200);
    } finally {
      await db.update(schema.projects).set({ ideasPublic: true }).where(eq(schema.projects.id, project.id));
    }
  });

  it("roadmap lanes and published changelog entries with safe HTML", async () => {
    const rm = await (await roadmap.GET(req("roadmap?lang=en"), params)).json();
    expect(rm.lanes.map((l: { status: string }) => l.status)).toEqual(["planned", "in_progress", "shipped"]);
    expect(rm.lanes[0].label).toBeTruthy();
    const cl = await (await changelog.GET(req("changelog?limit=5"), params)).json();
    expect(cl.entries).toHaveLength(1);
    expect(cl.entries[0].html).toContain("<strong>Hotovo</strong>");
    expect(cl.entries[0].html).not.toContain("<script>");
    expect(cl.entries[0].ai).toBe(false);
  });
});
