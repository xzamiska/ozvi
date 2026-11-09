import { PLAN_LIMITS, schema, withProject, withSystem, type Db, type PlanName, type Tx } from "@ozvi/db";
import { and, eq, inArray, notExists, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { MAX_FILE_BYTES, safeName, sniff, storage } from "../storage";
import { fold, type ImportData, type ImportFile, type ImportItem, type Kind, type Status } from "./model";

/**
 * One engine for every import source: preview (dry run, no writes), apply in chunks as a background
 * job with progress, and undo. Imported data never sends anything: we insert rows directly and never
 * call the notify/e-mail/webhook paths (lib/email/notify.ts, lib/webhooks.ts `emit`).
 *
 * Idempotency: import_records maps (source, type, source id) → the row we created. Re-running skips
 * known ids. People who already exist (same host-app id or e-mail) are reused, not recorded, so undo
 * never deletes somebody who was there before the import.
 */

const { users, items, comments, votes, tags, itemTags, itemEvents, customStatuses, importRuns, importRecords, projects, attachments, workspaces } = schema;

export type RecordType = "user" | "tag" | "item" | "comment" | "vote" | "attachment";
/** Bytes of one source file (`ImportFile.ref`), or null when it is gone. Lives in memory only. */
export type FileLoader = (ref: string) => Promise<Uint8Array | null>;
export type ImportProject = { id: string; voteMode: string };

const CHUNK = 200;
const FIRST: Record<Kind, Status> = { idea: "open", bug: "new" };

/** Tag names across items, first spelling wins ("UI" before a later "ui"). */
function uniqueTags(list: ImportItem[]): string[] {
  const m = new Map<string, string>();
  for (const t of list.flatMap((i) => i.tags)) if (!m.has(t.toLowerCase())) m.set(t.toLowerCase(), t);
  return [...m.values()];
}

/** Known source ids → target ids, per type. */
async function knownRecords(tx: Tx, source: string, type: RecordType, sids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < sids.length; i += 5000) {
    const part = sids.slice(i, i + 5000);
    if (!part.length) continue;
    const rows = await tx.select({ s: importRecords.sourceId, t: importRecords.targetId }).from(importRecords)
      .where(and(eq(importRecords.source, source), eq(importRecords.sourceType, type), inArray(importRecords.sourceId, part)));
    for (const r of rows) out.set(r.s, r.t);
  }
  return out;
}

/** Existing board users matching the import's people by host-app id or e-mail (lower-cased). */
async function existingUsers(tx: Tx, data: ImportData): Promise<Map<string, string>> {
  const ext = data.users.map((u) => u.externalId).filter((x): x is string => !!x);
  const emails = data.users.map((u) => u.email).filter((x): x is string => !!x);
  if (!ext.length && !emails.length) return new Map();
  const rows = await tx.select({ id: users.id, externalId: users.externalId, email: users.email }).from(users)
    .where(or(...(ext.length ? [inArray(users.externalId, ext)] : []), ...(emails.length ? [inArray(sql`lower(${users.email})`, emails)] : [])));
  const byExt = new Map(rows.map((r) => [r.externalId, r.id]));
  // Prefer a real (SSO) identity over an `email:` placeholder when one address has both.
  const byEmail = new Map<string, string>();
  for (const r of [...rows].sort((a, b) => Number(b.externalId.startsWith("email:")) - Number(a.externalId.startsWith("email:")))) {
    if (r.email) byEmail.set(r.email.toLowerCase(), r.id);
  }
  const out = new Map<string, string>();
  for (const u of data.users) {
    const hit = (u.externalId && byExt.get(u.externalId)) || (u.email && byEmail.get(u.email));
    if (hit) out.set(u.sid, hit);
  }
  return out;
}

export interface Preview {
  items: { create: number; skip: number; ideas: number; bugs: number };
  users: { create: number; existing: number };
  comments: { create: number; skip: number };
  votes: { create: number; skip: number };
  tags: { create: string[]; existing: number };
  files: { create: number };
  /** Sources with post numbers (Fider): how many keep their number, how many get a new one (taken on this board). */
  numbers: { kept: number; changed: number } | null;
  sample: { title: string; kind: Kind; status: Status; subStatus: string | null; tags: string[]; author: string | null; createdAt: string | null; row?: number }[];
}

