import "server-only";
import { schema, type Tx } from "@ozvi/db";
import { parseTheme, presets, type Theme } from "@ozvi/theme";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { recipientLocale } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { detectLanguage } from "../lang-detect";
import { needsTranslation, translationModeOf } from "../translate";
import type { Project } from "../project";
import { stopLabel, type LabelSource } from "../route-text";
import type { ProofSnapshot } from "../proof";
import { renderMail, type Mail } from "./render";
import { isPace, summaryAt, SUMMARY_KINDS } from "./pace";
import { unsubscribeUrl } from "./unsubscribe";
import { projectOrigin } from "./url";

/**
 * Enqueue notifications inside the same transaction as the change that caused them,
 * so a rolled-back action never e-mails anybody. The worker sends them (worker.ts).
 */

const { users, emails, votes, comments, items } = schema;
type Item = typeof schema.items.$inferSelect;


function themeOf(p: Project): Theme {
  try { return parseTheme(p.theme); } catch { return parseTheme(presets.ozvi); }
}

/** The "email" translator for one locale (createTranslator: e-mails are rendered outside a request). */
export type EmailT = ReturnType<typeof translator<"email">>;

/** Builds one mail in the recipient's language (`t` = that language's translator). */
type Build = (t: EmailT, locale: Locale) => Mail;

/**
 * The post a mail quotes (a comment), for AI translation into each recipient's language: when the board has
 * translation on and the post is in another language than the mail, the row carries `translate` and the
 * worker translates it before sending (lib/email/translate-mail.ts). Nothing here calls a model.
 */
export interface QuotedPost { subject: "comment"; id: string; text: string }

async function enqueue(tx: Tx, project: Project, kind: string, recipientIds: string[], build: Build, post?: QuotedPost) {
  const ids = [...new Set(recipientIds)];
  if (ids.length === 0) return 0;
  const rows = await tx.select({ id: users.id, email: users.email, locale: users.locale, role: users.role, teamMail: users.teamMail }).from(users)
    .where(and(inArray(users.id, ids), isNotNull(users.email), eq(users.emailOptOut, false)));
  const theme = themeOf(project);
  if (rows.length === 0) return 0;
  const lang = post && translationModeOf(project) !== "off" ? detectLanguage(post.text) : null;
  const now = new Date();
  await tx.insert(emails).values(rows.map((r) => {
    const unsub = unsubscribeUrl(projectOrigin(project), project.slug, r.id);
    const locale = recipientLocale(project, r.locale);
    const mail = build(translator(locale, "email"), locale);
    const translate = post && needsTranslation(lang, locale) && mail.quote ? { subject: post.subject, id: post.id, target: locale, mail: mail as unknown as Record<string, unknown> } : null;
    // A team member who wants summaries: the mail waits (deferred) and goes out in their next summary.
    const pace = r.role === "team" || r.role === "admin" ? r.teamMail?.pace : undefined;
    const at = SUMMARY_KINDS.has(kind) && isPace(pace) ? summaryAt(pace, now) : null;
    const held = at ? { status: "deferred" as const, sendAfter: at, translate: null } : { translate };
    return { projectId: project.id, userId: r.id, to: r.email!, kind, ...renderMail(mail, theme, project.name, unsub, locale), ...held };
  }));
  return rows.length;
}

const itemUrl = (p: Project, item: Item) => `${projectOrigin(p)}/${p.slug}/i/${item.number}`;
const NOBODY = "00000000-0000-0000-0000-000000000000";

export type TeamMail = "newBug" | "newIdea" | "comments" | "digest" | "assigned";

/**
 * The team (team and admins); with `want`, only those who did not switch that kind of team e-mail off
 * ("My data" → Team e-mails; a missing key means on).
 */
