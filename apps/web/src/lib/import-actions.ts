"use server";

import { schema, withProject } from "@ozvi/db";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { translator } from "@/i18n/messages";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { cannyBoards, cannyDump, cannyToImport, CannyError, defaultBoardKind } from "./import/canny";
import { CSV_FIELDS, csvToImport, guessMapping, type Mapping } from "./import/csv-map";
import { importTick, previewImport, registerFetcher, registerFiles, undoImport, type Preview, type UndoReport } from "./import/engine";
import { FiderError, fiderApiFiles, fiderBase, fiderFromApi, fiderFromBackup, fiderSummary, fiderToImport, type FiderOptions, type FiderRows, type FiderSummary } from "./import/fider";
import type { ImportData, Kind, RowIssue } from "./import/model";
import { safeFetch } from "./net";
import { getCtx } from "./project";
import { storage } from "./storage";
import { allow } from "./ratelimit";

/**
 * Admin imports (Canny, generic CSV). Admin only: an import creates people and posts in bulk.
 * Preview = dry run (nothing written); start queues a background run (lib/import/engine.ts).
 */

const MAX_FILE = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;

async function requireAdmin(slug: string) {
  const ctx = await getCtx(slug);
  const t = translator(ctx.locale, "import");
  if (ctx.user?.role !== "admin") throw new Error(t("errors.adminOnly"));
  if (!allow("import", ctx.user.id)) throw new Error(translator(ctx.locale, "errors")("rateLimit"));
  return { ...ctx, user: ctx.user, t };
}

export interface CsvPreviewState {
  error?: string;
  headers?: string[];
  mapping?: Mapping;
  canny?: boolean;
  rows?: number;
  preview?: Preview;
  issues?: RowIssue[];
  issueCount?: { errors: number; warnings: number };
  notes?: { key: string; n?: number }[];
  started?: boolean;
}

async function readCsv(form: FormData, t: (k: "errors.noFile" | "errors.tooBig" | "errors.tooManyRows" | "errors.notText") => string): Promise<string> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error(t("errors.noFile"));
  if (file.size > MAX_FILE) throw new Error(t("errors.tooBig"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("windows-1250").decode(bytes); } // Old Slovak/Czech Excel exports
  if (text.includes("\u0000")) throw new Error(t("errors.notText"));
  return text;
}

function readMapping(form: FormData, headers: string[]): Mapping | null {
  const raw = form.get("mapping");
  if (typeof raw !== "string" || !raw) return null;
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    const out: Mapping = {};
    for (const f of CSV_FIELDS) if (typeof m[f] === "string" && headers.includes(m[f] as string)) out[f] = m[f] as string;
    return out;
  } catch { return null; }
}

