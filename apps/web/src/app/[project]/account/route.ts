import { schema, withProject } from "@ozvi/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { LoginError, verifyLink } from "@/lib/email-login";
import { requestOrigin } from "@/lib/email/url";
import { safeReturn, sessionCookie } from "@/lib/session";
import { matchLocale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { boardRequestLocale } from "@/lib/project";
import { rememberLocale } from "@/lib/user-locale";

const text = (msg: string, status: number) => new NextResponse(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Consumes a hand-off from /app/open/<slug>: the workspace owner becomes (and stays) admin of this board. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return text((await getTranslations({ locale: matchLocale(req.headers.get("accept-language")), namespace: "boardAuth" }))("noProject"), 404);
  const locale = await boardRequestLocale(project);
  const t = await getTranslations({ locale, namespace: "boardAuth" });
  let row;
  try {
    row = await verifyLink(db, req.nextUrl.searchParams.get("t") ?? "", project.id, "handoff", locale);
  } catch (e) {
    if (e instanceof LoginError) return text(t("handoffExpired"), 401);
    throw e;
  }
  // Still an owner of this project's workspace right now?
  const owner = await db.select({ id: schema.accounts.id, name: schema.accounts.name }).from(schema.accounts)
    .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.accountId, schema.accounts.id))
    .where(and(eq(schema.accounts.email, row.email), eq(schema.workspaceMembers.workspaceId, project.workspaceId)));
  if (owner.length === 0) return text(t("handoffNoAccess"), 403);
  // The board shows the console account's real name. Without one we store no name (the board then says
  // "Člen tímu"), and clear the e-mail local part older hand-offs saved as a name.
  const name = owner[0]!.name?.trim() || null;
  // The person may already be here with this e-mail proven (an app sign-in with emailVerified): that account
  // becomes the admin one instead of a second account.
  const [same] = await withProject(db, project.id, (tx) => tx.select().from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${row.email.toLowerCase()} and ${schema.users.emailVerified} and ${schema.users.externalId} not like 'email:%'`)
    .orderBy(desc(schema.users.lastSeenAt)).limit(1));
  const hasEmailUser = await withProject(db, project.id, async (tx) => (await tx.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.externalId, `email:${row.email}`)).limit(1)).length > 0);
  if (same && !hasEmailUser) {
    const [u] = await withProject(db, project.id, (tx) => tx.update(schema.users)
      .set({ role: "admin", lastSeenAt: new Date(), ...(name && { name }) }).where(eq(schema.users.id, same.id)).returning());
    await rememberLocale(project.id, u!.id, locale);
    const res = NextResponse.redirect(new URL(safeReturn(slug, row.returnTo), requestOrigin(project, req)));
    res.cookies.set(sessionCookie(slug, u!, project.id));
    return res;
  }
  const [user] = await withProject(db, project.id, (tx) => tx.insert(schema.users)
    .values({ projectId: project.id, externalId: `email:${row.email}`, email: row.email, emailVerified: true, name, role: "admin", lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.users.projectId, schema.users.externalId],
      set: { role: "admin", lastSeenAt: new Date(), email: row.email, name: sql`coalesce(${name}::text, nullif(${schema.users.name}, ${row.email.split("@")[0]}))` },
    })
    .returning());
  await rememberLocale(project.id, user!.id, locale);
  const res = NextResponse.redirect(new URL(safeReturn(slug, row.returnTo), requestOrigin(project, req)));
  res.cookies.set(sessionCookie(slug, user!, project.id));
  return res;
}