async function teamIds(tx: Tx, want?: TeamMail) {
  const rows = await tx.select({ id: users.id, prefs: users.teamMail }).from(users).where(or(eq(users.role, "team"), eq(users.role, "admin")));
  return rows.filter((r) => !want || r.prefs?.[want] !== false).map((r) => r.id);
}

/**
 * Authors and public commenters of the given items, per item. An idea also counts the people of duplicates merged
 * into it (under the original): merging must not drop them out of the loop. Bugs never do (private: another
 * reporter's bug is not theirs to follow; they hear about the fix of their own report, notifyDuplicateFixed).
 */
async function participants(tx: Tx, list: Item[]): Promise<{ itemId: string; userId: string }[]> {
  if (list.length === 0) return [];
  const ideaIds = list.filter((i) => i.kind === "idea").map((i) => i.id);
  const dups = ideaIds.length ? await tx.select({ id: items.id, into: items.mergedIntoId, authorId: items.authorId }).from(items)
    .where(and(inArray(items.mergedIntoId, ideaIds), isNull(items.deletedAt))) : [];
  const owner = new Map<string, string>([...list.map((i) => [i.id, i.id] as const), ...dups.map((d) => [d.id, d.into!] as const)]);
  const out: { itemId: string; userId: string }[] = [];
  for (const i of list) if (i.authorId) out.push({ itemId: i.id, userId: i.authorId });
  for (const d of dups) if (d.authorId) out.push({ itemId: d.into!, userId: d.authorId });
  const talkers = await tx.selectDistinct({ id: comments.authorId, itemId: comments.itemId }).from(comments)
    .where(and(inArray(comments.itemId, [...owner.keys()]), eq(comments.internal, false), eq(comments.pending, false)));
  for (const t of talkers) if (t.id) out.push({ itemId: owner.get(t.itemId)!, userId: t.id });
  return out;
}

/**
 * Everybody following an item: its author and everyone who commented publicly (for an idea, also on duplicates
 * merged into it). Voting alone does not subscribe (voters hear about it once, from the changelog). Bugs are
 * private, but only the reporter and the team can comment on them, so the list never reaches anyone else.
 */
async function followers(tx: Tx, item: Item) {
  return [...new Set((await participants(tx, [item])).map((p) => p.userId))];
}

/** Proof of the fix as a link list for the mail (PRs with titles, the release, a preview to try). */
export function proofLinks(t: EmailT, proof: ProofSnapshot | null | undefined): Mail["links"] {
  if (!proof) return undefined;
  const items = [
    ...(proof.preview ? [{ label: t("proofPreview"), href: proof.preview }] : []),
    ...proof.prs.map((p) => ({ label: p.title || p.ref || p.url, href: p.url, note: p.ref && p.title ? `(${p.ref})` : undefined })),
    ...(proof.release?.url ? [{ label: t("proofRelease", { version: proof.release.tag }), href: proof.release.url }] : []),
  ];
  return items.length ? { heading: t("proofHeading"), items } : undefined;
}

