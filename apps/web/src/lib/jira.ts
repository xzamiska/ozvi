import { schema, withProject, withSystem, type Db, type Tx } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { neutralizeLine } from "./agent-safe";
import { DomainError, type Item } from "./domain";
import { safeFetch } from "./net";
import type { Project, User } from "./project";
import { sourceOf } from "./provenance";
import {
  addTrackerLink, applyTrackerState, findLink, issueAdf, issueParts, itemTrust, openRow, parseBase, readSync, trackerRow, verifyHmacHex,
  type ApplyResult, type TrackerConfigBase, type TrackerIssue, type TrackerRow, type TrackerState,
} from "./trackers";

/**
 * Jira Cloud: e-mail + API token (Basic auth, encrypted) for one site (https://<name>.atlassian.net only —
 * the address is admin input, so nothing else is ever requested: SSRF), one project and issue type.
 * Status changes arrive by webhook (Jira admin → System → Webhooks, with a secret: X-Hub-Signature
 * sha256=<hex>) or, when nobody has Jira admin rights, by polling linked issues every 5 minutes.
 * PR proof: remote links pointing at GitHub pull requests / GitLab merge requests.
 */

const M = (l: Locale) => translator(l, "integrations");

export interface JiraConfig extends TrackerConfigBase {
  site: string; email: string;
  projectKey: string | null; projectName: string | null;
  issueTypeId: string | null;
  projects: { key: string; name: string }[];
  issueTypes: { id: string; name: string }[];
  viewer: string | null;
  /** webhook: Jira pushes changes; poll: Ozvi asks every 5 minutes. */
  sync: "webhook" | "poll";
  lastPollAt: string | null;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** "acme.atlassian.net", "https://acme.atlassian.net/jira/…" → "https://acme.atlassian.net"; anything else → null. */
export function normalizeJiraSite(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/.test(host)) return null;
  return `https://${host}`;
}

export function parseJiraConfig(raw: unknown): JiraConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const site = typeof r.site === "string" ? normalizeJiraSite(r.site) : null;
  if (!site || typeof r.email !== "string") return null;
  const s = (v: unknown, n = 120) => (typeof v === "string" && v ? v.slice(0, n) : null);
  const list = <T,>(v: unknown, f: (o: Record<string, unknown>) => T | null) => (Array.isArray(v) ? v.flatMap((x) => { const y = x && typeof x === "object" ? f(x as Record<string, unknown>) : null; return y ? [y] : []; }).slice(0, 200) : []);
  return {
    ...parseBase("jira", r), site, email: r.email.slice(0, 200),
    projectKey: s(r.projectKey, 20), projectName: s(r.projectName), issueTypeId: s(r.issueTypeId, 40),
    projects: list(r.projects, (o) => typeof o.key === "string" ? { key: o.key, name: neutralizeLine(String(o.name ?? o.key), 80) } : null),
    issueTypes: list(r.issueTypes, (o) => typeof o.id === "string" ? { id: o.id, name: neutralizeLine(String(o.name ?? o.id), 60) } : null),
    viewer: s(r.viewer), sync: r.sync === "poll" ? "poll" : "webhook", lastPollAt: s(r.lastPollAt, 40),
  };
}

export type Jira = TrackerRow<JiraConfig>;
export async function getJira(tx: Tx): Promise<Jira | null> {
  return openRow(await trackerRow(tx, "jira"), parseJiraConfig);
}

export interface JiraAuth { site: string; email: string; token: string }

