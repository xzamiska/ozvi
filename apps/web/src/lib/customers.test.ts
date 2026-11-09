import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchLimit, MAX_PAGES, nextPageHref, PAGE_SIZE, pageParam, takePage } from "./paging";
import { aggregateDemand, cleanTraits, formatMoney, readCustomer } from "./traits";
import { normalizeWeight } from "./votes";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

/* Wave 0: paging, customer traits (team only) and importance voting with a budget. */

describe("paging", () => {
  it("reads ?p safely", () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("-3")).toBe(1);
    expect(pageParam("2.5")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam(["3", "9"])).toBe(3);
    expect(pageParam("100000")).toBe(MAX_PAGES);
  });
  it("cuts at the page boundary and probes one row ahead", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => i);
    expect(fetchLimit(1)).toBe(PAGE_SIZE + 1);
    expect(takePage(rows(PAGE_SIZE), 1)).toEqual({ rows: rows(PAGE_SIZE), hasMore: false });
    expect(takePage(rows(PAGE_SIZE + 1), 1).hasMore).toBe(true);
    expect(takePage(rows(PAGE_SIZE + 1), 1).rows).toHaveLength(PAGE_SIZE);
    expect(takePage(rows(2 * PAGE_SIZE + 1), 2).rows).toHaveLength(2 * PAGE_SIZE);
    expect(takePage(rows(0), 1)).toEqual({ rows: [], hasMore: false });
    // The last allowed page never offers more, even with rows left.
    expect(takePage(rows(MAX_PAGES * PAGE_SIZE + 1), MAX_PAGES).hasMore).toBe(false);
  });
  it("keeps filters, sort and search in the next link", () => {
    expect(nextPageHref({ sort: "mrr", f: "all", q: "export", plan: undefined }, 1)).toBe("?sort=mrr&f=all&q=export&p=2");
    expect(nextPageHref({ pl: "2" }, 1, "sh")).toBe("?pl=2&sh=2");
  });
});

describe("traits", () => {
  it("reads customer traits gracefully", () => {
    expect(readCustomer(null)).toEqual({ company: null, companyKey: null, plan: null, mrr: null, currency: "EUR" });
    expect(readCustomer({ company: "  Acme ", plan: "pro", mrr: 2900, currency: "czk" }))
      .toEqual({ company: "Acme", companyKey: "name:acme", plan: "pro", mrr: 2900, currency: "CZK" });
    expect(readCustomer({ companyId: 7, mrr: "1500" })).toMatchObject({ companyKey: "id:7", mrr: 1500 });
    expect(readCustomer({ mrr: "lots", currency: "euro" })).toMatchObject({ mrr: null, currency: "EUR" });
    expect(readCustomer({ mrr: -5 }).mrr).toBeNull();
    expect(readCustomer(["x"]).company).toBeNull();
  });
  it("counts a company once, at its highest MRR, and sums per currency", () => {
    const d = aggregateDemand([
      { userId: "1", traits: { company: "Acme", mrr: 2900 } },
      { userId: "2", traits: { company: "ACME", mrr: 4900 } }, // same company, bigger seat wins
      { userId: "2", traits: { company: "ACME", mrr: 4900 } }, // same person twice (voter + author)
      { userId: "3", traits: { companyId: "b1", company: "Beta", mrr: 10000, currency: "USD" } },
      { userId: "4", traits: { plan: "free" } }, // no company, no MRR
      { userId: "5", traits: { mrr: 900 } }, // a person on their own
      { userId: "6", traits: {} },
    ]);
    expect(d.companies).toBe(2);
    expect(d.people).toBe(6);
    expect(d.individuals).toBe(3);
    expect(d.mrr).toEqual([{ currency: "USD", cents: 10000 }, { currency: "EUR", cents: 5800 }]);
    expect(aggregateDemand([]).mrr).toEqual([]);
  });
  it("formats money in the board locale", () => {
    expect(formatMoney(124000, "EUR", "sk-SK").replace(/\s/g, " ")).toBe("1 240 €");
    expect(formatMoney(2950, "EUR", "en-GB")).toBe("€29.50");
    expect(formatMoney(100, "XYZ1", "sk-SK")).toBe("1 XYZ1");
  });
  it("bounds what a token may store", () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(cleanTraits(many))).toHaveLength(30);
    expect(cleanTraits({ a: "x".repeat(500), b: { nested: 1 }, c: [1], d: true, e: null, f: Infinity }))
      .toEqual({ a: "x".repeat(200), d: true, e: null });
    expect(cleanTraits("nope")).toEqual({});
  });
});

