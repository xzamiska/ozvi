import { PLAN_LIMITS, schema, withProject, withSystem, type Db, type PlanName, type Tx } from "@ozvi/db";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { AI_MODEL_FAST, AiError, aiAvailable, aiConfigured, pivotTitles, translatePost, type AiErrorCode, type TranslatedText } from "./ai";
import { detectLanguage, type Lang } from "./lang-detect";
import { take } from "./ratelimit";

/**
 * Post translation on boards (ideas, comments, changelog) by the configured AI model, for projects with AI.
 *
 * Who may translate what is decided here, on the server, from the same rules the board uses to show
 * a post: bugs only for their reporter and the team, team-only notes only for the team, queued posts
 * only for their author and the team, nothing deleted. A post that the viewer cannot read is never
 * sent to the model. Translations are cached per (post, version = hash of its text, target language),
 * so each version is translated once per language however many people read it; only cache misses
 * count against the viewer's hourly limit and the project's daily cap.
 *
 * Labelling (AI Act art. 50): every translation is shown as "translated with AI" with the original a
 * click away, and carries `model` for machine-readable output.
 */

const { contentTranslations: ct, items, comments, changelogEntries } = schema;

export const TRANSLATION_MODES = ["off", "on_demand", "auto"] as const;
export type TranslationMode = (typeof TRANSLATION_MODES)[number];
export type Subject = "item" | "comment" | "changelog";

export function translationModeOf(p: { translationMode?: string | null }): TranslationMode {
  return (TRANSLATION_MODES as readonly string[]).includes(p.translationMode ?? "") ? p.translationMode as TranslationMode : "off";
}

/** Translation is offered when the board turned it on and AI is available (key + plan). */
export function translationEnabled(p: { translationMode?: string | null }, plan: PlanName): boolean {
  return translationModeOf(p) !== "off" && aiAvailable(plan);
}

/** Longest source text we translate (title + body); longer posts keep only the original. */
export const MAX_SOURCE_CHARS = 12_000;
/** Most posts one request may ask for (a thread with its comments). */
export const MAX_BATCH = 30;
/** New translations per project per 24 hours (cost cap); OZVI_TRANSLATE_DAILY_CAP overrides. */
export const dailyCap = (env = process.env) => {
  const n = Number(env.OZVI_TRANSLATE_DAILY_CAP);
  return Number.isInteger(n) && n >= 0 ? n : 500;
};

/** Version of a post's text: an edit changes it, so the cached translation of the old text is not reused. */
export function sourceHash(title: string | null, body: string): string {
  return createHash("sha256").update(JSON.stringify([title, body])).digest("hex");
}
/** The pivot (English title for duplicate search) is keyed by the title alone; same as SQL encode(sha256(…)). */
export function titleHash(title: string): string {
  return createHash("sha256").update(title, "utf8").digest("hex");
}
/** target_locale of the English title pivots (never shown to people as a translation). */
export const PIVOT = "en:title";

/* ── Visibility (mirrors the item page, changelog page and the comment thread) ────────────────── */

export interface Viewer { userId: string | null; isTeam: boolean }
interface BoardFlags { ideasPublic: boolean }

export function itemReadable(item: { kind: string; authorId: string | null; pending: boolean; deletedAt: Date | null }, p: BoardFlags, v: Viewer): boolean {
  if (item.deletedAt) return false;
  if (v.isTeam) return true;
  const author = !!v.userId && item.authorId === v.userId;
  if (item.pending && !author) return false;
  if (item.kind === "bug") return author;
  return p.ideasPublic || !!v.userId;
}

export function commentReadable(c: { authorId: string | null; internal: boolean; pending: boolean; deletedAt: Date | null }, v: Viewer): boolean {
  if (c.deletedAt) return false;
  if (v.isTeam) return true;
  if (c.internal) return false;
  return !c.pending || (!!v.userId && c.authorId === v.userId);
}

