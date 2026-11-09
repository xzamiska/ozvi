"use server";

import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { canSee, DomainError, type Item } from "./domain";
import { logActivity, who, type ActivityAction } from "./activity";
import { approveComment, approveItem, deleteComment, deleteItem, editComment, editItem, rejectItem, restoreItem, setBlocked } from "./moderation";
import { canSeeComment, isTeam } from "./moderation-rules";
import { getCtx } from "./project";
import { allow, RateLimitError } from "./ratelimit";

/** Board actions for editing, deleting and moderating. Every rule is checked again on the server (moderation.ts). */

export interface ModState { error?: string; ok?: boolean }

const UUID = /^[0-9a-f-]{36}$/;

async function run(slug: string, fn: (c: Awaited<ReturnType<typeof ctxFor>>) => Promise<void>): Promise<ModState> {
  const c = await ctxFor(slug);
  if (!c.user) return { error: c.t("signIn") };
  if (!allow("edit", c.user.id)) return { error: new RateLimitError(c.locale).message };
  try {
    await fn(c);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(c.locale) };
    throw e;
  }
  revalidatePath(`/${slug}`, "layout");
  return { ok: true };
}

async function ctxFor(slug: string) {
  const ctx = await getCtx(slug);
  return { ...ctx, t: await getTranslations({ locale: ctx.locale, namespace: "errors" }) };
}

type C = Awaited<ReturnType<typeof ctxFor>>;

async function loadItem(c: C, tx: Parameters<Parameters<typeof withProject>[2]>[0], itemId: string, opts: { deleted?: boolean } = {}): Promise<Item> {
  const item = UUID.test(itemId) ? await tx.query.items.findFirst({ where: eq(schema.items.id, itemId) }) : undefined;
  const visible = item && (opts.deleted && item.deletedAt ? isTeam(c.user) : canSee(item, c.user));
  if (!item || !visible) throw new DomainError(c.t("itemMissing"));
  return item;
}

const log = (c: C, action: ActivityAction, detail: string) =>
  logActivity({ workspaceId: c.project.workspaceId, projectId: c.project.id, actor: who(c.user), action, detail });

const ref = (i: Item) => `${i.kind === "bug" ? "BUG-" : "#"}${i.number} ${i.title}`.slice(0, 200);

export async function editItemAction(slug: string, itemId: string, input: { title: string; body: string }): Promise<ModState> {
  return run(slug, async (c) => {
    const item = await withProject(db, c.project.id, async (tx) => {
      const item = await loadItem(c, tx, itemId);
      await editItem(tx, c.user!, item, { title: String(input.title ?? ""), body: String(input.body ?? "") });
      return item;
    });
    if (item.authorId !== c.user!.id) await log(c, "moderation.edited", ref(item));
  });
}

export async function deleteItemAction(slug: string, itemId: string): Promise<ModState> {
  return run(slug, async (c) => {
    const item = await withProject(db, c.project.id, async (tx) => deleteItem(tx, c.user!, await loadItem(c, tx, itemId)));
    if (item.authorId !== c.user!.id) await log(c, "moderation.deleted", ref(item));
  });
}

export async function restoreItemAction(slug: string, itemId: string): Promise<ModState> {
  return run(slug, async (c) => {
    const item = await withProject(db, c.project.id, async (tx) => restoreItem(tx, c.user!, await loadItem(c, tx, itemId, { deleted: true })));
    await log(c, "moderation.restored", ref(item));
  });
}

export async function approveItemAction(slug: string, itemId: string): Promise<ModState> {
  return run(slug, async (c) => {
    const item = await withProject(db, c.project.id, async (tx) => approveItem(tx, c.project, c.user!, await loadItem(c, tx, itemId)));
    await log(c, "moderation.approved", ref(item));
  });
}

export async function rejectItemAction(slug: string, itemId: string, reason: string): Promise<ModState> {
  return run(slug, async (c) => {
    const item = await withProject(db, c.project.id, async (tx) => rejectItem(tx, c.project, c.user!, await loadItem(c, tx, itemId), String(reason ?? "")));
    await log(c, "moderation.rejected", ref(item));
  });
}

async function loadComment(c: C, tx: Parameters<Parameters<typeof withProject>[2]>[0], commentId: string) {
  const comment = UUID.test(commentId) ? await tx.query.comments.findFirst({ where: eq(schema.comments.id, commentId) }) : undefined;
  if (!comment || !canSeeComment(comment, c.user)) throw new DomainError(c.t("itemMissing"));
  const item = await loadItem(c, tx, comment.itemId);
  return { comment, item };
}

export async function editCommentAction(slug: string, commentId: string, body: string): Promise<ModState> {
  return run(slug, async (c) => {
    const { comment, item } = await withProject(db, c.project.id, async (tx) => {
      const r = await loadComment(c, tx, commentId);
      await editComment(tx, c.user!, r.comment, String(body ?? ""));
      return r;
    });
    if (comment.authorId !== c.user!.id) await log(c, "moderation.comment_edited", ref(item));
  });
}

export async function approveCommentAction(slug: string, commentId: string): Promise<ModState> {
  return run(slug, async (c) => {
    const { item } = await withProject(db, c.project.id, async (tx) => {
      const r = await loadComment(c, tx, commentId);
      await approveComment(tx, c.project, c.user!, r.item, r.comment);
      return r;
    });
    await log(c, "moderation.comment_approved", ref(item));
  });
}

export async function deleteCommentAction(slug: string, commentId: string): Promise<ModState> {
  return run(slug, async (c) => {
    const { comment, item } = await withProject(db, c.project.id, async (tx) => {
      const r = await loadComment(c, tx, commentId);
      await deleteComment(tx, c.user!, r.comment);
      return r;
    });
    if (comment.authorId !== c.user!.id) await log(c, "moderation.comment_deleted", ref(item));
  });
}

export async function setBlockedAction(slug: string, userId: string, blocked: boolean): Promise<ModState> {
  return run(slug, async (c) => {
    const target = await withProject(db, c.project.id, async (tx) => {
      const target = UUID.test(userId) ? await tx.query.users.findFirst({ where: eq(schema.users.id, userId) }) : undefined;
      if (!target) throw new DomainError(c.t("itemMissing"));
      return setBlocked(tx, c.user!, target, blocked);
    });
    await log(c, blocked ? "moderation.blocked" : "moderation.unblocked", who(target) ?? target.externalId);
  });
}
