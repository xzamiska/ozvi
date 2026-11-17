"use server";

import { encryptSecret, newSecret, schema } from "@ozvi/db";
import { checkContrast, themeSchema } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { isLocale, LOCALES } from "@/i18n/locales";
import { TRANSLATION_MODES } from "./translate";
import { getTranslations } from "next-intl/server";
import { getCtx } from "./project";
import { randomUUID } from "node:crypto";
import { appSite, fetchSiteIcon, iconType, MAX_ICON_BYTES } from "./favicon";
import { BlockedAddressError } from "./net";
import { storage } from "./storage";
import { normalizeSections } from "./sections";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName } from "./session-core";
import { sessionCookie } from "./session";
import { ownBoardSlug, slugAllowed } from "./slug";

async function requireAdmin(slug: string) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "admin.actions" });
  // No longer an admin (signed out, signed in as someone else, role changed in another tab): back to the
  // settings page, which shows its sign-in gate. A thrown error here was a crash screen and a server error report.
  if (ctx.user?.role !== "admin") redirect(`/${ctx.project.slug}/admin`);
  return { ...ctx, t, user: ctx.user };
}

/** `replaced`: the new SSO secret replaced an older one (the old one stopped working), not a first one. */
export interface AdminState { ok?: string; error?: string; secret?: string; replaced?: boolean }

export async function saveTheme(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, t } = await requireAdmin(slug);
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("theme") ?? "")); } catch { return { error: t("themeJson") }; }
  const parsed = themeSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  await db.update(schema.projects).set({ theme: parsed.data }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.theme" });
  revalidatePath(`/${slug}`, "layout");
  const n = checkContrast(parsed.data).length;
  return { ok: n ? t("themeLow", { n }) : t("themeSaved") };
}

const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

export async function saveSettings(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, t } = await requireAdmin(slug);
  const name = String(form.get("name") ?? "").trim();
  const loginUrl = String(form.get("loginUrl") ?? "").trim();
  const origins = String(form.get("origins") ?? "").split(/\s+/).map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  if (name.length < 2 || name.length > 60) return { error: t("nameLength") };
  if (loginUrl && !/^https?:\/\//.test(loginUrl)) return { error: t("loginUrl") };
  const bad = origins.find((o) => !ORIGIN.test(o));
  if (bad) return { error: t("badOrigin", { o: bad }) };
  await db.update(schema.projects).set({
    name, loginUrl: loginUrl || null, allowedOrigins: [...new Set(origins)], ideasPublic: form.get("ideasPublic") === "on",
    emailLogin: form.get("emailLogin") === "on", moderateIdeas: form.get("moderateIdeas") === "on",
  }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.settings" });
  // First time the host app is known and the board has no icon yet: take the app's favicon (best effort).
  const site = !project.faviconKey ? appSite({ loginUrl: loginUrl || null, allowedOrigins: origins }) : null;
  if (site) {
    const icon = await Promise.race([fetchSiteIcon(site).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
    if (icon) await storeIcon({ id: project.id, faviconKey: null }, icon.bytes, icon.type).catch(() => {});
  }
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("saved") };
}

/**
 * The board's address (/<slug>). Everything is keyed by the project id except the URL and the board
 * session cookie (ozvi_<slug>, path /<slug>): the admin who changes it gets a cookie under the new name,
 * everyone else signs in again. The old address is not kept (it may be taken by another project later).
 */
export async function changeSlug(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, t } = await requireAdmin(slug);
  const next = String(form.get("slug") ?? "").trim().toLowerCase();
  if (next === project.slug) return { error: t("slugSame") };
  const own = ownBoardSlug();
  if (!slugAllowed(next) || (own && (next === own || project.slug === own))) return { error: t("slugInvalid") };
  if (await db.query.projects.findFirst({ where: eq(schema.projects.slug, next), columns: { id: true } })) return { error: t("slugTaken", { slug: next }) };
  try {
    await db.update(schema.projects).set({ slug: next }).where(eq(schema.projects.id, project.id));
  } catch {
    // Taken between the check and the update (unique index).
    return { error: t("slugTaken", { slug: next }) };
  }
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.settings", detail: `/${project.slug} → /${next}` });
  const jar = await cookies();
  jar.set({ name: cookieName(project.slug), value: "", path: `/${project.slug}`, maxAge: 0 });
  jar.set(sessionCookie(next, user, project.id));
  revalidatePath(`/${project.slug}`, "layout");
  redirect(`/${next}/admin#project`);
}

/** Board sections (lib/sections): which the project uses and which the board opens on. Data is never deleted. */
export async function saveSections(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, locale } = await requireAdmin(slug);
  const t = await getTranslations({ locale, namespace: "admin.sections" });
  const picked = form.getAll("sections").map(String);
  if (picked.length === 0) return { error: t("needOne") };
  const { sections, homeSection } = normalizeSections(picked, String(form.get("home") ?? ""));
  await db.update(schema.projects).set({ sections, homeSection }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.settings", detail: `sections ${sections.join(",")}, home ${homeSection}` });
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("saved") };
}

/** MCP lockdown: agents get text only from the team and verified authors (see @ozvi/mcp applyLockdown). */
export async function saveMcpLockdown(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, locale } = await requireAdmin(slug);
  const on = form.get("mcpLockdown") === "on";
  await db.update(schema.projects).set({ mcpLockdown: on }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.settings", detail: `mcp lockdown ${on ? "on" : "off"}` });
  revalidatePath(`/${slug}/admin`);
  return { ok: (await getTranslations({ locale, namespace: "admin.integrations" }))("lockdownSaved") };
}