export function changelogReadable(e: { publishedAt: Date | null }, p: BoardFlags, v: Viewer): boolean {
  if (!p.ideasPublic && !v.userId) return false;
  return !!e.publishedAt || v.isTeam;
}

export interface Source { subject: Subject; id: string; title: string | null; body: string }

/** The posts of `wanted` this viewer may read, with their current text; anything else is dropped silently. */
export async function readableSources(tx: Tx, p: BoardFlags, v: Viewer, wanted: { subject: Subject; id: string }[]): Promise<Source[]> {
  const ids = (s: Subject) => [...new Set(wanted.filter((w) => w.subject === s).map((w) => w.id))];
  const out: Source[] = [];
  const itemIds = ids("item"), commentIds = ids("comment"), entryIds = ids("changelog");
  if (itemIds.length) {
    for (const i of await tx.select().from(items).where(inArray(items.id, itemIds))) {
      if (itemReadable(i, p, v)) out.push({ subject: "item", id: i.id, title: i.title, body: i.body });
    }
  }
  if (commentIds.length) {
    const rows = await tx.select({ c: comments, item: { kind: items.kind, authorId: items.authorId, pending: items.pending, deletedAt: items.deletedAt } })
      .from(comments).innerJoin(items, eq(items.id, comments.itemId)).where(inArray(comments.id, commentIds));
    // A comment is readable only where its thread is.
    for (const { c, item } of rows) {
      if (commentReadable(c, v) && itemReadable(item, p, v)) out.push({ subject: "comment", id: c.id, title: null, body: c.body });
    }
  }
  if (entryIds.length) {
    for (const e of await tx.select().from(changelogEntries).where(inArray(changelogEntries.id, entryIds))) {
      if (changelogReadable(e, p, v)) out.push({ subject: "changelog", id: e.id, title: e.title, body: e.body });
    }
  }
  return out;
}

/* ── Cache ─────────────────────────────────────────────────────────────────────────────────────── */

export interface Translation { subject: Subject; id: string; title: string | null; body: string; model: string; sourceLocale: string | null }

/** Cached translations of these exact versions into `target`, keyed by post id. Never calls the model. */
export async function cachedTranslations(tx: Tx, sources: Source[], target: string): Promise<Map<string, Translation>> {
  const out = new Map<string, Translation>();
  if (sources.length === 0) return out;
  const want = new Map(sources.map((s) => [`${s.id}:${sourceHash(s.title, s.body)}`, s]));
  const rows = await tx.select().from(ct)
    .where(and(inArray(ct.subjectId, sources.map((s) => s.id)), eq(ct.targetLocale, target)));
  for (const r of rows) {
    const s = want.get(`${r.subjectId}:${r.sourceHash}`);
    if (s) out.set(s.id, { subject: s.subject, id: s.id, title: r.title, body: r.body, model: r.model, sourceLocale: r.sourceLocale });
  }
  return out;
}

/** Which posts are in another language than `target` (and so worth a "Translate" button). */
export function foreignPosts<T extends { title?: string | null; body: string }>(posts: T[], target: string): T[] {
  return posts.filter((x) => {
    const lang = detectLanguage(`${x.title ?? ""}\n${x.body}`);
    return lang !== null && lang !== target;
  });
}

/* ── Translate on request ──────────────────────────────────────────────────────────────────────── */

export type TranslateError = AiErrorCode | "tooLong" | "cap";
export interface TranslateResult { translations: Translation[]; errors: { id: string; code: TranslateError }[] }

export interface TranslateDeps {
  translate: (input: { title: string | null; body: string }, target: string) => Promise<TranslatedText>;
  model: () => string;
  now: () => number;
}
const defaultDeps: TranslateDeps = { translate: translatePost, model: AI_MODEL_FAST, now: Date.now };

/**
 * Translations of `wanted` into `target` for this viewer: cached ones right away, the rest from the
 * model (outside any transaction), within the viewer's hourly limit and the project's daily cap.
 * `rateKey` identifies the viewer for the limiter (user id, else client IP).
 */