/** Dry run: what an import of `data` would create now, without writing anything. */
export async function previewImport(tx: Tx, data: ImportData): Promise<Preview> {
  const knownItems = await knownRecords(tx, data.source, "item", data.items.map((i) => i.sid));
  const knownComments = await knownRecords(tx, data.source, "comment", data.comments.map((c) => c.sid));
  const knownVotes = await knownRecords(tx, data.source, "vote", data.votes.map((v) => v.sid));
  const knownUsers = await knownRecords(tx, data.source, "user", data.users.map((u) => u.sid));
  const existing = await existingUsers(tx, data);
  const fresh = data.items.filter((i) => !knownItems.has(i.sid));
  // Only people who will actually be referenced get created.
  const needed = new Set<string>([
    ...fresh.map((i) => i.authorSid).filter((x): x is string => !!x),
    ...data.comments.filter((c) => !knownComments.has(c.sid)).map((c) => c.authorSid).filter((x): x is string => !!x),
    ...data.votes.filter((v) => !knownVotes.has(v.sid)).map((v) => v.userSid),
  ]);
  const usersToCreate = data.users.filter((u) => needed.has(u.sid) && !knownUsers.has(u.sid) && !existing.has(u.sid)).length;
  const tagNames = uniqueTags(fresh);
  const haveTags = tagNames.length
    ? new Set((await tx.select({ n: sql<string>`lower(${tags.name})` }).from(tags).where(inArray(sql`lower(${tags.name})`, tagNames.map((t) => t.toLowerCase())))).map((r) => r.n))
    : new Set<string>();
  const nameOf = new Map(data.users.map((u) => [u.sid, u.name ?? u.email]));
  const knownFiles = await knownRecords(tx, data.source, "attachment", (data.files ?? []).map((f) => f.sid));
  const wanted = fresh.map((i) => i.number).filter((n): n is number => typeof n === "number" && n > 0);
  const taken = new Set<number>();
  for (const part of chunks(wanted, 5000)) {
    for (const r of await tx.select({ n: items.number }).from(items).where(inArray(items.number, part))) taken.add(r.n);
  }
  return {
    items: { create: fresh.length, skip: data.items.length - fresh.length, ideas: fresh.filter((i) => i.kind === "idea").length, bugs: fresh.filter((i) => i.kind === "bug").length },
    users: { create: usersToCreate, existing: [...needed].filter((s) => existing.has(s) || knownUsers.has(s)).length },
    comments: { create: data.comments.filter((c) => !knownComments.has(c.sid)).length, skip: data.comments.filter((c) => knownComments.has(c.sid)).length },
    votes: { create: data.votes.filter((v) => !knownVotes.has(v.sid)).length, skip: data.votes.filter((v) => knownVotes.has(v.sid)).length },
    tags: { create: tagNames.filter((t) => !haveTags.has(t.toLowerCase())), existing: tagNames.filter((t) => haveTags.has(t.toLowerCase())).length },
    files: { create: (data.files ?? []).filter((f) => !knownFiles.has(f.sid)).length },
    numbers: wanted.length ? { kept: wanted.filter((n) => !taken.has(n)).length, changed: wanted.filter((n) => taken.has(n)).length } : null,
    sample: fresh.slice(0, 8).map((i) => ({ title: i.title, kind: i.kind, status: i.status, subStatus: i.subStatus ?? null, tags: i.tags,
      author: i.authorSid ? nameOf.get(i.authorSid) ?? null : null, createdAt: i.createdAt ?? null, row: i.row })),
  };
}

export interface ApplyReport {
  users: number; tags: number; items: number; ideas: number; bugs: number; comments: number; votes: number; merged: number; files: number;
  skipped: { items: number; comments: number; votes: number; files: number };
}
export const emptyReport = (): ApplyReport => ({ users: 0, tags: 0, items: 0, ideas: 0, bugs: 0, comments: 0, votes: 0, merged: 0, files: 0,
  skipped: { items: 0, comments: 0, votes: 0, files: 0 } });

const record = (tx: Tx, projectId: string, runId: string, source: string, type: RecordType, sourceId: string, targetId: string) =>
  tx.insert(importRecords).values({ projectId, runId, source, sourceType: type, sourceId, targetId }).onConflictDoNothing();