describe("vote weight", () => {
  it("is 1 in simple mode and 1–3 in importance mode", () => {
    expect(normalizeWeight("simple", 3)).toBe(1);
    expect(normalizeWeight("simple", 0)).toBe(0);
    expect(normalizeWeight("importance", 3)).toBe(3);
    expect(normalizeWeight("importance", 9)).toBe(3);
    expect(normalizeWeight("importance", 1.4)).toBe(1);
    expect(normalizeWeight("importance", Number.NaN)).toBe(0);
  });
});

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
// The vote_mode column comes with migration 0018; skip the DB part on a database that has not got it yet.
const migrated = up && await db.execute(sql`select vote_mode from projects limit 0`).then(() => true, () => false);
const slug = `cust-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
type U = typeof schema.users.$inferSelect;
let team: U, acme1: U, acme2: U, beta: U, solo: U;
const ideas: string[] = [];

const { applyVote, budgetLeft } = await import("./votes");
const { listItems, countItems } = await import("./queries");
const { itemDemand, customerPlans } = await import("./customers");
const { wantedByPlan } = await import("./traits");
const { mcpBackend } = await import("./mcp-backend");

describe.skipIf(!migrated)("customers + budget (DB)", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Cust" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Cust", theme: presets.ozvi,
        voteMode: "importance", voteBudget: 4, itemSeq: 60 }).returning())[0]!;
      [team, acme1, acme2, beta, solo] = (await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "t", role: "team" },
        { projectId: project.id, externalId: "a1", name: "Ana", traits: { company: "Acme", plan: "pro", mrr: 2900 } },
        { projectId: project.id, externalId: "a2", name: "Adam", traits: { company: "acme", plan: "pro", mrr: 4900 } },
        { projectId: project.id, externalId: "b", name: "Bea", traits: { companyId: "b", company: "Beta", plan: "business", mrr: 20000 } },
        { projectId: project.id, externalId: "s", name: "Sam" },
      ]).returning()) as [U, U, U, U, U];
      // 55 open ideas (more than one page) + 1 shipped.
      const rows = await tx.insert(schema.items).values([
        ...Array.from({ length: 55 }, (_, i) => ({ projectId: project.id, kind: "idea" as const, number: i + 1, title: `Idea ${i + 1}`, status: "open" as const })),
        { projectId: project.id, kind: "idea" as const, number: 56, title: "Shipped", status: "shipped" as const, authorId: solo.id },
      ]).returning();
      ideas.push(...rows.map((r) => r.id));
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("enforces the budget on the server, weight costs points, inactive ideas are free", async () => {
    const vote = (u: U, i: number, w: number) => withProject(db, project.id, (tx) => applyVote(tx, project, u.id, ideas[i]!, w));
    expect(await vote(acme1, 0, 3)).toEqual({ ok: true, weight: 3 });
    expect(await vote(acme1, 1, 2)).toEqual({ ok: false, reason: "budget", left: 1 });
    expect(await vote(acme1, 1, 1)).toEqual({ ok: true, weight: 1 });
    expect(await withProject(db, project.id, (tx) => budgetLeft(tx, project, acme1.id))).toBe(0);
    expect((await vote(acme1, 2, 1)).ok).toBe(false);
    // Re-voting the same idea only needs the difference.
    expect(await vote(acme1, 0, 2)).toEqual({ ok: true, weight: 2 });
    expect(await vote(acme1, 2, 1)).toEqual({ ok: true, weight: 1 });
    // A shipped idea does not use the budget.
    expect(await vote(acme1, 55, 3)).toEqual({ ok: true, weight: 3 });
    // Removing gives points back.
    expect(await vote(acme1, 2, 0)).toEqual({ ok: true, weight: 0 });
    expect(await withProject(db, project.id, (tx) => budgetLeft(tx, project, acme1.id))).toBe(1);
    // voteCount is the weighted sum.
    const [i0] = await withProject(db, project.id, (tx) => tx.select().from(schema.items).where(eq(schema.items.id, ideas[0]!)));
    expect(i0!.voteCount).toBe(2);
    // Simple mode forces weight 1 whatever the client sends.
    expect(await withProject(db, project.id, (tx) => applyVote(tx, { ...project, voteMode: "simple", voteBudget: null }, beta.id, ideas[3]!, 3)))
      .toEqual({ ok: true, weight: 1 });
    await withProject(db, project.id, (tx) => applyVote(tx, { ...project, voteBudget: null }, beta.id, ideas[3]!, 0));
  });

  it("pages lists at the boundary with a correct total", async () => {
    const where = [eq(schema.items.kind, "idea"), eq(schema.items.status, "open")];
    const p1 = await withProject(db, project.id, async (tx) => takePage(await listItems(tx, where, "new", false, { limit: fetchLimit(1) }), 1));
    expect(p1.rows).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    const p2 = await withProject(db, project.id, async (tx) => takePage(await listItems(tx, where, "new", false, { limit: fetchLimit(2) }), 2));
    expect(p2.rows).toHaveLength(55);
    expect(p2.hasMore).toBe(false);
    expect(new Set(p2.rows.map((r) => r.id)).size).toBe(55);
    expect(await withProject(db, project.id, (tx) => countItems(tx, where))).toBe(55);
  });

  it("aggregates demand, sorts by MRR and filters by plan for the team only", async () => {
    await withProject(db, project.id, async (tx) => {
      // Idea #10: two Acme seats + Beta + Sam. Idea #11: one Acme seat.
      for (const u of [acme2, beta, solo]) await applyVote(tx, { ...project, voteBudget: null }, u.id, ideas[9]!, 1);
      await tx.update(schema.items).set({ authorId: acme1.id }).where(eq(schema.items.id, ideas[9]!));
      await applyVote(tx, { ...project, voteBudget: null }, acme2.id, ideas[10]!, 2);
    });
    const { people, demand } = await withProject(db, project.id, async (tx) => {
      const item = (await tx.query.items.findFirst({ where: eq(schema.items.id, ideas[9]!) }))!;
      return itemDemand(tx, item);
    });
    expect(demand).toMatchObject({ companies: 2, people: 4, individuals: 1, mrr: [{ currency: "EUR", cents: 24900 }] });
    expect(people[0]!.company).toBe("Beta");
    expect(people.find((p) => p.userId === acme1.id)?.author).toBe(true);

    const where = [eq(schema.items.kind, "idea"), eq(schema.items.status, "open")];
    const byMrr = await withProject(db, project.id, (tx) => listItems(tx, where, "mrr", true, { team: true, limit: 3 }));
    expect(byMrr[0]!.number).toBe(10);
    expect(byMrr[0]!.mrr).toBe(24900);
    expect(byMrr[0]!.voters).toBe(3);
    // Members asking for MRR order get the normal order and no customer columns.
    const pub = await withProject(db, project.id, (tx) => listItems(tx, where, "mrr", false, { limit: 3 }));
    expect(pub[0]).not.toHaveProperty("mrr");
    expect(pub[0]).not.toHaveProperty("affected");

    const biz = await withProject(db, project.id, (tx) => listItems(tx, [...where, wantedByPlan("business")], "top", true, { team: true }));
    expect(biz.map((r) => r.number)).toEqual([10]);
    expect(await withProject(db, project.id, (tx) => customerPlans(tx))).toEqual(["business", "pro"]);
  });

  it("MCP returns customer data only to triage tokens", async () => {
    const tb = await mcpBackend({ project, user: team, scope: "triage", tokenId: "t" });
    const detail = await tb.get(10);
    expect(detail?.item.demand).toMatchObject({ companies: 2, people: 4 });
    expect(detail?.item.demand?.mrr[0]?.formatted.replace(/\s/g, " ")).toBe("249 €");
    expect(detail?.customers?.length).toBe(4);
    const top = await tb.search({ kind: "idea", sort: "mrr", limit: 2 });
    expect(top[0]!.number).toBe(10);
    expect(top[0]!.demand?.companies).toBe(2);

    for (const [user, scope] of [[team, "read"], [acme1, "write"]] as const) {
      const b = await mcpBackend({ project, user, scope, tokenId: `x-${scope}` });
      const d = await b.get(10);
      expect(d?.item.demand).toBeUndefined();
      expect(d?.customers).toBeUndefined();
      const s = await b.search({ kind: "idea", sort: "mrr", limit: 2 });
      expect(s[0]!.demand).toBeUndefined();
      expect(JSON.stringify(s)).not.toMatch(/Acme|Beta|mrr/i);
    }
  });
});
