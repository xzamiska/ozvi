import { schema } from "@ozvi/db";
import { sql, type SQL } from "drizzle-orm";

/**
 * Customer data the host app sends as SSO token traits (documented in @ozvi/sdk and docs/INTEGRACIA.md):
 *   company   – company name ("Acme s.r.o.")
 *   companyId – stable company id; people with the same one count as one company (else the name is used)
 *   plan      – plan name in your app ("pro")
 *   mrr       – monthly recurring revenue in cents (integer, e.g. 2900 = 29 €)
 *   currency  – ISO 4217 code for mrr ("EUR" when missing)
 * Team only: never rendered for members or the public, never returned by member MCP tokens.
 */

export const DEFAULT_CURRENCY = "EUR";

/**
 * Untrusted token traits → what we store: at most 30 keys (≤ 40 chars), scalar values, strings ≤ 200 chars.
 * Anything else is dropped, so a host app cannot bloat the users table through a token.
 */
export function cleanTraits(raw: unknown): Record<string, string | number | boolean | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= 30) break;
    if (!k || k.length > 40) continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

export interface Customer {
  company: string | null;
  /** Dedupe key: companyId, else the lower-cased company name, else null (a person on their own). */
  companyKey: string | null;
  plan: string | null;
  /** Cents, or null when missing or not a number. */
  mrr: number | null;
  currency: string;
}

const text = (v: unknown, max = 120): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
};

/** Untrusted jsonb → known traits only, bounded, never throws. */
export function readCustomer(raw: unknown): Customer {
  const t = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const company = text(t.company);
  const id = text(t.companyId);
  const m = typeof t.mrr === "number" ? t.mrr : typeof t.mrr === "string" && /^\d+(\.\d+)?$/.test(t.mrr.trim()) ? Number(t.mrr) : NaN;
  const cur = typeof t.currency === "string" && /^[A-Za-z]{3}$/.test(t.currency.trim()) ? t.currency.trim().toUpperCase() : DEFAULT_CURRENCY;
  return {
    company,
    companyKey: id ? `id:${id}` : company ? `name:${company.toLocaleLowerCase("sk")}` : null,
    plan: text(t.plan, 60),
    mrr: Number.isFinite(m) && m >= 0 ? Math.round(m) : null,
    currency: cur,
  };
}

export interface Demand {
  /** Distinct companies among the people. */
  companies: number;
  /** Distinct people. */
  people: number;
  /** People with no company trait. */
  individuals: number;
  /** MRR per currency, a company counted once (its highest reported MRR), largest first. */
  mrr: { currency: string; cents: number }[];
}

/** Who wants it, in money: one company with five voters is still one company and one MRR. */
export function aggregateDemand(people: { userId: string; traits: unknown }[]): Demand {
  const seen = new Set<string>();
  const companies = new Map<string, { cents: number | null; currency: string }>();
  const solo: Customer[] = [];
  for (const p of people) {
    if (seen.has(p.userId)) continue;
    seen.add(p.userId);
    const c = readCustomer(p.traits);
    if (!c.companyKey) { solo.push(c); continue; }
    const prev = companies.get(c.companyKey);
    if (!prev || (c.mrr ?? -1) > (prev.cents ?? -1)) companies.set(c.companyKey, { cents: c.mrr, currency: c.currency });
  }
  const sums = new Map<string, number>();
  const add = (currency: string, cents: number | null) => { if (cents) sums.set(currency, (sums.get(currency) ?? 0) + cents); };
  for (const c of companies.values()) add(c.currency, c.cents);
  for (const c of solo) add(c.currency, c.mrr);
  return {
    companies: companies.size,
    people: seen.size,
    individuals: solo.length,
    mrr: [...sums].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents),
  };
}

/** Money in the board locale: whole units when the amount is whole, cents otherwise. */
export function formatMoney(cents: number, currency: string, localeTag: string): string {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat(localeTag, {
      style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency}`;
  }
}

const { users, votes, items } = schema;

/**
 * SQL for one item's MRR (voters + author, a company counted once at its highest MRR). Currencies are
 * not converted: good enough to sort by, the item page shows the exact per-currency sums.
 */
export const itemMrrSql: SQL<number> = sql<number>`(select coalesce(sum(m), 0)::bigint from (
  select max(case when jsonb_typeof(du.traits->'mrr') = 'number' then (du.traits->>'mrr')::numeric
                  when du.traits->>'mrr' ~ '^[0-9]+(\\.[0-9]+)?$' then (du.traits->>'mrr')::numeric end) as m
  from ${users} du
  where du.id in (select dv.user_id from ${votes} dv where dv.item_id = ${items.id}) or du.id = ${items.authorId}
  group by coalesce('id:' || nullif(btrim(du.traits->>'companyId'), ''), 'name:' || lower(nullif(btrim(du.traits->>'company'), '')), du.id::text)
) demand)`.mapWith(Number);

/** Ideas wanted by (voted or asked for by) someone on this plan. */
export const wantedByPlan = (plan: string): SQL => sql`exists (select 1 from ${users} pu
  where (pu.id in (select pv.user_id from ${votes} pv where pv.item_id = ${items.id}) or pu.id = ${items.authorId})
    and btrim(pu.traits->>'plan') = ${plan})`;