export async function jira<T>(a: JiraAuth, path: string, init: RequestInit = {}, f: Fetch = safeFetch): Promise<T> {
  const site = normalizeJiraSite(a.site);
  if (!site) throw new DomainError((l) => M(l)("jira.site"));
  let res: Response;
  try {
    res = await f(`${site}${path}`, {
      ...init,
      headers: {
        accept: "application/json", "user-agent": "ozvi",
        authorization: `Basic ${Buffer.from(`${a.email}:${a.token}`).toString("base64")}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DomainError((l) => M(l)("jira.network"));
  }
  if (res.status === 401) throw new DomainError((l) => M(l)("jira.badToken"));
  if (res.status === 403) throw new DomainError((l) => M(l)("jira.forbidden"));
  if (res.status === 404) throw new DomainError((l) => M(l)("jira.notFound"));
  if (!res.ok) throw new DomainError((l) => M(l)("jira.status", { s: String(res.status) }));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const auth = (j: Jira): JiraAuth => ({ site: j.config.site, email: j.config.email, token: j.token });

export async function jiraViewer(a: JiraAuth, f?: Fetch) {
  const me = await jira<{ displayName: string }>(a, "/rest/api/3/myself", {}, f);
  const ps = await jira<{ values: { key: string; name: string }[] }>(a, "/rest/api/3/project/search?maxResults=100&orderBy=name", {}, f);
  return { viewer: neutralizeLine(me.displayName, 80), projects: ps.values.map((p) => ({ key: p.key, name: neutralizeLine(p.name, 80) })) };
}

/** Issue types of the project and the statuses its workflows use (unique, in category order). */
export async function jiraProjectMeta(a: JiraAuth, projectKey: string, f?: Fetch) {
  const key = encodeURIComponent(projectKey);
  const p = await jira<{ name: string; issueTypes: { id: string; name: string; subtask?: boolean }[] }>(a, `/rest/api/3/project/${key}`, {}, f);
  const per = await jira<{ statuses: { id: string; name: string; statusCategory?: { key: string } }[] }[]>(a, `/rest/api/3/project/${key}/statuses`, {}, f);
  const seen = new Map<string, TrackerState>();
  for (const t of per) for (const s of t.statuses) if (!seen.has(s.id)) seen.set(s.id, { id: s.id, name: neutralizeLine(s.name, 80), type: s.statusCategory?.key ?? "" });
  const order = ["new", "indeterminate", "done"];
  return {
    name: neutralizeLine(p.name, 80),
    issueTypes: p.issueTypes.filter((t) => !t.subtask).map((t) => ({ id: t.id, name: neutralizeLine(t.name, 60) })),
    states: [...seen.values()].sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type)),
  };
}

interface JiraIssue { id: string; key: string; fields: { summary: string; status?: { id: string; name: string; statusCategory?: { key: string } }; project?: { key: string } } }

const toTracker = (site: string, i: JiraIssue): TrackerIssue => ({
  externalId: i.id, ref: i.key, url: `${site}/browse/${i.key}`, title: i.fields.summary,
  state: i.fields.status ? { id: i.fields.status.id, name: i.fields.status.name, type: i.fields.status.statusCategory?.key ?? "" } : null,
});

/** "ABC-12" or "https://acme.atlassian.net/browse/ABC-12". */
export function parseJiraRef(input: string): string | null {
  const s = input.trim();
  const KEY = "([A-Za-z][A-Za-z0-9_]{0,9}-\\d{1,7})";
  const m = new RegExp(`^${KEY}$`).exec(s)
    ?? new RegExp(`^https://[a-z0-9-]+\\.atlassian\\.net/browse/${KEY}(?:[/?#].*)?$`, "i").exec(s)
    ?? new RegExp(`^https://[a-z0-9-]+\\.atlassian\\.net/.*[?&]selectedIssue=${KEY}(?:&.*)?$`, "i").exec(s);
  return m ? m[1]!.toUpperCase() : null;
}

function requireProject(j: Jira | null): asserts j is Jira & { config: { projectKey: string; issueTypeId: string } } {
  if (!j) throw new DomainError((l) => M(l)("jira.notConnected"));
  if (!j.config.projectKey || !j.config.issueTypeId) throw new DomainError((l) => M(l)("jira.pickProject"));
}

export async function linkJiraIssue(tx: Tx, project: Project, actor: User, item: Item, input: string, f?: Fetch) {
  const j = await getJira(tx);
  requireProject(j);
  const key = parseJiraRef(input);
  if (!key) throw new DomainError((l) => M(l)("jira.ref"));
  const issue = await jira<JiraIssue>(auth(j), `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,project`, {}, f);
  if (issue.fields.project?.key && issue.fields.project.key !== j.config.projectKey) throw new DomainError((l) => M(l)("jira.otherProject", { project: j.config.projectKey! }));
  return addTrackerLink(tx, project, actor, item, "jira", toTracker(j.config.site, issue), j.config);
}

export async function createJiraIssue(tx: Tx, project: Project, actor: User, item: Item, f?: Fetch) {
  const j = await getJira(tx);
  requireProject(j);
  const parts = issueParts(project, item, await itemTrust(tx, item), sourceOf(item.source));
  const url = parts.footer.slice(parts.footer.indexOf("http"));
  const created = await jira<{ id: string; key: string }>(auth(j), "/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({ fields: {
      project: { key: j.config.projectKey }, issuetype: { id: j.config.issueTypeId },
      summary: parts.title.slice(0, 250), description: issueAdf(parts, item.body, url), labels: ["ozvi"],
    } }),
  }, f);
  const issue = await jira<JiraIssue>(auth(j), `/rest/api/3/issue/${encodeURIComponent(created.key)}?fields=summary,status`, {}, f).catch(() => null);
  return addTrackerLink(tx, project, actor, item, "jira", issue ? toTracker(j.config.site, issue) : { externalId: created.id, ref: created.key, url: `${j.config.site}/browse/${created.key}`, title: parts.title, state: null }, j.config);
}

/** Moves the issue with the workflow transition that leads to `stateId` (Jira has no "set status"). */
export async function jiraSetState(a: JiraAuth, key: string, stateId: string, f?: Fetch): Promise<boolean> {
  const k = encodeURIComponent(key);
  const tr = await jira<{ transitions: { id: string; to: { id: string } }[] }>(a, `/rest/api/3/issue/${k}/transitions`, {}, f);
  const t = tr.transitions.find((x) => x.to.id === stateId);
  if (!t) return false;
  await jira(a, `/rest/api/3/issue/${k}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: t.id } }) }, f);
  return true;
}

export async function jiraComment(a: JiraAuth, key: string, adf: unknown, f?: Fetch) {
  await jira(a, `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { method: "POST", body: JSON.stringify({ body: adf }) }, f);
}