/** Status mails, pure so they can be tested per language. `url` is the item's page. */
export const statusMails = {
  bugReporter: (t: EmailT, locale: Locale, item: Item, url: string, board?: LabelSource, proof?: ProofSnapshot | null): Mail => {
    const label = stopLabel(locale, item.status, board);
    const fixed = item.status === "fixed";
    return {
      subject: fixed ? t("bugFixedSubject", { title: item.title }) : `${label}: ${item.title}`,
      summary: fixed && item.fixedInVersion
        ? t("bugMineSummaryVersion", { title: item.title, label, version: item.fixedInVersion })
        : t("bugMineSummary", { title: item.title, label }),
      heading: fixed ? t("bugFixedHeading") : t("bugMineHeading", { label }),
      paragraphs: fixed
        ? [item.fixedInVersion ? t("bugFixedBodyVersion", { title: item.title, version: item.fixedInVersion }) : t("bugFixedBody", { title: item.title }), t("bugFixedAsk")]
        : [t("quoted", { title: item.title })],
      ...(fixed ? { links: proofLinks(t, proof) } : {}),
      cta: { label: fixed ? t("confirmFix") : t("openReport"), href: url },
    };
  },
  bugFollower: (t: EmailT, locale: Locale, item: Item, url: string, board?: LabelSource): Mail => {
    const label = stopLabel(locale, item.status, board);
    return {
      subject: `${label}: #${item.number} ${item.title}`,
      summary: t("bugOtherSummary", { n: String(item.number), title: item.title, label }),
      heading: t("bugOtherHeading", { n: String(item.number), label }),
      paragraphs: [`${t("quoted", { title: item.title })}${item.status === "fixed" && item.fixedInVersion ? t("fixedIn", { version: item.fixedInVersion }) : ""}`],
      cta: { label: t("openReport"), href: url },
    };
  },
  idea: (t: EmailT, locale: Locale, item: Item, url: string, board?: LabelSource, proof?: ProofSnapshot | null): Mail => {
    const label = stopLabel(locale, item.status, board);
    const shipped = item.status === "shipped";
    return {
      subject: shipped ? t("shippedSubject", { title: item.title }) : `${label}: ${item.title}`,
      summary: t("ideaSummary", { title: item.title, label }),
      heading: shipped ? t("ideaShippedHeading") : t("ideaHeading", { label }),
      paragraphs: [t("quoted", { title: item.title }), t("ideaWhy")],
      // Ideas are public, PRs may live in a private repo: only the preview and the release travel.
      ...(shipped && proof ? { links: proofLinks(t, { prs: [], release: proof.release, preview: proof.preview }) } : {}),
      cta: { label: t("viewIdea"), href: url },
    };
  },
};

/** `note`: the team's own words with the move (also posted as a comment, `noteId`), quoted in the mail. */
export async function notifyStatusChange(tx: Tx, project: Project, item: Item, actorId: string, proof: ProofSnapshot | null = null, note: string | null = null, noteId: string | null = null) {
  if (item.deletedAt) return;
  const recipients = (await followers(tx, item)).filter((id) => id !== actorId);
  const url = itemUrl(project, item);
  const said = note ? { quote: note.slice(0, 1000), quoteBase: quoteBase(project) } : {};
  const post: QuotedPost | undefined = note && noteId ? { subject: "comment", id: noteId, text: note } : undefined;
  if (item.kind === "bug") {
    // The reporter gets the "does it work for you?" mail; other followers (team) a plain update.
    const reporter = item.authorId && item.authorId !== actorId ? [item.authorId] : [];
    await enqueue(tx, project, "bug_status", reporter, (t, l) => ({ ...statusMails.bugReporter(t, l, item, url, project, proof), ...said }), post);
    await enqueue(tx, project, "bug_status", recipients.filter((id) => id !== item.authorId), (t, l) => ({ ...statusMails.bugFollower(t, l, item, url, project), ...said }), post);
    // Reporters of duplicates merged into this bug hear about the fix too (the merge dialog promises it), each
    // about their own report: bugs are private, so the original's title and link never reach them.
    if (item.status === "fixed") {
      const dups = await tx.select().from(items).where(and(eq(items.mergedIntoId, item.id), isNotNull(items.authorId), isNull(items.deletedAt)));
      await notifyDuplicateFixed(tx, project, item, dups, actorId);
    }
    return;
  }
  await enqueue(tx, project, "idea_status", recipients, (t, l) => ({ ...statusMails.idea(t, l, item, url, project, proof), ...said }), post);
}

const quoteBase = (p: Project) => ({ origin: projectOrigin(p), slug: p.slug });

/**
 * The original bug is fixed: each duplicate's reporter hears about their own report (title and link of the
 * duplicate; bugs are private, the original's never reach them). Not its author or the person who did it.
 */