const at = (s: string | null | undefined) => (s ? new Date(s) : new Date());

/**
 * Writes `data` for one run in chunks (one transaction each) so progress is visible and a crash
 * loses at most one chunk; re-running continues where it stopped (records make it idempotent).
 */
export async function applyImport(db: Db, project: ImportProject, runId: string, data: ImportData,
  progress: (done: number, report: ApplyReport) => Promise<void> = async () => {}, loadFile?: FileLoader): Promise<ApplyReport> {
  const report = emptyReport();
  const src = data.source;
  let done = 0;
  const step = async (n: number) => { done += n; await progress(done, report); };

  // People: reuse records or existing board users; create placeholders (no e-mail is ever sent to them).
  const userId = new Map<string, string>();
  for (let i = 0; i < data.users.length; i += CHUNK) {
    const part = data.users.slice(i, i + CHUNK);
    await withProject(db, project.id, async (tx) => {
      const known = await knownRecords(tx, src, "user", part.map((u) => u.sid));
      const existing = await existingUsers(tx, { ...data, users: part });
      for (const u of part) {
        const hit = known.get(u.sid) ?? existing.get(u.sid);
        if (hit) { userId.set(u.sid, hit); continue; }
        const externalId = u.externalId ?? `${src}:${u.sid}`;
        const [row] = await tx.insert(users).values({
          projectId: project.id, externalId, email: u.email, name: u.name, role: u.role ?? "member", emailOptOut: !!u.emailOptOut,
          // importedRole lets undo tell "made team by the import" from "promoted by the team later".
          traits: { ...(u.traits ?? {}), importedFrom: src, ...(u.role ? { importedRole: u.role } : {}) },
        }).onConflictDoNothing({ target: [users.projectId, users.externalId] }).returning({ id: users.id });
        if (row) {
          userId.set(u.sid, row.id);
          await record(tx, project.id, runId, src, "user", u.sid, row.id);
          report.users++;
        } else {
          const [again] = await tx.select({ id: users.id }).from(users).where(eq(users.externalId, externalId));
          if (again) userId.set(u.sid, again.id);
        }
      }
    });
    await step(part.length);
  }

  // Tags by name (case-insensitive); new ones are team-only unless the source says they were public.
  const meta = new Map((data.tagMeta ?? []).map((t) => [t.name.toLowerCase(), t]));
  const tagId = new Map<string, string>();
  const tagNames = uniqueTags(data.items);
  if (tagNames.length) {
    await withProject(db, project.id, async (tx) => {
      for (const name of tagNames) {
        const [have] = await tx.select({ id: tags.id }).from(tags).where(sql`lower(${tags.name}) = ${name.toLowerCase()}`);
        if (have) { tagId.set(name.toLowerCase(), have.id); continue; }
        const m = meta.get(name.toLowerCase());
        const [row] = await tx.insert(tags).values({ projectId: project.id, name, public: m?.public ?? false, color: m?.color ?? "neutral" }).onConflictDoNothing().returning({ id: tags.id });
        if (!row) continue;
        tagId.set(name.toLowerCase(), row.id);
        await record(tx, project.id, runId, src, "tag", `tag:${name.toLowerCase()}`, row.id);
        report.tags++;
      }
    });
  }

  // Custom sub-statuses by label, for source statuses we don't have (e.g. Canny's custom "Beta").
  const subs = await withProject(db, project.id, (tx) => tx.select({ id: customStatuses.id, kind: customStatuses.kind, stage: customStatuses.stage, labels: customStatuses.labels }).from(customStatuses));
  const subFor = (kind: Kind, label: string | null | undefined) => {
    if (!label) return null;
    const f = fold(label);
    return subs.find((s) => s.kind === kind && Object.values((s.labels ?? {}) as Record<string, unknown>).some((l) => typeof l === "string" && fold(l) === f)) ?? null;
  };

  const itemId = new Map<string, string>();
  const created = new Set<string>();
  const top = data.items.reduce((m, i) => Math.max(m, i.number && i.number < 2_000_000_000 ? i.number : 0), 0);
  for (let i = 0; i < data.items.length; i += CHUNK) {
    const part = data.items.slice(i, i + CHUNK);
    await withProject(db, project.id, async (tx) => {
      const known = await knownRecords(tx, src, "item", part.map((x) => x.sid));
      for (const it of part) {
        const hit = known.get(it.sid);
        if (hit) { itemId.set(it.sid, hit); report.skipped.items++; continue; }
        const id = await insertItem(tx, project.id, it, it.authorSid ? userId.get(it.authorSid) ?? null : null, subFor(it.kind, it.subStatus), src, top);
        itemId.set(it.sid, id);
        created.add(it.sid);
        for (const t of it.tags) {
          const tid = tagId.get(t.toLowerCase());
          if (tid) await tx.insert(itemTags).values({ projectId: project.id, itemId: id, tagId: tid }).onConflictDoNothing();
        }
        await record(tx, project.id, runId, src, "item", it.sid, id);
        report.items++; it.kind === "idea" ? report.ideas++ : report.bugs++;
      }
    });
    await step(part.length);
  }
  // Items imported by an earlier run (comments/votes/files may still be new).
  const missing = [...new Set([...data.comments.map((c) => c.itemSid), ...data.votes.map((v) => v.itemSid), ...(data.files ?? []).map((f) => f.itemSid),
    ...data.items.map((i) => i.mergedIntoSid).filter((x): x is string => !!x)])].filter((s) => !itemId.has(s));
  if (missing.length) {
    const prev = await withProject(db, project.id, (tx) => knownRecords(tx, src, "item", missing));
    for (const [s, t] of prev) itemId.set(s, t);
  }

  // Duplicates: merged into their original (only items this run created; earlier merges are the team's now).
  const merges = data.items.filter((i) => i.mergedIntoSid && created.has(i.sid) && itemId.has(i.mergedIntoSid));
  if (merges.length) {
    await withProject(db, project.id, async (tx) => {
      for (const it of merges) {
        await tx.update(items).set({ mergedIntoId: itemId.get(it.mergedIntoSid!)! }).where(eq(items.id, itemId.get(it.sid)!));
        report.merged++;
      }
    });
  }

  for (let i = 0; i < data.comments.length; i += CHUNK) {
    const part = data.comments.slice(i, i + CHUNK);
    await withProject(db, project.id, async (tx) => {
      const known = await knownRecords(tx, src, "comment", part.map((c) => c.sid));
      for (const c of part) {
        const item = itemId.get(c.itemSid);
        if (known.has(c.sid) || !item) { report.skipped.comments++; continue; }
        const [row] = await tx.insert(comments).values({ projectId: project.id, itemId: item, authorId: c.authorSid ? userId.get(c.authorSid) ?? null : null,
          body: c.body, internal: c.internal, source: "import", createdAt: at(c.createdAt) }).returning({ id: comments.id });
        await record(tx, project.id, runId, src, "comment", c.sid, row!.id);
        report.comments++;
      }
    });
    await step(part.length);
  }

  // Votes keep their weight on importance boards; budgets do not apply to history.
  const importance = project.voteMode === "importance";
  const touched = new Set<string>();
  for (let i = 0; i < data.votes.length; i += CHUNK) {
    const part = data.votes.slice(i, i + CHUNK);
    await withProject(db, project.id, async (tx) => {
      const known = await knownRecords(tx, src, "vote", part.map((v) => v.sid));
      for (const v of part) {
        const item = itemId.get(v.itemSid); const user = userId.get(v.userSid);
        if (known.has(v.sid) || !item || !user) { report.skipped.votes++; continue; }
        const [row] = await tx.insert(votes).values({ projectId: project.id, itemId: item, userId: user, weight: importance ? Math.min(3, Math.max(1, v.weight)) : 1, createdAt: at(v.createdAt) })
          .onConflictDoNothing().returning({ itemId: votes.itemId });
        if (!row) { report.skipped.votes++; continue; }
        await record(tx, project.id, runId, src, "vote", v.sid, `${item}:${user}`);
        touched.add(item);
        report.votes++;
      }
      await recount(tx, [...touched]);
    });
    touched.clear();
    await step(part.length);
  }

  await importFiles(db, project.id, runId, src, data.files ?? [], itemId, report, loadFile, step);
  return report;
}

