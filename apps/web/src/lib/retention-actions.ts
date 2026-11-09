"use server";

import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { getCtx } from "./project";
import { allow, RateLimitError } from "./ratelimit";
import { CAPTURE_DAYS, CLOSED_FILES_DAYS, CONTACT_MONTHS, parseOption, previewRetention, type RetentionPolicy, type RetentionReport } from "./retention";

/** Admin → Dáta → Uchovávanie dát. Admin only; the preview is a dry run of the same queries the nightly job uses. */

export interface RetentionState { ok?: string; error?: string }

async function adminCtx(slug: string, limited = true) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "errors" });
  if (!ctx.user || ctx.user.role !== "admin") return { error: t("adminOnly") } as const;
  if (limited && !allow("edit", ctx.user.id)) return { error: new RateLimitError(ctx.locale).message } as const;
  return { ctx } as const;
}

function readPolicy(form: FormData): RetentionPolicy | null {
  const captureDays = parseOption(form.get("capture"), CAPTURE_DAYS);
  const closedFilesDays = parseOption(form.get("closedFiles"), CLOSED_FILES_DAYS);
  const contactsMonths = parseOption(form.get("contacts"), CONTACT_MONTHS);
  if (captureDays === undefined || closedFilesDays === undefined || contactsMonths === undefined) return null;
  return { captureDays, closedFilesDays, contactsMonths };
}

const label = (v: number | null) => (v === null ? "never" : String(v));

export async function saveRetention(slug: string, _: RetentionState, form: FormData): Promise<RetentionState> {
  const r = await adminCtx(slug);
  if ("error" in r) return { error: r.error };
  const { project, user, locale } = r.ctx;
  const t = await getTranslations({ locale, namespace: "admin.retention" });
  const policy = readPolicy(form);
  if (!policy) return { error: t("invalid") };
  await db.update(schema.projects).set({
    retentionCaptureDays: policy.captureDays, retentionClosedFilesDays: policy.closedFilesDays, retentionContactsMonths: policy.contactsMonths,
  }).where(eq(schema.projects.id, project.id));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user!), action: "retention.settings",
    detail: `capture ${label(policy.captureDays)} d · closed files ${label(policy.closedFilesDays)} d · contacts ${label(policy.contactsMonths)} m` });
  revalidatePath(`/${slug}/admin`);
  return { ok: t("saved") };
}

/** Dry run for the values in the form (saved or not). */
export async function previewRetentionAction(slug: string, form: FormData): Promise<{ report?: RetentionReport; error?: string }> {
  // Read-only and admin-only: not counted against the edit limit (it runs on every change of a select).
  const r = await adminCtx(slug, false);
  if ("error" in r) return { error: r.error };
  const policy = readPolicy(form);
  if (!policy) return { error: (await getTranslations({ locale: r.ctx.locale, namespace: "admin.retention" }))("invalid") };
  return { report: await previewRetention(db, r.ctx.project.id, policy) };
}