export async function translateFor(db: Db, opts: {
  project: BoardFlags & { id: string; translationMode?: string | null }; plan: PlanName; viewer: Viewer; target: string; rateKey: string;
  wanted: { subject: Subject; id: string }[]; deps?: Partial<TranslateDeps>;
}): Promise<TranslateResult> {
  const deps = { ...defaultDeps, ...opts.deps };
  const { project, viewer, target } = opts;
  if (!translationEnabled(project, opts.plan)) throw new AiError("off");
  const wanted = opts.wanted.slice(0, MAX_BATCH);
  const { sources, cached, usedToday } = await withProject(db, project.id, async (tx) => {
    const sources = await readableSources(tx, project, viewer, wanted);
    const cached = await cachedTranslations(tx, sources, target);
    const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(ct)
      .where(and(eq(ct.projectId, project.id), gt(ct.createdAt, new Date(deps.now() - 86_400_000)), sql`${ct.targetLocale} <> ${PIVOT}`));
    return { sources, cached, usedToday: c?.n ?? 0 };
  });

  const result: TranslateResult = { translations: [...cached.values()], errors: [] };
  let budget = Math.max(0, dailyCap() - usedToday);
  const todo: Source[] = [];
  for (const s of sources) {
    if (cached.has(s.id)) continue;
    if ((s.title?.length ?? 0) + s.body.length > MAX_SOURCE_CHARS) { result.errors.push({ id: s.id, code: "tooLong" }); continue; }
    if (budget <= 0) { result.errors.push({ id: s.id, code: "cap" }); continue; }
    if (!take("translate", `${project.id}:${opts.rateKey}`, deps.now()).ok) { result.errors.push({ id: s.id, code: "rate" }); continue; }
    budget--;
    todo.push(s);
  }

  const fresh: (Translation & { hash: string })[] = [];
  // A few at a time: a long thread should not open dozens of parallel API calls.
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (s) => {
      try {
        const out = await deps.translate({ title: s.title, body: s.body }, target);
        fresh.push({ subject: s.subject, id: s.id, title: s.title === null ? null : out.title, body: out.body, model: deps.model(),
          sourceLocale: detectLanguage(`${s.title ?? ""}\n${s.body}`), hash: sourceHash(s.title, s.body) });
      } catch (e) {
        if (e instanceof AiError) result.errors.push({ id: s.id, code: e.code });
        else { console.error("[ozvi] translate", e); result.errors.push({ id: s.id, code: "failed" }); }
      }
    }));
  }
  if (fresh.length) {
    await withProject(db, project.id, (tx) => tx.insert(ct).values(fresh.map((f) => ({
      projectId: project.id, subject: f.subject, subjectId: f.id, sourceHash: f.hash, targetLocale: target,
      sourceLocale: f.sourceLocale, title: f.title, body: f.body, model: f.model,
    }))).onConflictDoNothing());
    result.translations.push(...fresh.map(({ hash: _h, ...t }) => t));
  }
  return result;
}

/** Erase translations of posts that were deleted (their text must not be served or kept). */
export async function forgetTranslations(tx: Tx, subjectIds: string[]): Promise<void> {
  if (subjectIds.length) await tx.delete(ct).where(inArray(ct.subjectId, subjectIds));
}

/* ── English pivots for duplicate search across languages ─────────────────────────────────────── */

/** Plans whose projects may spend AI on pivots (same as embeddings). */
const AI_PLANS = (Object.keys(PLAN_LIMITS) as PlanName[]).filter((p) => PLAN_LIMITS[p].ai);

/**
 * Worker step: English titles of public, non-English ideas on boards with translation on, so a
 * Polish "Eksport do CSV" finds the Slovak "Export do CSV" and the English "CSV export". Ideas only:
 * bug reports are private and have no viewer here. Titles only, batched, within the daily cap.
 */
