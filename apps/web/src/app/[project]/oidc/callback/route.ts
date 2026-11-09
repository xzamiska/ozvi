import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/email/url";
import { completeLogin, decodeFlow, flowCookieName } from "@/lib/oidc";
import { sessionCookie } from "@/lib/session";
import { matchLocale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { boardRequestLocale } from "@/lib/project";
import { rememberLocale } from "@/lib/user-locale";

const text = (msg: string, status: number) => new NextResponse(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Identity provider → here with ?code&state. State + nonce + PKCE come from the flow cookie. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  const locale = project ? await boardRequestLocale(project) : matchLocale(req.headers.get("accept-language"));
  const t = await getTranslations({ locale, namespace: "boardAuth" });
  if (!project?.oidcIssuer || !project.oidcClientId) return text(t("oidcOff"), 404);
  const q = req.nextUrl.searchParams;
  const flow = decodeFlow(req.cookies.get(flowCookieName(slug))?.value);
  if (q.get("error")) return text(t("oidcRefused", { err: q.get("error")! }), 401);
  if (!flow || !q.get("state") || flow.state !== q.get("state") || !q.get("code")) {
    return text(t("oidcStale"), 400);
  }
  const origin = requestOrigin(project, req);
  let user;
  try {
    user = await completeLogin(project, origin, q.get("code")!, flow);
  } catch (e) {
    console.error("[ozvi] oidc callback", e);
    return text(t("oidcFailed"), 401);
  }
  await rememberLocale(project.id, user.id, locale);
  const res = NextResponse.redirect(new URL(flow.ret, origin));
  res.cookies.set(sessionCookie(slug, user, project.id));
  res.cookies.set({ name: flowCookieName(slug), value: "", path: `/${slug}/oidc`, maxAge: 0 });
  return res;
}
