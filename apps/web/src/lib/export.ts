import "server-only";
import { schema, type Tx } from "@ozvi/db";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { translator } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";
import { type Cell, type Delimiter } from "./csv";
import { demandFor } from "./customers";
import { moderationWhere, textMatch } from "./queries";
import { stopLabel, type LabelSource } from "./route-text";
import { itemMrrSql, readCustomer, wantedByPlan } from "./traits";

/**
 * Team CSV exports: ideas, bugs, comments and voters. The list filters mirror the board pages
 * (ideas: f, q, plan, tag; bugs: s, st, q, tag) so "Export" downloads what the team is looking at.
 * Callers check the viewer is team; nothing here filters by role.
 */

const { items, users, votes, comments, customStatuses, tags, itemTags } = schema;

export const EXPORT_KINDS = ["ideas", "bugs", "comments", "voters"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
/** Hard cap per file; a board this big should use the JSON export or MCP. */
export const EXPORT_MAX = 50_000;

const IDEA_FILTERS: Record<string, readonly string[]> = {
  active: ["open", "planned", "in_progress"],
  shipped: ["shipped"],
  all: ["open", "planned", "in_progress", "shipped", "declined"],
};
const BUG_STAGES: Record<string, readonly string[]> = {
  open: ["new", "confirmed", "in_progress"],
  fixed: ["fixed", "verified"],
  all: ["new", "confirmed", "in_progress", "fixed", "verified", "wont_fix"],
};

export interface ListFilter {
  kind: "idea" | "bug";
  where: SQL[];
  /** Ideas' moderation queue (pending only). */
  queue: boolean;
  order: "top" | "new" | "old" | "mrr";
  /** One item only (voters / comments of a single idea). */
  number?: number;
}

const one = (v: string | null | undefined, max = 100) => (v ?? "").trim().slice(0, max);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tagWhere(tag: string): SQL[] {
  if (!tag) return [];
  const match = UUID.test(tag) ? sql`${tags.id} = ${tag}` : sql`lower(${tags.name}) = ${tag.toLowerCase()}`;
  return [sql`exists (select 1 from ${itemTags} join ${tags} on ${tags.id} = ${itemTags.tagId} where ${itemTags.itemId} = ${items.id} and ${match})`];
}

/** Same query string as the list page → the same rows. Unknown values fall back like the pages do (but default to "all"). */
export function listFilter(kind: "idea" | "bug", sp: URLSearchParams): ListFilter {
  const q = one(sp.get("q"));
  const tag = one(sp.get("tag"), 80);
  const n = /^\d{1,9}$/.exec(one(sp.get("item")))?.[0];
  const number = n ? Number(n) : undefined;
  if (kind === "idea") {
    const f = one(sp.get("f"));
    const queue = f === "queue";
    const statuses = IDEA_FILTERS[queue ? "all" : f in IDEA_FILTERS ? f : "all"]!;
    const plan = one(sp.get("plan"), 60);
    const sort = sp.get("sort");
    return {
      kind, queue, number, order: sort === "new" ? "new" : sort === "mrr" ? "mrr" : "top",
      where: [eq(items.kind, "idea"), inArray(items.status, [...statuses] as never[]), ...textMatch(q), ...(plan ? [wantedByPlan(plan)] : []), ...tagWhere(tag),
        ...(number ? [eq(items.number, number)] : [])],
    };
  }
  const st = one(sp.get("st"));
  const s = one(sp.get("s"));
  const statuses = BUG_STAGES.all!.includes(st) ? [st] : BUG_STAGES[s in BUG_STAGES ? s : "all"]!;
  return {
    kind, queue: false, number, order: sp.get("sort") === "old" ? "old" : "new",
    where: [eq(items.kind, "bug"), inArray(items.status, [...statuses] as never[]), ...textMatch(q), ...tagWhere(tag), ...(number ? [eq(items.number, number)] : [])],
  };
}

/** Spreadsheet-friendly UTC timestamp (Excel and LibreOffice parse it as a date). */
export const csvDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 19).replace("T", " ") : "");
/** Money as a plain number in the delimiter's convention (`;` files use a decimal comma). */
export const csvMoney = (cents: number | null | undefined, d: Delimiter) =>
  cents == null ? "" : d === ";" ? (cents / 100).toFixed(2).replace(".", ",") : (cents / 100).toFixed(2);

function subLabel(labels: unknown, locale: Locale): string {
  const l = labels && typeof labels === "object" ? (labels as Record<string, unknown>) : {};
  const v = l[locale] ?? l.sk ?? l.en ?? l.cs ?? Object.values(l)[0];
  return typeof v === "string" ? v : "";
}

async function filteredItems(tx: Tx, f: ListFilter) {
  const orderBy = { top: [desc(items.voteCount), desc(items.createdAt)], new: [desc(items.createdAt)], old: [asc(items.createdAt)],
    mrr: [desc(itemMrrSql), desc(items.voteCount)] }[f.order];
  return tx.select({
    id: items.id, number: items.number, kind: items.kind, title: items.title, body: items.body, status: items.status,
    voteCount: items.voteCount, fixedInVersion: items.fixedInVersion, pending: items.pending, createdAt: items.createdAt, updatedAt: items.updatedAt,
    authorId: items.authorId, authorName: users.name, authorEmail: users.email, authorTraits: users.traits, sub: customStatuses.labels,
    voters: sql<number>`(select count(*)::int from ${votes} where ${votes.itemId} = ${items.id})`,
    comments: sql<number>`(select count(*)::int from ${comments} where ${comments.itemId} = ${items.id} and ${comments.deletedAt} is null)`,
    tagNames: sql<string | null>`(select string_agg(${tags.name}, ', ' order by lower(${tags.name})) from ${itemTags} join ${tags} on ${tags.id} = ${itemTags.tagId} where ${itemTags.itemId} = ${items.id})`,
  }).from(items).leftJoin(users, eq(users.id, items.authorId)).leftJoin(customStatuses, eq(customStatuses.id, items.subStatusId))
    .where(and(isNull(items.mergedIntoId), moderationWhere({ queue: f.queue }), ...f.where))
    .orderBy(...orderBy, desc(items.number)).limit(EXPORT_MAX);
}

