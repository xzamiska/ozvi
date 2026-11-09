import { PLAN_LIMITS, schema, withProject, withSystem, type Db, type PlanName } from "@ozvi/db";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { aiAvailable, labelAi, weeklyDigest } from "./ai";
import { notifyTeamDigest } from "./email/notify";
import { boardLocales } from "@/i18n/board";
import { countUnannounced, listUnannounced } from "./release";
import { daysWaiting, unansweredWhere, waitingSinceSql } from "./unanswered";

/**
 * Monday morning (UTC, from 06:00) team digest, once a week per project. Quiet weeks send nothing.
 * Data is read in one transaction, the optional AI call runs outside any transaction, and the
 * e-mail is enqueued in another.
 */

const { projects, workspaces, items, votes } = schema;
const WEEK = 7 * 86_400_000;

export async function teamDigests(db: Db, now = new Date()): Promise<number> {
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 6) return 0;
  const due = await withSystem(db, (tx) => tx.select({ p: projects, plan: workspaces.plan }).from(projects)
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .where(or(isNull(projects.teamDigestAt), lt(projects.teamDigestAt, new Date(now.getTime() - 6 * 86_400_000)))).limit(20));
  let sent = 0;
  for (const { p, plan } of due) {
    // Atomic claim: with several replicas only one wins; a crash or AI failure never causes a second digest.
    const claimed = await db.update(projects).set({ teamDigestAt: now })
      .where(and(eq(projects.id, p.id), or(isNull(projects.teamDigestAt), lt(projects.teamDigestAt, new Date(now.getTime() - 6 * 86_400_000)))))
      .returning({ id: projects.id });
    if (claimed.length === 0) continue;
    const since = new Date(now.getTime() - WEEK);
    const data = await withProject(db, p.id, async (tx) => {
      const [c] = await tx.select({
        newIdeas: sql<number>`count(*) filter (where ${items.kind} = 'idea' and ${items.createdAt} >= ${since.toISOString()}::timestamptz)::int`,
        newBugs: sql<number>`count(*) filter (where ${items.kind} = 'bug' and ${items.createdAt} >= ${since.toISOString()}::timestamptz)::int`,
        openBugs: sql<number>`count(*) filter (where ${items.kind} = 'bug' and ${items.status} in ('new','confirmed','in_progress'))::int`,
      }).from(items).where(and(isNull(items.mergedIntoId), isNull(items.deletedAt)));
      const trending = await tx.select({ number: items.number, title: items.title, votes: items.voteCount, status: items.status, newVotes: sql<number>`count(${votes.userId})::int` })
        .from(items).innerJoin(votes, and(eq(votes.itemId, items.id), gte(votes.createdAt, since)))
        .where(and(eq(items.kind, "idea"), isNull(items.mergedIntoId), eq(items.pending, false), isNull(items.deletedAt))).groupBy(items.id).orderBy(desc(sql`count(${votes.userId})`)).limit(8);
      const bugs = await tx.select({ number: items.number, title: items.title, status: items.status, body: sql<string>`left(${items.body}, 400)` })
        .from(items).where(and(eq(items.kind, "bug"), isNull(items.deletedAt), gte(items.createdAt, since), inArray(items.status, ["new", "confirmed", "in_progress"]))).orderBy(desc(items.createdAt)).limit(15);
      // "Bez odpovede": reports waiting longer than the project's N days, longest wait first.
      const waiting = unansweredWhere(p.unansweredDays, now);
      const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(items).where(waiting);
      const unanswered = await tx.select({ number: items.number, title: items.title, since: sql<string>`${waitingSinceSql}::text` })
        .from(items).where(waiting).orderBy(asc(waitingSinceSql)).limit(5);
      // "Vydané, ale neoznámené": voters hear only through a published changelog, so remind the team.
      const shipped = await listUnannounced(tx, 5);
      return { ...c!, trending, bugs, unanswered: { n: u?.n ?? 0, top: unanswered }, unannounced: { n: await countUnannounced(tx), top: shipped } };
    });
    if (data.newIdeas + data.newBugs + data.trending.length + data.unanswered.n === 0) continue;
    let summary: string | null = null;
    if (aiAvailable(plan as PlanName) && PLAN_LIMITS[plan as PlanName].ai) {
      try {
        // One summary for the whole team: written in the board's default language.
        const lang = boardLocales(p).fallback;
        summary = labelAi(await weeklyDigest({ days: 7, newIdeas: data.newIdeas, newBugs: data.newBugs, openBugs: data.openBugs, ideas: data.trending, bugs: data.bugs }, lang), lang);
      } catch (e) {
        console.warn("[ozvi] weekly digest AI failed", e instanceof Error ? e.message : e);
      }
    }
    sent += await withProject(db, p.id, (tx) => notifyTeamDigest(tx, p, {
      newIdeas: data.newIdeas, newBugs: data.newBugs, openBugs: data.openBugs,
      top: data.trending.slice(0, 5).map((t) => `#${t.number} ${t.title} (+${t.newVotes})`), summary,
      unanswered: { n: data.unanswered.n, days: p.unansweredDays,
        top: data.unanswered.top.map((x) => ({ label: `#${x.number} ${x.title}`, days: daysWaiting(new Date(x.since), now) })) },
      unannounced: { n: data.unannounced.n, top: data.unannounced.top.map((x) => `#${x.number} ${x.title}`) },
    }));
  }
  return sent;
}
