"use client";

import { Ban, Check, MoreHorizontal, Pencil, RotateCcw, Trash2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import {
  approveCommentAction, approveItemAction, deleteCommentAction, deleteItemAction, editCommentAction, editItemAction, rejectItemAction, restoreItemAction,
  setBlockedAction, type ModState,
} from "@/lib/moderation-actions";
import { cn } from "@/lib/utils";
import { TranslateBar, TranslatedBody } from "@/components/ozvi/Translate";

/**
 * Editing and moderation on the item page: inline edit in place (no separate page), destructive
 * steps confirmed in an AlertDialog. Every rule is enforced again on the server.
 */

/** Ctrl/⌘ + Enter saves, Escape cancels: the same keys as the comment form. */
function editKeys(save: () => void, cancel: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  };
}

function useAct() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ModState>, ok?: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.error) { toast.error(r.error); return; }
    if (ok) toast.success(ok);
    after?.();
  });
  return [pending, run] as const;
}

/* ---------- Post ---------- */

const EditCtx = createContext<{ editing: boolean; setEditing: (v: boolean) => void }>({ editing: false, setEditing: () => {} });

/** Wraps the post so the menu, the view and the inline editor share one "editing" state. */
export function ItemEditScope({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  return <EditCtx.Provider value={{ editing, setEditing }}>{children}</EditCtx.Provider>;
}

/** The read-only view of the post (title, body), hidden while editing. */
export function WhenViewing({ children }: { children: React.ReactNode }) {
  return useContext(EditCtx).editing ? null : <>{children}</>;
}

export function ItemEditForm({ slug, itemId, title, body }: { slug: string; itemId: string; title: string; body: string }) {
  const { editing, setEditing } = useContext(EditCtx);
  const t = useTranslations("moderation");
  const [vTitle, setTitle] = useState(title);
  const [vBody, setBody] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) { setTitle(title); setBody(body); setError(null); requestAnimationFrame(() => titleRef.current?.focus()); }
  }, [editing, title, body]);
  if (!editing) return null;
  const cancel = () => setEditing(false);
  const save = () => start(async () => {
    const r = await editItemAction(slug, itemId, { title: vTitle, body: vBody });
    if (r.error) { setError(r.error); return; }
    setEditing(false);
    toast.success(t("saved"));
  });
  return (
    <form className="grid gap-4 rounded-xl border bg-surface p-4 shadow-xs sm:p-5" onKeyDown={editKeys(save, cancel)}
      onSubmit={(e) => { e.preventDefault(); save(); }} aria-label={t("editPost")}>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-t`}>{t("titleLabel")}</Label>
        <Input id={`${id}-t`} ref={titleRef} value={vTitle} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200}
          className="h-10 font-heading text-[17px] font-semibold" autoComplete="off" data-1p-ignore />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-b`}>{t("bodyLabel")}</Label>
        <MarkdownEditor id={`${id}-b`} slug={slug} value={vBody} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={10_000} className="min-h-[140px] text-[15px]" />
      </div>
      {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">{t("keysHint")}</span>
        <Button type="button" variant="outline" size="sm" onClick={cancel}>{t("cancel")}</Button>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>{pending ? t("saving") : t("save")}</Button>
      </div>
    </form>
  );
}

interface Person { id: string; name: string; blocked: boolean }

