import { createHmac } from "node:crypto";
import { createDb, encryptSecret, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { effectiveScope, newToken, parseToken, authenticateToken } = await import("./tokens");
const { mcpBackend } = await import("./mcp-backend");
const { handleGithubEvent, getGithub, parseIssueRef, verifyGithubSignature } = await import("./github");
const { webhookTick, sign, isPrivateAddress, checkTarget } = await import("./webhooks");

describe("tokens", () => {
  it("round-trips the project slug and caps member scope", () => {
    const t = newToken("billiwo-app");
    expect(parseToken(t.token)).toEqual({ slug: "billiwo-app" });
    for (let i = 0; i < 200; i++) expect(parseToken(newToken("a-b").token)).toEqual({ slug: "a-b" });
    expect(parseToken("ozvi_pat_x_short")).toBeNull();
    expect(effectiveScope("triage", "member")).toBe("write");
    expect(effectiveScope("triage", "team")).toBe("triage");
  });
});

describe("github helpers", () => {
  it("parses issue references", () => {
    expect(parseIssueRef("https://github.com/a/b/issues/12", "x/y")).toEqual({ repo: "a/b", number: 12 });
    expect(parseIssueRef("#7", "x/y")).toEqual({ repo: "x/y", number: 7 });
    expect(parseIssueRef("a/b#3", "x/y")).toEqual({ repo: "a/b", number: 3 });
    expect(parseIssueRef("nonsense", "x/y")).toBeNull();
    expect(parseIssueRef("../orgs#1", "x/y")).toBeNull();
    expect(parseIssueRef("a/..#1", "x/y")).toBeNull();
  });
  it("verifies signatures", () => {
    const sig = `sha256=${createHmac("sha256", "s").update("body").digest("hex")}`;
    expect(verifyGithubSignature("s", "body", sig)).toBe(true);
    expect(verifyGithubSignature("s", "body2", sig)).toBe(false);
  });
});

describe("webhook target checks", () => {
  it("blocks internal addresses in cloud", async () => {
    expect(isPrivateAddress("10.0.0.5")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    for (const ip of ["198.18.0.1", "224.0.0.1", "255.255.255.255", "100.64.1.1", "64:ff9b::a00:1", "fe80::1", "fec0::1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["198.20.0.1", "100.128.0.1", "2a01:4f8::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
    expect(await checkTarget("http://localhost:9/x", "cloud")).toMatch(/https/);
    expect(await checkTarget("https://127.0.0.1/x", "cloud")).toMatch(/internej/);
    expect(await checkTarget("http://10.0.0.1/x", "self")).toBeNull();
    // The connection-time lookup refuses names that resolve to internal addresses (DNS rebinding).
    const { guardedLookup } = await import("./net");
    const err = await new Promise<Error | null>((r) => guardedLookup("localhost", {}, (e) => r(e)));
    expect(err?.message).toMatch(/internej/);
  });
});

// Integration against the dev database (skipped without it).
const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `f2-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
let team: typeof schema.users.$inferSelect;
let member: typeof schema.users.$inferSelect;
let other: typeof schema.users.$inferSelect;

describe.skipIf(!up)("F2 integration", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "F2" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "F2 test", theme: presets.ozvi, itemSeq: 3 }).returning())[0]!;
      const people = await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "t", name: "Tím", email: "t@x.sk", role: "team" },
        { projectId: project.id, externalId: "m", name: "Člen", email: "m@x.sk" },
        { projectId: project.id, externalId: "o", name: "Iný", email: "o@x.sk" },
      ]).returning();
      [team, member, other] = people as [typeof team, typeof team, typeof team];
      await tx.insert(schema.items).values([
        { projectId: project.id, kind: "idea", number: 1, title: "Export faktúr do Pohody", status: "open", authorId: member.id, voteCount: 2 },
        { projectId: project.id, kind: "idea", number: 2, title: "Export do Pohody (XML)", status: "open", authorId: other.id, voteCount: 1 },
        { projectId: project.id, kind: "bug", number: 3, title: "PDF bez diakritiky", status: "confirmed", authorId: other.id },
      ]);
      const [i1, i2] = await tx.select().from(schema.items).where(eq(schema.items.projectId, project.id)).orderBy(schema.items.number);
      await tx.insert(schema.votes).values([
        { projectId: project.id, itemId: i1!.id, userId: member.id }, { projectId: project.id, itemId: i1!.id, userId: other.id },
        { projectId: project.id, itemId: i2!.id, userId: other.id },
      ]);
      await tx.insert(schema.webhooks).values({ projectId: project.id, url: "https://hooks.example.com/x", secretEnc: encryptSecret("hooksecret"), includeBugs: true });
      await tx.insert(schema.integrations).values({ projectId: project.id, provider: "github", config: { repo: "acme/app", onClose: "release" }, tokenEnc: encryptSecret("ghp_x"), webhookSecretEnc: encryptSecret("ghsecret") });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("authenticates tokens and rejects revoked ones", async () => {
    const t = newToken(slug);
    await withProject(db, project.id, (tx) => tx.insert(schema.apiTokens).values({ projectId: project.id, userId: member.id, name: "x", hash: t.hash, prefix: t.prefix, scope: "triage" }));
    const auth = await authenticateToken(`Bearer ${t.token}`);
    expect(auth?.user.id).toBe(member.id);
    expect(auth?.scope).toBe("write");
    await withProject(db, project.id, (tx) => tx.update(schema.apiTokens).set({ revokedAt: new Date() }).where(eq(schema.apiTokens.hash, t.hash)));
    expect(await authenticateToken(`Bearer ${t.token}`)).toBeNull();
  });

  it("members never see other people's bugs through MCP", async () => {
    const b = await mcpBackend({ project, user: member, scope: "write", tokenId: "a" });
    const all = await b.search({ sort: "new", limit: 50 });
    expect(all.map((i) => i.number).sort()).toEqual([1, 2]);
    expect(await b.get(3)).toBeNull();
    const tb = await mcpBackend({ project, user: team, scope: "triage", tokenId: "b" });
    expect((await tb.get(3))?.item.title).toBe("PDF bez diakritiky");
  });

  it("finds duplicates by fuzzy text and merges votes", async () => {
    const b = await mcpBackend({ project, user: team, scope: "triage", tokenId: "c" });
    const sim = await b.similar({ number: 2, limit: 5 });
    expect(sim[0]?.number).toBe(1);
    const r = await b.merge(2, 1);
    expect(r.target.votes).toBe(2); // "other" voted on both → counted once
    const searched = await b.search({ query: "pohody", sort: "new", limit: 10 });
    expect(searched.map((i) => i.number)).toEqual([1]);
  });

  it("GitHub: issue closed + release → fixed in version, reporter e-mailed, webhook queued", async () => {
    const bug = await withProject(db, project.id, (tx) => tx.query.items.findFirst({ where: eq(schema.items.number, 3) }));
    await withProject(db, project.id, (tx) => tx.insert(schema.itemLinks).values({ projectId: project.id, itemId: bug!.id, provider: "github", ref: "acme/app#40", url: "https://github.com/acme/app/issues/40" }));
    await withProject(db, project.id, async (tx) => {
      const g = (await getGithub(tx))!;
      expect(await handleGithubEvent(tx, project, g, "issues", { action: "closed", issue: { number: 40, html_url: "", title: "t", state: "closed", closed_at: new Date(Date.now() - 60_000).toISOString(), state_reason: "completed" }, repository: { full_name: "acme/app" } })).toBe("closed");
      expect(await handleGithubEvent(tx, project, g, "release", { action: "published", release: { tag_name: "v2.15.1", name: null, html_url: "", published_at: new Date().toISOString(), prerelease: false, draft: false }, repository: { full_name: "acme/app" } })).toBe("release 2.15.1: 1 item(s), draft");
    });
    const after = await withProject(db, project.id, (tx) => tx.query.items.findFirst({ where: eq(schema.items.number, 3) }));
    expect(after).toMatchObject({ status: "fixed", fixedInVersion: "2.15.1" });
    const mails = await withProject(db, project.id, (tx) => tx.select().from(schema.emails).where(eq(schema.emails.kind, "bug_status")));
    expect(mails.map((m) => m.to)).toEqual(["o@x.sk"]);
  });

  it("a reopened bug is not marked fixed again by the next release", async () => {
    const bug = (await withProject(db, project.id, (tx) => tx.query.items.findFirst({ where: eq(schema.items.number, 3) })))!;
    const { changeStatus } = await import("./domain");
    await withProject(db, project.id, (tx) => changeStatus(tx, project, team, bug, "confirmed"));
    await withProject(db, project.id, async (tx) => {
      const g = (await getGithub(tx))!;
      expect(await handleGithubEvent(tx, project, g, "release", { action: "published", release: { tag_name: "2.16.0", name: null, html_url: "", published_at: new Date().toISOString(), prerelease: false, draft: false }, repository: { full_name: "acme/app" } })).toBe("release 2.16.0: 0 item(s)");
    });
  });

  it("merging a bug does not reveal the original to the duplicate's reporter", async () => {
    const { mergeItems } = await import("./domain");
    await withProject(db, project.id, async (tx) => {
      const [a] = await tx.insert(schema.items).values({ projectId: project.id, kind: "bug", number: 10, title: "Tajný názov B", status: "new", authorId: member.id }).returning();
      const [b] = await tx.insert(schema.items).values({ projectId: project.id, kind: "bug", number: 11, title: "Duplicitný", status: "new", authorId: other.id }).returning();
      await mergeItems(tx, project, team, b!, a!);
      const cs = await tx.select().from(schema.comments).where(eq(schema.comments.itemId, b!.id));
      expect(cs.map((c) => c.body).join()).not.toContain("Tajný");
    });
  });

  it("delivers signed webhooks", async () => {
    const got: { body: string; sig: string }[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      got.push({ body: String(init.body), sig: (init.headers as Record<string, string>)["ozvi-signature"]! });
      return new Response("ok");
    }) as typeof fetch;
    let n = 0;
    while ((await webhookTick(db, fake)) > 0 && n++ < 20);
    const mine = got.filter((g) => g.body.includes(slug));
    expect(mine.map((g) => JSON.parse(g.body).event)).toEqual(expect.arrayContaining(["item.merged", "item.status_changed"]));
    const t = /t=(\d+)/.exec(mine[0]!.sig)![1]!;
    expect(mine[0]!.sig).toBe(sign("hooksecret", mine[0]!.body, Number(t)));
  });
});
