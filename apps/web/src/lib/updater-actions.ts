"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { logActivity, who } from "./activity";
import { getCtx } from "./project";
import { allow, RateLimitError } from "./ratelimit";
import { UPDATER_MODES, updaterCheck, updaterSetMode, updaterStart, type UpdaterMode } from "./updater";

/** Admin → Aktualizácie, when the ozvi-updater sidecar is installed. Project admins only. */

export interface UpdaterState { ok?: string; error?: string }

async function adminCtx(slug: string) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "errors" });
  if (process.env.OZVI_MODE === "cloud") return { error: t("adminOnly") } as const;
  if (!ctx.user || ctx.user.role !== "admin") return { error: t("adminOnly") } as const;
  if (!allow("edit", ctx.user.id)) return { error: new RateLimitError(ctx.locale).message } as const;
  return { ctx } as const;
}

export async function setUpdaterMode(slug: string, _: UpdaterState, form: FormData): Promise<UpdaterState> {
  const r = await adminCtx(slug);
  if ("error" in r) return { error: r.error };
  const t = await getTranslations({ locale: r.ctx.locale, namespace: "forms.updater" });
  const mode = String(form.get("mode")) as UpdaterMode;
  if (!UPDATER_MODES.includes(mode)) return { error: t("errors.mode") };
  if (!(await updaterSetMode(mode))) return { error: t("errors.unreachable") };
  await logActivity({ workspaceId: r.ctx.project.workspaceId, projectId: r.ctx.project.id, actor: who(r.ctx.user!), action: "updater.mode", detail: mode });
  revalidatePath(`/${slug}/admin`);
  return { ok: t("modeSaved") };
}

export async function startUpdate(slug: string, _: UpdaterState): Promise<UpdaterState> {
  const r = await adminCtx(slug);
  if ("error" in r) return { error: r.error };
  const t = await getTranslations({ locale: r.ctx.locale, namespace: "forms.updater" });
  const res = await updaterStart();
  if (res !== "started") return { error: t(`errors.${res}`) };
  await logActivity({ workspaceId: r.ctx.project.workspaceId, projectId: r.ctx.project.id, actor: who(r.ctx.user!), action: "updater.start" });
  revalidatePath(`/${slug}/admin`);
  return { ok: t("started") };
}

export async function checkUpdates(slug: string, _: UpdaterState): Promise<UpdaterState> {
  const r = await adminCtx(slug);
  if ("error" in r) return { error: r.error };
  const t = await getTranslations({ locale: r.ctx.locale, namespace: "forms.updater" });
  if (!(await updaterCheck())) return { error: t("errors.unreachable") };
  revalidatePath(`/${slug}/admin`);
  return { ok: t("checked") };
}
