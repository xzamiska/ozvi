import { schema, type PlanName } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { stopLabel } from "@/lib/route-text";
import { cachedTitles, foreignPosts, translateTitlesFor, translationEnabled, translationModeOf } from "@/lib/translate";
import { budgetLeft, myVoteWeights, voteModeOf, votesLabel } from "@/lib/votes";
import { clampLimit } from "@/lib/widget-rules";
import { readProject, widgetIdeas, widgetPreflight, widgetRead } from "@/lib/widget-api";

type P = { params: Promise<{ project: string }> };

export async function OPTIONS(req: NextRequest, { params }: P) {
  return widgetPreflight(req, (await params).project);
}

/**
 * GET ?q=&limit=&lang= — top active ideas, or ideas matching `q` (similar ideas while typing a new one).
 * With `Authorization: Bearer <SSO token>` also the person's votes and remaining vote budget.
 *
 * Boards in automatic translation mode: ideas in another language than `lang` carry `tr` (title translated
 * with AI, `model`), from the cache only; titles not translated yet are translated after the answer is sent
 * (lib/translate.ts translateTitlesFor: same permissions and allowance as the board), for the next opening.
 */
export async function GET(req: NextRequest, { params }: P) {
  const r = await widgetRead(req, (await params).project, "ideas");
  if (!r.ok) return r.res;
  const { project, user, locale } = r;
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 200) ?? null;
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"), q ? 5 : 20, 50);
  // Similar ideas while typing stay in the original (the person compares wording).
  const auto = !q && translationModeOf(project) === "auto";
  const plan = auto ? await planOf(project.workspaceId) : null;
  const translate = !!plan && translationEnabled(project, plan);
  const data = await readProject(project, async (tx) => {
    const ideas = await widgetIdeas(tx, { q, limit, viewerId: user?.id });
    const mine = await myVoteWeights(tx, user?.id, ideas.map((i) => i.id));
    const left = await budgetLeft(tx, project, user?.id);
    const foreign = translate ? foreignPosts(ideas.map((i) => ({ subject: "item" as const, id: i.id, title: i.title, body: i.body })), locale) : [];
    const tr = foreign.length ? await cachedTitles(tx, foreign, locale) : new Map();
    return { ideas, mine, left, foreign, tr };
  });
  const missing = data.foreign.filter((f) => !data.tr.has(f.id)).map((f) => f.id);
  if (missing.length && plan) {
    const isTeam = user?.role === "team" || user?.role === "admin";
    after(() => translateTitlesFor(db, {
      project, plan, target: locale, viewer: { userId: user?.id ?? null, isTeam },
      rateKey: user?.id ?? clientIp(req.headers), ids: missing,
    }).catch((e) => console.warn("[ozvi] widget titles", e instanceof Error ? e.message : e)));
  }
  const mode = voteModeOf(project);
  return r.json({
    ideas: data.ideas.map(({ body: _b, voters, ...i }) => {
      const tr = data.tr.get(i.id);
      return { ...i, votesLabel: votesLabel(locale, mode, i.votes, voters), label: stopLabel(locale, i.status, project), weight: data.mine.get(i.id) ?? 0, ...(tr ? { tr: { title: tr.title, model: tr.model } } : {}) };
    }),
    voteMode: mode,
    budget: project.voteBudget != null ? { total: project.voteBudget, left: data.left } : null,
    signedIn: !!user,
  });
}

async function planOf(workspaceId: string): Promise<PlanName> {
  const [ws] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  return (ws?.plan ?? "self") as PlanName;
}