export async function pivotPending(db: Db, batch = 20, deps: { pivot?: typeof pivotTitles; model?: () => string } = {}): Promise<number> {
  if (!aiConfigured() && !deps.pivot) return 0;
  const rows = await withSystem(db, async (tx) => (await tx.execute(sql`
      select i.id, i.project_id, i.title from ${items} i
      join ${schema.projects} p on p.id = i.project_id
      join ${schema.workspaces} w on w.id = p.workspace_id
      left join content_translations t on t.subject_id = i.id and t.target_locale = ${PIVOT}
        and t.source_hash = encode(sha256(convert_to(i.title, 'UTF8')), 'hex')
      where i.kind = 'idea' and i.deleted_at is null and not i.pending and i.merged_into_id is null
        and p.translation_mode <> 'off'
        and w.plan in (${sql.join(AI_PLANS.map((x) => sql`${x}`), sql`, `)})
        and t.subject_id is null
      order by i.created_at desc limit ${batch * 3}`)) as unknown as { id: string; project_id: string; title: string }[]);
  // Short titles often carry too few words to tell the language: anything not clearly English gets a pivot
  // (the model returns English titles unchanged; titles are cheap).
  const english = rows.filter((r) => detectLanguage(r.title) === "en");
  const todo = rows.filter((r) => detectLanguage(r.title) !== "en").slice(0, batch);
  // English titles are their own pivot: recorded (no model call) so the worker does not scan them again.
  if (english.length) {
    await withSystem(db, (tx) => tx.insert(ct).values(english.map((r) => ({
      projectId: r.project_id, subject: "item", subjectId: r.id, sourceHash: titleHash(r.title), targetLocale: PIVOT,
      sourceLocale: "en", title: r.title, body: "", model: "none",
    }))).onConflictDoNothing());
  }
  if (todo.length === 0) return english.length;
  let out: string[];
  try { out = await (deps.pivot ?? pivotTitles)(todo.map((r) => r.title)); } catch (e) {
    console.warn("[ozvi] pivot titles failed", e instanceof Error ? e.message : e);
    return 0;
  }
  const model = (deps.model ?? AI_MODEL_FAST)();
  await withSystem(db, (tx) => tx.insert(ct).values(todo.map((r, i) => ({
    projectId: r.project_id, subject: "item", subjectId: r.id, sourceHash: titleHash(r.title), targetLocale: PIVOT,
    sourceLocale: detectLanguage(r.title), title: out[i]!, body: "", model,
  }))).onConflictDoNothing());
  return todo.length;
}

/** In-process cache of typed-title pivots (the new-idea form asks while the person types). */
const pivotCache = new Map<string, string>();

/** English version of a typed idea title for the similar-ideas search; null when not needed or not allowed. */
export async function pivotQuery(text: string, opts: { project: { id: string; translationMode?: string | null }; plan: PlanName; rateKey: string; pivot?: typeof pivotTitles }): Promise<string | null> {
  const q = text.trim().slice(0, 200);
  if (q.length < 12 || !translationEnabled(opts.project, opts.plan)) return null;
  const lang = detectLanguage(q);
  if (lang === "en") return null;
  const key = titleHash(q);
  const hit = pivotCache.get(key);
  if (hit !== undefined) return hit;
  if (!take("pivot", `${opts.project.id}:${opts.rateKey}`).ok) return null;
  try {
    const [out] = await (opts.pivot ?? pivotTitles)([q]);
    if (!out) return null;
    if (pivotCache.size > 2000) pivotCache.clear();
    pivotCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/** For tests. */
export function _resetPivotCache() { pivotCache.clear(); }


/** The cached English pivot of an item's current title (null when none: English, or not pivoted yet). */
export async function titlePivot(tx: Tx, itemId: string, title: string): Promise<string | null> {
  const [r] = await tx.select({ title: ct.title }).from(ct)
    .where(and(eq(ct.subjectId, itemId), eq(ct.targetLocale, PIVOT), eq(ct.sourceHash, titleHash(title))));
  return r?.title ?? null;
}
