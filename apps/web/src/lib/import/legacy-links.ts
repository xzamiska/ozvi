import { schema, withProject, type Db } from "@ozvi/db";
import { and, eq } from "drizzle-orm";

/**
 * Old Fider links (/posts/<number>/<slug>) keep working after a move to Ozvi: the import records each
 * post's Fider number, so the link finds the item even when it got a new number on this board.
 * A merged duplicate leads to its original. Null when the board never imported that post.
 */
export async function fiderPostNumber(db: Db, projectId: string, fiderNumber: number): Promise<number | null> {
  if (!Number.isSafeInteger(fiderNumber) || fiderNumber <= 0) return null;
  return withProject(db, projectId, async (tx) => {
    const [rec] = await tx.select({ id: schema.importRecords.targetId }).from(schema.importRecords).where(and(
      eq(schema.importRecords.projectId, projectId), eq(schema.importRecords.source, "fider"),
      eq(schema.importRecords.sourceType, "number"), eq(schema.importRecords.sourceId, String(fiderNumber)),
    )).limit(1);
    if (!rec) return null;
    const [item] = await tx.select({ number: schema.items.number, mergedIntoId: schema.items.mergedIntoId })
      .from(schema.items).where(and(eq(schema.items.projectId, projectId), eq(schema.items.id, rec.id))).limit(1);
    if (!item) return null;
    if (!item.mergedIntoId) return item.number;
    const [original] = await tx.select({ number: schema.items.number }).from(schema.items)
      .where(and(eq(schema.items.projectId, projectId), eq(schema.items.id, item.mergedIntoId))).limit(1);
    return original?.number ?? item.number;
  });
}
