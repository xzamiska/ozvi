import type { Tx } from "@ozvi/db";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { DomainError, type Item } from "./domain";
import type { Project, User } from "./project";
import { sourceOf } from "./provenance";
import {
  addTrackerLink, applyTrackerState, findLink, issueMarkdown, issueParts, itemTrust, openRow, parseBase, providerName, trackerRow, verifyHmacHex,
  type ApplyResult, type TrackerConfigBase, type TrackerIssue, type TrackerRow, type TrackerState,
} from "./trackers";
import { neutralizeLine } from "./agent-safe";

/**
 * Linear: personal API key per project (stored encrypted), one team. Issues are created from items
 * (sanitised, provenance header), existing ones linked by identifier/URL. Linear webhooks (Issue
 * events, signed "Linear-Signature": hex HMAC-SHA256 of the body; webhookTimestamp within a minute)
 * move the Ozvi item along the mapping; Ozvi moves go back through the tracker outbox.
 * PR proof: when the issue reaches a done state, its GitHub/GitLab pull request attachments become proof of the fix.
 */

const M = (l: Locale) => translator(l, "integrations");
const API = "https://api.linear.app/graphql";

export interface LinearTeam { id: string; key: string; name: string }
export interface LinearConfig extends TrackerConfigBase {
  teamId: string | null; teamKey: string | null; teamName: string | null;
  teams: LinearTeam[];
  /** Who the key belongs to (shown as the connection state). */
  viewer: string | null;
  /** Webhook created through the API (deleted on disconnect); null = set up by hand. */
  webhookId: string | null;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function parseLinearConfig(raw: unknown): LinearConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, n = 120) => (typeof v === "string" && v ? v.slice(0, n) : null);
  const teams = Array.isArray(r.teams) ? r.teams.flatMap((x) => {
    const o = x as Record<string, unknown>;
    return typeof o?.id === "string" && typeof o.name === "string" ? [{ id: o.id, key: String(o.key ?? ""), name: neutralizeLine(o.name, 80) }] : [];
  }).slice(0, 100) : [];
  return { ...parseBase("linear", r), teamId: s(r.teamId), teamKey: s(r.teamKey, 20), teamName: s(r.teamName), teams, viewer: s(r.viewer), webhookId: s(r.webhookId) };
}

export type Linear = TrackerRow<LinearConfig>;
export async function getLinear(tx: Tx): Promise<Linear | null> {
  return openRow(await trackerRow(tx, "linear"), parseLinearConfig);
}

/** Personal API keys go as-is; OAuth access tokens as Bearer. */
const authHeader = (key: string) => (key.startsWith("lin_api_") ? key : `Bearer ${key}`);

export async function linearGql<T>(key: string, query: string, variables: Record<string, unknown> = {}, f: Fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await f(API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader(key), "user-agent": "ozvi" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DomainError((l) => M(l)("linear.network"));
  }
  if (res.status === 401 || res.status === 403) throw new DomainError((l) => M(l)("linear.badKey"));
  const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string; extensions?: { code?: string; type?: string } }[] } | null;
  if (json?.errors?.length) {
    const e = json.errors[0]!;
    const code = `${e.extensions?.code ?? ""} ${e.extensions?.type ?? ""}`;
    if (/AUTHENTICATION|authentication/i.test(code)) throw new DomainError((l) => M(l)("linear.badKey"));
    if (/FORBIDDEN|forbidden/i.test(code)) throw new DomainError((l) => M(l)("linear.forbidden"));
    if (/not found|Entity not found/i.test(e.message)) throw new DomainError((l) => M(l)("linear.notFound"));
    const msg = neutralizeLine(e.message, 160);
    throw new DomainError((l) => M(l)("linear.error", { err: msg }));
  }
  if (!res.ok || !json?.data) throw new DomainError((l) => M(l)("linear.status", { s: String(res.status) }));
  return json.data;
}

