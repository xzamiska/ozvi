import type { NextRequest } from "next/server";
import { stopLabel } from "@/lib/route-text";
import { budgetLeft, myVoteWeights, voteModeOf } from "@/lib/votes";
import { clampLimit } from "@/lib/widget-rules";
import { readProject, widgetIdeas, widgetPreflight, widgetRead } from "@/lib/widget-api";

type P = { params: Promise<{ project: string }> };

export async function OPTIONS(req: NextRequest, { params }: P) {
  return widgetPreflight(req, (await params).project);
}

/**
 * GET ?q=&limit=&lang= — top active ideas, or ideas matching `q` (similar ideas while typing a new one).
 * With `Authorization: Bearer <SSO token>` also the person's votes and remaining vote budget.
 */
export async function GET(req: NextRequest, { params }: P) {
  const r = await widgetRead(req, (await params).project, "ideas");
  if (!r.ok) return r.res;
  const { project, user, locale } = r;
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 200) ?? null;
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"), q ? 5 : 20, 50);
  const data = await readProject(project, async (tx) => {
    const ideas = await widgetIdeas(tx, { q, limit, viewerId: user?.id });
    const mine = await myVoteWeights(tx, user?.id, ideas.map((i) => i.id));
    const left = await budgetLeft(tx, project, user?.id);
    return { ideas, mine, left };
  });
  return r.json({
    ideas: data.ideas.map((i) => ({ ...i, label: stopLabel(locale, i.status, project), weight: data.mine.get(i.id) ?? 0 })),
    voteMode: voteModeOf(project),
    budget: project.voteBudget != null ? { total: project.voteBudget, left: data.left } : null,
    signedIn: !!user,
  });
}