export async function notifyDuplicateFixed(tx: Tx, project: Project, original: Item, dups: Item[], actorId: string) {
  for (const d of dups) {
    if (!d.authorId || d.deletedAt || d.authorId === actorId || d.authorId === original.authorId) continue;
    const own = { ...d, status: "fixed" as const, fixedInVersion: original.fixedInVersion };
    await enqueue(tx, project, "bug_status", [d.authorId], (t, l) => statusMails.bugFollower(t, l, own, itemUrl(project, d), project));
  }
}

/** "We're tracking this under #n": the duplicate's people now follow the original. */
export const mergedMail = (t: EmailT, source: Pick<Item, "title">, target: Pick<Item, "title" | "number">, url: string): Mail => ({
  subject: t("mergedSubject", { n: String(target.number), title: source.title }),
  summary: t("mergedSummary", { n: String(target.number), title: source.title }),
  heading: t("mergedHeading", { n: String(target.number) }),
  paragraphs: [t("mergedBody", { title: source.title, n: String(target.number), target: target.title }), t("mergedNext")],
  cta: { label: t("viewIdea"), href: url },
});

/** A bug report joined the same problem reported by others: about the reporter's own report, nothing of the other. */
export const bugMergedMail = (t: EmailT, source: Pick<Item, "title" | "number">, url: string): Mail => ({
  subject: t("bugMergedSubject", { n: String(source.number), title: source.title }),
  summary: t("bugMergedSummary", { title: source.title }),
  heading: t("bugMergedHeading"),
  paragraphs: [t("bugMergedBody", { title: source.title }), t("bugMergedNext")],
  cta: { label: t("openReport"), href: url },
});

/**
 * An idea was merged into another: its author and commenters get one e-mail pointing at the original, which they
 * follow from now on (participants). Bugs keep their own path: the reporter hears when the original is fixed.
 */
export async function notifyMerged(tx: Tx, project: Project, source: Item, target: Item, actorId: string) {
  if (source.deletedAt) return 0;
  if (source.kind === "bug") {
    // Bug reports are private: the reporter hears about their own report only (never the other report's number
    // or title). A merge into an already fixed bug sends "Opravené" instead (notifyDuplicateFixed).
    if (!source.authorId || source.authorId === actorId || target.status === "fixed" || target.status === "verified") return 0;
    return enqueue(tx, project, "bug_status", [source.authorId], (t) => bugMergedMail(t, source, itemUrl(project, source)));
  }
  const recipients = (await followers(tx, source)).filter((id) => id !== actorId);
  return enqueue(tx, project, "idea_status", recipients, (t) => mergedMail(t, source, target, itemUrl(project, target)));
}

/**
 * Who hears about a comment:
 * - "all": a published comment goes to the item's followers (author, commenters) and to the team;
 * - "internal": internal notes go to the team only;
 * - "queued": a comment held for approval (suspicious links) goes to the team only, as a request to review it;
 * - "approved": once the team approves it, the followers hear about it (the team already did).
 * Call after the comment is inserted (or approved); its author is never mailed about their own comment.
 */