export async function linearViewer(key: string, f?: Fetch) {
  const d = await linearGql<{ viewer: { name: string; email?: string }; organization: { name: string }; teams: { nodes: LinearTeam[] } }>(key,
    `query { viewer { name } organization { name } teams(first: 100) { nodes { id key name } } }`, {}, f);
  return { viewer: `${d.viewer.name} · ${d.organization.name}`, teams: d.teams.nodes };
}

export async function linearStates(key: string, teamId: string, f?: Fetch): Promise<TrackerState[]> {
  const d = await linearGql<{ team: { states: { nodes: { id: string; name: string; type: string; position: number }[] } } }>(key,
    `query($id: String!) { team(id: $id) { states(first: 100) { nodes { id name type position } } } }`, { id: teamId }, f);
  const order = ["triage", "backlog", "unstarted", "started", "completed", "canceled"];
  return d.team.states.nodes
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.position - b.position)
    .map((s) => ({ id: s.id, name: neutralizeLine(s.name, 80), type: s.type }));
}

interface LinearIssue { id: string; identifier: string; url: string; title: string; state: { id: string; name: string; type: string } | null; team?: { id: string } | null }
const ISSUE = `id identifier url title state { id name type } team { id }`;

const toTracker = (i: LinearIssue): TrackerIssue => ({
  externalId: i.id, ref: i.identifier, url: i.url, title: i.title,
  state: i.state ? { id: i.state.id, name: i.state.name, type: i.state.type } : null,
});

