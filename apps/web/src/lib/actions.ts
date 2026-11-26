"use server";

import { assignItem } from "./assign";
import { logActivity, who } from "./activity";
import { stopLabel } from "./route-text";
import { translator } from "@/i18n/messages";
import { notifyAssigned } from "./email/notify";
import { ITEM_STATUSES, schema, withProject } from "@ozvi/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { AttachmentError } from "./attachments";
import { createItemFor, ValidationError } from "./items";
import { allow, RateLimitError } from "./ratelimit";
import { addCommentTo, assertCanParticipate, canSee, changeStatus, DomainError, itemByNumber, mergeItems, reporterVerdict } from "./domain";
import { getCtx } from "./project";
import { rememberLocale } from "./user-locale";
import { applyVote } from "./votes";
import { getTranslations } from "next-intl/server";
import { HONEYPOT, isBlocked } from "./moderation-rules";
import { attachDraft, cleanSimilarSeen, countDuplicate, draftComment, similarInputs, splitItem, strongMatch } from "./duplicates";
import { sectionOn } from "./sections";
import { KnownIssueError, publishKnown, unpublishKnown } from "./known-issues";

const { items } = schema;

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

/** A strong match for a new idea: the form asks once whether it is the same (ADR-0015). */
export interface StrongMatch { number: number; title: string; votes: number; status: string }
export interface CreateState extends FormState { strong?: StrongMatch }

/** Numbers in a comma-separated form field (the suggestions the author voted on or opened). */
const numbers = (f: FormData, k: string) => str(f, k).split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);

