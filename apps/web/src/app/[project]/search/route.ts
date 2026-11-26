import { withProject } from "@ozvi/db";
import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { similarIdeas, similarInputs } from "@/lib/duplicates";
import { getCtx } from "@/lib/project";
import { sectionOn } from "@/lib/sections";
import { matchKnown } from "@/lib/known-issues";

/**
 * Similar ideas while typing a new one (dedupe before it happens, ADR-0015). The same matcher as the team's
 * "Podobné" panel and MCP (lib/similar.ts findSimilar: embeddings when configured, otherwise trigrams on
 * accent-folded text, plus English pivots across languages), with the SHOW threshold of the method that
 * scored. Merged, deleted and queued ideas never show.
 * `kind=bug`: open known issues for someone reporting a bug (signed in), matched on their public title and
 * note only (lib/known-issues.ts). Bug reports themselves are never searchable here.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, plan } = await getCtx(slug);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (req.nextUrl.searchParams.get("kind") === "bug") {
    if (!user || !sectionOn(project, "bugs") || q.length < 4) return Response.json([]);
    const rows = await withProject(db, project.id, (tx) => matchKnown(tx, q, 3));
    return Response.json(rows.map(({ number, title, body, status, affected }) => ({ number, title, body, status, affected })));
  }
  if ((!project.ideasPublic && !user) || !sectionOn(project, "ideas")) return Response.json([]);
  if (q.length < 4) return Response.json([]);
  const inputs = await similarInputs(project, plan, user?.id ?? clientIp(req.headers), q);
  const rows = await withProject(db, project.id, (tx) => similarIdeas(tx, { text: q, ...inputs, userId: user?.id, limit: 3 }));
  return Response.json(rows.map((r) => ({ ...r, voted: r.weight > 0 })));
}