/** Board languages. The default is always among the offered ones. */
export async function saveLanguages(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, locale } = await requireAdmin(slug);
  const t = await getTranslations({ locale, namespace: "admin.languages" });
  const def = String(form.get("defaultLocale") ?? "");
  if (!isLocale(def)) return { error: t("invalid") };
  const picked = new Set(form.getAll("locales").map(String).filter(isLocale));
  picked.add(def);
  const locales = LOCALES.filter((l) => picked.has(l));
  // Post translation: only a known mode; a form without the field (AI unavailable, fieldset disabled) keeps the stored one.
  const mode = String(form.get("translationMode") ?? "");
  const translationMode = (TRANSLATION_MODES as readonly string[]).includes(mode) ? mode : project.translationMode;
  await db.update(schema.projects).set({ defaultLocale: def, locales, translationMode }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.settings", detail: locales.join(", ") });
  revalidatePath(`/${slug}`, "layout");
  // Saved in the admin's current language, which may just have been switched off: answer in the new board language then.
  return { ok: (await getTranslations({ locale: locales.includes(locale) ? locale : def, namespace: "admin.languages" }))("saved") };
}

/** The new secret is shown exactly once; we only keep it encrypted. */
export async function rotateSecret(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, t } = await requireAdmin(slug);
  if (project.ssoSecretEnc && form.get("confirm") !== "on") return { error: t("confirmRotate") };
  const secret = newSecret();
  await db.update(schema.projects).set({ ssoSecretEnc: encryptSecret(secret) }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.sso_secret" });
  // The page must learn that SSO is on now: without this it kept offering "Turn on SSO" (whose form has no
  // confirmation, so a second click failed) and the setup checklist stayed unticked.
  revalidatePath(`/${slug}/admin`);
  return { ok: t("rotated"), secret, replaced: !!project.ssoSecretEnc };
}

/** Voting mode and budget. Lowering the budget never removes votes; people just cannot add more until under it. */
export async function saveVoting(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, locale } = await requireAdmin(slug);
  const t = await getTranslations({ locale, namespace: "admin.settings.voting" });
  const mode = String(form.get("voteMode") ?? "");
  if (mode !== "simple" && mode !== "importance") return { error: t("invalid") };
  let budget: number | null = null;
  if (form.get("limited") === "on") {
    budget = Number(String(form.get("voteBudget") ?? "").trim());
    if (!Number.isInteger(budget) || budget < 1 || budget > 100) return { error: t("budgetRange") };
  }
  await db.update(schema.projects).set({ voteMode: mode, voteBudget: budget }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.settings",
    detail: `voting: ${mode}${budget ? `, ${budget}` : ""}` });
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("saved") };
}

/* ---------- favicon (lib/favicon.ts) ---------- */

async function storeIcon(project: { id: string; faviconKey: string | null }, bytes: Uint8Array, type: string) {
  const key = `icons/${project.id}-${randomUUID()}`;
  await storage().put(key, bytes, type);
  await db.update(schema.projects).set({ faviconKey: key, faviconType: type }).where(eq(schema.projects.id, project.id));
  if (project.faviconKey) await storage().remove(project.faviconKey).catch(() => {});
}

/** Takes the icon from the host app's website (the address the admin gives, or the app's login URL). */
export async function fetchFavicon(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, t } = await requireAdmin(slug);
  const raw = String(form.get("site") ?? "").trim() || appSite(project) || "";
  if (!raw) return { error: t("faviconBadSite") };
  let site: string;
  try { site = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).toString(); } catch { return { error: t("faviconBadSite") }; }
  const icon = await fetchSiteIcon(site).catch((e) => (e instanceof BlockedAddressError ? "blocked" as const : null));
  if (icon === "blocked") return { error: t("faviconBlocked") };
  if (!icon) return { error: t("faviconNotFound", { site: new URL(site).host }) };
  await storeIcon(project, icon.bytes, icon.type);
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.theme" });
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("faviconFetched", { site: new URL(site).host }) };
}

/** An icon the admin uploads: PNG, SVG, ICO, JPEG, GIF or WebP, checked by its bytes, at most 200 kB. */
export async function uploadFavicon(slug: string, _: AdminState, form: FormData): Promise<AdminState> {
  const { project, user, t } = await requireAdmin(slug);
  const file = form.get("icon");
  if (!(file instanceof File) || file.size === 0) return { error: t("faviconNoFile") };
  if (file.size > MAX_ICON_BYTES) return { error: t("faviconTooBig") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = iconType(bytes);
  if (!type) return { error: t("faviconBadType") };
  await storeIcon(project, bytes, type);
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.theme" });
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("faviconSaved") };
}

/** Back to the letter in the accent colour. */
export async function clearFavicon(slug: string): Promise<AdminState> {
  const { project, user, t } = await requireAdmin(slug);
  await db.update(schema.projects).set({ faviconKey: null, faviconType: null }).where(eq(schema.projects.id, project.id));
  if (project.faviconKey) await storage().remove(project.faviconKey).catch(() => {});
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "project.theme" });
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("faviconCleared") };
}
