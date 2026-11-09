import "server-only";
import { schema, type Tx } from "@ozvi/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { aggregateDemand, readCustomer, type Customer, type Demand } from "./traits";

const { users, votes } = schema;

/**
 * Team-only customer views over SSO traits (lib/traits.ts). Callers must check the viewer is team
 * (board) or the token has the triage scope (MCP) before calling; nothing here is filtered by role.
 */

/** Plan names people on this board have, for the team's plan filter. */
export async function customerPlans(tx: Tx): Promise<string[]> {
  const rows = await tx.execute<{ plan: string }>(sql`select distinct btrim(${users.traits}->>'plan') as plan from ${users}
    where coalesce(btrim(${users.traits}->>'plan'), '') <> '' order by 1 limit 30`);
  return rows.map((r) => r.plan);
}

export interface Wanter extends Customer {
  userId: string; name: string | null; email: string | null; avatarUrl: string | null;
  /** Vote weight (1–3), 0 = asked for it (author) without voting. */
  weight: number;
  author: boolean;
  at: Date;
}

/** Everyone who wants an item (voters + author), biggest customers first, plus the aggregate. */
export async function itemDemand(tx: Tx, item: { id: string; authorId: string | null }, limit = 100): Promise<{ people: Wanter[]; demand: Demand }> {
  const rows = await tx.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, traits: users.traits,
    weight: votes.weight, voteAt: votes.createdAt, createdAt: users.createdAt })
    .from(users).leftJoin(votes, and(eq(votes.userId, users.id), eq(votes.itemId, item.id)))
    .where(or(sql`${votes.itemId} is not null`, ...(item.authorId ? [eq(users.id, item.authorId)] : [])))
    .orderBy(desc(votes.createdAt)).limit(2000);
  const all: Wanter[] = rows.map((r) => ({
    ...readCustomer(r.traits), userId: r.id, name: r.name, email: r.email, avatarUrl: r.avatarUrl,
    weight: r.weight ?? 0, author: r.id === item.authorId, at: r.voteAt ?? r.createdAt,
  }));
  const demand = aggregateDemand(rows.map((r) => ({ userId: r.id, traits: r.traits })));
  const people = all.sort((a, b) => (b.mrr ?? -1) - (a.mrr ?? -1) || b.weight - a.weight || +b.at - +a.at).slice(0, limit);
  return { people, demand };
}

/** Aggregates for many items at once (MCP top_requests). */
export async function demandFor(tx: Tx, list: { id: string; authorId: string | null }[]): Promise<Map<string, Demand>> {
  if (list.length === 0) return new Map();
  const ids = list.map((i) => i.id);
  const voteRows = await tx.select({ itemId: votes.itemId, userId: users.id, traits: users.traits })
    .from(votes).innerJoin(users, eq(users.id, votes.userId)).where(inArray(votes.itemId, ids));
  const authorIds = [...new Set(list.map((i) => i.authorId).filter((a): a is string => !!a))];
  const authors = authorIds.length ? await tx.select({ id: users.id, traits: users.traits }).from(users).where(inArray(users.id, authorIds)) : [];
  const out = new Map<string, Demand>();
  for (const i of list) {
    const people = voteRows.filter((v) => v.itemId === i.id);
    const a = authors.find((x) => x.id === i.authorId);
    out.set(i.id, aggregateDemand([...people, ...(a ? [{ userId: a.id, traits: a.traits }] : [])]));
  }
  return out;
}

