import { withProject } from "@ozvi/db";
import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { similarIdeas, similarInputs } from "@/lib/duplicates";
import { getCtx } from "@/lib/project";
import { sectionOn } from "@/lib/sections";

/**
 * Similar ideas while typing a new one (dedupe before it happens, ADR-0015). The same matcher as the team's
 * "Podobné" panel and MCP (lib/similar.ts findSimilar: embeddings when configured, otherwise trigrams on
 * accent-folded text, plus English pivots across languages), with the SHOW threshold of the method that
 * scored. Bugs are never searchable here; merged, deleted and queued ideas never show.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, plan } = await getCtx(slug);
  if ((!project.ideasPublic && !user) || !sectionOn(project, "ideas")) return Response.json([]);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 4) return Response.json([]);
  const inputs = await similarInputs(project, plan, user?.id ?? clientIp(req.headers), q);
  const rows = await withProject(db, project.id, (tx) => similarIdeas(tx, { text: q, ...inputs, userId: user?.id, limit: 3 }));
  return Response.json(rows.map((r) => ({ ...r, voted: r.weight > 0 })));
}
