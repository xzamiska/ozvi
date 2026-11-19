"use server";

import { assignItem } from "./assign";
import { logActivity, who } from "./activity";
import { stopLabel } from "./route-text";
import { translator } from "@/i18n/messages";
import { notifyAssigned } from "./email/notify";
import { ITEM_STATUSES, schema, withProject } from "@ozvi/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { AttachmentError } from "./attachments";
import { createItemFor, ValidationError } from "./items";
import { allow, RateLimitError } from "./ratelimit";
import { addCommentTo, assertCanParticipate, canSee, changeStatus, DomainError, forgetIssueClosures, itemByNumber, mergeItems, recordStatus } from "./domain";
import { getCtx } from "./project";
import { rememberLocale } from "./user-locale";
import { applyVote } from "./votes";
import { getTranslations } from "next-intl/server";
import { HONEYPOT, isBlocked } from "./moderation-rules";

const { items, comments } = schema;

async function requireUser(slug: string) {
  const ctx = await getCtx(slug);
  if (!ctx.user) throw new Error((await getTranslations({ locale: ctx.locale, namespace: "errors" }))("signIn"));
  return { ...ctx, user: ctx.user, t: await getTranslations({ locale: ctx.locale, namespace: "errors" }) };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Sets the viewer's vote on an idea: weight 0 removes it, 1–3 sets it (forced to 1 unless the project
 * uses importance voting). The vote budget is enforced in applyVote; errors come back as text.
 */
export async function castVote(slug: string, itemId: string, weight: number): Promise<FormState> {
  const { project, user, locale, t } = await requireUser(slug);
  if (isBlocked(user)) return { error: t("blocked") };
  if (!allow("vote", user.id)) return { error: new RateLimitError(locale).message };
  const r = await withProject(db, project.id, (tx) => applyVote(tx, project, user.id, itemId, weight));
  if (!r.ok) return { error: r.reason === "missing" ? t("ideaMissing") : t("voteBudget", { n: r.left ?? 0 }) };
  await rememberLocale(project.id, user.id, locale);
  revalidatePath(`/${slug}`, "layout");
  return {};
}

export interface FormState { error?: string }

