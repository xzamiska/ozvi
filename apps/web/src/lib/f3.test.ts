import { createHash, createHmac } from "node:crypto";
import { createDb, schema, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
process.env.PUBLIC_URL = "https://feedback.example.com";
process.env.OZVI_CLOUD_DOMAIN = "ozvi.test";

const { normalizeDomain } = await import("./domains");
const { projectOrigin } = await import("./email/url");
const { verifyCreemSignature, planAfter, applyCreemEvent } = await import("./creem");
const { validRedirectUri, registerClient, issueCode, exchangeCode, refresh } = await import("./oauth");
const { issueLogin, verifyCode, verifyLink, issueHandoff, LoginError } = await import("./email-login");
const { mayCreateAccount } = await import("./account-rules");

describe("domains", () => {
  it("normalizes and refuses our own hosts", () => {
    expect(normalizeDomain("https://Feedback.Billiwo.com/x")).toBe("feedback.billiwo.com");
    expect(normalizeDomain("feedback.example.com")).toBeNull();
    expect(normalizeDomain("x.ozvi.test")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("bad_domain.com")).toBeNull();
  });
  it("uses a custom domain only once verified", () => {
    expect(projectOrigin({ customDomain: "f.billiwo.com", customDomainVerifiedAt: null })).toBe("https://feedback.example.com");
    expect(projectOrigin({ customDomain: "f.billiwo.com", customDomainVerifiedAt: new Date() })).toBe("https://f.billiwo.com");
  });
});

describe("creem", () => {
  it("verifies signatures and maps statuses", () => {
    const sig = createHmac("sha256", "whsec").update("{}").digest("hex");
    expect(verifyCreemSignature("whsec", "{}", sig)).toBe(true);
    expect(verifyCreemSignature("whsec", "{ }", sig)).toBe(false);
    expect(planAfter("active", "pro")).toBe("pro");
    expect(planAfter("scheduled_cancel", "pro")).toBe("pro");
    expect(planAfter("expired", "studio")).toBe("free");
    expect(planAfter("canceled", "pro")).toBe("free");
  });
});

describe("oauth redirect uris", () => {
  it("allows https and loopback http only", () => {
    expect(validRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(validRedirectUri("http://localhost:6274/cb")).toBe(true);
    expect(validRedirectUri("http://evil.com/cb")).toBe(false);
    expect(validRedirectUri("https://x.com/cb#frag")).toBe(false);
  });
});

describe("account signup rules", () => {
  it("is open in cloud, allow-listed in self-host", () => {
    expect(mayCreateAccount("a@b.sk", { OZVI_MODE: "cloud" })).toBe(true);
    expect(mayCreateAccount("a@b.sk", { OZVI_MODE: "self" })).toBe(false);
    expect(mayCreateAccount("a@b.sk", { OZVI_MODE: "self", OZVI_ADMIN_EMAILS: "x@y.sk, A@B.sk" })).toBe(true);
  });
});

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `f3-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
let user: typeof schema.users.$inferSelect;
let wsId = "";

describe.skipIf(!up)("F3 integration", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "F3", plan: "free" }).returning();
      wsId = w!.id;
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "F3", theme: presets.ozvi, customDomain: `${slug}.example.org`, customDomainVerifiedAt: new Date() }).returning())[0]!;
      user = (await tx.insert(schema.users).values({ projectId: project.id, externalId: "u", name: "Člen", role: "member" }).returning())[0]!;
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
    await db.delete(schema.loginCodes).where(eq(schema.loginCodes.email, `${slug}@x.sk`));
  });

  it("e-mail codes: wrong guesses burn the code after 5 tries", async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { lines.push(a.join(" ")); };
    await issueLogin({ db, email: `${slug}@x.sk`, projectId: project.id, linkBase: "https://x/login/link", brand: { name: "F3" } });
    console.log = orig;
    const code = /code (\d{6})/.exec(lines.join("\n"))![1]!;
    for (let i = 0; i < 5; i++) await expect(verifyCode(db, `${slug}@x.sk`, "000000" === code ? "111111" : "000000", project.id)).rejects.toBeInstanceOf(LoginError);
    await expect(verifyCode(db, `${slug}@x.sk`, code, project.id)).rejects.toThrow(/vypršal/);
  });

  it("a hand-off token is never accepted as a login link and vice versa", async () => {
    const t = await issueHandoff(db, project.id, `${slug}@x.sk`, `/${slug}/admin`);
    await expect(verifyLink(db, t, project.id, "login")).rejects.toBeInstanceOf(LoginError);
    expect((await verifyLink(db, t, project.id, "handoff")).email).toBe(`${slug}@x.sk`);
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { lines.push(a.join(" ")); };
    await issueLogin({ db, email: `${slug}-b@x.sk`, projectId: project.id, linkBase: "https://x/login/link", brand: { name: "F3" } });
    console.log = orig;
    const link = /[?&]t=([\w-]+)/.exec(lines.join("\n"))![1]!;
    await expect(verifyLink(db, link, project.id, "handoff")).rejects.toBeInstanceOf(LoginError);
    await db.delete(schema.loginCodes).where(eq(schema.loginCodes.email, `${slug}-b@x.sk`));
  });

  it("OAuth: members are capped at write, codes are single-use, refresh rotates", async () => {
    const client = await registerClient(project, { client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] });
    const verifier = "v".repeat(50);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const clientRow = await withSystem(db, (tx) => tx.query.oauthClients.findFirst({ where: eq(schema.oauthClients.clientId, client.client_id) }));
    const code = await issueCode(project, user, { clientDbId: clientRow!.id, redirectUri: "https://claude.ai/cb", challenge, scope: "triage" });
    const p = new URLSearchParams({ code, client_id: client.client_id, redirect_uri: "https://claude.ai/cb", code_verifier: verifier });
    const t = await exchangeCode(project, p);
    expect(t.scope).toBe("write");
    await expect(exchangeCode(project, p)).rejects.toThrow(/invalid or expired/);
    const r = await refresh(project, new URLSearchParams({ refresh_token: t.refresh_token, client_id: client.client_id }));
    expect(r.access_token).not.toBe(t.access_token);
    await expect(refresh(project, new URLSearchParams({ refresh_token: t.refresh_token, client_id: client.client_id }))).rejects.toThrow(/already used/);
    // Reuse revoked the whole family, including the pair it was rotated into.
    await expect(refresh(project, new URLSearchParams({ refresh_token: r.refresh_token, client_id: client.client_id }))).rejects.toThrow(/invalid/);
  });

  it("Creem: checkout upgrades, expiry downgrades and unverifies the custom domain", async () => {
    const cfg = { apiKey: "k", webhookSecret: "s", base: "", products: { pro_year: "prod_pro_y", pro_quarter: undefined, studio_year: undefined, studio_quarter: undefined } };
    expect(await applyCreemEvent(cfg, { id: "e1", eventType: "checkout.completed", object: {
      metadata: { workspace_id: wsId }, customer: { id: "cust_1" }, product: { id: "prod_pro_y" },
      subscription: { id: "sub_1", status: "active", product: { id: "prod_pro_y" }, customer: { id: "cust_1" }, current_period_end_date: "2027-11-07T00:00:00Z" },
    } })).toContain("pro");
    let ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, wsId) });
    expect(ws).toMatchObject({ plan: "pro", creemCustomerId: "cust_1", creemSubscriptionId: "sub_1" });
    expect(await applyCreemEvent(cfg, { id: "e2", eventType: "subscription.expired", created_at: Date.now() + 1000, object: { id: "sub_1", status: "active", product: { id: "prod_pro_y" } } })).toContain("free");
    ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, wsId) });
    expect(ws?.plan).toBe("free");
    expect(await applyCreemEvent(cfg, { id: "e3", eventType: "subscription.active", created_at: Date.now() - 60_000, object: { id: "sub_1", status: "active", product: { id: "prod_pro_y" } } })).toBe("older than last applied event");
    const p = await db.query.projects.findFirst({ where: eq(schema.projects.id, project.id) });
    expect(p?.customDomainVerifiedAt).toBeNull();
  });
});
