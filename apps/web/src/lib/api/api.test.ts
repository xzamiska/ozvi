import { createDb, encryptSecret, newSecret, schema, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OZVI_AI_PROVIDER;
delete process.env.OZVI_AI_API_KEY;

const { handleApi } = await import("./handler");
const { openApiSpec } = await import("./openapi");
const { ROUTES } = await import("./routes");
const { take, LIMITS } = await import("../ratelimit");
const { newToken } = await import("../tokens");
const { claim, settle, fingerprint } = await import("./idempotency");
const S = await import("./schemas");

/* ---------- pure parts ---------- */

describe("openapi", () => {
  const spec = openApiSpec("https://ozvi.test/acme/api/v1") as Record<string, any>;

  it("is OpenAPI 3.1 with every route and resolvable $refs", () => {
    expect(spec.openapi).toBe("3.1.0");
    for (const r of ROUTES) expect(spec.paths[r.path]?.[r.method.toLowerCase()]?.operationId, `${r.method} ${r.path}`).toBe(r.id);
    const ids = new Set(ROUTES.map((r) => r.id));
    expect(ids.size).toBe(ROUTES.length);
    const refs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "$ref") refs.push(x as string); else walk(x); }
    };
    walk(spec);
    expect(refs.length).toBeGreaterThan(20);
    for (const r of refs) {
      expect(r.startsWith("#/"), r).toBe(true);
      const target = r.slice(2).split("/").reduce<any>((o, k) => o?.[k], spec);
      expect(target, r).toBeDefined();
    }
  });

  it("declares path params for every {param} and documents problems", () => {
    for (const [path, ops] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
      const want = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const op of Object.values(ops)) {
        const got = op.parameters.filter((p: any) => p.in === "path").map((p: any) => p.name);
        expect(got.sort()).toEqual(want.sort());
        expect(op.responses["401"]).toBeDefined();
        expect(op.responses["429"]).toBeDefined();
      }
    }
    expect(spec.components.schemas.Problem.properties.code).toBeDefined();
    expect(spec.components.schemas.Item.properties.author).toEqual({ $ref: "#/components/schemas/Author" });
  });

  it("round-trips through JSON", () => {
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
  });
});

describe("rate limit state", () => {
  it("counts down and reports the reset", () => {
    const t = 5_000_000;
    const a = take("api", "rl-unit", t);
    expect(a).toMatchObject({ ok: true, limit: LIMITS.api.max, remaining: LIMITS.api.max - 1 });
    expect(a.resetSeconds).toBe(LIMITS.api.windowMs / 1000);
    for (let i = 1; i < LIMITS.api.max; i++) take("api", "rl-unit", t);
    const b = take("api", "rl-unit", t + 1000);
    expect(b).toMatchObject({ ok: false, remaining: 0 });
    expect(b.resetSeconds).toBe(LIMITS.api.windowMs / 1000 - 1);
  });
});

describe("idempotency store", () => {
  it("replays, refuses a different request and in-flight duplicates, forgets 5xx", () => {
    const fp = fingerprint("POST", "/x", "{}");
    expect(claim("s", "k1", fp).kind).toBe("new");
    expect(claim("s", "k1", fp).kind).toBe("in_progress");
    expect(claim("s", "k1", fingerprint("POST", "/x", "{\"a\":1}")).kind).toBe("mismatch");
    settle("s", "k1", { status: 201, body: "{}", headers: {} });
    expect(claim("s", "k1", fp)).toMatchObject({ kind: "replay", result: { status: 201 } });
    expect(claim("s", "k2", fp).kind).toBe("new");
    settle("s", "k2", { status: 500, body: "", headers: {} });
    expect(claim("s", "k2", fp).kind).toBe("new");
  });
});

/* ---------- against the database ---------- */

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `api-${Date.now()}`;
const covered = new Set<string>();
let project: typeof schema.projects.$inferSelect;
const tok = { admin: "", team: "", member: "", read: "", oauth: "", adminId: "" };
let member: typeof schema.users.$inferSelect;
let draftId = "";

type Res = { status: number; headers: Headers; body: any; text: string };
async function call(method: string, path: string, o: { token?: string; body?: unknown; headers?: Record<string, string>; as?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { "content-type": "application/json" } : {}), ...o.headers };
  const url = `http://ozvi.test/${o.as ?? slug}/api/v1${path}`;
  const req = new Request(url, { method, headers, body: o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body) });
  const segs = new URL(url).pathname.split("/").slice(4).filter(Boolean);
  const res = await handleApi(req, o.as ?? slug, segs, "http://ozvi.test");
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, headers: res.headers, body, text };
}