/**
 * Files: bytes come from the run's loader (memory only), are checked like uploads (size, type by
 * bytes, workspace quota) and stored before the row is written. A missing loader (server restarted)
 * or file skips it without a record, so the next run of the same import picks it up.
 */
async function importFiles(db: Db, projectId: string, runId: string, src: string, files: ImportFile[], itemId: Map<string, string>,
  report: ApplyReport, loadFile: FileLoader | undefined, step: (n: number) => Promise<void>) {
  if (!files.length) return;
  const quota = await withSystem(db, async (tx) => {
    const [p] = await tx.select({ plan: workspaces.plan, workspaceId: projects.workspaceId }).from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId)).where(eq(projects.id, projectId));
    const [u] = await tx.select({ used: sql<number>`coalesce(sum(${attachments.bytes}), 0)::bigint` }).from(attachments)
      .innerJoin(projects, eq(projects.id, attachments.projectId)).where(eq(projects.workspaceId, p!.workspaceId));
    return { left: PLAN_LIMITS[(p?.plan ?? "self") as PlanName].attachmentBytes - Number(u?.used ?? 0) };
  });
  for (let i = 0; i < files.length; i += 20) {
    const part = files.slice(i, i + 20);
    const known = await withProject(db, projectId, (tx) => knownRecords(tx, src, "attachment", part.map((f) => f.sid)));
    const ready: { f: ImportFile; item: string; bytes: Uint8Array; mime: string; key: string }[] = [];
    for (const f of part) {
      if (known.has(f.sid)) continue;
      const item = itemId.get(f.itemSid);
      if (!item) { report.skipped.files++; continue; }
      const bytes = loadFile ? await loadFile(f.ref).catch(() => null) : null;
      const mime = bytes && bytes.length <= MAX_FILE_BYTES ? sniff(bytes) : null;
      if (!bytes || !mime || bytes.length > quota.left) { report.skipped.files++; continue; }
      quota.left -= bytes.length;
      ready.push({ f, item, bytes, mime, key: `${projectId}/${item}/${randomUUID()}` });
    }
    const written: string[] = [];
    try {
      for (const r of ready) { await storage().put(r.key, r.bytes, r.mime); written.push(r.key); }
      await withProject(db, projectId, async (tx) => {
        for (const r of ready) {
          const [row] = await tx.insert(attachments).values({ projectId, itemId: r.item, storageKey: r.key, mime: r.mime, bytes: r.bytes.length, name: safeName(r.f.name) })
            .returning({ id: attachments.id });
          await record(tx, projectId, runId, src, "attachment", r.f.sid, row!.id);
          report.files++;
        }
      });
    } catch (e) {
      await Promise.all(written.map((k) => storage().remove(k).catch(() => {})));
      throw e;
    }
    await step(part.length);
  }
}

