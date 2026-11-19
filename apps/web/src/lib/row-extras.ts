import "server-only";
import { schema, type Tx } from "@ozvi/db";
import { eq, inArray } from "drizzle-orm";
import type { Row } from "@/components/ItemRow";
import type { BoardLanguages } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { subLabelMap } from "./sub-statuses";
import { tagsByItem } from "./tags";

/**
 * List rows get their tags (team-only ones only for the team), the sub-status name in the viewer's
 * language and, for the team, who handles them. Three queries for the whole page.
 */
export async function decorateRows(tx: Tx, board: BoardLanguages, locale: Locale, rows: Row[], team: boolean): Promise<void> {
  if (rows.length === 0) return;
  const tags = await tagsByItem(tx, rows.map((r) => r.id), team);
  const subs = rows.some((r) => r.subStatusId) ? await subLabelMap(tx, board, locale) : null;
  // Team: who handles each row (one query; customers never see it).
  const who = team ? new Map((await tx.select({ id: schema.items.id, name: schema.users.name, email: schema.users.email }).from(schema.items)
    .innerJoin(schema.users, eq(schema.users.id, schema.items.assigneeId))
    .where(inArray(schema.items.id, rows.map((r) => r.id)))).map((x) => [x.id, x.name ?? x.email ?? "—"])) : null;
  for (const r of rows) {
    r.tags = tags.get(r.id) ?? [];
    if (r.subStatusId && subs) r.subLabel = subs.get(r.subStatusId);
    if (who?.has(r.id)) r.assigneeName = who.get(r.id);
  }
}
