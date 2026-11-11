import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { translator } from "@/i18n/messages";
import { isBlocked } from "@/lib/moderation-rules";
import { allow, RateLimitError } from "@/lib/ratelimit";
import { applyVote, budgetLeft } from "@/lib/votes";
import { parseVote, writeAllowed } from "@/lib/widget-rules";
import { ownOrigins, readProject, widgetPreflight, widgetRead } from "@/lib/widget-api";

type P = { params: Promise<{ project: string }> };

export async function OPTIONS(req: NextRequest, { params }: P) {
  return widgetPreflight(req, (await params).project);
}

/**
 * POST {id, weight} with `Authorization: Bearer <SSO token>`: the same vote as on the board (applyVote decides the
 * weight from the vote mode and guards the budget). weight 0 removes the vote. Voting never subscribes.
 */
export async function POST(req: NextRequest, { params }: P) {
  const r = await widgetRead(req, (await params).project, "ideas");
  if (!r.ok) return r.res;
  const { project, user, locale, json } = r;
  const te = translator(locale, "errors");
  const tw = translator(locale, "widget");
  if (!writeAllowed(project.allowedOrigins, ownOrigins(project, req), req.headers.get("origin"))) return json({ error: tw("origin") }, 403);
  if (!user) return json({ error: te("signIn") }, 401);
  if (isBlocked(user)) return json({ error: te("blocked") }, 403);
  if (!allow("vote", user.id)) return json({ error: new RateLimitError(locale).message }, 429);
  const body = parseVote(await req.json().catch(() => null));
  if (!body) return json({ error: tw("form") }, 400);
  const out = await readProject(project, async (tx) => {
    const v = await applyVote(tx, project, user.id, body.id, body.weight);
    if (!v.ok) return v;
    const [row] = await tx.select({ votes: schema.items.voteCount }).from(schema.items).where(eq(schema.items.id, body.id));
    return { ...v, votes: row?.votes ?? 0, left: await budgetLeft(tx, project, user.id) };
  });
  if (!out.ok) return json({ error: out.reason === "missing" ? te("ideaMissing") : te("voteBudget", { n: out.left ?? 0 }), left: out.left ?? null }, out.reason === "missing" ? 404 : 409);
  return json({ weight: out.weight, votes: out.votes, left: out.left });
}
