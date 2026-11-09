import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/email/url";
import { cookieName } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  const res = NextResponse.redirect(new URL(`/${slug}/ideas`, requestOrigin(project, req)), 303);
  res.cookies.set({ name: cookieName(slug), value: "", path: `/${slug}`, maxAge: 0 });
  return res;
}
