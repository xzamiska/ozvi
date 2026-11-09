import type { McpAuthor, McpItem, McpUpdate, Source, Trust } from "@ozvi/mcp";

/**
 * What the public REST API (/<slug>/api/v1) needs on top of the MCP backend. Implemented inside
 * mcpBackend (lib/mcp-backend.ts) so both share one set of visibility, scope and provenance rules.
 */

export type ItemSort = "new" | "top" | "mrr";

export interface PageInput {
  kind?: "bug" | "idea";
  status?: string;
  tag?: string;
  q?: string;
  sort: ItemSort;
  limit: number;
  cursor?: string;
  /** The team's unanswered queue (triage). */
  unanswered?: boolean;
}

export interface ApiComment {
  id: string;
  author: McpAuthor;
  source: Source;
  body: string;
  internal: boolean;
  /** Waiting for the team's approval (link spam rule); only the team and its author see it. */
  pending: boolean;
  createdAt: string;
  withheld?: boolean;
}

export interface ApiVoter {
  name: string | null;
  email: string | null;
  externalId: string;
  trust: Trust;
  weight: number;
  company: string | null;
  plan: string | null;
  mrrCents: number | null;
  currency: string;
  votedAt: string;
}

export interface VoteInput { email?: string; externalId?: string; name?: string; company?: string; weight?: number }

export interface VoteOutcome {
  /** A vote was added or changed by this call. */
  voted: boolean;
  /** Why not: already_voted (kept as it was), author (asked for it themselves), blocked, budget (vote budget spent). */
  reason: "already_voted" | "author" | "blocked" | "budget" | null;
  weight: number | null;
  customer: { known: boolean; email: string | null; externalId: string; trust: Trust };
  item: McpItem;
}

export interface ApiStage { key: string; label: string; subStatuses: { id: string; label: string; labels: Record<string, string> }[] }
export interface ApiStatuses { idea: ApiStage[]; bug: ApiStage[] }

export interface ApiUser {
  id: string;
  externalId: string;
  name: string | null;
  email: string | null;
  role: "member" | "team" | "admin";
  trust: Trust;
  blocked: boolean;
  /** Host-app traits as stored (SSO/OIDC claims: company, plan, mrr…). */
  traits: Record<string, unknown>;
  customer: { company: string | null; plan: string | null; mrrCents: number | null; currency: string };
  votes: number;
  items: number;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface ApiWebhook {
  id: string;
  /** Host only plus a masked path: chat webhook URLs carry their secret in the path. */
  url: string;
  /** json (signed), or a chat format: slack, teams, discord. */
  format: "json" | "slack" | "teams" | "discord";
  events: string[];
  includeBugs: boolean;
  active: boolean;
  failedLast7Days: number;
  lastDeliveredAt: string | null;
  createdAt: string;
}

export interface ItemUpdate {
  status?: string;
  /** Sub-status id or label (any language); null clears it. */
  subStatus?: string | null;
  fixedInVersion?: string | null;
  pullRequests?: string[];
  previewUrl?: string;
  tags?: { set?: string[]; add?: string[]; remove?: string[] };
}

export interface ApiBackend {
  page(input: PageInput): Promise<{ items: McpItem[]; nextCursor: string | null }>;
  comments(number: number): Promise<ApiComment[] | null>;
  addComment(number: number, body: string, internal: boolean): Promise<ApiComment>;
  voters(number: number): Promise<ApiVoter[] | null>;
  vote(number: number, input: VoteInput): Promise<VoteOutcome>;
  unvote(number: number, input: VoteInput): Promise<{ removed: boolean; item: McpItem }>;
  statuses(): Promise<ApiStatuses>;
  update(number: number, input: ItemUpdate): Promise<McpItem>;
  /** A published entry (anyone) or a draft (team, triage). */
  getUpdate(id: string): Promise<McpUpdate | null>;
  createDraft(input: { title: string; body: string; items: number[] }): Promise<McpUpdate>;
  users(input: { limit: number; cursor?: string; q?: string; role?: string; email?: string; externalId?: string }): Promise<{ users: ApiUser[]; nextCursor: string | null }>;
  user(id: string): Promise<ApiUser | null>;
  webhooks(): Promise<ApiWebhook[]>;
}

/** Opaque cursors: base64url JSON, so clients never build them. */
export const encodeCursor = (v: Record<string, unknown>) => Buffer.from(JSON.stringify(v)).toString("base64url");
export function decodeCursor<T extends Record<string, unknown>>(s: string | undefined): T | null {
  if (!s) return null;
  try {
    const v = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

/** A cursor that is not one of ours (or from another sort): 400 invalid_cursor. */
export class CursorError extends Error {}
/** Something the caller named does not exist (or is not visible to the token): 404. */
export class ApiNotFound extends Error {}
