import { contextFor } from "./bug-context";
import { createHash } from "node:crypto";
import { PLAN_LIMITS, schema, withProject, type PlanName, type Tx } from "@ozvi/db";
import { strictestLockdown, ToolError, type Backend, type McpCustomer, type McpDemand, type McpItem, type McpItemDetail, type SearchInput, type Summary } from "@ozvi/mcp";
import { LOCALE_TAG, isLocale } from "@/i18n/locales";
import { demandFor, itemDemand } from "./customers";
import { formatMoney, itemMrrSql, type Demand } from "./traits";
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { addCommentTo, canSee, changeStatus, DomainError, isTeamRole, itemByNumber, mergeItems, type Item } from "./domain";
import { projectOrigin } from "./email/url";
import { createIssue, getGithub, linkIssue } from "./github";
import { createItemFor, ValidationError } from "./items";
import { publishEntry, saveEntry } from "./changelog";
import { allow, RateLimitError } from "./ratelimit";
import { embeddingsConfig, embedQuery, findSimilar } from "./similar";
import { attachProof, listProofs, readProof } from "./proof";
import { mcpUpdates } from "./release-mcp";
import type { TokenAuth } from "./tokens";
import { hasTag, listTags, setItemTags, tagIdsByName, tagsByItem } from "./tags";
import { tagFromParam } from "./tag-rules";
import { subLabelMap } from "./sub-statuses";
import { unansweredWhere, waitingSinceSql } from "./unanswered";
import { boardLocales } from "@/i18n/board";
import { authorOf, itemAuthorOf, sourceOf, trustOf, type TrustSubject } from "./provenance";
import { customerFor, submitInsight } from "./insights";
import { applyVote } from "./votes";
import { listSubStatuses } from "./sub-statuses";
import { stagesOf, subLabel } from "./statuses";
import { stopLabel } from "./route-text";
import { readCustomer } from "./traits";
import { ApiNotFound, CursorError, decodeCursor, encodeCursor, type ApiBackend, type ApiComment, type ApiUser } from "./api/types";
import type { ItemSource } from "./provenance";
import type { Locale } from "@/i18n/locales";

const { items, users, comments, attachments, itemLinks } = schema;
const NONE = "00000000-0000-0000-0000-000000000000";

/**
 * Backend for @ozvi/mcp, bound to one authenticated token. Every call is its own withProject transaction.
 * The REST API (lib/api) uses the same backend with channel "api": same rules, its own provenance, plus `api` extras.
 */
