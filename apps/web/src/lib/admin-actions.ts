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

async function requireAdmin(slug: string) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "admin.actions" });
  if (ctx.user?.role !== "admin") throw new Error(t("adminOnly"));
  return { ...ctx, t };
}

export interface AdminState { ok?: string; error?: string; secret?: string }

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
  return { ok: t("rotated"), secret };
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
