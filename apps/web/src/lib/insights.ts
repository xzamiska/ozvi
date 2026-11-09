import { schema, type Tx } from "@ozvi/db";
import { ToolError, type InsightInput } from "@ozvi/mcp";
import { and, asc, eq, sql } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { addCommentTo, type Item } from "./domain";
import { notifyNewIdea } from "./email/notify";
import type { Project, User } from "./project";
import { INSIGHT_PREFIX } from "./provenance";
import { findSimilar, type SimilarRow } from "./similar";
import { applyVote } from "./votes";

/**
 * Customer insights from agents (MCP submit_insight): a support/call snippet becomes demand on an
 * existing idea (the customer's vote + an internal note) or a new idea that waits in the moderation
 * queue. Nothing an agent sends here is ever public before the team approves it.
 */

const { items, users, votes, comments } = schema;

/** Similarity at or above this attaches to the closest idea on its own; below, a new idea goes to the queue. */
export const INSIGHT_ATTACH_SCORE = 0.85;

/** Single line, no control or angle characters, bounded: customer fields come from an agent. */
export const cleanField = (s: string | null | undefined, max: number) =>
  (s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null;

export const cleanEmail = (s: string | null | undefined) => {
  const e = (s ?? "").trim().toLowerCase();
  return /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z0-9-]{2,}$/i.test(e) ? e : null;
};

/** Internal note (board's default language) with where the insight came from and who said it. */
export function insightNote(locale: Locale, a: Pick<InsightInput, "text" | "source" | "sourceRef">, who: { email: string | null; company: string | null; name: string | null }, agent: string | null): string {
  const t = translator(locale, "integrations");
  const ref = cleanField(a.sourceRef, 300);
  const person = [who.name, who.email, who.company].filter(Boolean).join(" · ");
  const quote = a.text.trim().slice(0, 4000).split("\n").map((l) => `> ${l}`).join("\n");
  return [
    `**${t("insight.heading", { source: t(`insight.source.${a.source}`) })}**${ref ? ` · ${ref}` : ""}`,
    person ? `${t("insight.customer")}: ${person}` : t("insight.noCustomer"),
    "",
    quote,
    "",
    `_${t("insight.via", { agent: agent ?? "MCP" })}_`,
  ].join("\n");
}

export interface InsightOutcome {
  action: "attached" | "created";
  item: Item;
  voted: boolean;
  customer: { known: boolean; email: string | null; company: string | null } | null;
  candidates: SimilarRow[];
}

/** The customer by e-mail (known board user first), or a new unverified contact that never gets e-mails. */
export async function customerFor(tx: Tx, project: Project, c: InsightInput["customer"]) {
  const email = cleanEmail(c?.email);
  const company = cleanField(c?.company, 120);
  const name = cleanField(c?.name, 120);
  if (!email) return { user: null, email: null, company, name, known: false };
  const [found] = await tx.select().from(users).where(sql`lower(${users.email}) = ${email}`)
    .orderBy(sql`${users.externalId} like ${`${INSIGHT_PREFIX}%`}`, asc(users.createdAt)).limit(1);
  if (found) return { user: found, email, company, name, known: !found.externalId.startsWith(INSIGHT_PREFIX) };
  const [created] = await tx.insert(users).values({
    projectId: project.id, externalId: `${INSIGHT_PREFIX}${email}`, email, name,
    traits: company ? { company } : {},
    // Nobody asked this person; they hear nothing from Ozvi until they sign in themselves.
    emailOptOut: true,
  }).onConflictDoNothing({ target: [users.projectId, users.externalId] }).returning();
  const user = created ?? (await tx.select().from(users).where(eq(users.externalId, `${INSIGHT_PREFIX}${email}`)))[0] ?? null;
  return { user, email, company, name, known: false };
}

