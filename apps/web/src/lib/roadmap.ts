import { schema, type Tx } from "@ozvi/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { BoardLanguages } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { fetchLimit, takePage } from "./paging";
import { subLabelMap } from "./sub-statuses";
import { tagFromParam, type Tag } from "./tag-rules";
import { hasTag, listTags, tagsByItem } from "./tags";

/**
 * The public roadmap: ideas in the three forward lanes, each paging on its own, with the tags this
 * viewer may see (team-only ones only for the team) and the sub-status name in the viewer's language.
 * The optional ?tag=<name> filter resolves like the ideas list (tagFromParam), so a team-only tag in
 * the URL is simply unknown to everybody else. Run inside withProject (RLS keeps other projects out).
 */

export const ROADMAP_LANES = [
  { status: "planned", key: "pl", size: 50 },
  { status: "in_progress", key: "ip", size: 50 },
  { status: "shipped", key: "sh", size: 20 },
] as const;
export type LaneKey = (typeof ROADMAP_LANES)[number]["key"];

export interface RoadmapCard { id: string; number: number; title: string; votes: number; updatedAt: Date; tags: Tag[]; subLabel?: string }
export interface RoadmapLane { rows: RoadmapCard[]; hasMore: boolean; total: number }

export async function roadmapLanes(tx: Tx, board: BoardLanguages, locale: Locale, opts: { team: boolean; tag?: string | null; pages: Record<LaneKey, number> }) {
  const { items } = schema;
  const allTags = await listTags(tx, opts.team);
  const tag = tagFromParam(allTags, opts.tag, opts.team);
  const lanes: RoadmapLane[] = [];
  const subIds: (string | null)[][] = [];
  for (const c of ROADMAP_LANES) {
    const page = opts.pages[c.key];
    const where = and(eq(items.kind, "idea"), eq(items.status, c.status), isNull(items.mergedIntoId), isNull(items.deletedAt), eq(items.pending, false),
      ...(tag ? [hasTag(tag.id)] : []));
    const rows = await tx.select({ id: items.id, number: items.number, title: items.title, votes: items.voteCount, updatedAt: items.updatedAt, subStatusId: items.subStatusId })
      .from(items).where(where)
      .orderBy(...(c.status === "shipped" ? [desc(items.updatedAt)] : [desc(items.voteCount), desc(items.createdAt)]), desc(items.number))
      .limit(fetchLimit(page, c.size));
    const p = takePage(rows, page, c.size);
    const [n] = p.hasMore || page > 1 ? await tx.select({ n: sql<number>`count(*)::int` }).from(items).where(where) : [{ n: p.rows.length }];
    subIds.push(p.rows.map((r) => r.subStatusId));
    lanes.push({ rows: p.rows.map(({ subStatusId: _, ...r }) => ({ ...r, tags: [] })), hasMore: p.hasMore, total: n?.n ?? p.rows.length });
  }
  const cards = lanes.flatMap((l) => l.rows);
  const tags = await tagsByItem(tx, cards.map((r) => r.id), opts.team);
  const subs = subIds.flat().some(Boolean) ? await subLabelMap(tx, board, locale) : null;
  lanes.forEach((l, i) => l.rows.forEach((r, j) => {
    r.tags = tags.get(r.id) ?? [];
    const sid = subIds[i]![j];
    if (sid && subs) r.subLabel = subs.get(sid);
  }));
  return { allTags, tag, lanes };
}