async function insertItem(tx: Tx, projectId: string, it: ImportItem, authorId: string | null,
  sub: { id: string; stage: string } | null, source: string, top = 0): Promise<string> {
  const created = at(it.createdAt);
  const status = (sub?.stage as Status | undefined) ?? it.status;
  const values = {
    projectId, kind: it.kind, title: it.title, body: it.body, status, subStatusId: sub?.id ?? null, authorId,
    context: it.kind === "bug" ? { importedFrom: source } : null, source: "import", createdAt: created, updatedAt: it.updatedAt ? at(it.updatedAt) : created,
    ...(it.pending ? { pending: true, pendingReason: "approval" } : {}),
  };
  let row: { id: string } | undefined;
  if (it.number && Number.isInteger(it.number) && it.number > 0 && it.number < 2_000_000_000) {
    // Keep the source number when it is free. Lock the project row first (the same row new posts
    // take their number from), so nobody can grab this number between the check and the insert.
    await tx.update(projects).set({ itemSeq: sql`greatest(${projects.itemSeq}, ${it.number})` }).where(eq(projects.id, projectId));
    [row] = await tx.insert(items).values({ ...values, number: it.number }).onConflictDoNothing().returning({ id: items.id });
  }
  if (!row) {
    // A new number goes after every number the source still wants to keep (`top`), never onto one of them.
    const [seq] = await tx.update(projects).set({ itemSeq: sql`greatest(${projects.itemSeq}, ${top}) + 1` }).where(eq(projects.id, projectId)).returning({ n: projects.itemSeq });
    [row] = await tx.insert(items).values({ ...values, number: seq!.n }).returning({ id: items.id });
  }
  // The route shows how far it got (same shape as the item_events backfill in migration 0015).
  if (status !== FIRST[it.kind]) await tx.insert(itemEvents).values({ projectId, itemId: row!.id, fromStatus: null, toStatus: status, createdAt: created });
  return row!.id;
}

