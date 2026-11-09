import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret, schema, type Tx } from "@ozvi/db";
import { and, eq, inArray } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { neutralizeLine, neutralizeMarkdown, quoteBlock, stripHtmlComments, stripInvisible } from "./agent-safe";
import { changeStatus, DomainError, type Item } from "./domain";
import { projectOrigin } from "./email/url";
import { attachProof, cleanProofUrl } from "./proof";
import type { Project, User } from "./project";
import { authorOf, itemAuthorOf, sourceOf, type ItemSource, type Trust } from "./provenance";

/**
 * Work trackers (Linear, Jira Cloud): shared model for both.
 *
 * Status sync speaks in five "buckets" so one mapping serves ideas and bugs alike:
 *   none (ignored) · ack (planned / confirmed) · progress (in progress) · done (shipped / fixed) · off (declined / won't fix).
 * The admin maps each tracker workflow state to a bucket; Ozvi → tracker uses the first state (in workflow
 * order) mapped to the item's bucket.
 *
 * No ping-pong (Ozvi → tracker → Ozvi …), three guards:
 *  1. a change applied from a tracker runs inside `fromTracker(linkId)`, and the outbox skips that link;
 *  2. every link remembers the tracker state it last saw (sync.stateId): a webhook repeating it is a no-op;
 *  3. it also remembers what Ozvi pushed (sync.pushedStateId/pushedAt): the echo of our own push is ignored,
 *     and the outbox does not push when the tracker already sits in the target bucket.
 * Voters are never e-mailed from here: changeStatus notifies the author and commenters exactly as the
 * GitHub path does; voters hear once, from the published changelog.
 */

export type TrackerProvider = "linear" | "jira";
export const TRACKERS: readonly TrackerProvider[] = ["linear", "jira"];
export type Bucket = "none" | "ack" | "progress" | "done" | "off";
export const BUCKETS: readonly Bucket[] = ["none", "ack", "progress", "done", "off"];
export type CommentMirror = "off" | "public" | "all";

/** A workflow state as cached in the integration config. `type`: Linear state type or Jira status category key. */
export interface TrackerState { id: string; name: string; type: string }

export interface TrackerConfigBase {
  states: TrackerState[];
  mapping: Record<string, Bucket>;
  /** Ozvi stage changes move the tracker issue too. */
  push: boolean;
  comments: CommentMirror;
}

const STATUS_BUCKET: Record<string, Bucket> = {
  open: "none", new: "none",
  planned: "ack", confirmed: "ack",
  in_progress: "progress",
  shipped: "done", fixed: "done", verified: "done",
  declined: "off", wont_fix: "off",
};

export function statusBucket(status: string): Bucket {
  return STATUS_BUCKET[status] ?? "none";
}

export function bucketStatus(kind: Item["kind"], bucket: Bucket): string | null {
  switch (bucket) {
    case "ack": return kind === "bug" ? "confirmed" : "planned";
    case "progress": return "in_progress";
    case "done": return kind === "bug" ? "fixed" : "shipped";
    case "off": return kind === "bug" ? "wont_fix" : "declined";
    default: return null;
  }
}

const CANCEL = /cancel|won'?t|wont|declin|reject|duplicate|zru[sš]|zamietnut|nerie[sš]|odmítnut/i;

/**
 * Defaults: Backlog/Todo → planned/confirmed, In Progress → in progress, Done → shipped/fixed,
 * Canceled → declined/won't fix; Linear Triage stays unmapped (new reports wait there).
 */
export function defaultBucket(provider: TrackerProvider, s: TrackerState): Bucket {
  if (provider === "linear") {
    switch (s.type) {
      case "backlog": case "unstarted": return "ack";
      case "started": return "progress";
      case "completed": return "done";
      case "canceled": return "off";
      default: return "none";
    }
  }
  // Jira categories: new (To Do), indeterminate (In Progress), done (Done and every closing status).
  if (s.type === "done") return CANCEL.test(s.name) ? "off" : "done";
  if (s.type === "indeterminate") return "progress";
  if (s.type === "new") return "ack";
  return "none";
}

