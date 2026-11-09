"use client";

import { Merge, Pencil, Plus } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TagChip } from "@/components/ozvi/tags";
import { createTagAction, deleteTagAction, mergeTagAction, updateTagAction, type TagState } from "@/lib/tag-actions";
import { TAG_CHIP, TAG_COLORS, TAG_NAME_MAX, type Tag, type TagColor } from "@/lib/tag-rules";
import { cn } from "@/lib/utils";
import { ConfirmAction, hint, noFill, Result } from "./settings";

/** Admin: the project's tags — create, rename, recolour, public/team-only, merge, delete. */
export function TagsAdmin({ slug, tags, usage }: { slug: string; tags: Tag[]; usage: Record<string, number> }) {
  const t = useTranslations("admin.tags");
  return (
    <div className="grid gap-4">
      {tags.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-surface/60 px-5 py-6 text-center text-[14px] text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-surface">
          {tags.map((tag) => <TagRow key={`${tag.id}-${tag.name}-${tag.color}-${tag.public}`} slug={slug} tag={tag} others={tags.filter((x) => x.id !== tag.id)} used={usage[tag.id] ?? 0} />)}
        </ul>
      )}
      <NewTag slug={slug} />
    </div>
  );
}

function TagRow({ slug, tag, others, used }: { slug: string; tag: Tag; others: Tag[]; used: number }) {
  const t = useTranslations("admin.tags");
  const [editing, setEditing] = useState(false);
  return (
    <li className="grid gap-3 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <TagChip tag={tag} />
          <span className="text-[13px] text-muted-foreground">
            {tag.public ? t("public") : t("teamOnly")} · <span data-num>{t("used", { n: used })}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}><Pencil />{t("edit")}</Button>
          {others.length > 0 && <MergeTag slug={slug} tag={tag} others={others} used={used} />}
          <ConfirmAction variant="ghost" trigger={t("delete")} title={t("deleteTitle", { name: tag.name })}
            text={used ? t("deleteText", { n: used }) : t("deleteUnused")} confirm={t("deleteConfirm")} pending={t("deleting")}
            run={async () => { const r = await deleteTagAction(slug, tag.id); if (r.error) toast.error(r.error); else toast(r.ok); }} />
        </div>
      </div>
      {editing && <TagForm slug={slug} tag={tag} onDone={() => setEditing(false)} />}
    </li>
  );
}

function MergeTag({ slug, tag, others, used }: { slug: string; tag: Tag; others: Tag[]; used: number }) {
  const t = useTranslations("admin.tags");
  const tf = useTranslations("forms");
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const into = others.find((o) => o.id === target);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTarget(""); }}>
      <DialogTrigger asChild><Button type="button" variant="ghost" size="sm"><Merge />{t("merge")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("mergeTitle", { name: tag.name })}</DialogTitle>
          <DialogDescription>{t("mergeText", { n: used })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`merge-${tag.id}`} className="text-[14px] font-semibold">{t("mergeInto")}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id={`merge-${tag.id}`} className="w-full bg-surface"><SelectValue placeholder={t("mergePick")} /></SelectTrigger>
            <SelectContent>
              {others.map((o) => <SelectItem key={o.id} value={o.id}>{o.public ? o.name : `${o.name} · ${t("teamOnly")}`}</SelectItem>)}
            </SelectContent>
          </Select>
          {into && into.public !== tag.public && <p className={hint}>{into.public ? t("mergeToPublic") : t("mergeToTeam")}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">{tf("keep")}</Button></DialogClose>
          <Button type="button" disabled={!into || pending} aria-busy={pending || undefined}
            onClick={() => start(async () => {
              const r = await mergeTagAction(slug, tag.id, target);
              if (r.error) { toast.error(r.error); return; }
              toast(r.ok); setOpen(false);
            })}>
            {into ? t("mergeConfirm", { name: into.name }) : t("merge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTag({ slug }: { slug: string }) {
  const t = useTranslations("admin.tags");
  const [open, setOpen] = useState(false);
  if (!open) return <div><Button type="button" variant="outline" onClick={() => setOpen(true)}><Plus />{t("new")}</Button></div>;
  return <TagForm slug={slug} onDone={() => setOpen(false)} />;
}

/** Create (no `tag`) or edit one tag. Colour = a theme token, shown as a live chip preview. */
function TagForm({ slug, tag, onDone }: { slug: string; tag?: Tag; onDone: () => void }) {
  const t = useTranslations("admin.tags");
  const s = useTranslations("admin.settings");
  const id = useId();
  const [state, action, pending] = useActionState(
    (p: TagState, f: FormData) => (tag ? updateTagAction(slug, tag.id, p, f) : createTagAction(slug, p, f)), {});
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState<TagColor>(tag?.color ?? "neutral");
  const [pub, setPub] = useState(tag?.public ?? true);
  const handled = useRef<TagState | null>(null);
  useEffect(() => {
    if (!state.ok || handled.current === state) return;
    handled.current = state;
    toast(state.ok);
    onDone();
  }, [state, onDone]);
  return (
    <form action={action} className={cn("grid gap-4", tag ? "rounded-lg border border-dashed p-4" : "rounded-xl border bg-surface p-5 sm:p-6")}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`} className="text-[14px] font-semibold">{t("name")}</Label>
          <Input id={`${id}-name`} name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={TAG_NAME_MAX}
            placeholder={t("namePlaceholder")} autoFocus {...noFill} />
        </div>
        <div className="flex h-9 items-center sm:justify-end"><TagChip tag={{ name: name.trim() || t("preview"), color, public: pub }} /></div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[14px] font-semibold">{t("color")}</legend>
        <input type="hidden" name="color" value={color} />
        <div role="radiogroup" aria-label={t("color")} className="flex flex-wrap gap-1.5">
          {TAG_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} onClick={() => setColor(c)}
              className={cn("inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium transition-colors hover:bg-muted",
                color === c ? "border-brand bg-brand-soft text-foreground ring-1 ring-brand-line" : "border-line-strong text-muted-foreground")}>
              <span aria-hidden className={cn("size-2.5 rounded-full", TAG_CHIP[c].dot)} />{t(`colors.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <Label htmlFor={`${id}-public`} className="text-[14px] font-semibold">{t("publicLabel")}</Label>
          <p className={hint}>{pub ? t("publicOn") : t("publicOff")}</p>
        </div>
        <Switch id={`${id}-public`} name="public" checked={pub} onCheckedChange={setPub} className="mt-0.5" />
      </div>
      <Result error={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? s("saving") : tag ? t("save") : t("create")}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>{t("cancel")}</Button>
      </div>
    </form>
  );
}