export async function createItem(slug: string, _prev: CreateState, form: FormData): Promise<CreateState> {
  const { project, user, locale, plan } = await requireUser(slug);
  const kind = str(form, "kind") === "bug" ? "bug" : "idea";
  // Honeypot: only bots fill the hidden field. Nothing is saved; they land on the list as if it worked.
  if (str(form, HONEYPOT)) redirect(`/${slug}/${kind === "bug" ? "bugs" : "ideas"}`);
  const title = str(form, "title");
  // A strong match the author has not voted on or opened: ask once instead of creating (never again for a
  // draft they confirmed as different: the form sends confirmedNew=1 then).
  if (kind === "idea" && str(form, "confirmedNew") !== "1" && title.length >= 3 && sectionOn(project, "ideas") && !isBlocked(user)) {
    const inputs = await similarInputs(project, plan, user.id, title);
    const strong = await withProject(db, project.id, (tx) => strongMatch(tx, { text: title, ...inputs, seen: numbers(form, "seen"), userId: user.id })).catch(() => null);
    if (strong) return { strong };
  }
  let number: number;
  try {
    let context: unknown = null;
    try { context = JSON.parse(str(form, "context") || "{}"); } catch { /* ignore malformed context */ }
    number = await createItemFor(project, user, {
      kind,
      title,
      body: str(form, "body"),
      context,
      files: form.getAll("files").filter((f): f is File => f instanceof File),
      similarSeen: kind === "idea" ? cleanSimilarSeen(str(form, "shown"), str(form, "strong"), str(form, "reason")) : null,
      joinKnown: kind === "bug" && /^\d{1,9}$/.test(str(form, "joinKnown")) ? Number(str(form, "joinKnown")) : null,
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

export async function addComment(slug: string, itemId: string, _prev: FormState, form: FormData): Promise<FormState & { queued?: boolean }> {
  const { project, user, locale, t } = await requireUser(slug);
  if (str(form, HONEYPOT)) return {};
  try {
    assertCanParticipate(user);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  if (!allow("comment", user.id) || !allow("commentBurst", user.id)) return { error: new RateLimitError(locale).message };
  let queued = false;
  try {
    await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
      if (!item || !canSee(item, user)) throw new DomainError(t("itemMissing"));
      queued = (await addCommentTo(tx, project, user, item, str(form, "body"), form.get("internal") === "on")).pending;
      // A new idea's draft turned into a comment on a similar idea: counted (no person kept, duplicateStats).
      if (str(form, "via") === "similar" && item.kind === "idea") await countDuplicate(tx, project.id, "attached");
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  await rememberLocale(project.id, user.id, locale);
  revalidatePath(`/${slug}`, "layout");
  return queued ? { queued } : {};
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
    // The comment's id is known up front so the status e-mail can have that comment translated (lib/email/translate-mail.ts).
    const noteId = note ? randomUUID() : null;
    const moved = await changeStatus(tx, project, user, item, str(form, "status"), str(form, "fixedInVersion") || null, { subStatusId: sub, note: notify ? note : null, noteId, notify });
    // The words go on the item as a comment. Its own e-mail is skipped: the status e-mail already carries them.
    if (note && moved) await tx.insert(schema.comments).values({ id: noteId!, projectId: project.id, itemId: item.id, authorId: user.id, body: note, internal: false, source: "board" });
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
/**
 * Team: publish a bug as a known issue (or update its public title and note), or take it off the list
 * (`hide`). Reporters see only these two fields (lib/known-issues.ts).
 */
export async function setKnownIssue(slug: string, itemId: string, _prev: FormState, form: FormData): Promise<FormState & { saved?: number }> {
  const { project, isTeam, user, locale, t } = await requireUser(slug);
  if (!isTeam) return { error: t("known.team") };
  const hide = str(form, "hide") === "1";
  let detail = "";
  try {
    await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
      if (!item || item.kind !== "bug") throw new DomainError(t("itemMissing"));
      if (hide) await unpublishKnown(tx, item);
      else await publishKnown(tx, item, { title: str(form, "title"), body: String(form.get("body") ?? "") });
      detail = `#${item.number}`;
    });
  } catch (e) {
    if (e instanceof KnownIssueError) return { error: t(`known.${e.message as "kind" | "state" | "title" | "body"}`) };
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: hide ? "triage.known_hidden" : "triage.known_published", detail });
  revalidatePath(`/${slug}`, "layout");
  return { saved: Date.now() };
}

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

/**
 * "Pridať hlas a môj popis k #N" on a new idea's strong match: the author's vote and their draft (title + body)
 * as their comment on #number, then to that idea. Approval rules and budgets apply as anywhere (attachDraft).
 */
export async function attachToIdea(slug: string, number: number, _prev: FormState, form: FormData): Promise<FormState> {
  const { project, user, locale, t } = await requireUser(slug);
  if (str(form, HONEYPOT)) return {};
  if (!allow("comment", user.id) || !allow("commentBurst", user.id) || !allow("vote", user.id)) return { error: new RateLimitError(locale).message };
  let queued = false;
  try {
    queued = await withProject(db, project.id, async (tx) => {
      const item = Number.isInteger(number) && number > 0 ? await itemByNumber(tx, number) : null;
      if (!item || !canSee(item, user)) throw new DomainError(t("ideaMissing"));
      return (await attachDraft(tx, project, user, item, draftComment(str(form, "title"), str(form, "body")))).queued;
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  await rememberLocale(project.id, user.id, locale);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/i/${number}?attached=${queued ? "queued" : "1"}`);
}

/** Team: undo a merge ("Oddeliť"). The item has its own route again; the votes moved to the original stay there. */
export async function unmergeItem(slug: string, itemId: string): Promise<FormState> {
  const { project, isTeam, user, locale, t } = await requireUser(slug);
  if (!isTeam) return { error: t("mergeTeamOnly") };
  let detail = "", n = 0;
  try {
    await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
      if (!item) throw new DomainError(t("itemMissing"));
      const r = await splitItem(tx, project, user, item);
      n = item.number;
      detail = `#${item.number} ← #${r.from ?? "?"}`;
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "triage.unmerged", detail });
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/i/${n}`);
}

/**
 * Closing the loop: the reporter confirms a fix works, or reopens it, optionally saying what still doesn't work
 * (`note`, kept with the "still broken" line as their comment, which the team hears about).
 */
export async function confirmFix(slug: string, itemId: string, works: boolean, note = ""): Promise<{ error?: string }> {
  const { project, user, locale, t } = await requireUser(slug);
  try {
    await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: and(eq(items.id, itemId), eq(items.kind, "bug")) });
      if (!item) throw new DomainError(t("cannotConfirm"));
      const line = item.fixedInVersion ? t("stillBrokenIn", { v: item.fixedInVersion }) : t("stillBroken");
      const said = note.trim().slice(0, 4000);
      if (!(await reporterVerdict(tx, project, user, item, works, said ? `${line}\n\n${said}` : line))) throw new DomainError(t("cannotConfirm"));
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  revalidatePath(`/${slug}`, "layout");
  return {};
}