/** Contract: a 2xx answer must parse with the documented schema and carry no undocumented fields. */
function contract(routeId: string, r: Res) {
  const route = ROUTES.find((x) => x.id === routeId)!;
  expect(r.status, `${routeId}: ${r.text.slice(0, 300)}`).toBe(route.response.status);
  covered.add(routeId);
  if (route.response.csv && !r.headers.get("content-type")?.includes("json")) return;
  const schema = route.response.schema as z.ZodType;
  const parsed = schema.safeParse(r.body);
  expect(parsed.success, `${routeId}: ${JSON.stringify(parsed.error?.issues.slice(0, 3))}`).toBe(true);
  expect(JSON.parse(JSON.stringify(parsed.data)), `${routeId}: undocumented fields`).toEqual(r.body);
}

function isProblem(r: Res, code: string, status?: number) {
  expect(r.headers.get("content-type")).toBe("application/problem+json");
  expect(r.body.code, r.text).toBe(code);
  if (status) expect(r.status).toBe(status);
  expect(r.body.type).toMatch(/\/docs\/api#error-/);
  expect(S.Problem.safeParse(r.body).success).toBe(true);
}

describe.skipIf(!up)("REST API v1", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "API" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "API test", theme: presets.ozvi, itemSeq: 9 }).returning())[0]!;
      const [admin, team, m, cust] = await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "adm", email: "adm@x.sk", name: "Admin", role: "admin" },
        { projectId: project.id, externalId: "tm", email: "tm@x.sk", name: "Team", role: "team" },
        { projectId: project.id, externalId: "mem", email: "mem@x.sk", name: "Member" },
        { projectId: project.id, externalId: "cust-1", email: "cust@acme.sk", name: "Customer", traits: { company: "Acme", plan: "pro", mrr: 4900 } },
      ]).returning();
      member = m!;
      await tx.insert(schema.items).values([
        ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ projectId: project.id, kind: "idea" as const, number: n, title: `Idea number ${n}`, status: "open" as const, authorId: cust!.id, voteCount: n % 3 })),
        { projectId: project.id, kind: "bug", number: 8, title: "Member bug", status: "new", authorId: m!.id, source: "widget" },
        { projectId: project.id, kind: "bug", number: 9, title: "Someone else's bug", status: "new", authorId: cust!.id },
      ]);
      await tx.insert(schema.tags).values([{ projectId: project.id, name: "billing" }, { projectId: project.id, name: "secret", public: false }]);
      await tx.insert(schema.webhooks).values([
        { projectId: project.id, url: "https://hooks.example.com/services/T0/B0/xyz", secretEnc: encryptSecret(newSecret()) },
        { projectId: project.id, url: "https://acme.webhook.office.com/webhookb2/secret", secretEnc: encryptSecret(newSecret()), format: "teams" },
      ]);
      const [client] = await tx.insert(schema.oauthClients).values({ projectId: project.id, clientId: "ozvi_client_test", name: "c", redirectUris: ["https://c.example/cb"] }).returning();
      const mk = async (userId: string, scope: "read" | "write" | "triage", oauth = false) => {
        const t = newToken(slug);
        const [row] = await tx.insert(schema.apiTokens).values({ projectId: project.id, userId, name: "t", hash: t.hash, prefix: t.prefix, scope, ...(oauth ? { oauthClientId: client!.id } : {}) }).returning();
        return { token: t.token, id: row!.id };
      };
      const a = await mk(admin!.id, "triage");
      tok.admin = a.token; tok.adminId = a.id;
      tok.team = (await mk(team!.id, "triage")).token;
      tok.member = (await mk(m!.id, "triage")).token; // capped to write by the member role
      tok.read = (await mk(team!.id, "read")).token;
      tok.oauth = (await mk(team!.id, "triage", true)).token;
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("serves the spec without a token", async () => {
    const r = await call("GET", "/openapi.json");
    expect(r.status).toBe(200);
    expect(r.body.servers[0].url).toBe(`http://ozvi.test/${slug}/api/v1`);
  });

  it("authenticates: missing, foreign-project and OAuth tokens are refused with problem+json", async () => {
    const none = await call("GET", "/items");
    isProblem(none, "unauthorized", 401);
    expect(none.headers.get("www-authenticate")).toMatch(/^Bearer/);
    isProblem(await call("GET", "/items", { token: "ozvi_pat_nope" }), "unauthorized", 401);
    isProblem(await call("GET", "/items", { token: tok.admin, as: "other-project" }), "token_audience", 401);
    isProblem(await call("GET", "/items", { token: tok.oauth }), "token_audience", 401);
  });

  it("whoami, rate-limit headers, 404 and 405", async () => {
    const me = await call("GET", "/me", { token: tok.member });
    contract("getMe", me);
    expect(me.body.scope).toBe("write");
    expect(me.headers.get("ratelimit-limit")).toBe(String(LIMITS.api.max));
    expect(Number(me.headers.get("ratelimit-remaining"))).toBeLessThan(LIMITS.api.max);
    expect(Number(me.headers.get("ratelimit-reset"))).toBeGreaterThan(0);
    isProblem(await call("GET", "/nope", { token: tok.read }), "not_found", 404);
    const m = await call("PUT", "/items", { token: tok.read });
    isProblem(m, "method_not_allowed", 405);
    expect(m.headers.get("allow")).toBe("GET, POST");
  });

  it("enforces scopes and role caps", async () => {
    isProblem(await call("POST", "/items", { token: tok.read, body: { kind: "idea", title: "Read token" } }), "insufficient_scope", 403);
    // A member's triage token is capped to write.
    isProblem(await call("PATCH", "/items/1", { token: tok.member, body: { status: "planned" } }), "insufficient_scope", 403);
    isProblem(await call("GET", "/items?unanswered=true", { token: tok.member }), "insufficient_scope", 403);
    isProblem(await call("POST", "/items/1/comments", { token: tok.member, body: { body: "x", internal: true } }), "insufficient_scope", 403);
    isProblem(await call("GET", "/users", { token: tok.member }), "insufficient_scope", 403);
    isProblem(await call("GET", "/webhooks", { token: tok.team }), "forbidden", 403);
  });

  it("members see ideas and their own bugs only", async () => {
    const r = await call("GET", "/items?limit=100", { token: tok.member });
    contract("listItems", r);
    const nums = r.body.data.map((i: any) => i.number);
    expect(nums).toContain(8);
    expect(nums).not.toContain(9);
    isProblem(await call("GET", "/items/9", { token: tok.member }), "not_found", 404);
    expect(r.body.data.find((i: any) => i.number === 8).source).toBe("widget");
  });

  it("paginates with cursors (new and top) without gaps or repeats", async () => {
    for (const sort of ["new", "top"]) {
      const all = (await call("GET", `/items?kind=idea&sort=${sort}&limit=100`, { token: tok.team })).body.data.map((i: any) => i.number);
      const seen: number[] = [];
      let cursor: string | null = null;
      do {
        const r: Res = await call("GET", `/items?kind=idea&sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ""}`, { token: tok.team });
        expect(r.status).toBe(200);
        seen.push(...r.body.data.map((i: any) => i.number));
        cursor = r.body.nextCursor;
      } while (cursor);
      expect(seen).toEqual(all);
      expect(all).toHaveLength(7);
    }
    const first = await call("GET", "/items?sort=new&limit=2", { token: tok.team });
    isProblem(await call("GET", `/items?sort=top&limit=2&cursor=${first.body.nextCursor}`, { token: tok.team }), "invalid_cursor", 400);
    isProblem(await call("GET", "/items?cursor=garbage", { token: tok.team }), "invalid_cursor", 400);
    isProblem(await call("GET", "/items?limit=1000", { token: tok.team }), "invalid_request", 400);
  });

  it("ETag and If-None-Match on items", async () => {
    const r = await call("GET", "/items/1", { token: tok.team });
    contract("getItem", r);
    const etag = r.headers.get("etag")!;
    expect(etag).toMatch(/^".+"$/);
    const again = await call("GET", "/items/1", { token: tok.team, headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(again.text).toBe("");
  });

  it("creates with Idempotency-Key and provenance source=api", async () => {
    const body = { kind: "idea", title: "From the API", body: "Plain **text**" };
    const a = await call("POST", "/items", { token: tok.team, body, headers: { "idempotency-key": "k-1" } });
    contract("createItem", a);
    expect(a.body).toMatchObject({ source: "api", author: { trust: "team" } });
    const b = await call("POST", "/items", { token: tok.team, body, headers: { "idempotency-key": "k-1" } });
    expect(b.status).toBe(201);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.body.number).toBe(a.body.number);
    isProblem(await call("POST", "/items", { token: tok.team, body: { ...body, title: "Another" }, headers: { "idempotency-key": "k-1" } }), "idempotency_key_reused", 422);
    isProblem(await call("POST", "/items", { token: tok.team, body: "{oops", headers: {} }), "invalid_json", 400);
    isProblem(await call("POST", "/items", { token: tok.team, body: { kind: "idea", title: "x" } }), "invalid_request", 400);
    const ct = await call("POST", "/items", { token: tok.team, body: "kind=idea", headers: { "content-type": "text/plain" } });
    isProblem(ct, "unsupported_media_type", 415);
  });

  it("updates status, sub-status and tags; lists statuses and tags", async () => {
    const st = await call("GET", "/statuses", { token: tok.read });
    contract("listStatuses", st);
    expect(st.body.idea.map((s: any) => s.key)).toContain("planned");
    const tags = await call("GET", "/tags", { token: tok.team });
    contract("listTags", tags);
    expect(tags.body.data.map((t: any) => t.name)).toContain("secret");
    expect((await call("GET", "/tags", { token: tok.member })).body.data.map((t: any) => t.name)).not.toContain("secret");
    const r = await call("PATCH", "/items/2", { token: tok.team, body: { status: "planned", tags: { add: ["billing"] } } });
    contract("updateItem", r);
    expect(r.body.item).toMatchObject({ status: "planned", tags: ["billing"] });
    isProblem(await call("PATCH", "/items/2", { token: tok.team, body: { tags: { add: ["nope"] } } }), "unprocessable", 422);
    isProblem(await call("PATCH", "/items/2", { token: tok.team, body: {} }), "invalid_request", 400);
    isProblem(await call("PATCH", "/items/999", { token: tok.team, body: { status: "planned" } }), "not_found", 404);
  });

  it("comments: create, list, internal only for the team, lockdown withholds", async () => {
    const c = await call("POST", "/items/1/comments", { token: tok.member, body: { body: "Me too" } });
    contract("createComment", c);
    expect(c.body).toMatchObject({ source: "api", internal: false });
    await call("POST", "/items/1/comments", { token: tok.team, body: { body: "Team note", internal: true } });
    const asMember = await call("GET", "/items/1/comments", { token: tok.member });
    contract("listComments", asMember);
    expect(asMember.body.data.some((x: any) => x.internal)).toBe(false);
    const asTeam = await call("GET", "/items/1/comments", { token: tok.team, headers: { "x-ozvi-lockdown": "team" } });
    expect(asTeam.body.data.some((x: any) => x.internal)).toBe(true);
    const fromMember = asTeam.body.data.find((x: any) => x.author.trust !== "team");
    expect(fromMember).toMatchObject({ withheld: true, body: "" });
    const item = await call("GET", "/items/1", { token: tok.team, headers: { "x-ozvi-lockdown": "team" } });
    expect(item.body.item.withheld).toBe(true);
  });

  it("votes on behalf of customers with the submit_insight rules", async () => {
    const byEmail = await call("POST", "/items/3/votes", { token: tok.team, body: { email: "New.Person@example.com", company: "Globex" } });
    contract("castVote", byEmail);
    expect(byEmail.body).toMatchObject({ voted: true, customer: { known: false, trust: "anonymous" } });
    const again = await call("POST", "/items/3/votes", { token: tok.team, body: { email: "new.person@example.com" } });
    expect(again.body).toMatchObject({ voted: false, reason: "already_voted" });
    const author = await call("POST", "/items/3/votes", { token: tok.team, body: { externalId: "cust-1" } });
    expect(author.body).toMatchObject({ voted: false, reason: "author" });
    const known = await call("POST", "/items/3/votes", { token: tok.team, body: { externalId: "mem" } });
    expect(known.body).toMatchObject({ voted: true, customer: { known: true, trust: "sso_customer" } });
    isProblem(await call("POST", "/items/3/votes", { token: tok.team, body: { externalId: "ghost" } }), "not_found", 404);
    isProblem(await call("POST", "/items/8/votes", { token: tok.team, body: { externalId: "mem" } }), "unprocessable", 422);
    isProblem(await call("POST", "/items/3/votes", { token: tok.team, body: {} }), "invalid_request", 400);
    const voters = await call("GET", "/items/3/votes", { token: tok.team });
    contract("listVoters", voters);
    expect(voters.body.data).toHaveLength(2);
    const rm = await call("DELETE", "/items/3/votes?externalId=mem", { token: tok.team });
    contract("removeVote", rm);
    expect(rm.body.removed).toBe(true);
  });

  it("merge needs the confirmation code", async () => {
    const first = await call("POST", "/items/5/merge", { token: tok.team, body: { into: 4 } });
    isProblem(first, "confirmation_required", 409);
    expect(first.body.preview.duplicate.number).toBe(5);
    isProblem(await call("POST", "/items/5/merge", { token: tok.team, body: { into: 4, confirm: "wrong" } }), "confirmation_invalid", 422);
    const done = await call("POST", "/items/5/merge", { token: tok.team, body: { into: 4, confirm: first.body.confirm } });
    contract("mergeItem", done);
    expect(done.body.duplicate.status).toBe("declined");
  });

  it("changelog: draft, list, get, publish only with confirm", async () => {
    const d = await call("POST", "/changelog", { token: tok.team, body: { title: "Shipped via API", body: "Hello", items: [6] }, headers: { "idempotency-key": "draft-1" } });
    contract("createDraft", d);
    expect(d.body.status).toBe("draft");
    draftId = d.body.id;
    isProblem(await call("GET", `/changelog/${draftId}`, { token: tok.member }), "not_found", 404);
    contract("getChangelogEntry", await call("GET", `/changelog/${draftId}`, { token: tok.team }));
    contract("listChangelog", await call("GET", "/changelog?drafts=true", { token: tok.team }));
    isProblem(await call("GET", "/changelog?drafts=true", { token: tok.member }), "insufficient_scope", 403);
    const p0 = await call("POST", `/changelog/${draftId}/publish`, { token: tok.team, body: {} });
    isProblem(p0, "confirmation_required", 409);
    expect(p0.body.preview.title).toBe("Shipped via API");
    const p1 = await call("POST", `/changelog/${draftId}/publish`, { token: tok.team, body: { confirm: true } });
    contract("publishChangelogEntry", p1);
    const item = await call("GET", "/items/6", { token: tok.team });
    expect(item.body.item.status).toBe("shipped");
    isProblem(await call("GET", "/changelog/not-a-uuid", { token: tok.team }), "not_found", 404);
  });

  it("people, webhooks and export (team only)", async () => {
    const page1 = await call("GET", "/users?limit=2", { token: tok.team });
    contract("listUsers", page1);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await call("GET", `/users?limit=100&cursor=${page1.body.nextCursor}`, { token: tok.team });
    expect(page2.body.data.map((u: any) => u.id)).not.toContain(page1.body.data[0].id);
    const cust = (await call("GET", "/users?externalId=cust-1", { token: tok.team })).body.data[0];
    expect(cust.customer).toMatchObject({ company: "Acme", plan: "pro", mrrCents: 4900 });
    contract("getUser", await call("GET", `/users/${cust.id}`, { token: tok.team }));

    const hooks = await call("GET", "/webhooks", { token: tok.admin });
    contract("listWebhooks", hooks);
    expect(hooks.body.data[0].url).toBe("https://hooks.example.com/…");
    expect(hooks.body.data.map((h: any) => h.format).sort()).toEqual(["json", "teams"]);

    const csv = await call("GET", "/export?what=ideas&sep=comma", { token: tok.team });
    contract("export", csv);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.text).toContain("Idea number 1");
    const j = await call("GET", "/export?what=voters&format=json", { token: tok.team });
    contract("export", j);
    expect(j.body.rows.length).toBeGreaterThan(0);
    isProblem(await call("GET", "/export", { token: tok.team, headers: { "x-ozvi-lockdown": "verified" } }), "lockdown_active", 403);
  });

  it("answers 429 with Retry-After when the token's window is spent", async () => {
    for (let i = 0; i < LIMITS.api.max; i++) take("api", tok.adminId);
    const r = await call("GET", "/me", { token: tok.admin });
    isProblem(r, "rate_limited", 429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(r.headers.get("ratelimit-remaining")).toBe("0");
  });

  it("every route was exercised by a contract check", () => {
    expect(ROUTES.map((r) => r.id).filter((id) => !covered.has(id))).toEqual([]);
  });
});