/** Step 1 (upload) and step 2 (mapping changed): parse, map, dry-run against the board. */
export async function previewCsv(slug: string, _: CsvPreviewState, form: FormData): Promise<CsvPreviewState> {
  try {
    const { project, t } = await requireAdmin(slug);
    const text = await readCsv(form, t);
    const kind: Kind = form.get("kind") === "bug" ? "bug" : "idea";
    const first = csvToImport(text, { mapping: {}, defaultKind: kind });
    if (first.headers.length === 0) return { error: t("errors.empty") };
    const mapping = readMapping(form, first.headers) ?? guessMapping(first.headers);
    if (!mapping.title) return { headers: first.headers, mapping, canny: first.canny, error: t("errors.mapTitle") };
    const data = csvToImport(text, { mapping, defaultKind: kind });
    if (data.items.length + data.issues.filter((i) => i.level === "error").length > MAX_ROWS) return { error: t("errors.tooManyRows") };
    const preview = await withProject(db, project.id, (tx) => previewImport(tx, data));
    const errors = data.issues.filter((i) => i.level === "error").length;
    return {
      headers: data.headers, mapping, canny: data.canny, rows: data.items.length + errors, preview,
      issues: data.issues.slice(0, 200), issueCount: { errors, warnings: data.issues.length - errors }, notes: data.notes,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function queue(project: { id: string; workspaceId: string }, user: { id: string; name: string | null; email: string | null }, source: string, label: string, input: ImportData | null, id = randomUUID()) {
  const [run] = await withProject(db, project.id, (tx) => tx.insert(schema.importRuns).values({
    id, projectId: project.id, source, label: label.slice(0, 200), input, createdById: user.id,
    total: input ? input.users.length + input.items.length + input.comments.length + input.votes.length : 0,
  }).returning({ id: schema.importRuns.id }));
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "import.started", detail: label.slice(0, 200) });
  return run!.id;
}

const kick = () => { void importTick(db).catch((e) => console.error("[ozvi] import", e)); };

/** Starts the CSV import with the confirmed mapping (the same file is sent again). */
export async function startCsv(slug: string, _: CsvPreviewState, form: FormData): Promise<CsvPreviewState> {
  try {
    const { project, user, t } = await requireAdmin(slug);
    const text = await readCsv(form, t);
    const kind: Kind = form.get("kind") === "bug" ? "bug" : "idea";
    const headers = csvToImport(text, { mapping: {}, defaultKind: kind }).headers;
    const mapping = readMapping(form, headers);
    if (!mapping?.title) return { error: t("errors.mapTitle") };
    const data = csvToImport(text, { mapping, defaultKind: kind });
    if (data.items.length > MAX_ROWS) return { error: t("errors.tooManyRows") };
    if (data.items.length === 0) return { error: t("errors.nothing") };
    const file = form.get("file") as File;
    const { headers: _h, canny: _c, ...input } = data;
    await queue(project, user, data.source, file.name || "CSV", { ...input, issues: [] });
    kick();
    revalidatePath(`/${slug}/admin`);
    return { started: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export interface CannyState {
  error?: string;
  boards?: { id: string; name: string; posts: number; kind: Kind | "skip" }[];
  started?: boolean;
}

const cannyMessage = (e: unknown, t: ReturnType<typeof translator<"import">>) =>
  e instanceof CannyError ? (e.code === "key" ? t("errors.cannyKey") : e.code === "network" ? t("errors.cannyNetwork") : t("errors.cannyApi")) : e instanceof Error ? e.message : String(e);

/** Canny step 1: check the key and list boards with a suggested destination each. */
export async function cannyConnect(slug: string, _: CannyState, form: FormData): Promise<CannyState> {
  let t: ReturnType<typeof translator<"import">> | undefined;
  try {
    const ctx = await requireAdmin(slug);
    t = ctx.t;
    const key = String(form.get("apiKey") ?? "").trim();
    if (!/^[\w-]{10,200}$/.test(key)) return { error: t("errors.cannyKey") };
    const boards = await cannyBoards(key);
    if (!boards.length) return { error: t("errors.cannyNoBoards") };
    return { boards: boards.map((b) => ({ id: b.id, name: b.name, posts: b.postCount ?? 0, kind: defaultBoardKind(b.name) })) };
  } catch (e) {
    return { error: t ? cannyMessage(e, t) : String(e) };
  }
}

/** Canny step 2: queue the run; the key stays in this process's memory until the data is fetched. */
export async function cannyStart(slug: string, _: CannyState, form: FormData): Promise<CannyState> {
  let t: ReturnType<typeof translator<"import">> | undefined;
  try {
    const ctx = await requireAdmin(slug);
    t = ctx.t;
    const key = String(form.get("apiKey") ?? "").trim();
    if (!/^[\w-]{10,200}$/.test(key)) return { error: t("errors.cannyKey") };
    const kinds: Record<string, Kind | "skip"> = {};
    for (const [k, v] of form.entries()) {
      if (!k.startsWith("board:") || typeof v !== "string") continue;
      kinds[k.slice(6)] = v === "bug" ? "bug" : v === "skip" ? "skip" : "idea";
    }
    const ids = Object.entries(kinds).filter(([, v]) => v !== "skip").map(([k]) => k);
    if (!ids.length) return { error: t("errors.cannyNoBoards") };
    // The fetcher is in place before the run exists, so the job can never pick it up without the key.
    const runId = randomUUID();
    registerFetcher(runId, async (progress) => cannyToImport(await cannyDump(key, ids, { progress }), kinds));
    await queue(ctx.project, ctx.user, "canny", "Canny API", null, runId);
    kick();
    revalidatePath(`/${slug}/admin`);
    return { started: true };
  } catch (e) {
    return { error: t ? cannyMessage(e, t) : String(e) };
  }
}

export interface UndoState { error?: string; ok?: string; report?: UndoReport }

/** Deletes everything one finished (or failed) run created. */
export async function undoRun(slug: string, runId: string, _: UndoState, _form: FormData): Promise<UndoState> {
  try {
    const { project, user, t } = await requireAdmin(slug);
    const { importRuns } = schema;
    const files: string[] = [];
    const res = await withProject(db, project.id, async (tx) => {
      const [run] = await tx.select().from(importRuns).where(and(eq(importRuns.id, runId), inArray(importRuns.status, ["done", "failed"]))).for("update");
      if (!run) return null;
      return { run, report: await undoImport(tx, runId, files) };
    });
    if (!res) return { error: t("errors.cannotUndo") };
    // Bytes go only after the rows are gone for good.
    await Promise.all(files.map((k) => storage().remove(k).catch(() => {})));
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "import.undone", detail: res.run.label });
    revalidatePath(`/${slug}`, "layout");
    return { ok: t("undone", { items: res.report.items }), report: res.report };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------- Fider ---------- */

/**
 * Fider in two steps. Load (backup.zip upload or API URL + key) reads everything once and keeps the
 * rows in this process's memory for 15 minutes under an opaque token bound to the project and the
 * admin, so changing options (bug tag, identity provider) re-previews without uploading or
 * fetching again. The API key is never stored: start receives it again for the files and drops it
 * when the run ends.
 */

const MAX_ZIP = 25 * 1024 * 1024;
const TTL = 15 * 60_000;
type FiderLoaded = { projectId: string; userId: string; mode: "backup" | "api"; rows: FiderRows; blobs?: Map<string, Uint8Array>; base?: string; at: number };
const gf = globalThis as { __ozviFider?: Map<string, FiderLoaded> };
const loaded = (gf.__ozviFider ??= new Map());
const sweep = () => { for (const [k, v] of loaded) if (Date.now() - v.at > TTL) loaded.delete(k); };

export interface FiderState {
  error?: string;
  token?: string;
  mode?: "backup" | "api";
  summary?: FiderSummary;
  options?: FiderOptions;
  preview?: Preview;
  people?: { app: number; email: number; other: number };
  started?: boolean;
}

const fiderMessage = (e: unknown, t: ReturnType<typeof translator<"import">>) =>
  e instanceof FiderError ? t(`errors.${e.code}`) : e instanceof Error ? e.message : String(e);

const readOptions = (form: FormData, summary: FiderSummary): FiderOptions => {
  const bug = form.get("bugTag"), provider = form.get("provider");
  return {
    bugTag: typeof bug === "string" ? (bug && summary.tags.some((x) => x.slug === bug) ? bug : null) : summary.suggested.bugTag,
    provider: typeof provider === "string" ? (provider && summary.providers.some((x) => x.name === provider) ? provider : null) : summary.suggested.provider,
  };
};

async function fiderPreviewFor(projectId: string, rows: FiderRows, options: FiderOptions) {
  const data = fiderToImport(rows, options);
  const preview = await withProject(db, projectId, (tx) => previewImport(tx, data));
  const people = { app: 0, email: 0, other: 0 };
  for (const u of data.users) u.externalId?.startsWith("email:") ? people.email++ : u.externalId?.startsWith("fider:") ? people.other++ : people.app++;
  return { data, preview, people };
}

const fiderKey = (form: FormData) => String(form.get("apiKey") ?? "").trim();
const validKey = (k: string) => /^[\w.~+/=-]{8,300}$/.test(k);

/** Step 1: read the backup or the API, return what can be chosen and the dry run with defaults. */
export async function fiderLoad(slug: string, _: FiderState, form: FormData): Promise<FiderState> {
  let t: ReturnType<typeof translator<"import">> | undefined;
  try {
    const ctx = await requireAdmin(slug);
    t = ctx.t;
    const mode = form.get("mode") === "api" ? "api" : "backup";
    let entry: FiderLoaded;
    if (mode === "backup") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return { error: t("errors.noBackup") };
      if (file.size > MAX_ZIP) return { error: t("errors.backupTooBig") };
      const b = fiderFromBackup(new Uint8Array(await file.arrayBuffer()));
      entry = { projectId: ctx.project.id, userId: ctx.user.id, mode, rows: b.rows, blobs: b.blobs, at: Date.now() };
    } else {
      const key = fiderKey(form);
      if (!validKey(key)) return { error: t("errors.fiderKey") };
      const base = fiderBase(String(form.get("url") ?? ""));
      const rows = await fiderFromApi(base, key, { fetch: (u, i) => safeFetch(u, i) });
      entry = { projectId: ctx.project.id, userId: ctx.user.id, mode, rows, base, at: Date.now() };
    }
    if (!entry.rows.posts.length) return { error: t("errors.fiderEmpty") };
    sweep();
    const token = randomUUID();
    loaded.set(token, entry);
    const summary = fiderSummary(entry.rows);
    const options = summary.suggested;
    const { preview, people } = await fiderPreviewFor(ctx.project.id, entry.rows, options);
    return { token, mode, summary, options, preview, people };
  } catch (e) {
    return { error: t ? fiderMessage(e, t) : String(e) };
  }
}

function takeLoaded(token: unknown, projectId: string, userId: string) {
  const e = typeof token === "string" ? loaded.get(token) : undefined;
  if (!e || e.projectId !== projectId || e.userId !== userId || Date.now() - e.at > TTL) return null;
  return e;
}

/** Step 2 (options changed): the dry run again from memory. */
export async function fiderPreview(slug: string, _: FiderState, form: FormData): Promise<FiderState> {
  try {
    const { project, user, t } = await requireAdmin(slug);
    const e = takeLoaded(form.get("token"), project.id, user.id);
    if (!e) return { error: t("errors.fiderExpired") };
    const summary = fiderSummary(e.rows);
    const options = readOptions(form, summary);
    const { preview, people } = await fiderPreviewFor(project.id, e.rows, options);
    return { token: String(form.get("token")), mode: e.mode, summary, options, preview, people };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Step 3: queue the run. Files come from the backup in memory or from Fider with the key (API). */
export async function fiderStart(slug: string, _: FiderState, form: FormData): Promise<FiderState> {
  let t: ReturnType<typeof translator<"import">> | undefined;
  try {
    const ctx = await requireAdmin(slug);
    t = ctx.t;
    const token = form.get("token");
    const e = takeLoaded(token, ctx.project.id, ctx.user.id);
    if (!e) return { error: t("errors.fiderExpired") };
    const summary = fiderSummary(e.rows);
    const data = fiderToImport(e.rows, readOptions(form, summary));
    if (!data.items.length) return { error: t("errors.nothing") };
    const runId = randomUUID();
    if (e.mode === "backup") {
      const blobs = e.blobs ?? new Map();
      registerFiles(runId, async (ref) => blobs.get(ref) ?? null);
    } else if (data.files?.length) {
      const key = fiderKey(form);
      if (!validKey(key)) return { error: t("errors.fiderKey") };
      registerFiles(runId, fiderApiFiles(e.base!, key, (u, i) => safeFetch(u, i)));
    }
    await queue(ctx.project, ctx.user, "fider", `Fider${summary.tenant ? ` ${summary.tenant}` : ""}`, data, runId);
    loaded.delete(token as string);
    kick();
    revalidatePath(`/${slug}/admin`);
    return { started: true };
  } catch (e) {
    return { error: t ? fiderMessage(e, t) : String(e) };
  }
}
