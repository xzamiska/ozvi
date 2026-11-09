import "server-only";
import { schema, type Tx } from "@ozvi/db";
import { parseTheme, presets, type Theme } from "@ozvi/theme";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { recipientLocale } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import type { Project } from "../project";
import { stopLabel, type LabelSource } from "../route-text";
import type { ProofSnapshot } from "../proof";
import { renderMail, type Mail } from "./render";
import { unsubscribeUrl } from "./unsubscribe";
import { projectOrigin } from "./url";

/**
 * Enqueue notifications inside the same transaction as the change that caused them,
 * so a rolled-back action never e-mails anybody. The worker sends them (worker.ts).
 */

const { users, emails, votes, comments } = schema;
type Item = typeof schema.items.$inferSelect;


function themeOf(p: Project): Theme {
  try { return parseTheme(p.theme); } catch { return parseTheme(presets.ozvi); }
}

/** The "email" translator for one locale (createTranslator: e-mails are rendered outside a request). */
export type EmailT = ReturnType<typeof translator<"email">>;

/** Builds one mail in the recipient's language (`t` = that language's translator). */
type Build = (t: EmailT, locale: Locale) => Mail;

async function enqueue(tx: Tx, project: Project, kind: string, recipientIds: string[], build: Build) {
  const ids = [...new Set(recipientIds)];
  if (ids.length === 0) return 0;
  const rows = await tx.select({ id: users.id, email: users.email, locale: users.locale }).from(users)
    .where(and(inArray(users.id, ids), isNotNull(users.email), eq(users.emailOptOut, false)));
  const theme = themeOf(project);
  if (rows.length === 0) return 0;
  await tx.insert(emails).values(rows.map((r) => {
    const unsub = unsubscribeUrl(projectOrigin(project), project.slug, r.id);
    const locale = recipientLocale(project, r.locale);
    return { projectId: project.id, userId: r.id, to: r.email!, kind, ...renderMail(build(translator(locale, "email"), locale), theme, project.name, unsub, locale) };
  }));
  return rows.length;
}

const itemUrl = (p: Project, item: Item) => `${projectOrigin(p)}/${p.slug}/i/${item.number}`;
const NOBODY = "00000000-0000-0000-0000-000000000000";

async function teamIds(tx: Tx) {
  const rows = await tx.select({ id: users.id }).from(users).where(or(eq(users.role, "team"), eq(users.role, "admin")));
  return rows.map((r) => r.id);
}

/**
 * Everybody following an item: its author and everyone who commented publicly. Voting alone does
 * not subscribe (voters hear about it once, from the changelog). Bugs are private, but only the
 * reporter and the team can comment on them, so the list never reaches anyone else.
 */
async function followers(tx: Tx, item: Item) {
  const ids = new Set<string>();
  if (item.authorId) ids.add(item.authorId);
  const talkers = await tx.selectDistinct({ id: comments.authorId }).from(comments)
    .where(and(eq(comments.itemId, item.id), eq(comments.internal, false), eq(comments.pending, false)));
  for (const t of talkers) if (t.id) ids.add(t.id);
  return [...ids];
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

export async function notifyStatusChange(tx: Tx, project: Project, item: Item, actorId: string, proof: ProofSnapshot | null = null) {
  if (item.deletedAt) return;
  const recipients = (await followers(tx, item)).filter((id) => id !== actorId);
  const url = itemUrl(project, item);
  if (item.kind === "bug") {
    // The reporter gets the "does it work for you?" mail; other followers (team) a plain update.
    const reporter = item.authorId && item.authorId !== actorId ? [item.authorId] : [];
    await enqueue(tx, project, "bug_status", reporter, (t, l) => statusMails.bugReporter(t, l, item, url, project, proof));
    await enqueue(tx, project, "bug_status", recipients.filter((id) => id !== item.authorId), (t, l) => statusMails.bugFollower(t, l, item, url, project));
    return;
  }
  await enqueue(tx, project, "idea_status", recipients, (t, l) => statusMails.idea(t, l, item, url, project, proof));
}

const quoteBase = (p: Project) => ({ origin: projectOrigin(p), slug: p.slug });

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
  const recipients = (c.audience === "internal" || c.audience === "queued" ? team
    : c.audience === "approved" ? (await followers(tx, item)).filter((id) => !team.includes(id))
    : [...(await followers(tx, item)), ...team]).filter((id) => id !== c.authorId);
  const internal = c.audience === "internal";
  const queued = c.audience === "queued";
  const href = `${itemUrl(project, item)}${c.commentId ? `#c-${c.commentId}` : ""}`;
  await enqueue(tx, project, internal ? "comment_internal" : queued ? "comment_queued" : "comment", recipients, (t) => {
    const who = c.authorName ?? t("someone");
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
  });
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

/** A new idea goes to the team so nothing waits unseen until the weekly digest. */
export async function notifyNewIdea(tx: Tx, project: Project, item: Item) {
  const team = (await teamIds(tx)).filter((id) => id !== (item.authorId ?? NOBODY));
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
  const team = (await teamIds(tx)).filter((id) => id !== (item.authorId ?? NOBODY));
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

/** One e-mail per person who wrote, voted for or commented on any idea in a published changelog entry. */
export async function notifyChangelog(
  tx: Tx, project: Project, entry: { title: string; body: string; url: string }, ideas: Item[], actorId: string | null,
) {
  if (ideas.length === 0) return 0;
  const ids = ideas.map((i) => i.id);
  const voterRows = await tx.select({ id: votes.userId, itemId: votes.itemId }).from(votes).where(inArray(votes.itemId, ids));
  const mine = new Map<string, Item[]>();
  const add = (userId: string, itemId: string) => {
    if (userId === actorId) return;
    const it = ideas.find((i) => i.id === itemId)!;
    const list = mine.get(userId) ?? [];
    if (!list.includes(it)) list.push(it);
    mine.set(userId, list);
  };
  for (const v of voterRows) add(v.id, v.itemId);
  const talkers = await tx.selectDistinct({ id: comments.authorId, itemId: comments.itemId }).from(comments)
    .where(and(inArray(comments.itemId, ids), eq(comments.internal, false), eq(comments.pending, false)));
  for (const t of talkers) if (t.id) add(t.id, t.itemId);
  for (const i of ideas) if (i.authorId) add(i.authorId, i.id);
  let n = 0;
  for (const [userId, theirs] of mine) {
    n += await enqueue(tx, project, "changelog", [userId], (t) => ({
      subject: t("changelogSubject", { title: entry.title }),
      summary: t("changelogSummary", { title: entry.title, ideas: theirs.map((x) => x.title).join(", ") }),
      heading: entry.title,
      paragraphs: [theirs.length === 1
        ? t("changelogOne", { title: theirs[0]!.title })
        : t("changelogMany", { titles: theirs.map((x) => t("quoted", { title: x.title })).join(", ") })],
      quote: entry.body ? entry.body.slice(0, 1500) : undefined,
      quoteHeadings: true,
      quoteBase: quoteBase(project),
      cta: { label: t("viewChangelog"), href: entry.url },
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
  const team = await tx.select({ id: users.id }).from(users).where(or(eq(users.role, "team"), eq(users.role, "admin")));
  return enqueue(tx, project, "team_digest", team.map((t) => t.id), (t) => ({
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
