import "server-only";
import { schema, withProject, type Tx } from "@ozvi/db";
import { OzviTokenError } from "@ozvi/sdk";
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { boardLocales } from "@/i18n/board";
import { DEFAULT_LOCALE, isLocale, LOCALES, matchLocale, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { db } from "./db";
import { appOrigin, requestOrigin } from "./email/url";
import { projectFor } from "./oauth-meta";
import type { Project, User } from "./project";
import { moderationWhere } from "./queries";
import { userFromToken } from "./sso";
import { readCors, searchWords } from "./widget-rules";

/** The widget sends ?lang= (its own language); otherwise Accept-Language, both within the board's languages. */
export function widgetLocale(project: { defaultLocale: string; locales: string[] } | undefined, req: NextRequest): Locale {
  const { allowed, fallback } = project ? boardLocales(project) : { allowed: [...LOCALES], fallback: DEFAULT_LOCALE };
  const wanted = req.nextUrl.searchParams.get("lang");
  if (isLocale(wanted) && allowed.includes(wanted)) return wanted;
  return matchLocale(req.headers.get("accept-language"), allowed, fallback);
}

/** Origins of this board itself (instance URL, custom domain): the demo and same-origin embeds. */
export const ownOrigins = (project: Project, req: NextRequest) => [appOrigin(req.nextUrl.origin), requestOrigin(project, req)];

export type WidgetRead =
  | { ok: false; res: Response }
  | { ok: true; project: Project; user: User | null; locale: Locale; headers: Record<string, string>; json: (body: unknown, status?: number) => Response };

/**
 * Shared start of every widget GET: project, language, CORS, and the person from `Authorization: Bearer <SSO token>`
 * when a trusted origin sends one. Private boards (ideas not public) answer only to a signed-in person.
 */
export async function widgetRead(req: NextRequest, slug: string): Promise<WidgetRead> {
  const project = await projectFor(slug);
  const locale = widgetLocale(project, req);
  const t = translator(locale, "widget");
  if (!project) return { ok: false, res: Response.json({ error: t("noProject") }, { status: 404, headers: { "access-control-allow-origin": "*" } }) };
  const { headers } = readCors(project.allowedOrigins, ownOrigins(project, req), req.headers.get("origin"));
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let user: User | null = null;
  if (token) {
    try {
      user = await userFromToken(project, token);
    } catch (e) {
      const error = e instanceof OzviTokenError && e.reason === "expired" ? t("expired") : t("who");
      return { ok: false, res: Response.json({ error }, { status: 401, headers }) };
    }
  }
  if (!project.ideasPublic && !user) return { ok: false, res: Response.json({ error: t("private"), private: true }, { status: 401, headers }) };
  // Anonymous answers are the same for everybody: a short public cache; personal ones are never cached.
  const cache = user ? "private, no-store" : "public, max-age=60";
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...headers, "cache-control": cache } });
  return { ok: true, project, user, locale, headers, json };
}

export async function widgetPreflight(req: NextRequest, slug: string): Promise<Response> {
  const project = await projectFor(slug);
  if (!project) return new Response(null, { status: 204 });
  return new Response(null, { status: 204, headers: readCors(project.allowedOrigins, ownOrigins(project, req), req.headers.get("origin")).headers });
}

const ACTIVE = ["open", "planned", "in_progress"] as const;

/**
 * Ideas for the widget: the top active ideas, or (with `q`) ideas whose title matches any of the words, in any
 * status, the same rule as the board's similar-ideas search. Queued ideas only for their author; bugs never.
 */
export async function widgetIdeas(tx: Tx, opts: { q?: string | null; limit: number; viewerId?: string | null }) {
  const { items } = schema;
  const words = searchWords(opts.q);
  if (opts.q && words.length === 0) return [];
  const esc = (w: string) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return tx.select({ id: items.id, number: items.number, title: items.title, votes: items.voteCount, status: items.status, pending: items.pending })
    .from(items)
    .where(and(eq(items.kind, "idea"), isNull(items.mergedIntoId), moderationWhere({ viewerId: opts.viewerId }),
      words.length ? or(...words.map((w) => ilike(items.title, esc(w)))) : inArray(items.status, [...ACTIVE])))
    .orderBy(desc(items.voteCount), desc(items.createdAt), desc(items.number))
    .limit(opts.limit);
}

/** Runs a read inside the project's RLS scope. */
export const readProject = <T>(project: Project, fn: (tx: Tx) => Promise<T>) => withProject(db, project.id, fn);
