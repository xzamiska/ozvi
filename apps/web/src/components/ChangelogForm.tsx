"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { StatusMark } from "@/components/ozvi/route";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "./MarkdownEditor";
import { aiDraftChangelog, deleteDraft, saveChangelog, type ChangelogState } from "@/lib/changelog-actions";
import { useTranslations } from "next-intl";
import { routeText } from "@/lib/route";
import { cn } from "@/lib/utils";

interface Candidate { id: string; number: number; kind: "bug" | "idea"; title: string; status: string; votes: number }

export function ChangelogForm({ slug, id, initial, candidates, published, ai, notice }: {
  slug: string; id: string | null;
  /** Shown above the title (release draft / AI review note). */
  notice?: React.ReactNode;
  initial: { title: string; body: string; itemIds: string[]; ai?: boolean };
  candidates: Candidate[]; published: boolean; ai: boolean;
}) {
  const [state, action, pending] = useActionState<ChangelogState, FormData>((p, f) => saveChangelog(slug, id, p, f), {});
  const tf = useTranslations("forms");
  const t = useTranslations("forms.changelog");
  const tr = useTranslations("route");
  const votesLabel = (n: number) => t("votes", { count: n });
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial.itemIds));
  const [aiError, setAiError] = useState<string>();
  // Once AI wrote any of the text, the entry carries the AI label (EU AI Act art. 50), even after edits.
  const [aiUsed, setAiUsed] = useState(!!initial.ai);
  const [drafting, startDraft] = useTransition();
  const [deleting, startDelete] = useTransition();
  const chosen = candidates.filter((c) => picked.has(c.id) && c.kind === "idea");
  const votes = chosen.reduce((s, c) => s + c.votes, 0);

  const toggle = (cid: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(cid); else n.delete(cid); return n; });
  const draft = () => startDraft(async () => {
    const r = await aiDraftChangelog(slug, candidates.filter((c) => picked.has(c.id) && c.kind === "idea").map((c) => c.id));
    if (r.error) return setAiError(r.error);
    setAiError(undefined);
    if (r.title || r.body) setAiUsed(true);
    if (r.title) setTitle(r.title);
    if (r.body) setBody(r.body);
  });

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
      {aiUsed && <input type="hidden" name="ai" value="1" />}
      <section aria-labelledby="cl-items" className="grid gap-3 lg:sticky lg:top-24 lg:order-2">
        <div>
          <h2 id="cl-items" className="font-heading text-[17px] font-bold tracking-tight">{t("shipped")}</h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {published ? t("linkedPublished") : t("linkedDraft")}
          </p>
        </div>
        {candidates.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-surface/60 px-4 py-6 text-center text-[14px] text-muted-foreground">
            {t("noCandidates")}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-xl border bg-surface">
            {candidates.map((c) => (
              <li key={c.id}>
                <div className={cn("grid grid-cols-[16px_minmax(0,1fr)] items-start gap-3 px-4 py-3 transition-colors hover:bg-wash", picked.has(c.id) && "bg-brand-soft/60")}>
                  <Checkbox id={`cl-${c.id}`} name="items" value={c.id} checked={picked.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} className="mt-0.5" />
                  <Label htmlFor={`cl-${c.id}`} className="grid cursor-pointer gap-1 font-normal">
                    <span className="text-[14px] leading-snug font-semibold">{c.title}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                      <span data-num>#{c.number}</span>
                      <span className="inline-flex items-center gap-1.5"><StatusMark kind={c.kind} status={c.status} className="size-3.5" />{routeText(tr, "label", c.status)}</span>
                      {c.kind === "idea" ? <span className="tabular-nums">{votesLabel(c.votes)}</span> : <span>{t("bugPrivate")}</span>}
                    </span>
                  </Label>
                </div>
              </li>
            ))}
          </ul>
        )}
        {ai && (
          <div className="grid gap-2">
            <Button type="button" variant="outline" onClick={draft} disabled={drafting || picked.size === 0} aria-busy={drafting || undefined}>
              <Sparkles />{drafting ? t("drafting") : t("aiDraft")}
            </Button>
            <p className="text-[13px] leading-snug text-muted-foreground">
              {picked.size === 0 ? t("pickFirst") : t("aiNote")}
            </p>
            {aiError && <p role="alert" className="text-[13px] font-medium text-destructive">{aiError}</p>}
          </div>
        )}
      </section>

      <div className="grid min-w-0 gap-6 lg:order-1">
        {notice}
        <div className="grid gap-2">
          <Label htmlFor="cl-title" className="text-[14px] font-semibold">{t("title")}</Label>
          <Input id="cl-title" name="title" required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")} autoComplete="off" data-1p-ignore className="h-11 max-w-[68ch] bg-surface text-[16px]" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cl-body" className="text-[14px] font-semibold">{t("body")}</Label>
          <p className="-mt-1 text-[13px] text-muted-foreground" id="cl-body-hint">{t("bodyHint")}</p>
          <MarkdownEditor headings slug={slug} id="cl-body" name="body" rows={12} maxLength={20_000} value={body} onChange={(e) => setBody(e.target.value)}
            aria-describedby="cl-body-hint" boxClassName="max-w-[68ch]" className="min-h-[260px] text-[15px] leading-relaxed" />
          {aiUsed && (
            <p className="flex max-w-[68ch] items-start gap-2 text-[13px] text-muted-foreground">
              <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0" />{published ? t("aiLabelPublished") : t("aiLabelDraft")}
            </p>
          )}
        </div>

        <div aria-live="polite">
          {state.error && <p role="alert" className="text-[14px] font-medium text-destructive">{state.error}</p>}
          {state.ok && <p role="status" className="text-[14px] font-medium text-success">{state.ok}</p>}
        </div>

        <div className="grid gap-3 border-t pt-6">
          {!published && (
            <p className="max-w-[68ch] text-[13.5px] text-muted-foreground">
              {chosen.length === 0
                ? t("publishNoItems")
                : <>{chosen.length === 1 ? t("publishOne") : t("publishMany", { n: chosen.length })} <span className="font-medium text-foreground">{t("total", { votes: votesLabel(votes) })}</span>.</>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!published && (
              <Button type="submit" size="lg" name="intent" value="publish" disabled={pending} aria-busy={pending || undefined}>
                {pending ? tf("saving") : votes > 0 ? t("publishNotify") : t("publish")}
              </Button>
            )}
            <Button type="submit" size="lg" variant={published ? "default" : "outline"} name="intent" value="save" disabled={pending}>
              {published ? t("saveChanges") : t("saveDraft")}
            </Button>
            {id && !published && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="ghost" size="lg" className="text-destructive hover:text-destructive sm:ml-auto"><Trash2 />{t("discard")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("discardTitle")}</DialogTitle>
                    <DialogDescription>{t("discardText", { title: title || initial.title })}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">{tf("keep")}</Button></DialogClose>
                    <Button type="button" variant="destructive" disabled={deleting} aria-busy={deleting || undefined}
                      onClick={() => startDelete(() => deleteDraft(slug, id))}>
                      {deleting ? t("discarding") : t("discard")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