async function recount(tx: Tx, itemIds: string[]) {
  if (!itemIds.length) return;
  await tx.update(items).set({ voteCount: sql`(select coalesce(sum(${votes.weight}), 0) from ${votes} where ${votes.itemId} = ${items.id})` })
    .where(inArray(items.id, itemIds));
}

export interface UndoReport { items: number; comments: number; votes: number; users: number; tags: number }

/**
 * Deletes what one run created: its votes and comments, its items (with everything on them, also
 * anything added since), the tags it created if no other item uses them, and the people it created
 * if they have nothing else on the board and are not team.
 */
export async function undoImport(tx: Tx, runId: string, removedFiles: string[] = []): Promise<UndoReport> {
  const recs = await tx.select({ type: importRecords.sourceType, target: importRecords.targetId }).from(importRecords).where(eq(importRecords.runId, runId));
  const of = (t: RecordType) => recs.filter((r) => r.type === t).map((r) => r.target);
  const out: UndoReport = { items: 0, comments: 0, votes: 0, users: 0, tags: 0 };

  const votePairs = of("vote").map((v) => v.split(":")).filter((p) => p.length === 2) as [string, string][];
  const touched = new Set<string>();
  for (let i = 0; i < votePairs.length; i += 1000) {
    const part = votePairs.slice(i, i + 1000);
    const del = await tx.delete(votes).where(or(...part.map(([it, u]) => and(eq(votes.itemId, it), eq(votes.userId, u))))).returning({ itemId: votes.itemId });
    out.votes += del.length; del.forEach((d) => touched.add(d.itemId));
  }
  const ids = (t: RecordType) => of(t);
  // Files go with their items (and the run's files on older items): the caller removes the bytes after commit.
  for (const part of chunks(ids("item"))) {
    removedFiles.push(...(await tx.select({ k: attachments.storageKey }).from(attachments).where(inArray(attachments.itemId, part))).map((r) => r.k));
  }
  for (const part of chunks(ids("attachment"))) {
    for (const r of await tx.delete(attachments).where(inArray(attachments.id, part)).returning({ k: attachments.storageKey })) {
      if (!removedFiles.includes(r.k)) removedFiles.push(r.k);
    }
  }
  for (const part of chunks(ids("comment"))) out.comments += (await tx.delete(comments).where(inArray(comments.id, part)).returning({ id: comments.id })).length;
  for (const part of chunks(ids("item"))) out.items += (await tx.delete(items).where(inArray(items.id, part)).returning({ id: items.id })).length;
  await recount(tx, [...touched]);
  for (const part of chunks(ids("tag"))) {
    out.tags += (await tx.delete(tags).where(and(inArray(tags.id, part), notExists(tx.select({ x: sql`1` }).from(itemTags).where(eq(itemTags.tagId, tags.id))))).returning({ id: tags.id })).length;
  }
  for (const part of chunks(ids("user"))) {
    out.users += (await tx.delete(users).where(and(inArray(users.id, part),
      // Not somebody the team promoted after the import (a role the import gave is fine to remove).
      or(eq(users.role, "member"), sql`${users.traits}->>'importedRole' = ${users.role}::text`),
      notExists(tx.select({ x: sql`1` }).from(items).where(eq(items.authorId, users.id))),
      notExists(tx.select({ x: sql`1` }).from(comments).where(eq(comments.authorId, users.id))),
      notExists(tx.select({ x: sql`1` }).from(votes).where(eq(votes.userId, users.id))),
      sql`not exists (select 1 from ${schema.apiTokens} where ${schema.apiTokens.userId} = ${users.id})`,
    )).returning({ id: users.id })).length;
  }
  await tx.delete(importRecords).where(eq(importRecords.runId, runId));
  // Records of other runs whose rows went with these items (their comments/votes) are stale now.
  await tx.execute(sql`delete from ${importRecords} r where r.source_type = 'comment' and not exists (select 1 from ${comments} c where c.id::text = r.target_id)`);
  await tx.execute(sql`delete from ${importRecords} r where r.source_type = 'vote' and not exists (select 1 from ${votes} v where v.item_id::text || ':' || v.user_id::text = r.target_id)`);
  await tx.update(importRuns).set({ status: "undone", undoneAt: new Date(), input: null }).where(eq(importRuns.id, runId));
  return out;
}