export async function mcpBackend(auth: TokenAuth, channel: Extract<ItemSource, "mcp" | "api"> = "mcp", apiLocale?: Locale): Promise<Backend & { api: ApiBackend }> {
  const { project, user, scope } = auth;
  const team = isTeamRole(user.role);
  const base = `${projectOrigin(project)}/${project.slug}`;
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withProject(db, project.id, async (tx) => {
    try {
      return await fn(tx);
    } catch (e) {
      if (e instanceof DomainError || e instanceof ValidationError || e instanceof RateLimitError) throw new ToolError(e.message);
      throw e;
    }
  });
  /**
   * Members see ideas and their own bugs. Nobody gets deleted posts or ideas waiting in the
   * moderation queue through MCP (the queue is handled on the board).
   */
  const published: SQL = and(isNull(items.deletedAt), eq(items.pending, false))!;
  const visible: SQL = team ? published : and(published, or(eq(items.kind, "idea"), eq(items.authorId, user.id)))!;
  const suggestModel = embeddingsConfig()?.model ?? null;
  const reachable = (i: Item) => canSee(i, user) && !i.pending && !i.deletedAt;

  type AuthorRow = (TrustSubject & { name: string | null }) | null;
  const authorCols = { name: users.name, role: users.role, externalId: users.externalId, traits: users.traits };
  const toMcp = (i: Item, author: AuthorRow = null): McpItem => ({
    number: i.number, kind: i.kind, title: i.title, body: i.body, status: i.status, votes: i.voteCount,
    fixedInVersion: i.fixedInVersion, url: `${base}/i/${i.number}`, createdAt: i.createdAt.toISOString(),
    author: itemAuthorOf(i, author), source: sourceOf(i.source), mergedInto: null,
  });
  /** The latest fixed/shipped stop's proof, or what is attached so far. PRs of public ideas only for the team (the repo may be private). */
  async function itemProofOut(tx: Tx, item: Item) {
    const itemId = item.id;
    const [ev] = await tx.select({ proof: schema.itemEvents.proof }).from(schema.itemEvents)
      .where(and(eq(schema.itemEvents.itemId, itemId), sql`${schema.itemEvents.proof} is not null`)).orderBy(desc(schema.itemEvents.createdAt)).limit(1);
    let p = readProof(ev?.proof);
    if (!p) {
      const rows = await listProofs(tx, itemId);
      p = rows.length ? { prs: rows.filter((r) => r.kind === "pr").map((r) => ({ url: r.url, title: r.title, ref: r.ref })), preview: rows.filter((r) => r.kind === "preview").at(-1)?.url ?? null, release: null } : null;
    }
    return p && !team && item.kind === "idea" ? { ...p, prs: [] } : p;
  }
  /** Authors by id, for provenance on items fetched without a join. */
  async function authorsById(tx: Tx, ids: (string | null)[]): Promise<Map<string, AuthorRow>> {
    const want = [...new Set(ids.filter((x): x is string => !!x))];
    if (!want.length) return new Map();
    const rows = await tx.select({ id: users.id, ...authorCols }).from(users).where(inArray(users.id, want));
    return new Map(rows.map((r) => [r.id, r]));
  }
  async function withAuthors(tx: Tx, list: Item[]): Promise<McpItem[]> {
    const a = await authorsById(tx, list.map((i) => i.authorId));
    return list.map((i) => toMcp(i, i.authorId ? a.get(i.authorId) ?? null : null));
  }

  /** Customer data (SSO traits: company, plan, MRR) only for team tokens with the triage scope. */
  const customers = team && scope === "triage";
  /** Team-only tags: same rule as customer data (team role and triage scope); everybody else gets public tags. */
  const teamTags = customers;
  const fallbackLocale = boardLocales(project).fallback;
  const moneyTag = LOCALE_TAG[isLocale(project.defaultLocale) ? project.defaultLocale : "sk"];
  const demandOut = (d: Demand): McpDemand => ({
    companies: d.companies, people: d.people,
    mrr: d.mrr.map((m) => ({ ...m, formatted: formatMoney(m.cents, m.currency, moneyTag) })),
  });

  async function list(tx: Tx, where: SQL[], order: SQL[], limit: number, opts: { waiting?: boolean; offset?: number } = {}) {
    const rows = await tx.select({ item: items, author: authorCols, voters: sql<number>`(select count(*)::int from ${schema.votes} where ${schema.votes.itemId} = ${items.id})`,
      waitingSince: opts.waiting ? sql<string | null>`${waitingSinceSql}::text` : sql<null>`null` })
      .from(items).leftJoin(users, eq(users.id, items.authorId))
      .where(and(isNull(items.mergedIntoId), visible, ...where)).orderBy(...order).limit(limit).offset(opts.offset ?? 0);
    const demand = customers ? await demandFor(tx, rows.filter((r) => r.item.kind === "idea").map((r) => r.item)) : null;
    const tagMap = await tagsByItem(tx, rows.map((r) => r.item.id), teamTags);
    const subs = rows.some((r) => r.item.subStatusId) ? await subLabelMap(tx, project, fallbackLocale) : null;
    return rows.map((r) => {
      const d = demand?.get(r.item.id);
      return { ...toMcp(r.item, r.author), voters: r.voters, ...(d ? { demand: demandOut(d) } : {}),
        tags: (tagMap.get(r.item.id) ?? []).map((x) => x.name), subStatus: r.item.subStatusId ? subs?.get(r.item.subStatusId) ?? null : null,
        ...(opts.waiting ? { waitingSince: r.waitingSince ? new Date(r.waitingSince).toISOString() : null } : {}) };
    });
  }

  async function mustGet(tx: Tx, n: number) {
    const item = await itemByNumber(tx, n);
    if (!item || !reachable(item)) {
      if (channel === "api") throw new ApiNotFound(`#${n} does not exist or this token cannot see it.`);
      throw new ToolError(`#${n} neexistuje alebo k nemu nemáte prístup.`);
    }
    return item;
  }

  async function ideasFor(tx: Tx, numbers: number[]) {
    if (numbers.length === 0) return [];
    const rows = await tx.select().from(items).where(and(inArray(items.number, numbers), eq(items.kind, "idea"), isNull(items.mergedIntoId), published));
    const missing = numbers.filter((n) => !rows.some((r) => r.number === n));
    if (missing.length) throw new ToolError(`Tieto nápady neexistujú (alebo sú to chyby či duplicity): ${missing.map((n) => `#${n}`).join(", ")}.`);
    return rows;
  }

  const gh = await withProject(db, project.id, (tx) => getGithub(tx)).catch(() => null);
  const [ws] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, project.workspaceId));
  const aiAllowed = PLAN_LIMITS[(ws?.plan ?? "self") as PlanName].ai;

  /* ---------- REST API extras (lib/api): same visibility, scope and provenance rules as the tools above ---------- */
  const apiLoc: Locale = apiLocale ?? fallbackLocale;
  const userCols = { id: users.id, externalId: users.externalId, name: users.name, email: users.email, role: users.role, traits: users.traits,
    blockedAt: users.blockedAt, lastSeenAt: users.lastSeenAt, createdAt: users.createdAt,
    votes: sql<number>`(select count(*)::int from ${schema.votes} where ${schema.votes.userId} = ${users.id})`,
    items: sql<number>`(select count(*)::int from ${items} where ${items.authorId} = ${users.id} and ${items.deletedAt} is null)` };
  type UserRow = { id: string; externalId: string; name: string | null; email: string | null; role: ApiUser["role"]; traits: unknown;
    blockedAt: Date | null; lastSeenAt: Date | null; createdAt: Date; votes: number; items: number };
  const userOut = (u: UserRow): ApiUser => {
    const c = readCustomer(u.traits);
    return { id: u.id, externalId: u.externalId, name: u.name, email: u.email, role: u.role, trust: trustOf(u), blocked: !!u.blockedAt,
      traits: u.traits && typeof u.traits === "object" && !Array.isArray(u.traits) ? (u.traits as Record<string, unknown>) : {},
      customer: { company: c.company, plan: c.plan, mrrCents: c.mrr, currency: c.currency },
      votes: u.votes, items: u.items, lastSeenAt: u.lastSeenAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() };
  };
  const commentCols = { id: comments.id, author: authorCols, source: comments.source, body: comments.body, internal: comments.internal, pending: comments.pending, createdAt: comments.createdAt };
  /** The person a team token votes for: an existing board user by externalId, or by e-mail (an unknown e-mail becomes an unverified contact, as in submit_insight). */
  async function voterFor(tx: Tx, v: { email?: string; externalId?: string; name?: string; company?: string }, create: boolean) {
    if (v.externalId) {
      const [u] = await tx.select().from(users).where(eq(users.externalId, v.externalId));
      if (!u) throw new ApiNotFound(`No person with externalId ${JSON.stringify(v.externalId.slice(0, 80))} on this board.`);
      return { user: u, known: true, email: u.email };
    }
    if (create) {
      const who = await customerFor(tx, project, { email: v.email, name: v.name, company: v.company });
      if (!who.user) throw new ToolError("Give a valid e-mail address or externalId.");
      return { user: who.user, known: who.known, email: who.email };
    }
    const [u] = await tx.select().from(users).where(sql`lower(${users.email}) = ${(v.email ?? "").trim().toLowerCase()}`).limit(1);
    return u ? { user: u, known: true, email: u.email } : null;
  }
  async function idea(tx: Tx, n: number) {
    const item = await mustGet(tx, n);
    if (item.kind !== "idea") throw new ToolError(`#${n} is a bug report; only ideas take votes.`);
    if (item.mergedIntoId) {
      const [into] = await tx.select({ number: items.number }).from(items).where(eq(items.id, item.mergedIntoId));
      throw new ToolError(`#${n} was merged into #${into?.number ?? "?"}; vote there.`);
    }
    return item;
  }
  const fresh = async (tx: Tx, id: string) => (await withAuthors(tx, [(await tx.query.items.findFirst({ where: eq(items.id, id) }))!]))[0]!;

  const api: ApiBackend = {
    page: (a) => run(async (tx) => {
      const where: SQL[] = [];
      if (a.kind) where.push(eq(items.kind, a.kind));
      if (a.status) where.push(eq(items.status, a.status as Item["status"]));
      if (a.tag) {
        const tag = tagFromParam(await listTags(tx, teamTags), a.tag, teamTags);
        if (!tag) return { items: [], nextCursor: null };
        where.push(hasTag(tag.id));
      }
      const q = a.q?.trim().slice(0, 200);
      const mode = a.unanswered ? "unanswered" : q ? "q" : a.sort === "mrr" && !customers ? "top" : a.sort;
      const c = decodeCursor<{ m?: string; v?: unknown; n?: unknown; o?: unknown }>(a.cursor);
      if (a.cursor && (!c || c.m !== mode)) throw new CursorError();
      const int = (x: unknown, max = 2_147_483_647) => { if (!Number.isInteger(x) || (x as number) < 0 || (x as number) > max) throw new CursorError(); return x as number; };
      const take = a.limit + 1;
      let rows: McpItem[];
      let offset = 0;
      if (mode === "new") {
        if (c) where.push(sql`${items.number} < ${int(c.n)}`);
        rows = await list(tx, where, [desc(items.number)], take);
      } else if (mode === "top") {
        if (c) where.push(sql`(${items.voteCount}, ${items.number}) < (${int(c.v)}, ${int(c.n)})`);
        rows = await list(tx, where, [desc(items.voteCount), desc(items.number)], take);
      } else {
        offset = c ? int(c.o, 10_000) : 0;
        if (mode === "unanswered") {
          if (!customers) throw new ToolError("The unanswered queue is for team tokens with the triage scope.");
          where.push(unansweredWhere(project.unansweredDays));
          rows = await list(tx, where, [asc(waitingSinceSql), asc(items.createdAt), asc(items.number)], take, { waiting: true, offset });
        } else if (mode === "q") {
          const score = sql`greatest(word_similarity(ozvi_fold(${q}), ozvi_fold(${items.title})), 0.7 * word_similarity(ozvi_fold(${q}), ozvi_fold(left(${items.body}, 2000))))`;
          where.push(sql`${score} >= 0.3`);
          rows = await list(tx, where, [desc(score), desc(items.voteCount), desc(items.number)], take, { offset });
        } else {
          rows = await list(tx, where, [desc(itemMrrSql), desc(items.voteCount), desc(items.number)], take, { offset });
        }
      }
      const out = rows.slice(0, a.limit);
      const last = out.at(-1);
      const nextCursor = rows.length > a.limit && last
        ? encodeCursor(mode === "new" ? { m: mode, n: last.number } : mode === "top" ? { m: mode, v: last.votes, n: last.number } : { m: mode, o: offset + a.limit })
        : null;
      return { items: out, nextCursor };
    }),

    comments: (n) => run(async (tx) => {
      const item = await itemByNumber(tx, n);
      if (!item || !reachable(item)) return null;
      const rows = await tx.select(commentCols).from(comments).leftJoin(users, eq(users.id, comments.authorId))
        .where(and(eq(comments.itemId, item.id), isNull(comments.deletedAt),
          ...(team ? [] : [eq(comments.internal, false), or(eq(comments.pending, false), eq(comments.authorId, user.id))!])))
        .orderBy(asc(comments.createdAt));
      return rows.map((c): ApiComment => ({ id: c.id, author: authorOf(c.author?.externalId ? c.author : null), source: sourceOf(c.source), body: c.body,
        internal: c.internal, pending: c.pending, createdAt: c.createdAt.toISOString() }));
    }),

    addComment: (n, body, internal) => run(async (tx) => {
      if (!allow("comment", user.id)) throw new RateLimitError(apiLoc);
      const c = await addCommentTo(tx, project, user, await mustGet(tx, n), body, internal, channel);
      return { id: c.id, author: authorOf(user), source: sourceOf(c.source), body: c.body, internal: c.internal, pending: c.pending, createdAt: c.createdAt.toISOString() };
    }),

    voters: (n) => run(async (tx) => {
      if (!customers) throw new ToolError("Voters are for team tokens with the triage scope.");
      const item = await itemByNumber(tx, n);
      if (!item || !reachable(item)) return null;
      const rows = await tx.select({ name: users.name, email: users.email, externalId: users.externalId, role: users.role, traits: users.traits, weight: schema.votes.weight, at: schema.votes.createdAt })
        .from(schema.votes).innerJoin(users, eq(users.id, schema.votes.userId)).where(eq(schema.votes.itemId, item.id)).orderBy(asc(schema.votes.createdAt));
      return rows.map((r) => {
        const c = readCustomer(r.traits);
        return { name: r.name, email: r.email, externalId: r.externalId, trust: trustOf(r), weight: r.weight, company: c.company, plan: c.plan,
          mrrCents: c.mrr, currency: c.currency, votedAt: r.at.toISOString() };
      });
    }),

    vote: (n, v) => run(async (tx) => {
      if (!customers) throw new ToolError("Voting on behalf of a customer is for team tokens with the triage scope.");
      if (!allow("vote", `api:${auth.tokenId}`)) throw new RateLimitError(apiLoc);
      const item = await idea(tx, n);
      const who = (await voterFor(tx, v, true))!;
      const customer = { known: who.known, email: who.email, externalId: who.user.externalId, trust: trustOf(who.user) };
      const done = async (voted: boolean, reason: "already_voted" | "author" | "blocked" | "budget" | null, weight: number | null) =>
        ({ voted, reason, weight, customer, item: await fresh(tx, item.id) });
      // The same rules as submit_insight: no vote for blocked people or the author, an existing vote is kept as it is.
      if (who.user.blockedAt) return done(false, "blocked", null);
      if (item.authorId === who.user.id) return done(false, "author", null);
      const [had] = await tx.select({ w: schema.votes.weight }).from(schema.votes).where(and(eq(schema.votes.itemId, item.id), eq(schema.votes.userId, who.user.id)));
      if (had) return done(false, "already_voted", had.w);
      const r = await applyVote(tx, project, who.user.id, item.id, v.weight ?? 1);
      if (!r.ok) {
        if (r.reason === "budget") return done(false, "budget", null);
        throw new ToolError(`#${n} takes no votes right now (deleted or waiting for approval).`);
      }
      return done(true, null, r.weight);
    }),

    unvote: (n, v) => run(async (tx) => {
      if (!customers) throw new ToolError("Voting on behalf of a customer is for team tokens with the triage scope.");
      const item = await idea(tx, n);
      const who = await voterFor(tx, v, false);
      const [had] = who ? await tx.select({ w: schema.votes.weight }).from(schema.votes).where(and(eq(schema.votes.itemId, item.id), eq(schema.votes.userId, who.user.id))) : [];
      if (who && had) await applyVote(tx, project, who.user.id, item.id, 0);
      return { removed: !!had, item: await fresh(tx, item.id) };
    }),

    statuses: () => run(async (tx) => {
      const subs = await listSubStatuses(tx);
      const stages = (kind: "idea" | "bug") => stagesOf(kind).map((key) => ({
        key, label: stopLabel(apiLoc, key, project),
        subStatuses: subs.filter((s) => s.kind === kind && s.stage === key)
          .map((s) => ({ id: s.id, label: subLabel(s, apiLoc, fallbackLocale), labels: s.labels as Record<string, string> })),
      }));
      return { idea: stages("idea"), bug: stages("bug") };
    }),

    update: (n, u) => run(async (tx) => {
      if (!team) throw new ToolError("Only the team can change items.");
      let item = await mustGet(tx, n);
      for (const url of u.pullRequests ?? []) await attachProof(tx, project.id, item.id, { kind: "pr", url }, user.id);
      if (u.previewUrl) await attachProof(tx, project.id, item.id, { kind: "preview", url: u.previewUrl }, user.id);
      if (u.status !== undefined || u.subStatus !== undefined || u.fixedInVersion !== undefined || u.pullRequests?.length || u.previewUrl) {
        const status = u.status ?? item.status;
        let subId: string | null | undefined;
        if (u.subStatus === null) subId = null;
        else if (u.subStatus !== undefined) {
          const want = u.subStatus.trim().toLowerCase();
          const sub = (await listSubStatuses(tx)).find((s) => s.kind === item.kind && s.stage === status
            && (s.id === want || Object.values(s.labels).some((l) => l?.toLowerCase() === want)));
          if (!sub) throw new ToolError(`No sub-status "${u.subStatus.slice(0, 40)}" under ${status} for ${item.kind}s (see GET /statuses).`);
          subId = sub.id;
        }
        item = (await changeStatus(tx, project, user, item, status, u.fixedInVersion, subId !== undefined ? { subStatusId: subId } : {})) ?? item;
      }
      if (u.tags) {
        const current = ((await tagsByItem(tx, [item.id], true)).get(item.id) ?? []).map((x) => x.id);
        let next = u.tags.set ? await tagIdsByName(tx, u.tags.set) : current;
        if (u.tags.add?.length) next = [...new Set([...next, ...(await tagIdsByName(tx, u.tags.add))])];
        if (u.tags.remove?.length) { const drop = await tagIdsByName(tx, u.tags.remove); next = next.filter((id) => !drop.includes(id)); }
        await setItemTags(tx, project, user, item, next);
      }
      return fresh(tx, item.id);
    }),

    getUpdate: (id) => run(async (tx) => (await mcpUpdates(tx, project, customers, 1, id))[0] ?? null),

    createDraft: (input) => run(async (tx) => {
      if (!customers) throw new ToolError("Drafts are for team tokens with the triage scope.");
      const ideas = await ideasFor(tx, input.items);
      const entry = await saveEntry(tx, project, user, { title: input.title, body: input.body, itemIds: ideas.map((i) => i.id) }, undefined, apiLoc);
      return (await mcpUpdates(tx, project, true, 1, entry.id))[0]!;
    }),

    users: (a) => run(async (tx) => {
      if (!customers) throw new ToolError("People are for team tokens with the triage scope.");
      const c = decodeCursor<{ id?: unknown }>(a.cursor);
      if (a.cursor && (typeof c?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(c.id))) throw new CursorError();
      const like = a.q?.trim() ? `%${a.q.trim().slice(0, 100).replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
      const rows = await tx.select(userCols).from(users).where(and(
        c ? gt(users.id, c.id as string) : undefined,
        like ? or(ilike(users.name, like), ilike(users.email, like)) : undefined,
        a.role ? eq(users.role, a.role as ApiUser["role"]) : undefined,
        a.email ? sql`lower(${users.email}) = ${a.email.trim().toLowerCase()}` : undefined,
        a.externalId ? eq(users.externalId, a.externalId) : undefined,
      )).orderBy(asc(users.id)).limit(a.limit + 1);
      const out = rows.slice(0, a.limit);
      return { users: out.map(userOut), nextCursor: rows.length > a.limit ? encodeCursor({ id: out.at(-1)!.id }) : null };
    }),

    user: (id) => run(async (tx) => {
      if (!customers) throw new ToolError("People are for team tokens with the triage scope.");
      const [u] = await tx.select(userCols).from(users).where(eq(users.id, id));
      return u ? userOut(u) : null;
    }),

    webhooks: () => run(async (tx) => {
      if (user.role !== "admin" || !customers) throw new ToolError("Webhooks are for admins' tokens with the triage scope.");
      const { webhooks, webhookDeliveries } = schema;
      const rows = await tx.select({
        hook: webhooks,
        failed: sql<number>`(select count(*)::int from ${webhookDeliveries} d where d.webhook_id = ${webhooks.id} and d.status = 'failed' and d.created_at > now() - interval '7 days')`,
        last: sql<string | null>`(select max(d.sent_at)::text from ${webhookDeliveries} d where d.webhook_id = ${webhooks.id})`,
      }).from(webhooks).orderBy(webhooks.createdAt);
      return rows.map(({ hook, failed, last }) => {
        let url = "";
        try { const u = new URL(hook.url); url = `${u.protocol}//${u.host}${u.pathname.length > 1 ? "/…" : "/"}`; } catch { url = "(invalid)"; }
        return { id: hook.id, url, format: hook.format, events: hook.events, includeBugs: hook.includeBugs, active: hook.active,
          failedLast7Days: failed, lastDeliveredAt: last ? new Date(last).toISOString() : null, createdAt: hook.createdAt.toISOString() };
      });
    }),
  };

  return {
    api,
    project: { slug: project.slug, name: project.name },
    user: { name: user.name, role: user.role },
    scope,
    // The project's setting ("verified") or the connection's own header, whichever is stricter.
    lockdown: strictestLockdown(project.mcpLockdown ? "verified" : "off", auth.lockdown ?? "off"),
    // Per-token secret: a confirmation code from one token is useless for another.
    secret: createHash("sha256").update(`${process.env.OZVI_SESSION_SECRET ?? ""}:mcp:${auth.tokenId}`).digest("hex"),
    hasGithub: !!gh,

    search: (a: SearchInput) => run(async (tx) => {
      const where: SQL[] = [];
      if (a.kind) where.push(eq(items.kind, a.kind));
      if (a.status) where.push(eq(items.status, a.status as Item["status"]));
      if (a.tag) {
        // Unknown or team-only (for non-team tokens) tags match nothing, so their existence never leaks.
        const tag = tagFromParam(await listTags(tx, teamTags), a.tag, teamTags);
        if (!tag) return [];
        where.push(hasTag(tag.id));
      }
      if (a.unanswered) {
        if (!customers) throw new ToolError("The unanswered queue is for team tokens with the triage scope.");
        where.push(unansweredWhere(project.unansweredDays));
        return list(tx, where, [asc(waitingSinceSql), asc(items.createdAt)], a.limit, { waiting: true });
      }
      if (a.query?.trim()) {
        const q = a.query.trim().slice(0, 200);
        const score = sql`greatest(word_similarity(ozvi_fold(${q}), ozvi_fold(${items.title})), 0.7 * word_similarity(ozvi_fold(${q}), ozvi_fold(left(${items.body}, 2000))))`;
        where.push(sql`${score} >= 0.3`);
        return list(tx, where, [desc(score), desc(items.voteCount)], a.limit);
      }
      const order = a.sort === "mrr" && customers ? [desc(itemMrrSql), desc(items.voteCount), desc(items.createdAt)]
        : a.sort === "top" || a.sort === "mrr" ? [desc(items.voteCount), desc(items.createdAt)] : [desc(items.createdAt)];
      return list(tx, where, order, a.limit);
    }),

    get: (n: number) => run(async (tx): Promise<McpItemDetail | null> => {
      const item = await itemByNumber(tx, n);
      if (!item || !reachable(item)) return null;
      const [author] = item.authorId ? await tx.select(authorCols).from(users).where(eq(users.id, item.authorId)) : [];
      const cs = await tx.select({ author: authorCols, source: comments.source, body: comments.body, internal: comments.internal, createdAt: comments.createdAt })
        .from(comments).leftJoin(users, eq(users.id, comments.authorId))
        .where(and(eq(comments.itemId, item.id), isNull(comments.deletedAt), ...(team ? [] : [eq(comments.internal, false), eq(comments.pending, false)]))).orderBy(asc(comments.createdAt));
      const files = await tx.select().from(attachments).where(eq(attachments.itemId, item.id));
      const links = await tx.select().from(itemLinks).where(eq(itemLinks.itemId, item.id));
      let mergedInto: number | null = null;
      if (item.mergedIntoId) {
        const target = await tx.query.items.findFirst({ where: eq(items.id, item.mergedIntoId) });
        mergedInto = target && reachable(target) ? target.number : null;
      }
      const who = customers ? await itemDemand(tx, item, 100) : null;
      const [vc] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.votes).where(eq(schema.votes.itemId, item.id));
      const itemTagNames = ((await tagsByItem(tx, [item.id], teamTags)).get(item.id) ?? []).map((x) => x.name);
      const sub = item.subStatusId ? (await subLabelMap(tx, project, fallbackLocale)).get(item.subStatusId) ?? null : null;
      return {
        item: { ...toMcp(item, author ?? null), mergedInto, links: links.map((l) => ({ ref: l.ref, url: l.url, state: l.state })),
          proof: await itemProofOut(tx, item),
          voters: vc?.n ?? 0, ...(who ? { demand: demandOut(who.demand) } : {}), tags: itemTagNames, subStatus: sub },
        ...(who ? { customers: who.people.map((p): McpCustomer => ({ name: p.name, company: p.company, plan: p.plan, mrrCents: p.mrr,
          currency: p.currency, weight: p.weight, author: p.author })) } : {}),
        comments: cs.map((c) => ({ ...c, author: authorOf(c.author?.externalId ? c.author : null), source: sourceOf(c.source), createdAt: c.createdAt.toISOString() })),
        attachments: files.map((f) => ({ name: f.name, mime: f.mime, url: `${base}/files/${f.id}` })),
        // The widget capture (network log, steps, session links) is team-only, like on the board.
        context: item.kind === "bug" ? contextFor(item.context as Record<string, unknown> | null, team) : null,
      };
    }),

    summary: (days: number) => run(async (tx): Promise<Summary> => {
      const since = new Date(Date.now() - days * 86_400_000);
      const counts = await tx.select({ kind: items.kind, status: items.status, n: sql<number>`count(*)::int`, recent: sql<number>`count(*) filter (where ${items.createdAt} >= ${since.toISOString()}::timestamptz)::int` })
        .from(items).where(and(isNull(items.mergedIntoId), visible)).groupBy(items.kind, items.status);
      const by = (k: "bug" | "idea") => Object.fromEntries(counts.filter((c) => c.kind === k).map((c) => [c.status, c.n]));
      const sum = (k: "bug" | "idea") => counts.filter((c) => c.kind === k).reduce((s, c) => s + c.recent, 0);
      return {
        days,
        newIdeas: sum("idea"),
        newBugs: sum("bug"),
        openBugsByStatus: Object.fromEntries(Object.entries(by("bug")).filter(([s]) => ["new", "confirmed", "in_progress"].includes(s))),
        ideasByStatus: by("idea"),
        topIdeas: await list(tx, [eq(items.kind, "idea"), inArray(items.status, ["open", "planned", "in_progress"])], [desc(items.voteCount)], 10),
        recentBugs: await list(tx, [eq(items.kind, "bug"), gte(items.createdAt, since)], [desc(items.createdAt)], 15),
      };
    }),

    tags: () => run(async (tx) => (await listTags(tx, teamTags)).map((x) => ({ name: x.name, color: x.color, public: x.public }))),

    setTags: (n, names, mode) => run(async (tx) => {
      if (!team) throw new ToolError("Only the team can tag items.");
      const item = await mustGet(tx, n);
      const ids = await tagIdsByName(tx, names);
      const current = ((await tagsByItem(tx, [item.id], true)).get(item.id) ?? []).map((x) => x.id);
      const next = mode === "set" ? ids : mode === "add" ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id));
      return (await setItemTags(tx, project, user, item, next)).map((x) => x.name);
    }),

    similar: async (a) => {
      const queryVector = a.text && !a.number && aiAllowed ? await embedQuery(a.text) : null;
      return run(async (tx) => {
      const source = a.number ? await mustGet(tx, a.number) : null;
      const rows = await findSimilar(tx, {
        queryVector,
        text: source ? `${source.title}\n\n${source.body}` : a.text!,
        excludeId: source?.id,
        limit: a.limit,
        where: [team ? sql`true` : sql`(${items.kind} = 'idea' or ${items.authorId} = ${user.id})`, ...(source ? [sql`${items.kind} = ${source.kind}`] : [])],
      });
      const who = await authorsById(tx, rows.map((r) => r.authorId));
      return rows.map((r) => ({
        number: r.number, kind: r.kind, title: r.title, body: "", status: r.status, votes: r.votes, fixedInVersion: null,
        url: `${base}/i/${r.number}`, createdAt: "", author: itemAuthorOf({ authorId: r.authorId, context: r.system ? { insight: true } : null }, r.authorId ? who.get(r.authorId) : null), source: sourceOf(r.source), score: r.score,
        // Machine suggestions (embeddings model) are labelled; plain text similarity is not AI.
        ai: suggestModel ? { generated: true as const, model: suggestModel, reviewedBy: null } : null,
      }));
      });
    },

    create: async (a) => {
      try {
        const number = await createItemFor(project, user, { kind: a.kind, title: a.title, body: a.body, context: { appVersion: channel === "api" ? "API" : "MCP" }, files: [], source: channel });
        return run(async (tx) => toMcp((await itemByNumber(tx, number))!, user));
      } catch (e) {
        if (e instanceof ValidationError || e instanceof RateLimitError || e instanceof DomainError) throw new ToolError(e.message);
        throw e;
      }
    },

    submitInsight: async (a) => {
      if (!customers) throw new ToolError("Insights are for team tokens with the triage scope.");
      if (!allow("item", user.id)) throw new ToolError(new RateLimitError().message);
      const queryVector = !a.match && aiAllowed ? await embedQuery(`${a.title}\n\n${a.text}`) : null;
      return run(async (tx) => {
        const r = await submitInsight(tx, project, user, a, { queryVector, mustGet });
        const who = await authorsById(tx, [r.item.authorId, ...r.candidates.map((c) => c.authorId)]);
        return {
          action: r.action, voted: r.voted, customer: r.customer,
          item: toMcp(r.item, r.item.authorId ? who.get(r.item.authorId) ?? null : null),
          candidates: r.candidates.map((c) => ({
            number: c.number, kind: c.kind, title: c.title, body: "", status: c.status, votes: c.votes, fixedInVersion: null,
            url: `${base}/i/${c.number}`, createdAt: "", author: itemAuthorOf({ authorId: c.authorId, context: c.system ? { insight: true } : null }, c.authorId ? who.get(c.authorId) : null), source: sourceOf(c.source), score: c.score,
          })),
        };
      });
    },

    comment: (n, body, internal) => run(async (tx) => {
      if (!allow("comment", user.id)) throw new RateLimitError();
      await addCommentTo(tx, project, user, await mustGet(tx, n), body, internal, channel);
    }),

    setStatus: (n, status, version, proof) => run(async (tx) => {
      const item = await mustGet(tx, n);
      // Evidence first, so the status change (and the reporter's e-mail) carries it.
      for (const url of proof?.pullRequests ?? []) await attachProof(tx, project.id, item.id, { kind: "pr", url }, user.id);
      if (proof?.previewUrl) await attachProof(tx, project.id, item.id, { kind: "preview", url: proof.previewUrl }, user.id);
      return (await withAuthors(tx, [(await changeStatus(tx, project, user, item, status, version)) ?? item]))[0]!;
    }),

    listUpdates: (a) => run(async (tx) => {
      if (a.drafts && !customers) throw new ToolError("Drafts are for team tokens with the triage scope.");
      return mcpUpdates(tx, project, a.drafts, a.limit);
    }),
    getDraft: (id) => run(async (tx) => {
      if (!customers) throw new ToolError("Drafts are for team tokens with the triage scope.");
      const [d] = await mcpUpdates(tx, project, true, 1, id);
      if (!d) return null;
      const ids = await tx.select({ id: schema.changelogItems.itemId }).from(schema.changelogItems).where(eq(schema.changelogItems.entryId, id));
      const ideaIds = (await tx.select({ id: items.id }).from(items).where(and(inArray(items.id, ids.length ? ids.map((r) => r.id) : [NONE]), eq(items.kind, "idea")))).map((r) => r.id);
      const [r] = ideaIds.length ? await tx.select({ n: sql<number>`count(distinct ${users.id})::int` }).from(users)
        .where(and(sql`${users.id} in (select ${schema.votes.userId} from ${schema.votes} where ${inArray(schema.votes.itemId, ideaIds)} union select ${items.authorId} from ${items} where ${inArray(items.id, ideaIds)})`,
          sql`${users.email} is not null`, eq(users.emailOptOut, false), sql`${users.id} <> ${user.id}`)) : [{ n: 0 }];
      return { ...d, recipients: r?.n ?? 0 };
    }),
    publishDraft: (id) => run(async (tx) => {
      if (!customers) throw new ToolError("Drafts are for team tokens with the triage scope.");
      const r = await publishEntry(tx, project, user, id);
      return { url: `${base}/changelog#e-${r.entry.id}`, emailed: r.emailed };
    }),

    linkIssue: (n, issue) => run(async (tx) => linkIssue(tx, project, user, await mustGet(tx, n), issue)),
    createIssue: (n) => run(async (tx) => createIssue(tx, project, user, await mustGet(tx, n))),

    previewUpdate: (input) => run(async (tx) => {
      const ideas = await ideasFor(tx, input.items);
      const ids = ideas.map((i) => i.id);
      // Same rule as the e-mail: voters and authors, with an address, not opted out, not you.
      const [r] = ids.length ? await tx.select({ n: sql<number>`count(distinct ${users.id})::int` }).from(users)
        .where(and(sql`${users.id} in (select ${schema.votes.userId} from ${schema.votes} where ${inArray(schema.votes.itemId, ids)} union select ${items.authorId} from ${items} where ${inArray(items.id, ids)})`,
          sql`${users.email} is not null`, eq(users.emailOptOut, false), sql`${users.id} <> ${user.id}`)) : [{ n: 0 }];
      return { ideas: await withAuthors(tx, ideas), recipients: r?.n ?? 0 };
    }),

    publishUpdate: (input) => run(async (tx) => {
      // Idempotent within 30 minutes: a retried or repeated confirm must not publish (and e-mail) twice.
      const [dup] = await tx.select({ id: schema.changelogEntries.id }).from(schema.changelogEntries)
        .where(and(eq(schema.changelogEntries.title, input.title.trim()), gte(schema.changelogEntries.publishedAt, new Date(Date.now() - 30 * 60_000)))).limit(1);
      if (dup) return { url: `${base}/changelog#${dup.id}`, emailed: 0 };
      const ideas = await ideasFor(tx, input.items);
      const entry = await saveEntry(tx, project, user, { title: input.title, body: input.body, itemIds: ideas.map((i) => i.id) });
      const r = await publishEntry(tx, project, user, entry.id);
      return { url: `${base}/changelog#${entry.id}`, emailed: r.emailed };
    }),

    merge: (s, t) => run(async (tx) => {
      const r = await mergeItems(tx, project, user, await mustGet(tx, s), await mustGet(tx, t));
      const [source, target] = await withAuthors(tx, [r.source, r.target]);
      return { source: source!, target: target! };
    }),
  };
}
