import { schema } from "@ozvi/db";
import { OzviTokenError } from "@ozvi/sdk";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { corsHeaders } from "@/lib/cors";
import { db } from "@/lib/db";
import { issueBoardLink, issueLogin, LoginError, normalizeEmail, verifyCode } from "@/lib/email-login";
import { emailUser } from "@/lib/email-user";
import { appOrigin, projectOrigin, requestOrigin } from "@/lib/email/url";
import { allow, RateLimitError } from "@/lib/ratelimit";
import { safeReturn } from "@/lib/session";
import { userFromToken } from "@/lib/sso";
import { widgetLocale } from "@/lib/widget-api";
import { isWidgetToken, signWidgetToken } from "@/lib/widget-token";
import { translator } from "@/i18n/messages";

/**
 * E-mail verification inside the widget (ADR-0014), for host apps that give the widget no token.
 * POST JSON:
 *   { email }                → e-mails a 6-digit code (the board's sign-in code and limits)
 *   { email, code }          → { token }: a widget token for this project and person
 *   { open: "/bugs" } + Bearer <widget token> → { url }: a one-time board sign-in link ("My reports")
 * Only from the project's allowed origins (or the board itself) and only while e-mail sign-in is on.
 */
const find = (slug: string) => db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });

export async function OPTIONS(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const project = await find((await params).project);
  return new Response(null, { status: 204, headers: corsHeaders(project, req.headers.get("origin")) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await find(slug);
  const origin = req.headers.get("origin");
  const headers = corsHeaders(project, origin);
  const locale = widgetLocale(project, req);
  const t = translator(locale, "widget");
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...headers, "cache-control": "no-store" } });
  const fail = (status: number, error: string) => json({ error }, status);

  if (!project) return fail(404, t("noProject"));
  if (origin && origin !== appOrigin(req.nextUrl.origin) && origin !== requestOrigin(project, req) && !project.allowedOrigins.includes(origin)) {
    return fail(403, t("origin"));
  }
  if (!project.emailLogin) return fail(403, t("emailOff"));

  let body: { email?: unknown; code?: unknown; open?: unknown };
  try { body = await req.json(); } catch { return fail(400, t("form")); }
  const ip = clientIp(req.headers);

  // "My reports": the widget already knows the person; hand them to the board with a one-time link.
  if (typeof body.open === "string") {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!isWidgetToken(token)) return fail(401, t("who"));
    let user;
    try { user = await userFromToken(project, token); } catch (e) {
      return fail(401, e instanceof OzviTokenError && e.reason === "expired" ? t("expired") : t("who"));
    }
    if (!user.email) return fail(401, t("who"));
    if (!allow("widgetIp", `${project.id}:${ip}`)) return fail(429, new RateLimitError(locale).message);
    const link = await issueBoardLink(db, project.id, user.email, safeReturn(slug, `/${slug}${body.open}`));
    return json({ url: `${projectOrigin(project)}/${slug}/login/link?t=${link}` });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  try {
    if (body.code === undefined) {
      if (!allow("loginIp", ip)) return fail(429, translator(locale, "email")("errTooManyCodes"));
      await issueLogin({
        db, email, projectId: project.id, returnTo: `/${slug}/bugs`,
        linkBase: `${projectOrigin(project)}/${slug}/login/link`, brand: { name: project.name, theme: project.theme }, locale,
      });
      return json({ ok: true });
    }
    await verifyCode(db, email, String(body.code), project.id, locale, ip);
  } catch (e) {
    if (e instanceof LoginError) return fail(400, e.message);
    throw e;
  }
  const user = await emailUser(project.id, email);
  return json({ token: signWidgetToken({ projectId: project.id, userId: user.id, sessionVersion: user.sessionVersion }) });
}
