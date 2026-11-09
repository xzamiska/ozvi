import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/email/url";
import { authorizeUrl, encodeFlow, flowCookieName } from "@/lib/oidc";
import { safeReturn } from "@/lib/session";
import { OIDC_FLOW_MAX_AGE } from "@/lib/storage-keys";
import { matchLocale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { boardRequestLocale } from "@/lib/project";

/** GET /<project>/oidc/start?return=/<project>/ideas → identity provider. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  const t = await getTranslations({ locale: project ? await boardRequestLocale(project) : matchLocale(req.headers.get("accept-language")), namespace: "boardAuth" });
  if (!project?.oidcIssuer || !project.oidcClientId) return new NextResponse(t("oidcOff"), { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const origin = requestOrigin(project, req);
  let target;
  try {
    target = await authorizeUrl(project, origin, safeReturn(slug, req.nextUrl.searchParams.get("return")));
  } catch (e) {
    console.error("[ozvi] oidc discovery", e);
    return new NextResponse(t("oidcDown"), { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const res = NextResponse.redirect(target.url);
  res.cookies.set({
    name: flowCookieName(slug), value: encodeFlow(target.flow), httpOnly: true, sameSite: "lax",
    secure: origin.startsWith("https://"), path: `/${slug}/oidc`, maxAge: OIDC_FLOW_MAX_AGE,
  });
  return res;
}
