/**
 * Tags: pure rules shared by the server (queries, actions, MCP, webhooks) and client components.
 * Public tags show on the board and filter for everyone; team tags exist only for the team: they are
 * never rendered, filtered by, counted, exported to members, sent over MCP to member tokens or in webhooks.
 */

export const TAG_COLORS = ["neutral", "accent", "amber", "green", "red", "muted"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag { id: string; name: string; color: TagColor; public: boolean }

export const TAG_NAME_MAX = 40;
/** Tags per project and per item: enough for real taxonomies, small enough for a readable row. */
export const TAGS_PER_PROJECT = 100;
export const TAGS_PER_ITEM = 8;

export const isTagColor = (c: unknown): c is TagColor => typeof c === "string" && (TAG_COLORS as readonly string[]).includes(c);

/** Single line, trimmed, collapsed spaces, bounded; null when nothing is left. */
export function cleanTagName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, TAG_NAME_MAX);
  return s || null;
}

/** The only gate for showing tags: the team sees all, everybody else public ones. */
export function visibleTags<T extends Pick<Tag, "public">>(tags: readonly T[], team: boolean): T[] {
  return team ? [...tags] : tags.filter((t) => t.public);
}

/** A tag from the URL (?tag=<name>, case-insensitive) that this viewer may filter by; unknown or private → null. */
export function tagFromParam<T extends Pick<Tag, "name" | "public">>(tags: readonly T[], param: string | null | undefined, team: boolean): T | null {
  const want = (param ?? "").trim().toLowerCase();
  if (!want) return null;
  return visibleTags(tags, team).find((t) => t.name.toLowerCase() === want) ?? null;
}

/** Sorted for display: public before team-only, then by name in the board's language. */
export function sortTags<T extends Pick<Tag, "name" | "public">>(tags: readonly T[], locale = "sk"): T[] {
  return [...tags].sort((a, b) => Number(b.public) - Number(a.public) || a.name.localeCompare(b.name, locale));
}

/** Tag colours are theme tokens: chip background/text classes per colour (never a literal hex). */
export const TAG_CHIP: Record<TagColor, { chip: string; dot: string }> = {
  neutral: { chip: "bg-surface text-foreground border-line-strong", dot: "bg-foreground" },
  accent: { chip: "bg-brand-soft text-brand-text border-brand-line", dot: "bg-brand" },
  amber: { chip: "bg-st-ack/10 text-foreground border-st-ack/35", dot: "bg-st-ack" },
  green: { chip: "bg-st-done/10 text-foreground border-st-done/35", dot: "bg-st-done" },
  red: { chip: "bg-destructive/8 text-foreground border-destructive/35", dot: "bg-destructive" },
  muted: { chip: "bg-muted text-muted-foreground border-line", dot: "bg-subtle" },
};
