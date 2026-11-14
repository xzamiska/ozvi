import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/email/url";
import { fiderPostNumber } from "@/lib/import/legacy-links";

/**
 * Old Fider post links after a move to Ozvi: /<project>/posts/<number>/<slug>, and on the board's own
 * domain plain /posts/<number>/<slug> (the proxy adds the project). Permanent redirect to the item,
 * or to the board when that post was never imported, so links in old e-mails never end in a 404.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string; number: string }> }) {
  const { project: slug, number } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new NextResponse("Nenájdené.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const n = /^\d{1,9}$/.test(number) ? await fiderPostNumber(db, project.id, Number(number)) : null;
  const to = new URL(n ? `/${slug}/i/${n}` : `/${slug}`, requestOrigin(project, req));
  return NextResponse.redirect(to, 301);
}
