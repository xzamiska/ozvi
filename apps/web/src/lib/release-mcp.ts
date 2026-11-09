import { schema, type Tx } from "@ozvi/db";
import type { McpUpdate } from "@ozvi/mcp";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { aiLabel } from "./changelog";
import { projectOrigin } from "./email/url";
import type { Project } from "./project";

const { changelogEntries, changelogItems, items, users } = schema;

/**
 * Changelog entries as MCP/API data, with the machine-readable AI label. Drafts only when asked (the
 * caller checks the team scope); published entries list ideas only (bugs are private).
 */
export async function mcpUpdates(tx: Tx, project: Project, drafts: boolean, limit: number, id?: string): Promise<McpUpdate[]> {
  const reviewer = alias(users, "reviewer");
  const rows = await tx.select({ e: changelogEntries, reviewer: reviewer.name }).from(changelogEntries)
    .leftJoin(reviewer, eq(reviewer.id, changelogEntries.reviewedById))
    .where(and(id ? eq(changelogEntries.id, id) : undefined, drafts ? undefined : isNotNull(changelogEntries.publishedAt)))
    .orderBy(desc(changelogEntries.createdAt)).limit(limit);
  if (rows.length === 0) return [];
  const linked = await tx.select({ entryId: changelogItems.entryId, number: items.number, kind: items.kind, title: items.title })
    .from(changelogItems).innerJoin(items, eq(items.id, changelogItems.itemId))
    .where(and(inArray(changelogItems.entryId, rows.map((r) => r.e.id)), isNull(items.deletedAt), eq(items.pending, false)));
  const base = `${projectOrigin(project)}/${project.slug}`;
  return rows.map(({ e, reviewer: name }) => ({
    id: e.id,
    status: e.publishedAt ? "published" : "draft",
    title: e.title,
    body: e.body,
    version: e.releaseTag,
    url: e.publishedAt ? `${base}/changelog#e-${e.id}` : `${base}/changelog/${e.id}/edit`,
    publishedAt: e.publishedAt?.toISOString() ?? null,
    updatedAt: e.updatedAt.toISOString(),
    items: linked.filter((l) => l.entryId === e.id && (drafts || l.kind === "idea")).map((l) => ({ number: l.number, kind: l.kind, title: l.title })),
    ai: aiLabel(e, name),
  }));
}