export async function createItem(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { project, user, locale } = await requireUser(slug);
  const kind = str(form, "kind") === "bug" ? "bug" : "idea";
  // Honeypot: only bots fill the hidden field. Nothing is saved; they land on the list as if it worked.
  if (str(form, HONEYPOT)) redirect(`/${slug}/${kind === "bug" ? "bugs" : "ideas"}`);
  let number: number;
  try {
    let context: unknown = null;
    try { context = JSON.parse(str(form, "context") || "{}"); } catch { /* ignore malformed context */ }
    number = await createItemFor(project, user, {
      kind,
      title: str(form, "title"),
      body: str(form, "body"),
      context,
      files: form.getAll("files").filter((f): f is File => f instanceof File),
    }, locale);
  } catch (e) {
    if (e instanceof AttachmentError || e instanceof ValidationError || e instanceof RateLimitError) return { error: e.message };
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  await rememberLocale(project.id, user.id, locale);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/i/${number}`);
}

export async function addComment(slug: string, itemId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { project, user, locale, t } = await requireUser(slug);
  if (str(form, HONEYPOT)) return {};
  try {
    assertCanParticipate(user);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  if (!allow("comment", user.id) || !allow("commentBurst", user.id)) return { error: new RateLimitError(locale).message };
  try {
    await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
      if (!item || !canSee(item, user)) throw new DomainError(t("itemMissing"));
      await addCommentTo(tx, project, user, item, str(form, "body"), form.get("internal") === "on");
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  await rememberLocale(project.id, user.id, locale);
  revalidatePath(`/${slug}`, "layout");
  return {};
}

export async function setStatus(slug: string, itemId: string, form: FormData) {
  const { project, isTeam, user, t } = await requireUser(slug);
  if (!isTeam) throw new Error(t("statusTeamOnly"));
  await withProject(db, project.id, async (tx) => {
    const item = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
    if (!item) throw new Error(t("itemMissing"));
    // "sub": a custom sub-status of the chosen stage ("" = the plain stage); validated in changeStatus.
    const sub = form.has("sub") ? (/^[0-9a-f-]{36}$/i.test(str(form, "sub")) ? str(form, "sub") : null) : undefined;
    // The team may add its own words (a public comment, quoted in the status e-mail) or move without e-mailing anyone.
    const note = str(form, "note").trim().slice(0, 5000) || null;
    const notify = str(form, "notify") !== "0";
    const moved = await changeStatus(tx, project, user, item, str(form, "status"), str(form, "fixedInVersion") || null, { subStatusId: sub, note: notify ? note : null, notify });
    // The words go on the item as a comment. Its own e-mail is skipped: the status e-mail already carries them.
    if (note && moved) await tx.insert(schema.comments).values({ projectId: project.id, itemId: item.id, authorId: user.id, body: note, internal: false, source: "board" });
  });
  revalidatePath(`/${slug}`, "layout");
}

/** Team: who handles this item ("" = nobody). */
export async function setAssignee(slug: string, itemId: string, assigneeId: string): Promise<FormState & { unchanged?: boolean }> {
  const { project, user, locale, t } = await requireUser(slug);
  let changed = false;
  try {
    await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
      if (!item) throw new DomainError(t("itemMissing"));
      changed = !!(await assignItem(tx, project, user, item, /^[0-9a-f-]{36}$/i.test(assigneeId) ? assigneeId : null));
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  revalidatePath(`/${slug}`, "layout");
  return changed ? {} : { unchanged: true };
}

/**
 * Team, list pages: the same change on many items at once (triage review: 20 items took ~80 clicks). Status
 * (with or without the status e-mails) and/or assignee; at most 100 items; each item goes through the same
 * rules as one by one (changeStatus, assignItem). Returns how many changed.
 */
export async function bulkUpdate(slug: string, form: FormData): Promise<{ changed?: number; error?: string }> {
  const { project, user, isTeam, locale, t } = await requireUser(slug);
  if (!isTeam) return { error: t("statusTeamOnly") };
  const ids = [...new Set(form.getAll("sel").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 100);
  const status = str(form, "status");
  // "none" or a user id; anything else (a forged value) is no change.
  const assignee = /^(none|[0-9a-f-]{36})$/i.test(str(form, "assignee")) ? str(form, "assignee") : "";
  const notify = str(form, "notify") === "on";
  if (ids.length === 0 || (!status && !assignee)) return { changed: 0 };
  let changed = 0, bulkDetail = "";
  const given: (typeof items.$inferSelect)[] = [];
  const touched: number[] = [];
  try {
    await withProject(db, project.id, async (tx) => {
      for (const id of ids) {
        let item = await tx.query.items.findFirst({ where: eq(items.id, id) });
        if (!item || item.deletedAt || item.mergedIntoId) continue;
        let did = false;
        if (status && (ITEM_STATUSES[item.kind] as readonly string[]).includes(status)) {
          const moved = await changeStatus(tx, project, user, item, status, undefined, { notify });
          if (moved) { item = moved; did = true; }
        }
        if (assignee) {
          const a = await assignItem(tx, project, user, item, assignee === "none" ? null : assignee, { notify: false });
          if (a) { did = true; given.push(a); }
        }
        if (did) { changed++; touched.push(item.number); }
      }
      // One e-mail to the colleague for the whole batch, not one per item.
      if (assignee && assignee !== "none" && assignee !== user.id) await notifyAssigned(tx, project, given, assignee, user.name);
      if (touched.length) {
        const to = assignee === "none" ? "—" : assignee ? (await tx.query.users.findFirst({ where: eq(schema.users.id, assignee) }))?.name ?? "" : "";
        bulkDetail = [touched.map((n) => `#${n}`).join(" "), status && `→ ${stopLabel(locale, status, project)}`, assignee && `· ${translator(locale, "board")("bulk.assignee")}: ${to}`].filter(Boolean).join(" ");
      }
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  // A lead can see who moved what in bulk (console Activity); single moves are in each item's history.
  if (bulkDetail) await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "triage.bulk", detail: bulkDetail.slice(0, 500) });
  revalidatePath(`/${slug}`, "layout");
  return { changed };
}

/** Team: mark this item as a duplicate of #target. */
export async function mergeInto(slug: string, itemId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { project, isTeam, user, locale, t } = await requireUser(slug);
  if (!isTeam) return { error: t("mergeTeamOnly") };
  const n = Number(str(form, "target").replace(/^#/, ""));
  if (!Number.isInteger(n) || n < 1) return { error: t("mergeNumber") };
  let merged = "";
  try {
    await withProject(db, project.id, async (tx) => {
      const source = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
      const target = await itemByNumber(tx, n);
      if (!source) throw new DomainError(t("itemMissing"));
      if (!target) throw new DomainError(t("numberMissing", { n }));
      await mergeItems(tx, project, user, source, target);
      merged = `#${source.number} → #${target.number}`;
    });
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "triage.merged", detail: merged });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/i/${n}`);
}

/** Closing the loop: the reporter confirms a fix works, or reopens it with a note. */
export async function confirmFix(slug: string, itemId: string, works: boolean) {
  const { project, user, t } = await requireUser(slug);
  await withProject(db, project.id, async (tx) => {
    const item = await tx.query.items.findFirst({ where: and(eq(items.id, itemId), eq(items.kind, "bug")) });
    if (!item || item.authorId !== user.id || item.status !== "fixed") throw new Error(t("cannotConfirm"));
    await tx.update(items).set({ status: works ? "verified" : "confirmed", subStatusId: null, updatedAt: new Date() }).where(eq(items.id, itemId));
    await recordStatus(tx, project.id, itemId, item.status, works ? "verified" : "confirmed", item.fixedInVersion, user.id);
    if (!works) {
      await forgetIssueClosures(tx, itemId);
      await tx.insert(comments).values({ projectId: project.id, itemId, authorId: user.id,
        body: (item.fixedInVersion ? t("stillBrokenIn", { v: item.fixedInVersion }) : t("stillBroken")) });
    }
  });
  revalidatePath(`/${slug}`, "layout");
}
