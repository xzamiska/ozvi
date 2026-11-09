import { withProject } from "@ozvi/db";
import type { NextRequest } from "next/server";
import { translator } from "@/i18n/messages";
import { csvHeaders, parseDelimiter, toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { projectOrigin } from "@/lib/email/url";
import { EXPORT_KINDS, exportComments, exportItems, exportVoters, listFilter, type ExportKind } from "@/lib/export";
import { getCtx } from "@/lib/project";
import { allow } from "@/lib/ratelimit";

/**
 * Team CSV export: /<slug>/export?what=ideas|bugs|comments|voters[&of=idea|bug]&sep=semicolon|comma
 * plus the list page's own filters (f, s, st, q, plan, tag, sort; item=<number> for one item).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, isTeam, locale } = await getCtx(slug);
  const t = translator(locale, "export");
  if (!user || !isTeam) return new Response(t("teamOnly"), { status: 403 });
  if (!allow("export", user.id)) return new Response(translator(locale, "errors")("rateLimit"), { status: 429 });

  const sp = req.nextUrl.searchParams;
  const what = (EXPORT_KINDS as readonly string[]).includes(sp.get("what") ?? "") ? (sp.get("what") as ExportKind) : "ideas";
  const kind = what === "bugs" ? "bug" : what === "ideas" ? "idea" : sp.get("of") === "bug" ? "bug" : "idea";
  const d = parseDelimiter(sp.get("sep"), locale);
  const origin = projectOrigin(project);
  const f = listFilter(kind, sp);

  const sheet = await withProject(db, project.id, (tx) =>
    what === "comments" ? exportComments(tx, f, locale)
      : what === "voters" ? exportVoters(tx, f, locale, d)
        : exportItems(tx, f, locale, d, (n) => `${origin}/${slug}/i/${n}`, project));
  const fileKey = (what === "comments" || what === "voters" ? `${what}_${kind}` : what) as "ideas" | "bugs" | "comments_idea" | "comments_bug" | "voters_idea" | "voters_bug";
  const name = `${slug}-${t(`file.${fileKey}`)}${f.number ? `-${f.number}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(sheet.header, sheet.rows, d), { headers: csvHeaders(name) });
}
