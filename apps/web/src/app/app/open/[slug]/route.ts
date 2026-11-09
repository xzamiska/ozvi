import { NextResponse, type NextRequest } from "next/server";
import { getAccount } from "@/lib/account";
import { canOpen } from "@/lib/app-actions";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { issueHandoff } from "@/lib/email-login";
import { appOrigin, projectOrigin } from "@/lib/email/url";

/** Dashboard → project board/admin, signed in as admin of that project (on its own domain). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const account = await getAccount();
  if (!account) return NextResponse.redirect(new URL("/app/login", appOrigin(req.nextUrl.origin)));
  const project = await canOpen(account.id, slug);
  if (!project) return new NextResponse((await getTranslations("account"))("server.noProjectAccess"), { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  const where = req.nextUrl.searchParams.get("to");
  const to = `/${slug}/${where === "admin" ? "admin" : where === "bugs" ? "bugs" : "ideas"}`;
  const t = await issueHandoff(db, project.id, account.email, to);
  return NextResponse.redirect(`${projectOrigin(project)}/${slug}/account?t=${t}`);
}
