import "server-only";
import { schema, withProject, type PlanName } from "@ozvi/db";
import { parseTheme, presets, type Theme } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { boardLocales, resolveBoardLocale, type BoardLanguages } from "@/i18n/board";
import { overridesFor, parseStatusLabels } from "./statuses";
import { LOCALE_COOKIE, type Locale } from "@/i18n/locales";
import { db } from "./db";
import { readSession } from "./session";

export type Project = typeof schema.projects.$inferSelect;
export type User = typeof schema.users.$inferSelect;

export interface Ctx {
  project: Project;
  theme: Theme;
  user: User | null;
  isTeam: boolean;
  plan: PlanName;
  /** Board UI language for this request (see i18n/board.ts). */
  locale: Locale;
}

/** Board locale for this request: cookie (if enabled) > Accept-Language (within enabled) > default. */
export async function boardRequestLocale(p: BoardLanguages): Promise<Locale> {
  return resolveBoardLocale(p, (await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
}

/** Board locale by slug without loading the whole board (root layout's <html lang>); null = no such board. */
export const boardLocaleForSlug = cache(async (slug: string): Promise<Locale | null> => {
  const [row] = await db.select({ defaultLocale: schema.projects.defaultLocale, locales: schema.projects.locales })
    .from(schema.projects).where(eq(schema.projects.slug, slug));
  return row ? boardRequestLocale(row) : null;
});

/**
 * Renamed route stops of a board in one locale ({ status: label }), or null when it has none
 * (or no such board). Used by the i18n request config to override "route.label".
 */
export const stageLabelsForSlug = cache(async (slug: string, locale: Locale): Promise<Record<string, string> | null> => {
  const [row] = await db.select({ labels: schema.projects.statusLabels, defaultLocale: schema.projects.defaultLocale, locales: schema.projects.locales })
    .from(schema.projects).where(eq(schema.projects.slug, slug));
  if (!row) return null;
  const out = overridesFor(parseStatusLabels(row.labels), locale, boardLocales(row).fallback);
  return Object.keys(out).length ? out : null;
});

/** Resolves project + theme + signed-in user once per request. */
export const getCtx = cache(async (slug: string): Promise<Ctx> => {
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) notFound();
  const parsed = (() => {
    try { return parseTheme(project.theme); } catch { return parseTheme(presets.ozvi); }
  })();
  const session = await readSession(slug, project.id);
  const found = session
    ? (await withProject(db, project.id, (tx) => tx.query.users.findFirst({ where: eq(schema.users.id, session.u) }))) ?? null
    : null;
  // Signed out everywhere (or role changed) since this cookie was issued → treat as anonymous.
  const user = found && found.sessionVersion === (session?.v ?? 0) ? found : null;
  const [ws] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, project.workspaceId));
  return {
    project, theme: parsed, user, isTeam: user?.role === "team" || user?.role === "admin", plan: (ws?.plan ?? "self") as PlanName,
    locale: await boardRequestLocale(project),
  };
});

/**
 * Where the sign-in button goes: the project's OIDC provider when configured, otherwise the host-app
 * login URL (which comes back to /<slug>/sso?token=…), otherwise e-mail sign-in when enabled.
 */
export function loginHref(project: Project, returnTo: string): string | null {
  if (project.oidcIssuer && project.oidcClientId) return `/${project.slug}/oidc/start?return=${encodeURIComponent(returnTo)}`;
  if (!project.loginUrl) return project.emailLogin ? `/${project.slug}/login?return=${encodeURIComponent(returnTo)}` : null;
  return `${project.loginUrl}${project.loginUrl.includes("?") ? "&" : "?"}ozvi_return=${encodeURIComponent(returnTo)}`;
}
