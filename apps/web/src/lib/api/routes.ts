import { withProject } from "@ozvi/db";
import { checkConfirm, confirmCode, type Backend, type Lockdown, type Scope } from "@ozvi/mcp";
import type { z } from "zod";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { csvHeaders, delimiterFor, toCsv, type Cell } from "../csv";
import { db } from "../db";
import { projectOrigin } from "../email/url";
import { exportComments, exportItems, exportVoters, listFilter } from "../export";
import type { TokenAuth } from "../tokens";
import { ApiNotFound, type ApiBackend } from "./types";
import { ApiProblem, type ProblemCode } from "./problem";
import * as S from "./schemas";

/**
 * The REST API's route table. One entry per operation: the handler, the scope it needs, its schemas.
 * handler.ts dispatches by it and openapi.ts documents it, so the spec lists exactly what is served.
 */

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface Ctx {
  b: Backend & { api: ApiBackend };
  auth: TokenAuth;
  lockdown: Lockdown;
  locale: Locale;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  req: Request;
}

export type Result = { status?: number; body?: unknown; headers?: Record<string, string> } | Response;

export interface Route {
  id: string;
  method: Method;
  /** Relative to /<slug>/api/v1, with {param} segments. */
  path: string;
  tag: "Items" | "Comments" | "Votes" | "Board" | "Changelog" | "People" | "Integrations" | "Account";
  summary: string;
  description?: string;
  /** Minimum scope; `need` can raise it per request (e.g. internal comments). */
  scope: Scope;
  need?: (c: Pick<Ctx, "query" | "body">) => Scope;
  /** Role on top of the scope (webhooks: admins only). */
  admin?: boolean;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Response schema (registered in schemas.responses), or "csv" for a file. */
  response: { status: number; schema?: z.ZodType; csv?: boolean; description: string };
  /** POST that creates something: honours Idempotency-Key. */
  idempotent?: boolean;
  /** Problems this operation can answer with besides the common ones. */
  errors?: ProblemCode[];
  run(c: Ctx): Promise<Result>;
}

const n = (c: Ctx) => c.params.number as number;
const notFound = (what: string) => new ApiProblem("not_found", `${what} does not exist or this token cannot see it.`);

