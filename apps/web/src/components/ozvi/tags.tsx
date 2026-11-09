import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TAG_CHIP, type Tag } from "@/lib/tag-rules";
import { cn } from "@/lib/utils";

/**
 * A tag as a small label: a dot in the tag's token colour, the name, and for team-only tags a dashed
 * border and a lock (dashed means internal, see DESIGN.md). With `href` it filters the list.
 */
export function TagChip({ tag, href, className }: { tag: Pick<Tag, "name" | "color" | "public">; href?: string; className?: string }) {
  const t = useTranslations("tags");
  const c = TAG_CHIP[tag.color] ?? TAG_CHIP.neutral;
  const cls = cn(
    "inline-flex h-[22px] max-w-[200px] shrink-0 items-center gap-1.5 rounded-sm border px-1.5 text-[12px] leading-none font-semibold",
    c.chip, !tag.public && "border-dashed", href && "relative z-10 transition-colors hover:border-line-strong hover:bg-wash", className,
  );
  const inner = (
    <>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", c.dot)} />
      <span className="truncate">{tag.name}</span>
      {!tag.public && <Lock className="size-3 shrink-0 opacity-70" aria-label={t("teamOnly")} />}
    </>
  );
  return href
    ? <Link href={href} className={cls} title={tag.public ? tag.name : `${tag.name} · ${t("teamOnly")}`}>{inner}</Link>
    : <span className={cls} title={tag.public ? tag.name : `${tag.name} · ${t("teamOnly")}`}>{inner}</span>;
}

export function TagList({ tags, hrefFor, className }: { tags: Tag[]; hrefFor?: (t: Tag) => string; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {tags.map((t) => <TagChip key={t.id} tag={t} href={hrefFor?.(t)} />)}
    </span>
  );
}