function* chunks<T>(list: T[], n = 1000): Generator<T[]> {
  for (let i = 0; i < list.length; i += n) yield list.slice(i, i + n);
}

/* ---------- background job ---------- */

/** Canny API runs: the key lives only here, in memory, until the data is fetched. */
type Fetcher = (progress: (n: number) => Promise<void>) => Promise<ImportData>;
// Shared across module instances (Next bundles instrumentation and server actions separately).
type ImportState = { fetchers: Map<string, Fetcher>; loaders?: Map<string, FileLoader>; active: Set<string>; booted: boolean };
const g = globalThis as { __ozviImports?: ImportState };
const state: ImportState = g.__ozviImports ?? (g.__ozviImports = { fetchers: new Map(), active: new Set(), booted: false });
state.loaders ??= new Map();
const { fetchers, active } = state;
const loaders = state.loaders;

export function registerFetcher(runId: string, f: Fetcher) { fetchers.set(runId, f); }
/** Where the run's files come from (a Fider backup in memory, or Fider's API with the key). Dropped when the run ends. */
export function registerFiles(runId: string, f: FileLoader) { loaders.set(runId, f); }

/** Runs queued imports (one at a time per process). Called by lib/jobs.ts and right after a start. */
export async function importTick(db: Db): Promise<void> {
  if (!state.booted) {
    state.booted = true;
    // A run left "running" by a restart starts again; records make that safe.
    await withSystem(db, (tx) => tx.update(importRuns).set({ status: "queued" }).where(eq(importRuns.status, "running")));
  }
  if (active.size) return;
  active.add("claim");
  const [run] = await withSystem(db, (tx) => tx.execute<{ id: string; project_id: string }>(sql`
    update ${importRuns} set status = 'running' where id = (
      select id from ${importRuns} where status = 'queued' order by created_at limit 1 for update skip locked
    ) returning id, project_id`));
  try {
    if (run) await runOne(db, run.id, run.project_id);
  } finally { active.delete("claim"); }
}

async function runOne(db: Db, runId: string, projectId: string) {
  const save = (set: Partial<typeof importRuns.$inferInsert>) => withProject(db, projectId, (tx) => tx.update(importRuns).set(set).where(eq(importRuns.id, runId)));
  try {
    const [row] = await withProject(db, projectId, (tx) => tx.select({ input: importRuns.input, source: importRuns.source, report: importRuns.report }).from(importRuns).where(eq(importRuns.id, runId)));
    const [project] = await db.select({ id: projects.id, voteMode: projects.voteMode }).from(projects).where(eq(projects.id, projectId));
    if (!row || !project) return;
    let data = row.input as ImportData | null;
    if (!data) {
      const fetcher = fetchers.get(runId);
      if (!fetcher) { await save({ status: "failed", error: "restart", finishedAt: new Date() }); return; }
      await save({ report: { phase: "fetch", fetched: 0 } });
      const fetched = await fetcher(async (n: number) => { await save({ report: { phase: "fetch", fetched: n } }); });
      fetchers.delete(runId);
      await save({ input: fetched });
      data = fetched;
    }
    const total = data.users.length + data.items.length + data.comments.length + data.votes.length + (data.files?.length ?? 0);
    await save({ total, done: 0, report: { phase: "write" } });
    let last = 0;
    const report = await applyImport(db, project, runId, data, async (done, r) => {
      if (done - last < 50 && done < total) return;
      last = done;
      await save({ done, report: { phase: "write", ...r } });
    }, loaders.get(runId));
    loaders.delete(runId);
    await save({ status: "done", done: total, report: { phase: "done", ...report }, input: null, finishedAt: new Date() });
  } catch (e) {
    fetchers.delete(runId);
    loaders.delete(runId);
    const code = e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string" ? (e as { code: string }).code : "";
    console.error("[ozvi] import", runId, e);
    await save({ status: "failed", error: code === "key" ? "cannyKey" : code === "network" ? "cannyNetwork" : code.startsWith("fider") ? code : "failed", finishedAt: new Date() }).catch(() => {});
  }
}