export function defaultMapping(provider: TrackerProvider, states: TrackerState[]): Record<string, Bucket> {
  return Object.fromEntries(states.map((s) => [s.id, defaultBucket(provider, s)]));
}

const isBucket = (v: unknown): v is Bucket => typeof v === "string" && (BUCKETS as readonly string[]).includes(v);

/** Mapping from untrusted input: known states only; missing ones get the default. */
export function cleanMapping(provider: TrackerProvider, raw: unknown, states: TrackerState[]): Record<string, Bucket> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(states.map((s) => [s.id, isBucket(r[s.id]) ? r[s.id] as Bucket : defaultBucket(provider, s)]));
}

export function cleanStates(raw: unknown): TrackerState[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const o = x as Record<string, unknown>;
    return o && typeof o.id === "string" && typeof o.name === "string"
      ? [{ id: o.id.slice(0, 100), name: neutralizeLine(o.name, 80), type: typeof o.type === "string" ? o.type.slice(0, 40) : "" }] : [];
  }).slice(0, 200);
}

export function parseBase(provider: TrackerProvider, raw: Record<string, unknown>): TrackerConfigBase {
  const states = cleanStates(raw.states);
  return {
    states,
    mapping: cleanMapping(provider, raw.mapping, states),
    push: raw.push !== false,
    comments: raw.comments === "public" || raw.comments === "all" ? raw.comments : "off",
  };
}

/** Where Ozvi moves the tracker issue for a bucket: the first state in workflow order mapped to it. */
export function stateForBucket(cfg: Pick<TrackerConfigBase, "states" | "mapping">, bucket: Bucket): TrackerState | null {
  if (bucket === "none") return null;
  return cfg.states.find((s) => cfg.mapping[s.id] === bucket) ?? null;
}

/* ---------- integration row ---------- */

export interface TrackerRow<C> { id: string; config: C; token: string; webhookSecret: string | null }

export async function trackerRow(tx: Tx, provider: TrackerProvider) {
  return tx.query.integrations.findFirst({ where: eq(schema.integrations.provider, provider) });
}

export function openRow<C>(row: typeof schema.integrations.$inferSelect | undefined, parse: (raw: unknown) => C | null): TrackerRow<C> | null {
  const config = parse(row?.config);
  if (!row || !config || !row.tokenEnc) return null;
  return { id: row.id, config, token: decryptSecret(row.tokenEnc), webhookSecret: row.webhookSecretEnc ? decryptSecret(row.webhookSecretEnc) : null };
}

/* ---------- signatures ---------- */