/** "…" menu on the post: edit, delete, and for the team block/unblock the author. */
export function ItemMenu({ slug, itemId, kind, canEdit, team, author, listHref }: {
  slug: string; itemId: string; kind: "idea" | "bug"; canEdit: boolean; team: boolean; author: Person | null; listHref: string;
}) {
  const t = useTranslations("moderation");
  const { setEditing } = useContext(EditCtx);
  const [confirm, setConfirm] = useState<null | "delete" | "block">(null);
  const [pending, run] = useAct();
  const router = useRouter();
  const editPicked = useRef(false);
  if (!canEdit && !(team && author)) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("menu")} className="text-muted-foreground"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48"
          onCloseAutoFocus={(e) => { if (editPicked.current) { e.preventDefault(); editPicked.current = false; } }}>
          {canEdit && <DropdownMenuItem onSelect={() => { editPicked.current = true; setEditing(true); }}><Pencil />{t("edit")}</DropdownMenuItem>}
          {canEdit && <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}><Trash2 />{t("delete")}</DropdownMenuItem>}
          {team && author && (
            <>
              {canEdit && <DropdownMenuSeparator />}
              {author.blocked
                ? <DropdownMenuItem onSelect={() => run(() => setBlockedAction(slug, author.id, false), t("unblocked", { name: author.name }))}><UserCheck />{t("unblockAuthor")}</DropdownMenuItem>
                : <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("block")}><Ban />{t("blockAuthor")}</DropdownMenuItem>}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Confirm open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)} pending={pending}
        title={t("deletePostTitle", { kind })} text={team ? t("deletePostTextTeam") : t("deletePostText")}
        confirm={t("delete")} busy={t("deleting")}
        onConfirm={() => run(() => deleteItemAction(slug, itemId), t("deletedToast"), () => { setConfirm(null); if (!team) router.push(listHref); })} />
      {author && <BlockConfirm slug={slug} person={author} open={confirm === "block"} onOpenChange={(o) => !o && setConfirm(null)} />}
    </>
  );
}

/* ---------- Comments ---------- */

/** One comment: header (server-rendered) with its menu, the text, and the inline editor. */
export function CommentContent({ slug, id, body, html, header, canEdit, canDelete, team, author, pending = null }: {
  slug: string; id: string; body: string; header: React.ReactNode; canEdit: boolean; canDelete: boolean; team: boolean; author: Person | null;
  /** Safe HTML of `body` rendered on the server (lib/markdown.ts). */
  html: string;
  /** Held for approval: the team sees approve/reject, the author a note. */
  pending?: "team" | "author" | null;
}) {
  const t = useTranslations("moderation");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "block">(null);
  const [busy, run] = useAct();
  const [saving, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const editPicked = useRef(false);
  const fieldId = useId();
  const showMenu = canEdit || canDelete || (team && author);

  const begin = () => { setValue(body); setError(null); setEditing(true); requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(body.length, body.length); }); };
  const cancel = () => setEditing(false);
  const save = () => start(async () => {
    const r = await editCommentAction(slug, id, value);
    if (r.error) { setError(r.error); return; }
    setEditing(false);
  });

  return (
    <>
      <div className="mb-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">{header}</div>
        {showMenu && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("commentMenu")} className="-mr-1.5 text-muted-foreground"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44"
              onCloseAutoFocus={(e) => { if (editPicked.current) { e.preventDefault(); editPicked.current = false; } }}>
              {canEdit && <DropdownMenuItem onSelect={() => { editPicked.current = true; begin(); }}><Pencil />{t("edit")}</DropdownMenuItem>}
              {canDelete && <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}><Trash2 />{t("delete")}</DropdownMenuItem>}
              {team && author && (
                <>
                  {(canEdit || canDelete) && <DropdownMenuSeparator />}
                  {author.blocked
                    ? <DropdownMenuItem onSelect={() => run(() => setBlockedAction(slug, author.id, false), t("unblocked", { name: author.name }))}><UserCheck />{t("unblockAuthor")}</DropdownMenuItem>
                    : <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("block")}><Ban />{t("blockAuthor")}</DropdownMenuItem>}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editing ? (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={editKeys(save, cancel)}>
          <label htmlFor={fieldId} className="sr-only">{t("commentLabel")}</label>
          <MarkdownEditor id={fieldId} ref={area} slug={slug} value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={5000} required className="min-h-[76px] text-[15px]" />
          {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">{t("keysHint")}</span>
            <Button type="button" variant="outline" size="sm" onClick={cancel}>{t("cancel")}</Button>
            <Button type="submit" size="sm" disabled={saving} aria-busy={saving || undefined}>{saving ? t("saving") : t("save")}</Button>
          </div>
        </form>
      ) : (
        <>
          <TranslatedBody id={id} className="max-w-none text-[15px]">
            <div className="oz-prose oz-md max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: html }} />
          </TranslatedBody>
          <TranslateBar id={id} className="mt-2" />
        </>
      )}
      {!editing && pending === "author" && <p className="mt-2 text-[13px] text-muted-foreground">{t("commentPendingAuthor")}</p>}
      {!editing && pending === "team" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed pt-3">
          <span className="basis-full text-[13px] text-muted-foreground">{t("commentPendingTeam")}</span>
          <Button size="sm" disabled={busy} aria-busy={busy || undefined} onClick={() => run(() => approveCommentAction(slug, id), t("commentApprovedToast"))}>
            <Check />{t("approveComment")}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("delete")}>{t("reject")}</Button>
        </div>
      )}
      <Confirm open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)} pending={busy}
        title={pending === "team" ? t("rejectCommentTitle") : t("deleteCommentTitle")} text={pending === "team" ? t("rejectCommentText") : t("deleteCommentText")} confirm={t("delete")} busy={t("deleting")}
        onConfirm={() => run(() => deleteCommentAction(slug, id), undefined, () => setConfirm(null))} />
      {author && <BlockConfirm slug={slug} person={author} open={confirm === "block"} onOpenChange={(o) => !o && setConfirm(null)} />}
    </>
  );
}

