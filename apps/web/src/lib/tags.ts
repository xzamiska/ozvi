import { schema, type Tx } from "@ozvi/db";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Project, User } from "./project";
import { fail, isTeamRole, type Item } from "./domain";
import { emit, publicTagNames } from "./events";
import { cleanTagName, isTagColor, sortTags, TAGS_PER_ITEM, TAGS_PER_PROJECT, visibleTags, type Tag, type TagColor } from "./tag-rules";

/**
 * Tags in the database. Every read goes through `team` so team-only tags reach only the team;
 * writes are team (assign) or admin (manage) only — the callers check the role, these re-check it.
 */

const { tags, itemTags, items } = schema;

const cols = { id: tags.id, name: tags.name, color: tags.color, public: tags.public };
const asTag = (r: { id: string; name: string; color: string; public: boolean }): Tag => ({ ...r, color: isTagColor(r.color) ? r.color : "neutral" });

/** The project's tags this viewer may see. */
export async function listTags(tx: Tx, team: boolean): Promise<Tag[]> {
  const rows = await tx.select(cols).from(tags).where(team ? undefined : eq(tags.public, true)).orderBy(asc(tags.name));
  return sortTags(rows.map(asTag));
}

/** Tags on these items, visible to this viewer, by item id. */
export async function tagsByItem(tx: Tx, itemIds: string[], team: boolean): Promise<Map<string, Tag[]>> {
  const out = new Map<string, Tag[]>();
  if (itemIds.length === 0) return out;
  const rows = await tx.select({ itemId: itemTags.itemId, ...cols }).from(itemTags).innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(and(inArray(itemTags.itemId, itemIds), ...(team ? [] : [eq(tags.public, true)])));
  for (const r of rows) {
    const list = out.get(r.itemId) ?? [];
    list.push(asTag(r));
    out.set(r.itemId, list);
  }
  for (const [k, v] of out) out.set(k, sortTags(visibleTags(v, team)));
  return out;
}

/** List filter: items carrying this tag (resolve the tag with tagFromParam first, so private tags never filter for members). */
export function hasTag(tagId: string): SQL {
  return sql`exists (select 1 from ${itemTags} where ${itemTags.itemId} = ${items.id} and ${itemTags.tagId} = ${tagId})`;
}

/**
 * Team: replace an item's tags. Tags the actor can't see don't exist for them (RLS keeps other projects out).
 * Returns the item's tags afterwards.
 */
export async function setItemTags(tx: Tx, project: Project, actor: Pick<User, "role"> & { name?: string | null }, item: Item, tagIds: string[]): Promise<Tag[]> {
  if (!isTeamRole(actor.role)) throw fail((t) => t("tagsTeamOnly"));
  if (item.deletedAt) throw fail((t) => t("deleted"));
  const wanted = [...new Set(tagIds)];
  if (wanted.length > TAGS_PER_ITEM) throw fail((t) => t("tagsTooMany", { n: TAGS_PER_ITEM }));
  const known = wanted.length ? await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, wanted)) : [];
  if (known.length !== wanted.length) throw fail((t) => t("tagMissing"));
  const before = await publicTagNames(tx, item.id);
  await tx.delete(itemTags).where(eq(itemTags.itemId, item.id));
  if (wanted.length) await tx.insert(itemTags).values(wanted.map((tagId) => ({ projectId: project.id, itemId: item.id, tagId })));
  // Webhooks hear only about public tags: a change of team-only tags emits nothing.
  const after = await publicTagNames(tx, item.id);
  if (before.join("\u0000") !== after.join("\u0000")) await emit(tx, project, "item.tags_changed", { item, actorName: actor.name ?? null, previousTags: before });
  return (await tagsByItem(tx, [item.id], true)).get(item.id) ?? [];
}

/** Names → tag ids (case-insensitive), for MCP. Unknown names are an error the caller can fix. */
export async function tagIdsByName(tx: Tx, names: string[]): Promise<string[]> {
  const all = await listTags(tx, true);
  const missing: string[] = [];
  const ids = names.map((n) => {
    const t = all.find((x) => x.name.toLowerCase() === n.trim().toLowerCase());
    if (!t) missing.push(n);
    return t?.id;
  });
  if (missing.length) throw fail((t) => t("tagNames", { names: missing.join(", "), known: all.map((x) => x.name).join(", ") || "—" }));
  return ids as string[];
}

/* ---- Admin: manage the project's tags ---- */

export interface TagInput { name: unknown; color: unknown; public: unknown }

function parseInput(input: TagInput): { name: string; color: TagColor; public: boolean } {
  const name = cleanTagName(input.name);
  if (!name) throw fail((t) => t("tagName"));
  return { name, color: isTagColor(input.color) ? input.color : "neutral", public: input.public === true };
}

async function nameTaken(tx: Tx, name: string, exceptId?: string) {
  const [r] = await tx.select({ id: tags.id }).from(tags).where(sql`lower(${tags.name}) = lower(${name})`);
  return !!r && r.id !== exceptId;
}

export async function createTag(tx: Tx, project: Project, input: TagInput): Promise<Tag> {
  const v = parseInput(input);
  const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(tags);
  if ((n?.n ?? 0) >= TAGS_PER_PROJECT) throw fail((t) => t("tagsLimit", { n: TAGS_PER_PROJECT }));
  if (await nameTaken(tx, v.name)) throw fail((t) => t("tagExists", { name: v.name }));
  const [row] = await tx.insert(tags).values({ projectId: project.id, ...v }).returning(cols);
  return asTag(row!);
}

export async function updateTag(tx: Tx, id: string, input: TagInput): Promise<Tag> {
  const v = parseInput(input);
  if (await nameTaken(tx, v.name, id)) throw fail((t) => t("tagExists", { name: v.name }));
  const [row] = await tx.update(tags).set(v).where(eq(tags.id, id)).returning(cols);
  if (!row) throw fail((t) => t("tagMissing"));
  return asTag(row);
}

/** Merge `sourceId` into `targetId`: items keep one copy of the target tag, the source disappears. */
export async function mergeTags(tx: Tx, sourceId: string, targetId: string): Promise<number> {
  if (sourceId === targetId) throw fail((t) => t("tagMergeSelf"));
  const both = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, [sourceId, targetId]));
  if (both.length !== 2) throw fail((t) => t("tagMissing"));
  const moved = await tx.execute(sql`
    insert into ${itemTags} (project_id, item_id, tag_id, created_at)
    select project_id, item_id, ${targetId}, created_at from ${itemTags} where tag_id = ${sourceId}
    on conflict (item_id, tag_id) do nothing`);
  await tx.delete(tags).where(eq(tags.id, sourceId));
  return Number((moved as unknown as { count?: number }).count ?? 0);
}

export async function deleteTag(tx: Tx, id: string): Promise<void> {
  const r = await tx.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  if (r.length === 0) throw fail((t) => t("tagMissing"));
}

/** How many live items carry each tag (admin list). */
export async function tagUsage(tx: Tx): Promise<Map<string, number>> {
  const rows = await tx.select({ id: itemTags.tagId, n: sql<number>`count(*)::int` }).from(itemTags)
    .innerJoin(items, eq(items.id, itemTags.itemId)).where(sql`${items.deletedAt} is null and ${items.mergedIntoId} is null`).groupBy(itemTags.tagId);
  return new Map(rows.map((r) => [r.id, r.n]));
}