export async function notifyComment(
  tx: Tx, project: Project, item: Item,
  c: { authorId: string; authorName: string | null; body: string; audience: "all" | "internal" | "queued" | "approved"; commentId?: string },
) {
  if (item.deletedAt) return;
  const team = await teamIds(tx);
  // Team members who switched comment e-mails off still hear about conversations they are part of (followers).
  const listening = await teamIds(tx, "comments");
  const recipients = (c.audience === "internal" || c.audience === "queued" ? listening
    : c.audience === "approved" ? (await followers(tx, item)).filter((id) => !team.includes(id))
    : [...(await followers(tx, item)), ...listening]).filter((id) => id !== c.authorId);
  const internal = c.audience === "internal";
  const queued = c.audience === "queued";
  // Nameless author: the same label the board shows ("Team member" / "User"), never "Someone".
  const role = c.authorName ? null : (await tx.select({ role: users.role }).from(users).where(eq(users.id, c.authorId)))[0]?.role;
  const href = `${itemUrl(project, item)}${c.commentId ? `#c-${c.commentId}` : ""}`;
  await enqueue(tx, project, internal ? "comment_internal" : queued ? "comment_queued" : "comment", recipients, (t) => {
    const who = c.authorName ?? (role === "team" || role === "admin" ? t("teamMember") : t("user"));
    const where = item.kind === "bug" ? t("onBug", { n: String(item.number) }) : t("onIdea");
    return {
      subject: `${internal ? t("internalNote") : queued ? t("commentQueued") : t("newComment")}: ${item.title}`,
      summary: t(internal ? "noteSummary" : queued ? "commentQueuedSummary" : "commentSummary", { who, where, title: item.title }),
      heading: internal ? t("newInternalNote") : queued ? t("commentQueued") : t("newComment"),
      paragraphs: [t(queued ? "commentQueuedLead" : "commentLead", { who, where, title: item.title })],
      quote: c.body.slice(0, 1000),
      quoteBase: quoteBase(project),
      cta: { label: queued ? t("reviewComment") : t("reply"), href },
    };
  }, c.commentId && !queued ? { subject: "comment", id: c.commentId, text: c.body } : undefined);
}

/**
 * The team rejected the author's queued idea: tell them, with the team's message, in their language.
 * Respects the e-mail opt-out like every other mail (enqueue skips opted-out people).
 */
export const rejectionMail = (t: EmailT, item: Pick<Item, "title">, reason: string | null, url: string): Mail => ({
  subject: t("rejectedSubject", { title: item.title }),
  summary: t("rejectedSummary", { title: item.title }),
  heading: t("rejectedHeading"),
  paragraphs: [t(reason ? "rejectedBodyReason" : "rejectedBody", { title: item.title })],
  quote: reason ?? undefined,
  cta: { label: t("rejectedCta"), href: url },
});

export async function notifyRejected(tx: Tx, project: Project, item: Item, actorId: string) {
  if (!item.authorId || item.authorId === actorId) return 0;
  const reason = item.deleteReason?.trim() || null;
  return enqueue(tx, project, "idea_rejected", [item.authorId], (t) => rejectionMail(t, item, reason, itemUrl(project, item)));
}

/**
 * Someone on the team gave items to a colleague: tell the colleague once, however many items (bulk), unless they
 * switched assignment e-mails off ("My data" → Team e-mails). Team mail, never the customer.
 */
export async function notifyAssigned(tx: Tx, project: Project, list: Item[], assigneeId: string, byName: string | null) {
  if (list.length === 0 || !(await teamIds(tx, "assigned")).includes(assigneeId)) return;
  const one = list.length === 1 ? list[0]! : null;
  await enqueue(tx, project, "assigned", [assigneeId], (t) => ({
    subject: one ? t("assignedSubject", { title: one.title }) : t("assignedManySubject", { n: list.length }),
    summary: one ? t("assignedSummary", { title: one.title }) : t("assignedManySubject", { n: list.length }),
    heading: t("assignedHeading"),
    paragraphs: one
      ? [t("assignedBody", { who: byName ?? t("teamMember"), ref: t("ref", { n: String(one.number), title: one.title }) })]
      : [t("assignedManyBody", { who: byName ?? t("teamMember"), n: list.length }), ...list.slice(0, 20).map((i) => `• ${t("ref", { n: String(i.number), title: i.title })}`)],
    cta: one ? { label: one.kind === "bug" ? t("openReport") : t("openIdea"), href: itemUrl(project, one) }
      : { label: t("openMine"), href: `${projectOrigin(project)}/${project.slug}/${list[0]!.kind === "bug" ? "bugs" : "ideas"}?s=all&who=me` },
  }));
}