/* ---------- Queue and tombstones ---------- */

/** Team: approve or reject a queued idea (reject = soft delete with an optional message for the author). */
export function QueueActions({ slug, itemId }: { slug: string; itemId: string }) {
  const t = useTranslations("moderation");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, run] = useAct();
  const id = useId();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => approveItemAction(slug, itemId), t("approvedToast"))}>
        <Check />{t("approve")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>{t("reject")}</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rejectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("rejectText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={id}>{t("rejectReason")} <span className="font-normal text-muted-foreground">{t("optional")}</span></Label>
            <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder={t("rejectPlaceholder")} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} aria-busy={pending || undefined}
              onClick={() => run(() => rejectItemAction(slug, itemId, reason), t("rejectedToast"), () => setOpen(false))}>
              {pending ? t("rejecting") : t("reject")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RestoreButton({ slug, itemId }: { slug: string; itemId: string }) {
  const t = useTranslations("moderation");
  const [pending, run] = useAct();
  return (
    <Button size="sm" variant="outline" disabled={pending} aria-busy={pending || undefined}
      onClick={() => run(() => restoreItemAction(slug, itemId), t("restoredToast"))}>
      <RotateCcw />{pending ? t("restoring") : t("restore")}
    </Button>
  );
}

/** Admin people list: block or unblock a board member. */
export function BlockToggle({ slug, person }: { slug: string; person: Person }) {
  const t = useTranslations("moderation");
  const [open, setOpen] = useState(false);
  const [pending, run] = useAct();
  if (person.blocked) {
    return (
      <Button size="sm" variant="ghost" disabled={pending} aria-busy={pending || undefined}
        onClick={() => run(() => setBlockedAction(slug, person.id, false), t("unblocked", { name: person.name }))}>
        <UserCheck />{t("unblock")}
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}><Ban />{t("block")}</Button>
      <BlockConfirm slug={slug} person={person} open={open} onOpenChange={setOpen} />
    </>
  );
}

function BlockConfirm({ slug, person, open, onOpenChange }: { slug: string; person: Person; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("moderation");
  const [pending, run] = useAct();
  return (
    <Confirm open={open} onOpenChange={onOpenChange} pending={pending} title={t("blockTitle")} text={t("blockText", { name: person.name })}
      confirm={t("block")} busy={t("blocking")}
      onConfirm={() => run(() => setBlockedAction(slug, person.id, true), t("blockedToast", { name: person.name }), () => onOpenChange(false))} />
  );
}

function Confirm({ open, onOpenChange, title, text, confirm, busy, pending, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; text: string; confirm: string; busy: string; pending: boolean; onConfirm: () => void;
}) {
  const t = useTranslations("moderation");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
          {/* A plain button (not AlertDialogAction): the dialog stays open until the server answers. */}
          <Button variant="destructive" disabled={pending} aria-busy={pending || undefined} onClick={onConfirm} className={cn(pending && "cursor-progress")}>
            {pending ? busy : confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
