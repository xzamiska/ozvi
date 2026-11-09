import { PLAN_LIMITS, schema, withSystem, type Db, type PlanName, type Tx } from "@ozvi/db";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { translator } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";
import { MAX_FILE_BYTES, MAX_FILES, safeName, sniff, storage } from "./storage";

export class AttachmentError extends Error {}

export interface PreparedFile { bytes: Uint8Array; mime: string; name: string }

/**
 * Step 1, before any write: validate count, size, type (by bytes) and the workspace quota.
 * Quota is per workspace (all projects of the plan); read outside the project's RLS scope.
 */
export async function prepareAttachments(db: Db, project: { workspaceId: string }, files: File[], locale: Locale = "sk"): Promise<PreparedFile[]> {
  const t = translator(locale, "errors");
  const real = files.filter((f) => f.size > 0);
  if (real.length === 0) return [];
  if (real.length > MAX_FILES) throw new AttachmentError(t("tooManyFiles", { max: MAX_FILES }));
  const out: PreparedFile[] = [];
  for (const f of real) {
    if (f.size > MAX_FILE_BYTES) throw new AttachmentError(t("fileTooBig", { name: f.name }));
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mime = sniff(bytes);
    if (!mime) throw new AttachmentError(t("fileType", { name: f.name }));
    out.push({ bytes, mime, name: safeName(f.name) });
  }
  const { plan, used } = await withSystem(db, async (tx) => {
    const [w] = await tx.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, project.workspaceId));
    const [u] = await tx.select({ used: sql<number>`coalesce(sum(${schema.attachments.bytes}), 0)::bigint` })
      .from(schema.attachments).innerJoin(schema.projects, eq(schema.projects.id, schema.attachments.projectId))
      .where(eq(schema.projects.workspaceId, project.workspaceId));
    return { plan: (w?.plan ?? "self") as PlanName, used: Number(u?.used ?? 0) };
  });
  const incoming = out.reduce((s, f) => s + f.bytes.length, 0);
  if (used + incoming > PLAN_LIMITS[plan].attachmentBytes) {
    throw new AttachmentError(t("quota"));
  }
  return out;
}

/**
 * Step 2, inside the item transaction. Every stored key is pushed to `written`, so the caller
 * can delete the files if the transaction rolls back (no orphaned bytes outside the quota).
 */
export async function storeAttachments(tx: Tx, projectId: string, itemId: string, files: PreparedFile[], written: string[]) {
  for (const f of files) {
    const key = `${projectId}/${itemId}/${randomUUID()}`;
    await storage().put(key, f.bytes, f.mime);
    written.push(key);
    await tx.insert(schema.attachments).values({ projectId, itemId, storageKey: key, mime: f.mime, bytes: f.bytes.length, name: f.name });
  }
}

export async function discard(keys: string[]) {
  await Promise.all(keys.map((k) => storage().remove(k).catch(() => {})));
}
