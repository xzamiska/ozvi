import { createDb, schema, withSystem } from "@ozvi/db";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * createProject against the real DB, with the Next request context mocked: which attempts use up the
 * hourly limit, and what the free-workspace-per-network message offers.
 */

const me = vi.hoisted(() => ({ account: undefined as unknown, ip: "198.51.100.7" }));

vi.mock("./account", async (orig) => ({ ...(await orig<typeof import("./account")>()), getAccount: async () => me.account }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": me.ip }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/i18n/server", () => ({ requestLocale: async () => "sk" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k),
}));

const { createProject } = await import("./app-actions");
const { LIMITS, take } = await import("./ratelimit");

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const run = Date.now().toString(36);
const accounts: string[] = [];
const workspaces: string[] = [];

async function account(tag: string) {
  const [a] = await db.insert(schema.accounts).values({ email: `cp-${tag}-${run}@example.com` }).returning();
  accounts.push(a!.id);
  me.account = a;
  return a!;
}
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

afterEach(() => { delete process.env.OZVI_MODE; });
afterAll(async () => {
  if (!up) return;
  await withSystem(db, async (tx) => {
    const ws = (await tx.select({ id: schema.workspaceMembers.workspaceId }).from(schema.workspaceMembers)
      .where(inArray(schema.workspaceMembers.accountId, accounts))).map((r) => r.id);
    const all = [...new Set([...ws, ...workspaces])];
    if (all.length) {
      await tx.delete(schema.projects).where(inArray(schema.projects.workspaceId, all));
      await tx.delete(schema.workspaceMembers).where(inArray(schema.workspaceMembers.workspaceId, all));
      await tx.delete(schema.workspaces).where(inArray(schema.workspaces.id, all));
    }
    if (accounts.length) await tx.delete(schema.accounts).where(inArray(schema.accounts.id, accounts));
  });
});

describe.skipIf(!up)("createProject", () => {
  it("failed attempts do not use up the hourly project limit", async () => {
    const a = await account("retry");
    const taken = `cp-taken-${run}`;
    expect(await createProject({}, form({ name: "Taken", slug: taken }))).toEqual({ created: taken });
    // More failures than the hourly limit: a taken slug, a reserved slug, a too short name.
    for (let i = 0; i < LIMITS.signup.max; i++) {
      expect((await createProject({}, form({ name: "Again", slug: taken }))).error).toMatch(/^slugTaken/);
      expect((await createProject({}, form({ name: "Reserved", slug: "admin" }))).error).toBe("slugInvalid");
      expect((await createProject({}, form({ name: "x", slug: `cp-short-${run}` }))).error).toBe("nameLength");
    }
    const next = `cp-next-${run}`;
    expect(await createProject({}, form({ name: "Next", slug: next }))).toEqual({ created: next });
    // Successful creations still count, and the error says when to come back.
    for (let i = 2; i < LIMITS.signup.max; i++) expect((await createProject({}, form({ name: "More", slug: `cp-more${i}-${run}` }))).created).toBeTruthy();
    const over = await createProject({}, form({ name: "Over", slug: `cp-over-${run}` }));
    expect(over.error).toMatch(/^tooManyProjects \{"minutes":(60|59)\}$/);
    // Self-host: each project without a workspace founds its own; all of them belong to this account.
    const mine = await db.select({ n: sql<number>`count(*)::int` }).from(schema.projects)
      .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.workspaceId, schema.projects.workspaceId))
      .where(eq(schema.workspaceMembers.accountId, a.id));
    expect(mine[0]!.n).toBe(LIMITS.signup.max);
  });

  it("free workspaces per network: a newcomer gets a time and support, a member gets a link to their workspace", async () => {
    process.env.OZVI_MODE = "cloud";
    me.ip = `203.0.113.${(Date.now() % 200) + 20}`;
    for (let i = 0; i < LIMITS.freeWorkspaceIp.max; i++) take("freeWorkspaceIp", me.ip);

    await account("newcomer");
    const fresh = await createProject({}, form({ name: "Fresh", slug: `cp-fresh-${run}` }));
    expect(fresh.error).toMatch(/^tooManyFree \{"hours":24\}$/);
    expect(fresh.link).toBeUndefined();

    const b = await account("member");
    const [w] = await db.insert(schema.workspaces).values({ slug: `cp-ws-${run}`, name: "Tím Acme", plan: "pro" }).returning();
    workspaces.push(w!.id);
    await db.insert(schema.workspaceMembers).values({ workspaceId: w!.id, accountId: b.id, role: "member" });
    const member = await createProject({}, form({ name: "Member", slug: `cp-member-${run}` }));
    expect(member.error).toMatch(/^tooManyFreeHasWorkspace/);
    expect(member.link).toEqual({ href: `/app/new?w=${w!.id}`, label: `addToWorkspace {"workspace":"Tím Acme"}` });
  });
});