/** "ENG-123" or "https://linear.app/acme/issue/ENG-123/some-title". */
export function parseLinearRef(input: string): string | null {
  const s = input.trim();
  const url = /^https:\/\/linear\.app\/[A-Za-z0-9_-]+\/issue\/([A-Za-z][A-Za-z0-9_]{0,9}-\d{1,7})(?:[/?#].*)?$/.exec(s);
  if (url) return url[1]!.toUpperCase();
  const id = /^([A-Za-z][A-Za-z0-9_]{0,9}-\d{1,7})$/.exec(s);
  return id ? id[1]!.toUpperCase() : null;
}

function requireTeam(lin: Linear | null): asserts lin is Linear & { config: { teamId: string } } {
  if (!lin) throw new DomainError((l) => M(l)("linear.notConnected"));
  if (!lin.config.teamId) throw new DomainError((l) => M(l)("linear.pickTeam"));
}

export async function linkLinearIssue(tx: Tx, project: Project, actor: User, item: Item, input: string, f?: Fetch) {
  const lin = await getLinear(tx);
  requireTeam(lin);
  const ref = parseLinearRef(input);
  if (!ref) throw new DomainError((l) => M(l)("linear.ref"));
  const d = await linearGql<{ issue: LinearIssue | null }>(lin.token, `query($id: String!) { issue(id: $id) { ${ISSUE} } }`, { id: ref }, f);
  if (!d.issue) throw new DomainError((l) => M(l)("linear.notFound"));
  // The project's key only ever links issues of the connected team (that is where the mapping applies).
  if (d.issue.team?.id && d.issue.team.id !== lin.config.teamId) throw new DomainError((l) => M(l)("linear.otherTeam", { team: lin.config.teamName ?? "" }));
  return addTrackerLink(tx, project, actor, item, "linear", toTracker(d.issue), lin.config);
}

export async function createLinearIssue(tx: Tx, project: Project, actor: User, item: Item, f?: Fetch) {
  const lin = await getLinear(tx);
  requireTeam(lin);
  const parts = issueParts(project, item, await itemTrust(tx, item), sourceOf(item.source));
  const d = await linearGql<{ issueCreate: { success: boolean; issue: LinearIssue | null } }>(lin.token,
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE} } } }`,
    { input: { teamId: lin.config.teamId, title: parts.title, description: issueMarkdown(parts) } }, f);
  if (!d.issueCreate.success || !d.issueCreate.issue) throw new DomainError((l) => M(l)("linear.createFailed"));
  return addTrackerLink(tx, project, actor, item, "linear", toTracker(d.issueCreate.issue), lin.config);
}

export async function linearSetState(key: string, issueId: string, stateId: string, f?: Fetch) {
  const d = await linearGql<{ issueUpdate: { success: boolean } }>(key,
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, { id: issueId, input: { stateId } }, f);
  if (!d.issueUpdate.success) throw new Error("issueUpdate failed");
}

export async function linearComment(key: string, issueId: string, body: string, f?: Fetch) {
  const d = await linearGql<{ commentCreate: { success: boolean } }>(key,
    `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`, { input: { issueId, body } }, f);
  if (!d.commentCreate.success) throw new Error("commentCreate failed");
}

/** Pull/merge requests attached to the issue (Linear's GitHub/GitLab integration adds them). */
export async function linearPrs(key: string, issueId: string, f?: Fetch) {
  const d = await linearGql<{ issue: { attachments: { nodes: { url: string; title: string | null; sourceType: string | null }[] } } | null }>(key,
    `query($id: String!) { issue(id: $id) { attachments(first: 50) { nodes { url title sourceType } } } }`, { id: issueId }, f);
  return (d.issue?.attachments.nodes ?? [])
    .filter((a) => /^https:\/\/(github\.com\/[^/]+\/[^/]+\/pull\/\d+|gitlab\.com\/.+\/-\/merge_requests\/\d+)/.test(a.url))
    .map((a) => ({ url: a.url, title: a.title ? neutralizeLine(a.title, 300) : null }));
}

/** Creates the Linear webhook for the team (needs a public https URL and an admin key). */
export async function linearCreateWebhook(key: string, teamId: string, url: string, secret: string, f?: Fetch): Promise<string> {
  const d = await linearGql<{ webhookCreate: { success: boolean; webhook: { id: string } | null } }>(key,
    `mutation($input: WebhookCreateInput!) { webhookCreate(input: $input) { success webhook { id } } }`,
    { input: { url, teamId, label: "Ozvi", resourceTypes: ["Issue"], secret } }, f);
  if (!d.webhookCreate.success || !d.webhookCreate.webhook) throw new Error("webhookCreate failed");
  return d.webhookCreate.webhook.id;
}

export async function linearDeleteWebhook(key: string, id: string, f?: Fetch) {
  await linearGql(key, `mutation($id: String!) { webhookDelete(id: $id) { success } }`, { id }, f);
}

/** Linear signs the raw body; the payload's webhookTimestamp (ms) must be within a minute (replays). */
export function verifyLinear(secret: string, body: string, header: string | null, now = Date.now()): boolean {
  if (!verifyHmacHex(secret, body, header)) return false;
  try {
    const ts = Number((JSON.parse(body) as { webhookTimestamp?: number }).webhookTimestamp);
    return Number.isFinite(ts) && Math.abs(now - ts) <= 60_000;
  } catch { return false; }
}

interface LinearEvent {
  action: string; type: string;
  data: { id: string; identifier?: string; title?: string; url?: string; teamId?: string; stateId?: string; state?: { id: string; name: string; type: string } };
  updatedFrom?: { stateId?: string; title?: string };
}

/** One verified Linear delivery. */
export async function handleLinearEvent(tx: Tx, project: Project, lin: Linear, payload: unknown, f?: Fetch): Promise<ApplyResult | string> {
  const p = payload as LinearEvent;
  if (p?.type !== "Issue" || !p.data?.id) return "ignored";
  const link = await findLink(tx, "linear", p.data.id, p.data.identifier);
  if (!link) return "not linked";
  if (p.action === "remove") return "removed";
  if (p.action !== "update") return "ignored";
  const stateId = p.data.state?.id ?? p.data.stateId;
  const known = lin.config.states.find((s) => s.id === stateId);
  if (!stateId || (!p.updatedFrom?.stateId && !p.updatedFrom?.title)) return "ignored";
  const state: TrackerState = known ?? { id: stateId, name: p.data.state?.name ?? stateId, type: p.data.state?.type ?? "" };
  return applyTrackerState(tx, project, "linear", link, state, lin.config, {
    title: p.data.title,
    proofs: () => linearPrs(lin.token, p.data.id, f),
  });
}

export const LINEAR = providerName("linear");
