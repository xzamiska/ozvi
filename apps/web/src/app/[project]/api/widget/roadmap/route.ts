import type { NextRequest } from "next/server";
import { projectOrigin } from "@/lib/email/url";
import { roadmapLanes, ROADMAP_LANES } from "@/lib/roadmap";
import { stopLabel } from "@/lib/route-text";
import { clampLimit } from "@/lib/widget-rules";
import { readProject, widgetPreflight, widgetRead } from "@/lib/widget-api";

type P = { params: Promise<{ project: string }> };

export async function OPTIONS(req: NextRequest, { params }: P) {
  return widgetPreflight(req, (await params).project);
}

/** GET ?limit=&lang= — the public roadmap for <ozvi-roadmap>: three lanes, top `limit` cards each, public tags only. */
export async function GET(req: NextRequest, { params }: P) {
  const r = await widgetRead(req, (await params).project, "roadmap");
  if (!r.ok) return r.res;
  const { project, locale } = r;
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"), 5, 20);
  const { lanes } = await readProject(project, (tx) => roadmapLanes(tx, project, locale, { team: false, pages: { pl: 1, ip: 1, sh: 1 } }));
  const base = `${projectOrigin(project)}/${project.slug}`;
  return r.json({
    url: `${base}/roadmap`,
    lanes: ROADMAP_LANES.map((l, i) => ({
      status: l.status,
      label: stopLabel(locale, l.status, project),
      total: lanes[i]!.total,
      rows: lanes[i]!.rows.slice(0, limit).map((c) => ({
        number: c.number, title: c.title, votes: c.votes, sub: c.subLabel ?? null,
        tags: c.tags.map((t) => ({ name: t.name, color: t.color })), url: `${base}/i/${c.number}`,
      })),
    })),
  });
}