export interface Sheet { header: string[]; rows: Cell[][] }

/** Ideas or bugs, one row each, with votes, stage, author and customer data. */
export async function exportItems(tx: Tx, f: ListFilter, locale: Locale, d: Delimiter, itemUrl: (n: number) => string, board?: LabelSource): Promise<Sheet> {
  const t = translator(locale, "export");
  const rows = await filteredItems(tx, f);
  const demand = await demandFor(tx, rows.map((r) => ({ id: r.id, authorId: r.authorId })));
  const idea = f.kind === "idea";
  const header = [t("col.number"), t("col.title"), t("col.body"), t("col.stage"), t("col.subStatus"), t("col.statusKey"),
    ...(idea ? [t("col.voters"), t("col.weighted")] : [t("col.fixedIn")]), t("col.comments"), t("col.tags"),
    t("col.author"), t("col.authorEmail"), t("col.company"), t("col.plan"), t("col.mrr"), t("col.currency"),
    ...(idea ? [t("col.companies"), t("col.demandMrr")] : []), t("col.pending"), t("col.created"), t("col.updated"), t("col.url")];
  const out = rows.map((r) => {
    const c = readCustomer(r.authorTraits);
    const dm = demand.get(r.id);
    return [r.number, r.title, r.body, stopLabel(locale, r.status, board), subLabel(r.sub, locale), r.status,
      ...(idea ? [r.voters, r.voteCount] : [r.fixedInVersion ?? ""]), r.comments, r.tagNames ?? "",
      r.authorName ?? "", r.authorEmail ?? "", c.company ?? "", c.plan ?? "", csvMoney(c.mrr, d), c.mrr != null ? c.currency : "",
      ...(idea ? [dm?.companies ?? 0, (dm?.mrr ?? []).map((m) => `${csvMoney(m.cents, d)} ${m.currency}`).join(" + ")] : []),
      r.pending ? t("yes") : "", csvDate(r.createdAt), csvDate(r.updatedAt), itemUrl(r.number)] as Cell[];
  });
  return { header, rows: out };
}

/** Comments of the filtered items (internal notes included and marked: this is the team's export). */
export async function exportComments(tx: Tx, f: ListFilter, locale: Locale): Promise<Sheet> {
  const t = translator(locale, "export");
  const list = await filteredItems(tx, f);
  const header = [t("col.number"), t("col.itemTitle"), t("col.author"), t("col.authorEmail"), t("col.comment"), t("col.internal"), t("col.created")];
  if (list.length === 0) return { header, rows: [] };
  const byId = new Map(list.map((i) => [i.id, i]));
  const rows = await tx.select({ itemId: comments.itemId, body: comments.body, internal: comments.internal, createdAt: comments.createdAt, name: users.name, email: users.email })
    .from(comments).leftJoin(users, eq(users.id, comments.authorId))
    .where(and(isNull(comments.deletedAt), inArray(comments.itemId, [...byId.keys()]))).orderBy(asc(comments.createdAt)).limit(EXPORT_MAX * 4);
  return {
    header,
    rows: rows.map((r) => { const i = byId.get(r.itemId)!; return [i.number, i.title, r.name ?? "", r.email ?? "", r.body, r.internal ? t("yes") : "", csvDate(r.createdAt)]; })
      .sort((a, b) => (a[0] as number) - (b[0] as number)),
  };
}

/** Voters per item: who, how strongly (weight), which company/plan/MRR, when. */
export async function exportVoters(tx: Tx, f: ListFilter, locale: Locale, d: Delimiter): Promise<Sheet> {
  const t = translator(locale, "export");
  const list = await filteredItems(tx, f);
  const header = [t("col.number"), t("col.itemTitle"), t("col.voter"), t("col.voterEmail"), t("col.weight"), t("col.company"), t("col.plan"), t("col.mrr"), t("col.currency"), t("col.votedAt")];
  if (list.length === 0) return { header, rows: [] };
  const byId = new Map(list.map((i) => [i.id, i]));
  const rows = await tx.select({ itemId: votes.itemId, weight: votes.weight, at: votes.createdAt, name: users.name, email: users.email, traits: users.traits })
    .from(votes).innerJoin(users, eq(users.id, votes.userId)).where(inArray(votes.itemId, [...byId.keys()]))
    .orderBy(asc(votes.createdAt)).limit(EXPORT_MAX * 4);
  return {
    header,
    rows: rows.map((r) => {
      const i = byId.get(r.itemId)!; const c = readCustomer(r.traits);
      return [i.number, i.title, r.name ?? "", r.email ?? "", r.weight, c.company ?? "", c.plan ?? "", csvMoney(c.mrr, d), c.mrr != null ? c.currency : "", csvDate(r.at)];
    }).sort((a, b) => (a[0] as number) - (b[0] as number)),
  };
}
