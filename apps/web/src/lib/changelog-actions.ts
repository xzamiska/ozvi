"use server";

import { schema, withProject } from "@ozvi/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiError, aiAvailable, aiErrorText, draftChangelog, summarizeThread } from "./ai";
import { publishEntry, saveEntry } from "./changelog";
import { db } from "./db";
import { DomainError, isTeamRole } from "./domain";
import { getCtx } from "./project";
import { allow } from "./ratelimit";
import { getTranslations } from "next-intl/server";

export interface ChangelogState { error?: string; ok?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function requireTeam(slug: string) {
  const ctx = await getCtx(slug);
  if (!ctx.user || !isTeamRole(ctx.user.role)) throw new Error((await getTranslations({ locale: ctx.locale, namespace: "errors" }))("teamOnly"));
  return { ...ctx, user: ctx.user, t: await getTranslations({ locale: ctx.locale, namespace: "errors" }) };
}

const fields = (f: FormData) => ({
  title: String(f.get("title") ?? ""),
  body: String(f.get("body") ?? ""),
  itemIds: f.getAll("items").map(String).filter((s) => /^[0-9a-f-]{36}$/.test(s)),
  ai: f.get("ai") === "1",
});

export async function saveChangelog(slug: string, id: string | null, _: ChangelogState, form: FormData): Promise<ChangelogState> {
  const { project, user, locale, t } = await requireTeam(slug);
  if (id && !UUID.test(id)) return { error: t("itemMissing") };
  const publish = form.get("intent") === "publish";
  let entryId: string;
  let emailed = 0;
  try {
    ({ entryId, emailed } = await withProject(db, project.id, async (tx) => {
      const e = await saveEntry(tx, project, user, fields(form), id ?? undefined, locale);
      const r = publish ? await publishEntry(tx, project, user, e.id, locale) : { emailed: 0 };
      return { entryId: e.id, emailed: r.emailed };
    }));
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  revalidatePath(`/${slug}`, "layout");
  if (publish) redirect(`/${slug}/changelog?published=${emailed}#${entryId}`);
  if (!id) redirect(`/${slug}/changelog/${entryId}/edit?saved=1`);
  return { ok: t("draftSaved") };
}

export async function deleteDraft(slug: string, id: string) {
  const { project } = await requireTeam(slug);
  if (!UUID.test(id)) return;
  await withProject(db, project.id, (tx) => tx.delete(schema.changelogEntries)
    .where(and(eq(schema.changelogEntries.id, id), isNull(schema.changelogEntries.publishedAt))));
  revalidatePath(`/${slug}/changelog`);
  redirect(`/${slug}/changelog`);
}

/* ---------- AI helpers (team, plans with AI) ---------- */

export interface AiResult { error?: string; title?: string; body?: string; text?: string }

async function requireAi(slug: string) {
  const ctx = await requireTeam(slug);
  if (!aiAvailable(ctx.plan)) throw new AiError("off");
  if (!allow("ai", ctx.user.id)) throw new AiError("rate");
  return ctx;
}

export async function aiDraftChangelog(slug: string, itemIds: string[]): Promise<AiResult> {
  const { locale } = await getCtx(slug);
  try {
    const { project, t } = await requireAi(slug);
    const ids = itemIds.filter((s) => /^[0-9a-f-]{36}$/.test(s)).slice(0, 30);
    if (ids.length === 0) return { error: t("aiPickIdeas") };
    const rows = await withProject(db, project.id, (tx) => tx.select({ number: schema.items.number, title: schema.items.title, body: schema.items.body, votes: schema.items.voteCount })
      .from(schema.items).where(and(inArray(schema.items.id, ids), eq(schema.items.kind, "idea"), eq(schema.items.pending, false), isNull(schema.items.deletedAt))));
    return await draftChangelog(rows.map((r) => ({ ...r, body: r.body.slice(0, 1500) })), project.name, locale);
  } catch (e) {
    if (e instanceof AiError) return { error: aiErrorText(e.code, locale, e.detail) };
    throw e;
  }
}

export async function aiSummarizeItem(slug: string, itemId: string): Promise<AiResult> {
  const { locale } = await getCtx(slug);
  try {
    if (!UUID.test(itemId)) return { error: (await getTranslations({ locale, namespace: "errors" }))("itemMissing") };
    const { project } = await requireAi(slug);
    const data = await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(schema.items.id, itemId) });
      if (!item) return null;
      const cs = await tx.select({ author: schema.users.name, role: schema.users.role, internal: schema.comments.internal, body: schema.comments.body })
        .from(schema.comments).leftJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
        .where(and(eq(schema.comments.itemId, itemId), isNull(schema.comments.deletedAt))).orderBy(asc(schema.comments.createdAt)).limit(200);
      return { item, cs };
    });
    if (!data) return { error: (await getTranslations({ locale, namespace: "errors" }))("itemMissing") };
    return { text: await summarizeThread({
      kind: data.item.kind, title: data.item.title, body: data.item.body.slice(0, 4000), status: data.item.status, votes: data.item.voteCount,
      comments: data.cs.map((c) => ({ author: c.author, team: isTeamRole(c.role), internal: c.internal, body: c.body.slice(0, 2000) })),
    }, locale) };
  } catch (e) {
    if (e instanceof AiError) return { error: aiErrorText(e.code, locale, e.detail) };
    throw e;
  }
}
