import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/project";
import { storage } from "@/lib/storage";
import { getTranslations } from "next-intl/server";
import { sectionOfKind, sectionOn } from "@/lib/sections";

/** Serves an attachment only to people who may see its item (bugs: author + team). */
export async function GET(_: Request, { params }: { params: Promise<{ project: string; id: string }> }) {
  const { project: slug, id } = await params;
  const { project, user, isTeam, locale } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "boardAuth" });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(t("notFound"), { status: 404 });
  const row = await withProject(db, project.id, async (tx) => {
    const [r] = await tx.select({ a: schema.attachments, kind: schema.items.kind, authorId: schema.items.authorId, pending: schema.items.pending, deletedAt: schema.items.deletedAt })
      .from(schema.attachments).innerJoin(schema.items, eq(schema.items.id, schema.attachments.itemId))
      .where(eq(schema.attachments.id, id));
    return r;
  });
  const own = isTeam || (!!user && row?.authorId === user.id);
  // Deleted posts keep their files for the team only; queued ideas show them to their author and the team.
  const allowed = row && sectionOn(project, sectionOfKind(row.kind)) && (row.deletedAt ? isTeam : row.kind === "bug" || row.pending ? own : project.ideasPublic || !!user);
  if (!row || !allowed) return new Response(t("notFound"), { status: 404 });
  const body = await storage().get(row.a.storageKey);
  if (!body) return new Response(t("fileMissing"), { status: 404 });
  const image = row.a.mime.startsWith("image/");
  return new Response(body as unknown as BodyInit, {
    headers: {
      "content-type": row.a.mime === "text/plain" ? "text/plain; charset=utf-8" : row.a.mime,
      "content-disposition": `${image ? "inline" : "attachment"}; filename="${row.a.name}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=3600",
    },
  });
}
