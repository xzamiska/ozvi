"use server";

import { schema, withProject } from "@ozvi/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { getCtx } from "./project";
import { isPace } from "./email/pace";
import { deleteProject, eraseMe } from "./privacy";
import { cookieName } from "./session";
import { getTranslations } from "next-intl/server";
import { boardUserIsOwner } from "./workspace";

export interface PrivacyState { error?: string }

export async function eraseMyData(slug: string, _: PrivacyState, form: FormData): Promise<PrivacyState> {
  const { project, user, locale } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "errors" });
  if (!user) return { error: t("signInAgain") };
  if (form.get("confirm") !== "on") return { error: t("eraseConfirm") };
  if (user.role === "admin") return { error: t("eraseAdmin") };
  await eraseMe(project, user);
  (await cookies()).set({ name: cookieName(slug), value: "", path: `/${slug}`, maxAge: 0 });
  redirect(`/${slug}/ideas?erased=1`);
}

export async function deleteWholeProject(slug: string, _: PrivacyState, form: FormData): Promise<PrivacyState> {
  const { project, user, locale } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "errors" });
  if (user?.role !== "admin") return { error: t("deleteAdminOnly") };
  // Deleting a whole project (and its audit trail) is the workspace owner's call, not any board admin's.
  if (!(await boardUserIsOwner(project, user))) return { error: t("deleteOwnerOnly") };
  if (String(form.get("confirm") ?? "").trim() !== project.slug) return { error: t("deleteConfirm", { slug: project.slug }) };
  await deleteProject(project);
  // Without projectId: the project's own rows (and their activity) are gone, this one stays with the workspace.
  await logActivity({ workspaceId: project.workspaceId, actor: who(user), action: "project.deleted", detail: `${project.name} (/${project.slug})` });
  redirect(process.env.OZVI_MODE === "cloud" ? "/app" : "/");
}

/** "My data" → e-mails: the same switch as the unsubscribe link in every e-mail. */
export async function setEmails(slug: string, on: boolean) {
  const { project, user } = await getCtx(slug);
  if (!user) redirect(`/${slug}`);
  await withProject(db, project.id, (tx) => tx.update(schema.users).set({ emailOptOut: !on }).where(eq(schema.users.id, user.id)));
  revalidatePath(`/${slug}/me`);
}

const TEAM_MAIL = ["newBug", "newIdea", "comments", "assigned", "digest"] as const;

/** "My data" → Team e-mails (team and admins): which team e-mails this person wants. */
export async function setTeamMail(slug: string, form: FormData) {
  const { project, user } = await getCtx(slug);
  if (!user) redirect(`/${slug}`);
  if (user.role !== "team" && user.role !== "admin") return;
  const pace = form.get("pace");
  const prefs = { ...Object.fromEntries(TEAM_MAIL.map((k) => [k, form.get(k) === "on"])), ...(isPace(pace) && pace !== "instant" && { pace }) };
  await withProject(db, project.id, async (tx) => {
    await tx.update(schema.users).set({ teamMail: prefs }).where(eq(schema.users.id, user.id));
    // Back to "right away": what already waits for a summary goes out in one now, not at the old time.
    if (!prefs.pace) await tx.update(schema.emails).set({ sendAfter: new Date() })
      .where(and(eq(schema.emails.userId, user.id), eq(schema.emails.status, "deferred")));
  });
  revalidatePath(`/${slug}/me`);
}