/** A new idea goes to the team so nothing waits unseen until the weekly digest. */
export async function notifyNewIdea(tx: Tx, project: Project, item: Item) {
  const team = (await teamIds(tx, "newIdea")).filter((id) => id !== (item.authorId ?? NOBODY));
  await enqueue(tx, project, "new_idea", team, (t) => ({
    subject: t("newIdeaSubject", { title: item.title }),
    summary: t("newIdeaSummary", { title: item.title }),
    heading: t("newIdea"),
    paragraphs: [t("ref", { n: String(item.number), title: item.title })],
    quote: item.body ? item.body.slice(0, 600) : undefined,
    quoteBase: quoteBase(project),
    cta: { label: t("openIdea"), href: itemUrl(project, item) },
  }));
}

export async function notifyNewBug(tx: Tx, project: Project, item: Item) {
  const team = (await teamIds(tx, "newBug")).filter((id) => id !== (item.authorId ?? NOBODY));
  await enqueue(tx, project, "new_bug", team, (t) => ({
    subject: t("newBugSubject", { title: item.title }),
    summary: t("newBugSummary", { title: item.title }),
    heading: t("newBug"),
    paragraphs: [t("ref", { n: String(item.number), title: item.title })],
    quote: item.body ? item.body.slice(0, 600) : undefined,
    quoteBase: quoteBase(project),
    cta: { label: t("openReport"), href: itemUrl(project, item) },
  }));
}

/**
 * The changelog mail for one person: the entry and the ideas of theirs it ships. `reason` sets the footer:
 * "voted" when they only voted (voting does not subscribe), "follow" when they wrote or discussed one.
 */
export const changelogMail = (t: EmailT, entry: { title: string; body: string; url: string }, theirs: Pick<Item, "title">[], reason: "follow" | "voted"): Mail => ({
  subject: t("changelogSubject", { title: entry.title }),
  summary: t("changelogSummary", { title: entry.title, ideas: theirs.map((x) => x.title).join(", ") }),
  heading: entry.title,
  paragraphs: [theirs.length === 1
    ? t("changelogOne", { title: theirs[0]!.title })
    : t("changelogMany", { titles: theirs.map((x) => t("quoted", { title: x.title })).join(", ") })],
  quote: entry.body ? entry.body.slice(0, 1500) : undefined,
  quoteHeadings: true,
  cta: { label: t("viewChangelog"), href: entry.url },
  reason,
});

/**
 * Who hears about each idea of a changelog entry: its voters, plus its authors and commenters (also of duplicates
 * merged into it), who follow it. The publisher never does.
 */
async function changelogAudience(tx: Tx, ideas: Item[], actorId: string | null) {
  const ids = ideas.map((i) => i.id);
  const voterRows = ids.length ? await tx.select({ userId: votes.userId, itemId: votes.itemId }).from(votes).where(inArray(votes.itemId, ids)) : [];
  const people = await participants(tx, ideas);
  return [...voterRows.map((v) => ({ ...v, follows: false })), ...people.map((p) => ({ ...p, follows: true }))].filter((r) => r.userId !== actorId);
}

/**
 * The people a changelog e-mail would reach, per idea (only those with an address who did not opt out): the
 * changelog form and the MCP preview count these, so the number shown before publishing is the one that goes out.
 */
export async function changelogReach(tx: Tx, ideas: Item[], actorId: string | null): Promise<Map<string, string[]>> {
  const rows = await changelogAudience(tx, ideas, actorId);
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const mailable = new Set(userIds.length ? (await tx.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, userIds), isNotNull(users.email), eq(users.emailOptOut, false)))).map((u) => u.id) : []);
  const out = new Map<string, string[]>(ideas.map((i) => [i.id, []]));
  for (const r of rows) {
    const list = out.get(r.itemId)!;
    if (mailable.has(r.userId) && !list.includes(r.userId)) list.push(r.userId);
  }
  return out;
}

