import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { LoginError, verifyLink } from "@/lib/email-login";
import { requestOrigin } from "@/lib/email/url";
import { boardRequestLocale } from "@/lib/project";
import { safeReturn, sessionCookie } from "@/lib/session";
import { matchLocale } from "@/i18n/locales";

const text = (msg: string, status: number) => new NextResponse(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * "My reports" from the widget (ADR-0014): consumes the one-time link of api/widget/login {open} and signs in
 * exactly the user it was issued for (by id, never by e-mail), if that person still exists and e-mail sign-in
 * is still on. Never e-mailed, so a GET may consume it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return text((await getTranslations({ locale: matchLocale(req.headers.get("accept-language")), namespace: "boardAuth" }))("noProject"), 404);
  const t = await getTranslations({ locale: await boardRequestLocale(project), namespace: "boardAuth" });
  let row;
  try {
    row = await verifyLink(db, req.nextUrl.searchParams.get("t") ?? "", project.id, "widget");
  } catch (e) {
    if (e instanceof LoginError) return text(t("handoffExpired"), 401);
    throw e;
  }
  const user = /^[0-9a-f-]{36}$/i.test(row.email) && project.emailLogin
    ? await withProject(db, project.id, (tx) => tx.query.users.findFirst({ where: eq(schema.users.id, row.email) }))
    : undefined;
  if (!user) return text(t("handoffExpired"), 401);
  const res = NextResponse.redirect(new URL(safeReturn(slug, row.returnTo), requestOrigin(project, req)));
  res.cookies.set(sessionCookie(slug, user, project.id));
  return res;
}
