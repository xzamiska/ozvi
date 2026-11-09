import { schema } from "@ozvi/db";
import { OzviTokenError } from "@ozvi/sdk";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { AttachmentError } from "@/lib/attachments";
import { CAPTURE_LIMITS } from "@/lib/bug-context";
import { clientIp } from "@/lib/client-ip";
import { corsHeaders } from "@/lib/cors";
import { db } from "@/lib/db";
import { createItem, ValidationError } from "@/lib/items";
import { DomainError } from "@/lib/domain";
import { allow, RateLimitError } from "@/lib/ratelimit";
import { userFromToken } from "@/lib/sso";
import { appOrigin, requestOrigin } from "@/lib/email/url";
import { widgetLocale } from "@/lib/widget-api";
import { translator } from "@/i18n/messages";

const find = (slug: string) => db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });

export async function OPTIONS(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const project = await find((await params).project);
  return new Response(null, { status: 204, headers: corsHeaders(project, req.headers.get("origin")) });
}

/** POST multipart: title, body, kind, context (JSON), files[]; Authorization: Bearer <host-app SSO token>. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await find(slug);
  const origin = req.headers.get("origin");
  const headers = corsHeaders(project, origin);
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers });
  const locale = widgetLocale(project, req);
  const t = translator(locale, "widget");

  if (!project) return fail(404, t("noProject"));
  // Browsers always send Origin on cross-site POST; same-origin (our own demo) is fine too.
  if (origin && origin !== appOrigin(req.nextUrl.origin) && origin !== requestOrigin(project, req) && !project.allowedOrigins.includes(origin)) {
    return fail(403, t("origin"));
  }
  const ip = clientIp(req.headers);
  if (!allow("widgetIp", `${project.id}:${ip}`)) return fail(429, new RateLimitError(locale).message);

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let user;
  try {
    user = await userFromToken(project, token);
  } catch (e) {
    return fail(401, e instanceof OzviTokenError && e.reason === "expired" ? t("expired") : t("who"));
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return fail(400, t("form")); }
  const s = (k: string) => String(form.get(k) ?? "");
  let context: unknown = null;
  // Oversized context (a broken or hostile client) is dropped unread; cleanContext bounds the rest.
  const rawContext = s("context");
  if (rawContext.length <= CAPTURE_LIMITS.raw) try { context = JSON.parse(rawContext || "{}"); } catch { /* ignore */ }

  try {
    const { number, pending } = await createItem(project, user, {
      kind: s("kind") === "idea" ? "idea" : "bug",
      title: s("title"),
      body: s("body"),
      context,
      source: "widget",
      files: form.getAll("files").filter((f): f is File => f instanceof File),
    }, locale);
    // `pending`: the idea waits for the team's approval ("approval" = the board moderates, "links" = held for links).
    return Response.json({ number, url: `/${slug}/i/${number}`, pending }, { status: 201, headers });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof AttachmentError) return fail(400, e.message);
    if (e instanceof RateLimitError) return fail(429, e.message);
    if (e instanceof DomainError) return fail(403, e.text(locale));
    console.error("[ozvi] widget item", e);
    return fail(500, t("failed"));
  }
}
