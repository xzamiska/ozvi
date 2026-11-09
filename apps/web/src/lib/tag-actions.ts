"use server";

import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { DomainError, isTeamRole } from "./domain";
import { getCtx } from "./project";
import { allow, RateLimitError } from "./ratelimit";
import { saveStatuses } from "./sub-statuses";
import type { Tag } from "./tag-rules";
import { createTag, deleteTag, mergeTags, setItemTags, updateTag } from "./tags";
import { clampDays } from "./unanswered";

/**
 * Tags, custom statuses and the unanswered queue setting. Assigning tags: team. Managing tags and
 * statuses: admin. Every rule is checked here on the server; RLS keeps each call inside its project.
 */

export interface TagState { ok?: string; error?: string; tags?: Tag[] }

const UUID = /^[0-9a-f-]{36}$/i;

async function ctxFor(slug: string, need: "team" | "admin") {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "errors" });
  const okRole = need === "admin" ? ctx.user?.role === "admin" : isTeamRole(ctx.user?.role);
  return { ...ctx, t, allowed: !!ctx.user && okRole };
}

async function guarded<T extends TagState>(slug: string, need: "team" | "admin", fn: (c: Awaited<ReturnType<typeof ctxFor>>) => Promise<T>): Promise<T | TagState> {
  const c = await ctxFor(slug, need);
  if (!c.allowed || !c.user) return { error: need === "admin" ? c.t("adminOnly") : c.t("teamOnly") };
  if (!allow("edit", c.user.id)) return { error: new RateLimitError(c.locale).message };
  try {
    const r = await fn(c);
    revalidatePath(`/${slug}`, "layout");
    return r;
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(c.locale) };
    throw e;
  }
}

/** Team: the item's tags become exactly `tagIds`. */
export async function setTagsOnItem(slug: string, itemId: string, tagIds: string[]): Promise<TagState> {
  if (!UUID.test(itemId) || !Array.isArray(tagIds) || tagIds.some((id) => typeof id !== "string" || !UUID.test(id))) return { error: "Bad request" };
  return guarded(slug, "team", async ({ project, user, t }) => {
    const tags = await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(schema.items.id, itemId) });
      if (!item) throw new DomainError(t("itemMissing"));
      return setItemTags(tx, project, user!, item, tagIds);
    });
    return { tags };
  });
}

const tagInput = (form: FormData) => ({ name: form.get("name"), color: form.get("color"), public: form.get("public") === "on" });

export async function createTagAction(slug: string, _: TagState, form: FormData): Promise<TagState> {
  return guarded(slug, "admin", async ({ project, user, locale }) => {
    const tag = await withProject(db, project.id, (tx) => createTag(tx, project, tagInput(form)));
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user!), action: "project.settings", detail: `+tag ${tag.name}` });
    return { ok: (await getTranslations({ locale, namespace: "admin.tags" }))("created", { name: tag.name }) };
  });
}

export async function updateTagAction(slug: string, id: string, _: TagState, form: FormData): Promise<TagState> {
  if (!UUID.test(id)) return { error: "Bad request" };
  return guarded(slug, "admin", async ({ project, locale }) => {
    const tag = await withProject(db, project.id, (tx) => updateTag(tx, id, tagInput(form)));
    return { ok: (await getTranslations({ locale, namespace: "admin.tags" }))("saved", { name: tag.name }) };
  });
}

export async function mergeTagAction(slug: string, sourceId: string, targetId: string): Promise<TagState> {
  if (!UUID.test(sourceId) || !UUID.test(targetId)) return { error: "Bad request" };
  return guarded(slug, "admin", async ({ project, user, locale }) => {
    await withProject(db, project.id, (tx) => mergeTags(tx, sourceId, targetId));
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user!), action: "project.settings", detail: "tags merged" });
    return { ok: (await getTranslations({ locale, namespace: "admin.tags" }))("merged") };
  });
}

export async function deleteTagAction(slug: string, id: string): Promise<TagState> {
  if (!UUID.test(id)) return { error: "Bad request" };
  return guarded(slug, "admin", async ({ project, user, locale }) => {
    await withProject(db, project.id, (tx) => deleteTag(tx, id));
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user!), action: "project.settings", detail: "tag deleted" });
    return { ok: (await getTranslations({ locale, namespace: "admin.tags" }))("deleted") };
  });
}

/** Admin: stage renames + sub-statuses (JSON from StatusesForm). */
export async function saveStatusesAction(slug: string, json: string): Promise<TagState> {
  let input: unknown;
  try { input = JSON.parse(json); } catch { return { error: "Bad request" }; }
  if (!input || typeof input !== "object") return { error: "Bad request" };
  return guarded(slug, "admin", async ({ project, user, locale }) => {
    const r = await withProject(db, project.id, (tx) => saveStatuses(tx, project.id, input as Parameters<typeof saveStatuses>[2]));
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user!), action: "project.settings", detail: `statuses: ${r.subs}` });
    return { ok: (await getTranslations({ locale, namespace: "admin.statuses" }))("saved") };
  });
}

/** Admin: after how many days a waiting report shows up in "Bez odpovede". */
export async function saveUnansweredDays(slug: string, _: TagState, form: FormData): Promise<TagState> {
  return guarded(slug, "admin", async ({ project, locale }) => {
    const days = clampDays(form.get("days"));
    await db.update(schema.projects).set({ unansweredDays: days }).where(eq(schema.projects.id, project.id));
    return { ok: (await getTranslations({ locale, namespace: "admin.statuses" }))("daysSaved", { n: days }) };
  });
}
