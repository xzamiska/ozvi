import { schema } from "@ozvi/db";
import { OzviTokenError } from "@ozvi/sdk";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cookieName, decodeSession, safeReturn, sessionCookie } from "@/lib/session";
import { esc } from "@/lib/email/render";
import { userFromToken } from "@/lib/sso";
import { LOCALE_COOKIE, matchLocale } from "@/i18n/locales";
import { LOCALE_MAX_AGE } from "@/lib/storage-keys";
import { getTranslations } from "next-intl/server";
import { boardRequestLocale } from "@/lib/project";
import { rememberLocale } from "@/lib/user-locale";
import { requestOrigin } from "@/lib/email/url";

/**
 * Host-app SSO entry: GET /<project>/sso?token=<signOzviToken>&return=/<project>/ideas
 * Verifies the token with the project's secret, upserts the user, sets the session cookie.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const url = req.nextUrl;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new NextResponse((await getTranslations({ locale: matchLocale(req.headers.get("accept-language")), namespace: "boardAuth" }))("noProject"), { status: 404 });
  let locale = await boardRequestLocale(project);
  let t = await getTranslations({ locale, namespace: "boardAuth" });
  if (!project.ssoSecretEnc) return new NextResponse(t("ssoOff"), { status: 400 });

  let user;
  try {
    user = await userFromToken(project, url.searchParams.get("token") ?? "");
  } catch (e) {
    const msg = e instanceof OzviTokenError && e.reason === "expired" ? t("ssoExpired") : t("ssoFailed");
    return new NextResponse(msg, { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  // The host app's `locale` claim (already stored on the user) wins over the browser from now on.
  if (user.forcedLocale) { locale = user.forcedLocale; t = await getTranslations({ locale, namespace: "boardAuth" }); }
  else await rememberLocale(project.id, user.id, locale);

  // Login CSRF guard: a link from another site must not silently sign someone in as another person (they
  // would then file reports into that account), whether or not they had a session. Coming from the host
  // app itself (its addresses or its sign-in page) is the normal way in and goes straight through.
  const current = decodeSession(req.cookies.get(cookieName(slug))?.value);
  const crossSite = req.headers.get("sec-fetch-site") === "cross-site";
  const fromApp = (() => {
    try {
      const from = new URL(req.headers.get("referer") ?? "").origin;
      const own = [...project.allowedOrigins, ...(project.loginUrl ? [new URL(project.loginUrl).origin] : [])];
      return own.includes(from);
    } catch { return false; }
  })();
  const sameUser = current && current.p === project.id && current.u === user.id;
  if (crossSite && !fromApp && !sameUser && url.searchParams.get("confirm") !== "1") {
    const next = new URL(url); next.searchParams.set("confirm", "1");
    const back = safeReturn(slug, null);
    const who = user.name ?? user.email ?? t("otherUser");
    const signedIn = !!current && current.p === project.id;
    const k = signedIn
      ? { title: t("switchTitle"), heading: t("switchHeading", { who }), text: t("switchText"), stay: t("stay"), go: t("switch") }
      : { title: t("signInTitle"), heading: t("signInHeading", { who }), text: t("signInText"), stay: t("signInNo"), go: t("signInYes") };
    return new NextResponse(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(k.title)}</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;line-height:1.5">
<h1 style="font-size:1.3rem">${esc(k.heading)}</h1>
<p>${esc(k.text)}</p>
<p><a href="${esc(back)}">${esc(k.stay)}</a> &nbsp; <a href="${esc(next.pathname + next.search)}">${esc(k.go)}</a></p></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  const res = NextResponse.redirect(new URL(safeReturn(slug, url.searchParams.get("return")), requestOrigin(project, req)));
  res.cookies.set(sessionCookie(slug, user, project.id));
  if (user.forcedLocale) res.cookies.set({ name: LOCALE_COOKIE, value: user.forcedLocale, path: "/", maxAge: LOCALE_MAX_AGE, sameSite: "lax" });
  return res;
}