export async function notifyChangelog(
  tx: Tx, project: Project, entry: { title: string; body: string; url: string }, ideas: Item[], actorId: string | null,
) {
  if (ideas.length === 0) return 0;
  const mine = new Map<string, Item[]>();
  // Authors and commenters follow their ideas; everyone else here only voted.
  const following = new Set<string>();
  for (const r of await changelogAudience(tx, ideas, actorId)) {
    const it = ideas.find((i) => i.id === r.itemId)!;
    const list = mine.get(r.userId) ?? [];
    if (!list.includes(it)) list.push(it);
    mine.set(r.userId, list);
    if (r.follows) following.add(r.userId);
  }
  let n = 0;
  for (const [userId, theirs] of mine) {
    n += await enqueue(tx, project, "changelog", [userId], (t) => ({
      ...changelogMail(t, entry, theirs, following.has(userId) ? "follow" : "voted"),
      quoteBase: quoteBase(project),
    }));
  }
  return n;
}

/** Weekly team digest (team and admins), with numbers and optionally an AI summary. */
export async function notifyTeamDigest(tx: Tx, project: Project, d: {
  newIdeas: number; newBugs: number; openBugs: number; top: string[]; summary: string | null;
  /** "Bez odpovede": how many reports wait longer than `days`, and the longest waits. */
  unanswered?: { n: number; days: number; top: { label: string; days: number }[] };
  /** "Vydané, ale neoznámené": shipped/fixed items no published changelog mentions yet. */
  unannounced?: { n: number; top: string[] };
}) {
  return enqueue(tx, project, "team_digest", await teamIds(tx, "digest"), (t) => ({
    subject: t("teamDigestSubject", { project: project.name }),
    summary: t("teamDigestSummary", { ideas: d.newIdeas, bugs: d.newBugs, open: d.openBugs }),
    heading: t("teamDigestHeading"),
    paragraphs: [
      // Plain strings: the old text printed the raw numbers (no locale grouping).
      t("teamDigestNumbers", { ideas: String(d.newIdeas), bugs: String(d.newBugs), open: String(d.openBugs) }),
      ...(d.top.length ? [t("teamDigestTop"), ...d.top.map((x) => `• ${x}`)] : []),
      ...(d.unanswered && d.unanswered.n > 0 ? [
        t("teamDigestUnanswered", { n: d.unanswered.n, days: d.unanswered.days }),
        ...d.unanswered.top.map((x) => `• ${x.label} (${t("teamDigestWaiting", { n: x.days })})`),
      ] : []),
      ...(d.unannounced && d.unannounced.n > 0 ? [
        t("teamDigestUnannounced", { n: d.unannounced.n }),
        ...d.unannounced.top.map((x) => `• ${x}`),
      ] : []),
    ],
    quote: d.summary ?? undefined,
    cta: d.unanswered && d.unanswered.n > 0
      ? { label: t("openUnanswered"), href: `${projectOrigin(project)}/${project.slug}/unanswered` }
      : { label: t("openReports"), href: `${projectOrigin(project)}/${project.slug}/bugs` },
  }));
}

/** A GitHub release drafted a changelog entry: the team approves it (nothing is published automatically). */
export async function notifyReleaseDraft(tx: Tx, project: Project, d: { tag: string; title: string; ideas: number; bugs: number; editUrl: string }) {
  const team = await teamIds(tx);
  return enqueue(tx, project, "release_draft", team, (t) => ({
    subject: t("releaseDraftSubject", { version: d.tag }),
    summary: t("releaseDraftSummary", { version: d.tag, ideas: d.ideas, bugs: d.bugs }),
    heading: t("releaseDraftHeading", { version: d.tag }),
    paragraphs: [t("releaseDraftBody", { ideas: d.ideas, bugs: d.bugs }), t("releaseDraftNote")],
    cta: { label: t("releaseDraftCta"), href: d.editUrl },
  }));
}