export const ROUTES: Route[] = [
  {
    id: "getMe", method: "GET", path: "/me", tag: "Account", scope: "read",
    summary: "Who the token acts as",
    description: "The project, the token owner, the effective scope (token scope capped by the owner's current role) and lockdown.",
    response: { status: 200, schema: S.Me, description: "The token's identity." },
    run: async ({ b }) => ({ body: { project: b.project, user: b.user, scope: b.scope, lockdown: b.lockdown } }),
  },

  /* ---------- items ---------- */
  {
    id: "listItems", method: "GET", path: "/items", tag: "Items", scope: "read",
    need: ({ query }) => (query.unanswered || query.sort === "mrr" ? "triage" : "read"),
    summary: "List ideas and bug reports",
    description: "Bugs are private: a member's token sees ideas and their own bugs; team tokens see everything. Cursor pagination: pass `nextCursor` back as `cursor` with the same filters. With the triage scope ideas also carry `demand` (customers' companies and MRR).",
    query: S.ItemsQuery,
    response: { status: 200, schema: S.ItemPage, description: "A page of items." },
    errors: ["invalid_cursor"],
    run: async ({ b, query }) => {
      const r = await b.api.page(query as never);
      return { body: { data: r.items, nextCursor: r.nextCursor } };
    },
  },
  {
    id: "createItem", method: "POST", path: "/items", tag: "Items", scope: "write", idempotent: true,
    summary: "Create an idea or a bug report",
    description: "Filed as the token's owner with source `api`. Ideas from outside the team may wait in the moderation queue. The same title from the same person within a few minutes returns the first item (and 200 instead of 201).",
    body: S.CreateItem,
    response: { status: 201, schema: S.Item, description: "The new item." },
    errors: ["unprocessable"],
    run: async ({ b, body }) => {
      const item = await b.create(body as { kind: "bug" | "idea"; title: string; body: string });
      return { status: 201, body: item, headers: { location: item.url } };
    },
  },
  {
    id: "getItem", method: "GET", path: "/items/{number}", tag: "Items", scope: "read",
    summary: "Get one item",
    description: "With comments, attachments and (bugs) the masked browser context. Answers with an ETag; send it as If-None-Match to get 304 when nothing changed.",
    params: S.NumberParam,
    response: { status: 200, schema: S.ItemDetail, description: "The item." },
    run: async (c) => {
      const d = await c.b.get(n(c));
      if (!d) throw notFound(`#${n(c)}`);
      return { body: d };
    },
  },
  {
    id: "updateItem", method: "PATCH", path: "/items/{number}", tag: "Items", scope: "triage",
    summary: "Change status, sub-status, version, proof or tags",
    description: "Team only. A bug set to `fixed` with `fixedInVersion` asks the reporter to confirm the fix; proof (PR URLs, preview URL) is attached first and travels with the e-mail. Voters are not e-mailed on status changes; they hear once, through a published changelog entry.",
    params: S.NumberParam, body: S.UpdateItem,
    response: { status: 200, schema: S.ItemDetail, description: "The item after the change." },
    errors: ["unprocessable"],
    run: async (c) => {
      await c.b.api.update(n(c), c.body as never);
      return { body: (await c.b.get(n(c)))! };
    },
  },
  {
    id: "mergeItem", method: "POST", path: "/items/{number}/merge", tag: "Items", scope: "triage",
    summary: "Merge a duplicate into the original",
    description: "Irreversible: votes move to the original and this item is closed. The first call (without `confirm`) answers 409 `confirmation_required` with a `preview` and a `confirm` code valid about 10 minutes; show the preview to a person and repeat the call with the code. The code is bound to the token and to both numbers (and works for MCP merge_items too).",
    params: S.NumberParam, body: S.MergeItem,
    response: { status: 200, schema: S.MergeResult, description: "Merged." },
    errors: ["confirmation_required", "confirmation_invalid", "unprocessable"],
    run: async (c) => {
      const { into, confirm } = c.body as { into: number; confirm?: string };
      const args = { duplicate: n(c), original: into };
      if (!confirm) {
        const [d, o] = await Promise.all([c.b.get(args.duplicate), c.b.get(args.original)]);
        if (!d || !o) throw notFound(`#${!d ? args.duplicate : args.original}`);
        throw new ApiProblem("confirmation_required",
          `#${args.duplicate} (${d.item.votes} votes) will be closed and merged into #${args.original} (${o.item.votes} votes). Repeat the request with "confirm".`,
          { preview: { duplicate: d.item, original: o.item }, confirm: confirmCode(c.b.secret, "merge", args) });
      }
      if (!checkConfirm(c.b.secret, "merge", args, confirm)) throw new ApiProblem("confirmation_invalid", "Call again without confirm for a new preview.");
      const r = await c.b.merge(args.duplicate, args.original);
      return { body: { status: "merged", duplicate: r.source, original: r.target } };
    },
  },

  /* ---------- comments ---------- */
  {
    id: "listComments", method: "GET", path: "/items/{number}/comments", tag: "Comments", scope: "read",
    summary: "List an item's comments",
    description: "Oldest first. Internal notes and comments waiting for approval only for the team (and your own).",
    params: S.NumberParam,
    response: { status: 200, schema: S.CommentList, description: "Comments." },
    run: async (c) => {
      const list = await c.b.api.comments(n(c));
      if (!list) throw notFound(`#${n(c)}`);
      return { body: { data: list } };
    },
  },
  {
    id: "createComment", method: "POST", path: "/items/{number}/comments", tag: "Comments", scope: "write", idempotent: true,
    need: ({ body }) => (body.internal ? "triage" : "write"),
    summary: "Comment on an item",
    description: "The reporter or author is e-mailed unless the comment is internal (team only, triage scope). A comment from outside the team with three or more links waits for approval (`pending`).",
    params: S.NumberParam, body: S.CreateComment,
    response: { status: 201, schema: S.Comment, description: "The comment." },
    errors: ["unprocessable"],
    run: async (c) => ({ status: 201, body: await c.b.api.addComment(n(c), (c.body.body as string), !!c.body.internal) }),
  },

  /* ---------- votes ---------- */
  {
    id: "listVoters", method: "GET", path: "/items/{number}/votes", tag: "Votes", scope: "triage",
    summary: "List an idea's voters",
    description: "Team only (personal data): who voted, how strongly, and their company/plan/MRR from your app's traits.",
    params: S.NumberParam,
    response: { status: 200, schema: S.VoterList, description: "Voters, oldest vote first." },
    run: async (c) => {
      const list = await c.b.api.voters(n(c));
      if (!list) throw notFound(`#${n(c)}`);
      return { body: { data: list } };
    },
  },
  {
    id: "castVote", method: "POST", path: "/items/{number}/votes", tag: "Votes", scope: "triage", idempotent: true,
    summary: "Vote on behalf of a customer",
    description: "Team only. Records a customer's demand from support, sales or your CRM, with the same rules as MCP submit_insight: the person is found by `externalId` or `email` (an unknown e-mail becomes an unverified contact that never gets e-mails); blocked people and the idea's author get no vote; an existing vote is kept as it is; the board's vote budget applies. Voting never subscribes anybody: voters only get the changelog e-mail.",
    params: S.NumberParam, body: S.CastVote,
    response: { status: 200, schema: S.VoteResult, description: "What happened (`voted`, or `reason` why not)." },
    errors: ["unprocessable"],
    run: async (c) => ({ body: await c.b.api.vote(n(c), c.body as never) }),
  },
  {
    id: "removeVote", method: "DELETE", path: "/items/{number}/votes", tag: "Votes", scope: "triage",
    summary: "Remove a customer's vote",
    description: "Team only. Identify the person by `email` or `externalId` in the query string.",
    params: S.NumberParam, query: S.RemoveVoteQuery,
    response: { status: 200, schema: S.UnvoteResult, description: "Whether a vote was removed." },
    run: async (c) => ({ body: await c.b.api.unvote(n(c), c.query as never) }),
  },

  /* ---------- board ---------- */
  {
    id: "listTags", method: "GET", path: "/tags", tag: "Board", scope: "read",
    summary: "List tags",
    description: "Public tags; team-only tags (public=false) only for team tokens with the triage scope.",
    response: { status: 200, schema: S.TagList, description: "Tags." },
    run: async ({ b }) => ({ body: { data: await b.tags() } }),
  },
  {
    id: "listStatuses", method: "GET", path: "/statuses", tag: "Board", scope: "read",
    summary: "Stages and custom sub-statuses",
    description: "Stages per kind in route order (the off-route one last), with the board's labels in the request's language (Accept-Language among the board's languages) and the sub-statuses under each stage.",
    response: { status: 200, schema: S.Statuses, description: "Statuses." },
    run: async ({ b }) => ({ body: await b.api.statuses() }),
  },

  /* ---------- changelog ---------- */
  {
    id: "listChangelog", method: "GET", path: "/changelog", tag: "Changelog", scope: "read",
    need: ({ query }) => (query.drafts ? "triage" : "read"),
    summary: "List changelog entries",
    description: "Newest first. `drafts=true` (triage scope) includes drafts, e.g. the ones drafted from a GitHub release. Every entry carries `ai`: null when people wrote it; never present AI-written text as written by the team.",
    query: S.ChangelogQuery,
    response: { status: 200, schema: S.UpdateList, description: "Entries." },
    run: async ({ b, query }) => ({ body: { data: await b.listUpdates!({ drafts: !!query.drafts, limit: query.limit as number }) } }),
  },
  {
    id: "createDraft", method: "POST", path: "/changelog", tag: "Changelog", scope: "triage", idempotent: true,
    summary: "Create a changelog draft",
    description: "Team only. Creates a draft (nothing is sent); publish it with POST /changelog/{id}/publish.",
    body: S.CreateDraft,
    response: { status: 201, schema: S.Update, description: "The draft." },
    errors: ["unprocessable"],
    run: async ({ b, body }) => ({ status: 201, body: await b.api.createDraft(body as never) }),
  },
  {
    id: "getChangelogEntry", method: "GET", path: "/changelog/{id}", tag: "Changelog", scope: "read",
    summary: "Get one changelog entry",
    description: "Published entries for every token; drafts only for team tokens with the triage scope.",
    params: S.IdParam,
    response: { status: 200, schema: S.Update, description: "The entry." },
    run: async ({ b, params }) => {
      const e = await b.api.getUpdate(params.id as string);
      if (!e) throw notFound("This entry");
      return { body: e };
    },
  },
  {
    id: "publishChangelogEntry", method: "POST", path: "/changelog/{id}/publish", tag: "Changelog", scope: "triage",
    summary: "Publish a draft",
    description: "Irreversible: the linked ideas become shipped and everyone who voted for them gets one e-mail. Requires `{\"confirm\": true}`; without it the answer is 409 `confirmation_required` with a `preview` (title, text, AI label, number of recipients). Publishing records the token's owner as the reviewer of AI-assisted text. Publishing an already published entry changes nothing (`emailed: 0`).",
    params: S.IdParam, body: S.PublishDraft,
    response: { status: 200, schema: S.Published, description: "Published." },
    errors: ["confirmation_required"],
    run: async ({ b, params, body }) => {
      const id = params.id as string;
      const d = await b.getDraft!(id);
      if (!d) throw notFound("This entry");
      if (d.status === "published") return { body: { id, url: d.url, emailed: 0 } };
      if (body.confirm !== true) {
        throw new ApiProblem("confirmation_required", `Publishing "${d.title}" e-mails ${d.recipients} person(s). Repeat with {"confirm": true} after a person approved the text.`,
          { preview: d });
      }
      const r = await b.publishDraft!(id);
      return { body: { id, url: r.url, emailed: r.emailed } };
    },
  },

  /* ---------- people ---------- */
  {
    id: "listUsers", method: "GET", path: "/users", tag: "People", scope: "triage",
    summary: "List people (customers and team)",
    description: "Team only. Everyone known on the board with their traits from your app (company, plan, MRR), trust level, and how many votes and posts they have.",
    query: S.UsersQuery,
    response: { status: 200, schema: S.UserPage, description: "A page of people." },
    errors: ["invalid_cursor"],
    run: async ({ b, query }) => {
      const r = await b.api.users(query as never);
      return { body: { data: r.users, nextCursor: r.nextCursor } };
    },
  },
  {
    id: "getUser", method: "GET", path: "/users/{id}", tag: "People", scope: "triage",
    summary: "Get one person",
    params: S.IdParam,
    response: { status: 200, schema: S.User, description: "The person." },
    run: async ({ b, params }) => {
      const u = await b.api.user(params.id as string);
      if (!u) throw notFound("This person");
      return { body: u };
    },
  },

  /* ---------- integrations ---------- */
  {
    id: "listWebhooks", method: "GET", path: "/webhooks", tag: "Integrations", scope: "triage", admin: true,
    summary: "List webhooks",
    description: "Admins only. Webhooks are added in admin → Integrations; secrets are never returned.",
    response: { status: 200, schema: S.WebhookList, description: "Webhooks." },
    run: async ({ b }) => ({ body: { data: await b.api.webhooks() } }),
  },
  {
    id: "export", method: "GET", path: "/export", tag: "Integrations", scope: "triage",
    summary: "Export ideas, bugs, comments or voters",
    description: "Team only. The same data as the board's CSV export, with the same filters, as CSV (default) or JSON `{columns, rows}`. Column names are in the request's language. Refused while lockdown is on (an export carries every author's text).",
    query: S.ExportQuery,
    response: { status: 200, schema: S.ExportJson, csv: true, description: "CSV file, or JSON with format=json." },
    errors: ["lockdown_active"],
    run: async ({ auth, lockdown, locale, query }) => {
      if (lockdown !== "off") throw new ApiProblem("lockdown_active", "Turn lockdown off for this request (it is the project's setting or your X-Ozvi-Lockdown header).");
      const { project } = auth;
      const what = query.what as "ideas" | "bugs" | "comments" | "voters";
      const kind = what === "bugs" ? "bug" : what === "ideas" ? "idea" : query.of === "bug" ? "bug" : "idea";
      const sp = new URLSearchParams();
      for (const k of ["q", "tag", "f", "s", "st", "plan", "sort", "item"] as const) if (query[k] !== undefined) sp.set(k, String(query[k]));
      const d = query.sep === "semicolon" ? ";" : query.sep === "comma" ? "," : delimiterFor(locale);
      const f = listFilter(kind, sp);
      const origin = projectOrigin(project);
      const sheet = await withProject(db, project.id, (tx) =>
        what === "comments" ? exportComments(tx, f, locale)
          : what === "voters" ? exportVoters(tx, f, locale, d)
            : exportItems(tx, f, locale, d, (num) => `${origin}/${project.slug}/i/${num}`, project));
      if (query.format === "json") {
        const cell = (v: Cell) => (v instanceof Date ? v.toISOString() : v ?? null);
        return { body: { columns: sheet.header, rows: sheet.rows.map((r) => r.map(cell)) } };
      }
      const t = translator(locale, "export");
      const fileKey = (what === "comments" || what === "voters" ? `${what}_${kind}` : what) as "ideas";
      const name = `${project.slug}-${t(`file.${fileKey}`)}-${new Date().toISOString().slice(0, 10)}.csv`;
      return new Response(toCsv(sheet.header, sheet.rows, d), { headers: csvHeaders(name) });
    },
  },
];

export { ApiNotFound };