export async function submitInsight(
  tx: Tx, project: Project, actor: User, a: InsightInput,
  opts: { queryVector?: string | null; mustGet: (tx: Tx, n: number) => Promise<Item> },
): Promise<InsightOutcome> {
  const locale: Locale = isLocale(project.defaultLocale) ? project.defaultLocale : "sk";
  const title = a.title.trim();
  const text = a.text.trim();
  if (title.length < 3 || text.length < 3) throw new ToolError("Give a title and the customer's words (3+ characters each).");
  const who = await customerFor(tx, project, a.customer);
  const candidates = await findSimilar(tx, {
    // Trigram fallback compares titles (a long snippet against a short title scores low); embeddings use title + text.
    queryVector: opts.queryVector, text: title, limit: 5, where: [sql`${items.kind} = 'idea'`],
  }).catch(() => [] as SimilarRow[]);

  let target: Item | null = null;
  if (a.match) {
    target = await opts.mustGet(tx, a.match);
    if (target.kind !== "idea") throw new ToolError(`#${a.match} is a bug report; insights attach to ideas.`);
    if (target.mergedIntoId) {
      const [into] = await tx.select({ number: items.number }).from(items).where(eq(items.id, target.mergedIntoId));
      throw new ToolError(`#${a.match} was merged into #${into?.number ?? "?"}; attach there.`);
    }
  } else if (candidates[0] && candidates[0].score >= INSIGHT_ATTACH_SCORE) {
    target = (await tx.query.items.findFirst({ where: eq(items.id, candidates[0].id) })) ?? null;
  }
  const note = insightNote(locale, a, who, actor.name);
  const customer = who.email || who.company ? { known: who.known, email: who.email, company: who.company } : null;

  if (target) {
    let voted = false;
    if (who.user && !who.user.blockedAt && target.authorId !== who.user.id) {
      const [had] = await tx.select({ w: votes.weight }).from(votes).where(and(eq(votes.itemId, target.id), eq(votes.userId, who.user.id)));
      if (!had) voted = (await applyVote(tx, project, who.user.id, target.id, 1)).ok;
    }
    await addCommentTo(tx, project, actor, target, note, true, "mcp");
    const fresh = (await tx.query.items.findFirst({ where: eq(items.id, target.id) }))!;
    return { action: "attached", item: fresh, voted, customer, candidates: candidates.filter((c) => c.id !== target!.id) };
  }

  // New idea: always queued for the team, even though a team token filed it. Authored by the system
  // ("From customer feedback", context.insight), never by the customer: they are only a voter, visible to the team.
  const [seq] = await tx.update(schema.projects).set({ itemSeq: sql`${schema.projects.itemSeq} + 1` })
    .where(eq(schema.projects.id, project.id)).returning({ n: schema.projects.itemSeq });
  const [item] = await tx.insert(items).values({
    projectId: project.id, kind: "idea", number: seq!.n, title: title.slice(0, 200), body: text.slice(0, 10_000), status: "open",
    authorId: null, context: { insight: true, from: a.source }, pending: true, pendingReason: "approval", source: "mcp",
  }).returning();
  // applyVote refuses queued ideas (people can't vote on them); the customer's demand is recorded directly.
  let voted = false;
  if (who.user && !who.user.blockedAt) {
    await tx.insert(votes).values({ projectId: project.id, itemId: item!.id, userId: who.user.id, weight: 1 }).onConflictDoNothing();
    await tx.update(items).set({ voteCount: sql`(select coalesce(sum(${votes.weight}), 0) from ${votes} where ${votes.itemId} = ${item!.id})` }).where(eq(items.id, item!.id));
    voted = true;
  }
  // Team-only provenance note, written directly so the team gets one e-mail (new idea), not two.
  await tx.insert(comments).values({ projectId: project.id, itemId: item!.id, authorId: actor.id, body: note.slice(0, 5000), internal: true, source: "mcp" });
  await notifyNewIdea(tx, project, item!);
  const fresh = (await tx.query.items.findFirst({ where: eq(items.id, item!.id) }))!;
  return { action: "created", item: fresh, voted, customer, candidates };
}
