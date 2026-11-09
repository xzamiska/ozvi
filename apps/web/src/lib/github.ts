import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret, schema, type Tx } from "@ozvi/db";
import { and, eq, ilike, inArray, isNull, lte } from "drizzle-orm";
import { changeStatus, DomainError, type Item } from "./domain";
import { projectOrigin } from "./email/url";
import { emit } from "./events";
import { attachProof, cleanProofUrl, parsePrBody } from "./proof";
import { createReleaseDraft } from "./release";
import { isLocale, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import type { Project, User } from "./project";
import { neutralizeLine, neutralizeMarkdown, quoteBlock } from "./agent-safe";
import { itemAuthorOf, sourceOf, type ItemSource, type Trust } from "./provenance";

const M = (l: Locale) => translator(l, "integrations");
/** Text that leaves the viewer (issue bodies, internal notes) speaks the board's default language. */
const boardText = (project: Project) => M(isLocale(project.defaultLocale) ? project.defaultLocale : "sk");

/**
 * GitHub: link items to issues, open issues from bugs, and close the loop from GitHub's side.
 * - issue closed as completed → link remembers when; nothing is announced yet
 * - release published → every bug whose linked issue closed before it becomes "fixed in <tag>"
 *   (the reporter is asked to confirm) and linked ideas become "shipped"
 * With config.onClose = "fixed" the bug is marked fixed right when the issue closes (no releases).
 */

const { integrations, itemLinks, items, comments } = schema;

export interface GithubConfig { repo: string; onClose: "release" | "fixed" }
export interface Github { config: GithubConfig; token: string; webhookSecret: string | null }

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function parseGithubConfig(raw: unknown): GithubConfig | null {
  const c = (raw ?? {}) as Partial<GithubConfig>;
  if (!c.repo || !REPO.test(c.repo)) return null;
  return { repo: c.repo, onClose: c.onClose === "fixed" ? "fixed" : "release" };
}

export async function getGithub(tx: Tx): Promise<Github | null> {
  const row = await tx.query.integrations.findFirst({ where: eq(integrations.provider, "github") });
  const config = parseGithubConfig(row?.config);
  if (!row || !config || !row.tokenEnc) return null;
  return { config, token: decryptSecret(row.tokenEnc), webhookSecret: row.webhookSecretEnc ? decryptSecret(row.webhookSecretEnc) : null };
}

/** "https://github.com/o/r/issues/12", "o/r#12" or "#12"/"12" (default repo). */
export function parseIssueRef(input: string, defaultRepo: string): { repo: string; number: number } | null {
  const s = input.trim();
  if (/(^|\/)\.{1,2}(\/|#|$)/.test(s)) return null;
  const url = /^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/(?:issues|pull)\/(\d+)\/?(?:[#?].*)?$/.exec(s);
  if (url) return { repo: url[1]!, number: Number(url[2]) };
  const short = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#?(\d+)$/.exec(s);
  if (short) return { repo: short[1] ?? defaultRepo, number: Number(short[2]) };
  return null;
}

export const issueRef = (repo: string, n: number) => `${repo}#${n}`;

type Fetch = typeof fetch;
export async function gh<T>(token: string, path: string, init: RequestInit = {}, f: Fetch = fetch): Promise<T> {
  const res = await f(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ozvi",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const status = res.status;
    throw new DomainError((l) => status === 404 ? M(l)("gh.notFound") : status === 401 ? M(l)("gh.badToken") : status === 403 ? M(l)("gh.noScope") : M(l)("gh.status", { s: String(status) }));
  }
  return (await res.json()) as T;
}

interface GhIssue { number: number; html_url: string; title: string; state: "open" | "closed"; closed_at: string | null; state_reason?: string | null }

async function addLink(tx: Tx, project: Project, actor: User | null, item: Item, issue: GhIssue, repo: string) {
  const ref = issueRef(repo, issue.number);
  const existing = await tx.query.itemLinks.findFirst({ where: and(eq(itemLinks.provider, "github"), eq(itemLinks.ref, ref)) });
  if (existing && existing.itemId !== item.id) {
    const other = await tx.query.items.findFirst({ where: eq(items.id, existing.itemId) });
    throw new DomainError((l) => M(l)("gh.alreadyLinked", { ref, n: String(other?.number ?? "?") }));
  }
  if (existing) return { ref, url: existing.url };
  await tx.insert(itemLinks).values({
    projectId: project.id, itemId: item.id, provider: "github", ref, url: issue.html_url, title: issue.title.slice(0, 300),
    state: issue.state, closedAt: issue.closed_at && issue.state_reason !== "not_planned" ? new Date(issue.closed_at) : null,
  });
  await emit(tx, project, "item.linked", { item, actorName: actor?.name, link: { ref, url: issue.html_url } });
  return { ref, url: issue.html_url };
}

export async function linkIssue(tx: Tx, project: Project, actor: User, item: Item, input: string, f: Fetch = fetch) {
  const g = await getGithub(tx);
  if (!g) throw new DomainError((l) => M(l)("gh.notConnected"));
  const parsed = parseIssueRef(input, g.config.repo);
  if (!parsed) throw new DomainError((l) => M(l)("gh.issueRef"));
  // The project's token only ever talks to the connected repo.
  if (parsed.repo.toLowerCase() !== g.config.repo.toLowerCase()) throw new DomainError((l) => M(l)("gh.otherRepo", { repo: g.config.repo }));
  const issue = await gh<GhIssue>(g.token, `/repos/${parsed.repo}/issues/${parsed.number}`, {}, f);
  return addLink(tx, project, actor, item, issue, parsed.repo);
}

/** Opens an issue in the connected repo. Only the title, description and app version go to GitHub — not console logs or screenshots. */
export async function createIssue(tx: Tx, project: Project, actor: User, item: Item, f: Fetch = fetch) {
  const g = await getGithub(tx);
  if (!g) throw new DomainError((l) => M(l)("gh.notConnected"));
  if (item.kind === "bug") {
    const repo = await gh<{ private: boolean }>(g.token, `/repos/${g.config.repo}`, {}, f);
    if (!repo.private) throw new DomainError((l) => M(l)("gh.publicRepo", { repo: g.config.repo }));
  }
  const [author] = item.authorId ? await tx.select({ role: schema.users.role, externalId: schema.users.externalId, traits: schema.users.traits })
    .from(schema.users).where(eq(schema.users.id, item.authorId)) : [];
  const { title, body } = issueContent(project, item, itemAuthorOf(item, author ? { ...author, name: null } : null).trust, sourceOf(item.source));
  const issue = await gh<GhIssue>(g.token, `/repos/${g.config.repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [item.kind === "bug" ? "bug" : "enhancement"] }),
  }, f);
  return addLink(tx, project, actor, item, issue, g.config.repo);
}

/**
 * Issue title and body from user content, hardened for coding agents that read issues (GitLost):
 * hidden text removed or made visible, mentions made inert, the user's text quoted under a header
 * that says who wrote it (trust level, never the name) and that it is data, not instructions.
 * The app version and browser come from the client too, so they are cleaned the same way.
 */
export function issueContent(project: Project, item: Pick<Item, "kind" | "number" | "title" | "body" | "context">, trust: Trust, source: ItemSource) {
  const t = boardText(project);
  const ctx = (item.context ?? {}) as Record<string, string>;
  const line = (v: unknown) => (typeof v === "string" ? neutralizeMarkdown(neutralizeLine(v, 120)) : "");
  const meta = [ctx.appVersion && `${t("gh.appVersion")}: ${line(ctx.appVersion)}`, ctx.browser && `${t("gh.browser")}: ${line(ctx.browser)}`].filter(Boolean).join(" · ");
  const text = neutralizeMarkdown(item.body).trim();
  const body = [
    `**${t("gh.provenance", { trust: t(`gh.trust.${trust}`), source: t(`gh.source.${source}`) })}** ${t("gh.untrusted")}`,
    "",
    quoteBlock(text || t("gh.noBody")),
    "",
    "---",
    `${item.kind === "bug" ? t("gh.bugIn") : t("gh.ideaIn")}: ${projectOrigin(project)}/${project.slug}/i/${item.number}${meta ? `  \n${meta}` : ""}`,
  ].join("\n");
  return { title: neutralizeLine(item.title, 200) || `#${item.number}`, body };
}

export function verifyGithubSignature(secret: string, body: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const a = Buffer.from(header.slice(7), "hex");
  const b = createHmac("sha256", secret).update(body).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

async function note(tx: Tx, project: Project, itemId: string, body: string) {
  await tx.insert(comments).values({ projectId: project.id, itemId, authorId: null, body, internal: true });
}

const FINAL = new Set(["fixed", "verified", "wont_fix", "shipped", "declined"]);

interface IssuesEvent { action: string; issue: GhIssue; repository: { full_name: string } }
interface ReleaseEvent { action: string; release: { tag_name: string; name: string | null; html_url: string; published_at: string | null; prerelease: boolean; draft: boolean; body?: string | null }; repository: { full_name: string } }
interface PullRequestEvent {
  action: string;
  pull_request: { number: number; html_url: string; title: string; body: string | null; merged: boolean; merged_at: string | null };
  repository: { full_name: string };
}

export interface GithubEventOptions {
  /** AI is available for the project: release drafts are marked for an AI rewrite. */
  ai?: boolean;
  /** Called with the new release draft (after this transaction commits, the caller may enrich it). */
  onDraft?: (entryId: string, notes: string) => void;
}

/** Handles one verified GitHub delivery. Returns a short description for the response/log. */
export async function handleGithubEvent(tx: Tx, project: Project, g: Github, event: string, payload: unknown, opts: GithubEventOptions = {}): Promise<string> {
  if (event === "ping") return "pong";

  if (event === "pull_request") {
    // A merged PR is proof of a fix: it attaches to the items it names (Ozvi: #12) or whose linked issue it closes.
    const p = payload as PullRequestEvent;
    if (p.action !== "closed" || !p.pull_request.merged) return "ignored";
    if (p.repository.full_name.toLowerCase() !== g.config.repo.toLowerCase()) return "other repo";
    const pr = p.pull_request;
    const parsed = parsePrBody(`${pr.title}\n${pr.body ?? ""}`, p.repository.full_name);
    const targets = new Set<string>();
    if (parsed.items.length) {
      const rows = await tx.select({ id: items.id }).from(items).where(and(inArray(items.number, parsed.items), isNull(items.deletedAt)));
      for (const r of rows) targets.add(r.id);
    }
    if (parsed.issues.length) {
      const refs = parsed.issues.map((n) => issueRef(p.repository.full_name, n));
      const rows = await tx.select({ id: itemLinks.itemId }).from(itemLinks).where(and(eq(itemLinks.provider, "github"), inArray(itemLinks.ref, refs)));
      for (const r of rows) targets.add(r.id);
    }
    const ref = issueRef(p.repository.full_name, pr.number);
    for (const itemId of targets) {
      await attachProof(tx, project.id, itemId, { kind: "pr", url: pr.html_url, title: pr.title, ref }, null);
      if (parsed.preview) await attachProof(tx, project.id, itemId, { kind: "preview", url: parsed.preview }, null);
    }
    return `pr ${ref}: ${targets.size} item(s)`;
  }

  if (event === "issues") {
    const p = payload as IssuesEvent;
    const ref = issueRef(p.repository.full_name, p.issue.number);
    const link = await tx.query.itemLinks.findFirst({ where: and(eq(itemLinks.provider, "github"), eq(itemLinks.ref, ref)) });
    if (!link) return "not linked";
    if (p.action === "closed") {
      const completed = p.issue.state_reason !== "not_planned";
      await tx.update(itemLinks).set({ state: "closed", closedAt: completed ? new Date(p.issue.closed_at ?? Date.now()) : null }).where(eq(itemLinks.id, link.id));
      await note(tx, project, link.itemId, boardText(project)(completed ? "gh.closed" : "gh.closedNotPlanned", { ref }));
      const item = await tx.query.items.findFirst({ where: eq(items.id, link.itemId) });
      if (completed && item && item.kind === "bug" && g.config.onClose === "fixed" && !FINAL.has(item.status)) {
        await changeStatus(tx, project, null, item, "fixed", null);
      }
      return "closed";
    }
    if (p.action === "reopened") {
      await tx.update(itemLinks).set({ state: "open", closedAt: null }).where(eq(itemLinks.id, link.id));
      await note(tx, project, link.itemId, boardText(project)("gh.reopened", { ref }));
      return "reopened";
    }
    if (p.action === "edited") {
      await tx.update(itemLinks).set({ title: p.issue.title.slice(0, 300) }).where(eq(itemLinks.id, link.id));
      return "edited";
    }
    return "ignored";
  }

  if (event === "release") {
    const p = payload as ReleaseEvent;
    if (p.action !== "published" || p.release.draft || p.release.prerelease) return "ignored";
    if (p.repository.full_name.toLowerCase() !== g.config.repo.toLowerCase()) return "other repo";
    const tag = p.release.tag_name.replace(/^v(?=\d)/, "").slice(0, 40);
    const at = new Date(p.release.published_at ?? Date.now());
    const links = await tx.select({ link: itemLinks, item: items }).from(itemLinks).innerJoin(items, eq(items.id, itemLinks.itemId))
      .where(and(eq(itemLinks.provider, "github"), eq(itemLinks.state, "closed"), lte(itemLinks.closedAt, at), isNull(items.mergedIntoId),
        ilike(itemLinks.ref, `${p.repository.full_name.replace(/[\\%_]/g, (c) => `\\${c}`)}#%`)));
    const release = { tag, url: cleanProofUrl(p.release.html_url ?? ""), name: p.release.name };
    const changed: Item[] = [];
    const seen = new Set<string>();
    for (const { item } of links) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.kind === "bug" && (!FINAL.has(item.status) || (item.status === "fixed" && !item.fixedInVersion))) {
        const u = await changeStatus(tx, project, null, item, "fixed", tag, { release });
        if (u) changed.push(u);
      } else if (item.kind === "idea" && !FINAL.has(item.status)) {
        // Author and commenters get the usual status e-mail; voters hear once, from the published changelog.
        const u = await changeStatus(tx, project, null, item, "shipped", undefined, { release });
        if (u) changed.push(u);
      }
    }
    const draftId = await createReleaseDraft(tx, project, release, changed, { ai: !!opts.ai });
    if (draftId) opts.onDraft?.(draftId, (p.release.body ?? "").slice(0, 8000));
    return `release ${tag}: ${changed.length} item(s)${draftId ? ", draft" : ""}`;
  }

  return "ignored";
}