export async function jiraPrs(a: JiraAuth, key: string, f?: Fetch) {
  const links = await jira<{ object?: { url?: string; title?: string } }[]>(a, `/rest/api/3/issue/${encodeURIComponent(key)}/remotelink`, {}, f);
  return links.flatMap((l) => {
    const url = l.object?.url ?? "";
    return /^https:\/\/(github\.com\/[^/]+\/[^/]+\/pull\/\d+|gitlab\.com\/.+\/-\/merge_requests\/\d+)/.test(url) ? [{ url, title: l.object?.title ? neutralizeLine(l.object.title, 300) : null }] : [];
  });
}

/** Jira webhook secret: X-Hub-Signature: sha256=<hex HMAC-SHA256 of the body>. */
export const verifyJira = (secret: string, body: string, header: string | null) => verifyHmacHex(secret, body, header);

interface JiraEvent {
  webhookEvent: string;
  issue?: JiraIssue;
  changelog?: { items?: { field?: string; fieldId?: string; to?: string | null; toString?: string | null }[] };
}

export async function handleJiraEvent(tx: Tx, project: Project, j: Jira, payload: unknown, f?: Fetch): Promise<ApplyResult | string> {
  const p = payload as JiraEvent;
  if (!p?.issue?.id) return "ignored";
  const link = await findLink(tx, "jira", p.issue.id, p.issue.key);
  if (!link) return "not linked";
  if (p.webhookEvent === "jira:issue_deleted") return "deleted";
  if (p.webhookEvent !== "jira:issue_updated") return "ignored";
  // Keys change when an issue moves between projects: keep the link's ref current.
  if (p.issue.key && p.issue.key !== link.ref) {
    await tx.update(schema.itemLinks).set({ ref: p.issue.key, url: `${j.config.site}/browse/${p.issue.key}` }).where(eq(schema.itemLinks.id, link.id));
  }
  const st = p.issue.fields.status;
  if (!st) return "ignored";
  const state = j.config.states.find((s) => s.id === st.id) ?? { id: st.id, name: st.name, type: st.statusCategory?.key ?? "" };
  return applyTrackerState(tx, project, "jira", link, state, j.config, {
    title: p.issue.fields.summary,
    proofs: () => jiraPrs(auth(j), p.issue!.key, f),
  });
}

export const POLL_MS = 5 * 60_000;

/** Polling fallback: linked issues whose status differs from what the link last saw are applied like webhooks. */
export async function jiraPollProject(tx: Tx, project: Project, j: Jira, f?: Fetch): Promise<number> {
  const links = (await tx.select().from(schema.itemLinks).where(eq(schema.itemLinks.provider, "jira")).limit(1000));
  let moved = 0;
  for (let i = 0; i < links.length; i += 50) {
    const chunk = links.slice(i, i + 50);
    const keys = chunk.map((l) => l.ref).filter((k) => /^[A-Z][A-Z0-9_]{0,9}-\d+$/.test(k));
    if (!keys.length) continue;
    const r = await jira<{ issues: JiraIssue[] }>(auth(j), "/rest/api/3/search/jql", {
      method: "POST", body: JSON.stringify({ jql: `key in (${keys.join(",")})`, fields: ["summary", "status"], maxResults: 100 }),
    }, f);
    for (const issue of r.issues ?? []) {
      const link = chunk.find((l) => l.externalId === issue.id || l.ref === issue.key);
      const st = issue.fields.status;
      if (!link || !st || readSync(link.sync).stateId === st.id) continue;
      const state = j.config.states.find((s) => s.id === st.id) ?? { id: st.id, name: st.name, type: st.statusCategory?.key ?? "" };
      if (await applyTrackerState(tx, project, "jira", link, state, j.config, { title: issue.fields.summary, proofs: () => jiraPrs(auth(j), issue.key, f) }) === "moved") moved++;
    }
  }
  return moved;
}

/** Job: every project whose Jira syncs by polling, at most every POLL_MS. */
export async function jiraPollTick(db: Db, f?: Fetch) {
  const rows = await withSystem(db, (tx) => tx.select({ i: schema.integrations, p: schema.projects }).from(schema.integrations)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.integrations.projectId)).where(eq(schema.integrations.provider, "jira")));
  let n = 0;
  for (const { i, p } of rows) {
    const cfg = parseJiraConfig(i.config);
    if (!cfg || cfg.sync !== "poll" || !cfg.projectKey) continue;
    if (cfg.lastPollAt && Date.now() - Date.parse(cfg.lastPollAt) < POLL_MS) continue;
    // Stamped first and on its own: a failing Jira is retried in 5 minutes, not every tick.
    await withProject(db, p.id, (tx) => tx.update(schema.integrations).set({ config: { ...(i.config as object), lastPollAt: new Date().toISOString() } })
      .where(eq(schema.integrations.id, i.id)));
    await withProject(db, p.id, async (tx) => {
      const j = await getJira(tx);
      if (j) n += await jiraPollProject(tx, p, j, f);
    }).catch((e) => console.error("[ozvi] jira poll", p.slug, e instanceof Error ? e.message : e));
  }
  return n;
}
