import "server-only";
import type { Tx } from "@ozvi/db";
import type { Row } from "@/components/ItemRow";
import type { BoardLanguages } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { subLabelMap } from "./sub-statuses";
import { tagsByItem } from "./tags";

/**
 * List rows get their tags (team-only ones only for the team) and the sub-status name in the viewer's
 * language. Two queries for the whole page.
 */
export async function decorateRows(tx: Tx, board: BoardLanguages, locale: Locale, rows: Row[], team: boolean): Promise<void> {
  if (rows.length === 0) return;
  const tags = await tagsByItem(tx, rows.map((r) => r.id), team);
  const subs = rows.some((r) => r.subStatusId) ? await subLabelMap(tx, board, locale) : null;
  for (const r of rows) {
    r.tags = tags.get(r.id) ?? [];
    if (r.subStatusId && subs) r.subLabel = subs.get(r.subStatusId);
  }
}