/** HMAC-SHA256 of the raw body, hex, constant-time compare. `header` may carry a "sha256=" prefix. */
export function verifyHmacHex(secret: string, body: string, header: string | null | undefined): boolean {
  if (!header) return false;
  const hex = header.startsWith("sha256=") ? header.slice(7) : header;
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const a = Buffer.from(hex, "hex");
  const b = createHmac("sha256", secret).update(body).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hmacHex(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/* ---------- issue content (sanitised, provenance header) ---------- */

const T = (l: Locale) => translator(l, "integrations");
export const boardText = (project: Pick<Project, "defaultLocale">) => T(isLocale(project.defaultLocale) ? project.defaultLocale : "sk");

export interface IssueParts { title: string; header: string; quote: string; footer: string; meta: string }

/**
 * What goes to the tracker, hardened the same way as GitHub issues (lib/agent-safe.ts): hidden text
 * removed or made visible, mentions inert, the user's words quoted under a header with the author's
 * trust level (never the name) and the note that it is data, not instructions.
 */
export function issueParts(project: Project, item: Pick<Item, "kind" | "number" | "title" | "body" | "context">, trust: Trust, source: ItemSource): IssueParts {
  const t = boardText(project);
  const ctx = (item.context ?? {}) as Record<string, unknown>;
  const line = (v: unknown) => (typeof v === "string" ? neutralizeMarkdown(neutralizeLine(v, 120)) : "");
  const meta = [ctx.appVersion && `${t("gh.appVersion")}: ${line(ctx.appVersion)}`, ctx.browser && `${t("gh.browser")}: ${line(ctx.browser)}`].filter(Boolean).join(" · ");
  return {
    title: neutralizeLine(item.title, 200) || `#${item.number}`,
    header: `${t("gh.provenance", { trust: t(`gh.trust.${trust}`), source: t(`gh.source.${source}`) })} ${t("gh.untrusted")}`,
    quote: neutralizeMarkdown(item.body).trim() || t("gh.noBody").replace(/_/g, ""),
    footer: `${item.kind === "bug" ? t("gh.bugIn") : t("gh.ideaIn")}: ${projectOrigin(project)}/${project.slug}/i/${item.number}`,
    meta,
  };
}

/** Linear (Markdown). */
export function issueMarkdown(p: IssueParts): string {
  return [`**${p.header}**`, "", quoteBlock(p.quote), "", "---", `${p.footer}${p.meta ? `  \n${p.meta}` : ""}`].join("\n");
}

/** Atlassian Document Format: text nodes are literal, so nothing the user wrote can become markup. */
type Adf = { type: string; text?: string; content?: Adf[]; marks?: { type: string; attrs?: Record<string, string> }[]; attrs?: Record<string, unknown> };
const adfText = (text: string, marks?: Adf["marks"]): Adf => ({ type: "text", text, ...(marks ? { marks } : {}) });
const para = (...content: Adf[]): Adf => ({ type: "paragraph", content: content.filter((c) => c.text !== "") });

/** Plain text for ADF: hidden characters and HTML comments gone, otherwise as written. */
export function adfPlain(s: string): string {
  return stripInvisible(stripHtmlComments(s.replace(/\r\n?/g, "\n")));
}

export function issueAdf(p: IssueParts, rawBody: string, url: string): Adf {
  const paras = adfPlain(rawBody).trim().split(/\n{2,}/).filter(Boolean).slice(0, 200)
    .map((chunk) => para(adfText(chunk.slice(0, 20_000))));
  return {
    type: "doc", attrs: { version: 1 } as never,
    content: [
      para(adfText(p.header, [{ type: "strong" }])),
      { type: "blockquote", content: paras.length ? paras : [para(adfText(p.quote))] },
      { type: "rule" },
      para(adfText(p.footer.replace(url, "").replace(/:\s*$/, ": ")), adfText(url, [{ type: "link", attrs: { href: url } }])),
      ...(p.meta ? [para(adfText(adfPlain(p.meta).replace(/`/g, "")))] : []),
    ],
  } as Adf & { attrs: { version: number } };
}

/** Mirrored comment: header (trust, source, internal) + quoted text. */
export function commentParts(project: Project, c: { body: string; trust: Trust; source: ItemSource; internal: boolean }) {
  const t = boardText(project);
  const header = `${t(c.internal ? "tracker.commentInternal" : "tracker.comment", { trust: t(`gh.trust.${c.trust}`), source: t(`gh.source.${c.source}`) })} ${t("gh.untrusted")}`;
  return { header, markdown: `**${header}**\n\n${quoteBlock(neutralizeMarkdown(c.body).trim())}`, adfBody: c.body };
}

export function commentAdf(header: string, body: string): Adf {
  const paras = adfPlain(body).trim().split(/\n{2,}/).filter(Boolean).slice(0, 100).map((chunk) => para(adfText(chunk.slice(0, 20_000))));
  return { type: "doc", attrs: { version: 1 } as never, content: [para(adfText(header, [{ type: "strong" }])), { type: "blockquote", content: paras.length ? paras : [para(adfText("—"))] }] } as Adf;
}

/** Author trust of an item (for the provenance header). */
export async function itemTrust(tx: Tx, item: Item): Promise<Trust> {
  const [author] = item.authorId ? await tx.select({ role: schema.users.role, externalId: schema.users.externalId, traits: schema.users.traits })
    .from(schema.users).where(eq(schema.users.id, item.authorId)) : [];
  return itemAuthorOf(item, author ? { ...author, name: null } : null).trust;
}

/* ---------- links ---------- */

export interface TrackerIssue { externalId: string; ref: string; url: string; title: string; state: TrackerState | null }

export interface LinkSync { stateId?: string; stateName?: string; pushedStateId?: string; pushedAt?: string }
export const readSync = (raw: unknown): LinkSync => (raw && typeof raw === "object" ? raw as LinkSync : {});

const closedBucket = (b: Bucket) => b === "done" || b === "off";

export async function addTrackerLink(tx: Tx, project: Project, actor: User | null, item: Item, provider: TrackerProvider, issue: TrackerIssue, cfg: TrackerConfigBase) {
  const { itemLinks, items } = schema;
  const existing = await tx.query.itemLinks.findFirst({ where: and(eq(itemLinks.provider, provider), eq(itemLinks.ref, issue.ref)) });
  if (existing && existing.itemId !== item.id) {
    const other = await tx.query.items.findFirst({ where: eq(items.id, existing.itemId) });
    throw new DomainError((l) => T(l)("tracker.alreadyLinked", { ref: issue.ref, n: String(other?.number ?? "?") }));
  }
  if (existing) return { ref: existing.ref, url: existing.url };
  const bucket = issue.state ? cfg.mapping[issue.state.id] ?? "none" : "none";
  await tx.insert(itemLinks).values({
    projectId: project.id, itemId: item.id, provider, ref: issue.ref, url: issue.url, title: neutralizeLine(issue.title, 300),
    externalId: issue.externalId, state: closedBucket(bucket) ? "closed" : "open",
    // The state it is in now is "seen": only later moves change Ozvi.
    sync: issue.state ? { stateId: issue.state.id, stateName: issue.state.name } : {},
  });
  const { emit } = await import("./events");
  await emit(tx, project, "item.linked", { item, actorName: actor?.name, link: { ref: issue.ref, url: issue.url } });
  return { ref: issue.ref, url: issue.url };
}

export async function findLink(tx: Tx, provider: TrackerProvider, externalId: string | null | undefined, ref?: string | null) {
  const { itemLinks } = schema;
  if (externalId) {
    const l = await tx.query.itemLinks.findFirst({ where: and(eq(itemLinks.provider, provider), eq(itemLinks.externalId, externalId)) });
    if (l) return l;
  }
  return ref ? tx.query.itemLinks.findFirst({ where: and(eq(itemLinks.provider, provider), eq(itemLinks.ref, ref)) }) : undefined;
}

/* ---------- loop guard ---------- */

const origin = new AsyncLocalStorage<{ linkId: string }>();

/** Runs `fn` as a change that came from the tracker link `linkId`: the outbox will not send it back there. */
export function fromTracker<T>(linkId: string, fn: () => Promise<T>): Promise<T> {
  return origin.run({ linkId }, fn);
}

/** How long our own push is recognised when it comes back as a webhook. */
export const ECHO_MS = 15 * 60_000;

export type ApplyResult = "unchanged" | "echo" | "unmapped" | "same stage" | "no item" | "moved";

/**
 * A tracker issue is now in `state`: remember it on the link, and move the Ozvi item to the mapped stage
 * (unless it is our own echo, unmapped, or the item already sits in that stage).
 */
export async function applyTrackerState(
  tx: Tx, project: Project, provider: TrackerProvider, link: typeof schema.itemLinks.$inferSelect, state: TrackerState, cfg: TrackerConfigBase,
  opts: { proofs?: () => Promise<{ url: string; title: string | null; ref?: string | null }[]>; now?: number; title?: string } = {},
): Promise<ApplyResult> {
  const prev = readSync(link.sync);
  const now = opts.now ?? Date.now();
  const bucket = cfg.mapping[state.id] ?? "none";
  const echo = prev.pushedStateId === state.id && !!prev.pushedAt && now - Date.parse(prev.pushedAt) < ECHO_MS;
  await tx.update(schema.itemLinks).set({
    sync: { ...prev, stateId: state.id, stateName: state.name },
    state: closedBucket(bucket) ? "closed" : "open",
    ...(opts.title ? { title: neutralizeLine(opts.title, 300) } : {}),
  }).where(eq(schema.itemLinks.id, link.id));
  if (prev.stateId === state.id) return "unchanged";
  if (echo) return "echo";
  if (bucket === "none") return "unmapped";
  const item = await tx.query.items.findFirst({ where: eq(schema.items.id, link.itemId) });
  if (!item || item.deletedAt || item.mergedIntoId) return "no item";
  if (statusBucket(item.status) === bucket) return "same stage";
  const target = bucketStatus(item.kind, bucket)!;
  if (bucket === "done" && opts.proofs) {
    for (const p of await opts.proofs().catch(() => [])) {
      if (cleanProofUrl(p.url)) await attachProof(tx, project.id, item.id, { kind: "pr", url: p.url, title: p.title, ref: p.ref ?? null }, null).catch(() => undefined);
    }
  }
  await fromTracker(link.id, () => changeStatus(tx, project, null, item, target));
  const t = boardText(project);
  await tx.insert(schema.comments).values({
    projectId: project.id, itemId: item.id, authorId: null, internal: true,
    body: t("tracker.moved", { tracker: providerName(provider), ref: link.ref, state: state.name }),
  });
  return "moved";
}

export const providerName = (p: TrackerProvider | string) => (p === "linear" ? "Linear" : p === "jira" ? "Jira" : p);

/* ---------- outbox (Ozvi → tracker) ---------- */

/**
 * Called from events.emit (status changes, public comments) and for internal comments: queues the
 * matching tracker work for every Linear/Jira link of the item, except the link the change came from.
 */
export async function enqueueTrackerSync(tx: Tx, project: Project, kind: "status" | "comment", item: Item,
  data: { status?: string; comment?: { body: string; authorId?: string | null; source?: string; internal?: boolean } }) {
  const links = await tx.select().from(schema.itemLinks).where(and(eq(schema.itemLinks.itemId, item.id), inArray(schema.itemLinks.provider, [...TRACKERS])));
  if (links.length === 0) return;
  const skip = origin.getStore()?.linkId;
  const rows = await tx.select().from(schema.integrations).where(inArray(schema.integrations.provider, [...TRACKERS]));
  const cfgOf = (p: string) => parseBase(p as TrackerProvider, (rows.find((r) => r.provider === p)?.config ?? {}) as Record<string, unknown>);
  const has = (p: string) => rows.some((r) => r.provider === p && r.tokenEnc);
  const out: (typeof schema.trackerSyncs.$inferInsert)[] = [];
  for (const l of links) {
    if (l.id === skip || !has(l.provider)) continue;
    const cfg = cfgOf(l.provider);
    if (kind === "status") {
      if (!cfg.push || !data.status || statusBucket(data.status) === "none") continue;
      out.push({ projectId: project.id, linkId: l.id, kind, payload: { status: data.status } });
    } else if (data.comment) {
      const internal = !!data.comment.internal;
      if (cfg.comments === "off" || (internal && cfg.comments !== "all")) continue;
      let trust: Trust = "anonymous";
      if (data.comment.authorId) {
        const [u] = await tx.select({ role: schema.users.role, externalId: schema.users.externalId, traits: schema.users.traits, name: schema.users.name })
          .from(schema.users).where(eq(schema.users.id, data.comment.authorId));
        trust = authorOf(u ?? null).trust;
      }
      out.push({ projectId: project.id, linkId: l.id, kind, payload: { body: data.comment.body.slice(0, 5000), trust, source: sourceOf(data.comment.source), internal } });
    }
  }
  if (out.length) await tx.insert(schema.trackerSyncs).values(out);
}
