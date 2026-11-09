import { withProject } from "@ozvi/db";
import type { NextRequest } from "next/server";
import { listEntries } from "@/lib/changelog-queries";
import { db } from "@/lib/db";
import { esc } from "@/lib/email/render";
import { projectOrigin } from "@/lib/email/url";
import { projectFor } from "@/lib/oauth-meta";
import { boardLocales } from "@/i18n/board";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { renderMarkdownWith } from "@/lib/markdown";

/** RSS 2.0 of published changelog entries (public boards only). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const project = await projectFor((await params).project);
  if (!project || !project.ideasPublic) return new Response("not found", { status: 404 });
  const entries = await withProject(db, project.id, (tx) => listEntries(tx, false, 50));
  const base = `${projectOrigin(project)}/${project.slug}`;
  // Publicly cached, so always in the board's default language rather than the requester's.
  const locale = boardLocales(project).fallback;
  const t = await getTranslations({ locale, namespace: "boardAuth" });
  // XML 1.0 forbids most C0 control characters; drop them before escaping.
  // EU AI Act art. 50: AI-assisted entries say so in the feed too, with who approved them.
  const ta = await getTranslations({ locale, namespace: "ai.badge" });
  const aiNote = (e: { aiModel: string | null; reviewerName: string | null }) =>
    e.aiModel ? `<p><em>${esc(e.reviewerName ? ta("reviewed", { name: e.reviewerName }) : ta("reviewedAnon"))}</em></p>` : "";
  const x = (s: string) => esc(s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(t("feedTitle", { project: project.name }))}</title><link>${esc(base)}/changelog</link><description>${esc(t("feedDescription", { project: project.name }))}</description><language>${LOCALE_TAG[locale].toLowerCase()}</language>
${entries.map((e) => `<item><title>${x(e.title)}</title><link>${esc(`${base}/changelog#${e.id}`)}</link><guid isPermaLink="false">${e.id}</guid><pubDate>${e.publishedAt!.toUTCString()}</pubDate><description>${x(renderMarkdownWith(e.body, { headings: true, slug: project.slug, origin: projectOrigin(project) }, { base: projectOrigin(project), imagesAsLinks: true }) + aiNote(e))}</description></item>`).join("\n")}
</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
