import type { NextRequest } from "next/server";
import { translator } from "@/i18n/messages";
import { listEntries } from "@/lib/changelog-queries";
import { projectOrigin } from "@/lib/email/url";
import { renderMarkdownWith } from "@/lib/markdown";
import { clampLimit } from "@/lib/widget-rules";
import { readProject, widgetPreflight, widgetRead } from "@/lib/widget-api";

type P = { params: Promise<{ project: string }> };

export async function OPTIONS(req: NextRequest, { params }: P) {
  return widgetPreflight(req, (await params).project);
}

/**
 * GET ?limit=&lang= — the latest published changelog entries for <ozvi-changelog>. The body is the board's safe
 * Markdown rendered to HTML (every text escaped, images as links). AI-assisted entries carry `ai: true` and the
 * "written with AI · reviewed by …" note (EU AI Act art. 50).
 */
export async function GET(req: NextRequest, { params }: P) {
  const r = await widgetRead(req, (await params).project, "changelog");
  if (!r.ok) return r.res;
  const { project, locale } = r;
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"), 5, 20);
  const entries = await readProject(project, (tx) => listEntries(tx, false, limit));
  const origin = projectOrigin(project);
  const base = `${origin}/${project.slug}`;
  const ta = translator(locale, "ai");
  return r.json({
    url: `${base}/changelog`,
    entries: entries.map((e) => ({
      id: e.id,
      title: e.title,
      html: renderMarkdownWith(e.body, { headings: true, slug: project.slug, origin }, { base: origin, imagesAsLinks: true }),
      publishedAt: e.publishedAt!.toISOString(),
      url: `${base}/changelog#${e.id}`,
      ai: !!e.aiModel,
      aiNote: e.aiModel ? (e.reviewerName ? ta("badge.reviewed", { name: e.reviewerName }) : ta("badge.reviewedAnon")) : null,
      items: e.items.map((i) => ({ number: i.number, title: i.title, url: `${base}/i/${i.number}` })),
    })),
  });
}
