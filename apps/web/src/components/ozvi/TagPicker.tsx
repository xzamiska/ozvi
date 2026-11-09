"use client";

import { Check, Lock, Plus, Settings2, Tag as TagIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setTagsOnItem } from "@/lib/tag-actions";
import { TAG_CHIP, TAGS_PER_ITEM, type Tag } from "@/lib/tag-rules";
import { cn } from "@/lib/utils";

/**
 * Team: assign tags to one report. Each click saves at once (optimistic), the list refreshes from the
 * server. `compact` is the dashed "+" in list rows; otherwise an outline button for the item page.
 */
export function TagPicker({ slug, itemId, all, selected, admin, compact = false }: {
  slug: string; itemId: string; all: Tag[]; selected: string[]; admin: boolean; compact?: boolean;
}) {
  const t = useTranslations("tags");
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>(selected);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => x.name.toLowerCase().includes(s)) : all;
  }, [all, q]);

  const toggle = (id: string) => {
    const before = ids;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length > TAGS_PER_ITEM) { toast.error(t("tooMany", { n: TAGS_PER_ITEM })); return; }
    setIds(next);
    start(async () => {
      const r = await setTagsOnItem(slug, itemId, next);
      if (r.error) { setIds(before); toast.error(r.error); }
    });
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setIds(selected); setQ(""); } }}>
      <PopoverTrigger asChild>
        {compact ? (
          <button type="button" aria-label={t("edit")} title={t("edit")}
            className="relative z-10 inline-grid h-[22px] min-w-[22px] place-items-center rounded-sm border border-dashed border-line-strong px-1 text-muted-foreground transition-colors hover:border-brand hover:text-brand-text focus-visible:border-brand data-[state=open]:border-brand data-[state=open]:text-brand-text">
            {selected.length ? <Plus className="size-3.5" /> : <span className="inline-flex items-center gap-1 px-0.5 text-[12px] font-semibold"><TagIcon className="size-3" />{t("add")}</span>}
          </button>
        ) : (
          <Button variant="outline" size="sm" className="justify-self-start"><TagIcon />{selected.length ? t("edit") : t("add")}</Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" onOpenAutoFocus={(e) => { if (all.length <= 7) e.preventDefault(); }}>
        {all.length > 7 && (
          <div className="border-b p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-8" autoComplete="off" data-1p-ignore />
          </div>
        )}
        {all.length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">{admin ? t("noneAdmin") : t("noneTeam")}</p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">{t("noMatch")}</p>
        ) : (
          <ul role="listbox" aria-multiselectable aria-label={t("title")} aria-busy={pending || undefined} className="max-h-72 overflow-y-auto p-1">
            {shown.map((tag) => {
              const on = ids.includes(tag.id);
              return (
                <li key={tag.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(tag.id)}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13.5px] transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                    <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-[4px] border", on ? "border-brand bg-brand text-primary-foreground" : "border-line-strong")}>
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TAG_CHIP[tag.color].dot)} />
                    <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
                    {!tag.public && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={t("teamOnly")} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {admin && (
          <div className="border-t p-1">
            <Link href={`/${slug}/admin#tags`} className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Settings2 className="size-3.5" />{t("manage")}
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
