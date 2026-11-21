"use client";

import { Sparkles, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { mergeInto, setAssignee, setStatus, unmergeItem } from "@/lib/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { aiSummarizeItem } from "@/lib/changelog-actions";
import { githubLink, githubUnlink, type ActState } from "@/lib/integration-actions";
import { useTranslations } from "next-intl";
import { routeText, type Kind } from "@/lib/route";
import { cn } from "@/lib/utils";
import { StatusMark } from "./route";

/**
 * Moves the report along its route. Each stop is a row; custom sub-statuses sit indented under their
 * stop (choosing one also moves the report to that stop). The version field appears for "fixed".
 */
export function RouteControl({ slug, itemId, kind, status, version, statuses, subs = [], sub = null }: {
  slug: string; itemId: string; kind: Kind; status: string; version: string | null; statuses: readonly string[];
  subs?: { id: string; stage: string; label: string }[]; sub?: string | null;
}) {
  const [value, setValue] = useState(status);
  const [subValue, setSub] = useState<string | null>(sub);
  const [ver, setVer] = useState(version ?? "");
  const [mail, setMail] = useState(true);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const dirty = value !== status || subValue !== sub || (kind === "bug" && value === "fixed" && ver !== (version ?? ""));
  const tf = useTranslations("forms");
  const t = useTranslations("forms.team");
  const tr = useTranslations("route");
  const label = (s: string) => routeText(tr, "label", s);
  const subName = (id: string | null) => subs.find((x) => x.id === id)?.label;
  const target = subValue ? `${label(value)} · ${subName(subValue)}` : label(value);

  const save = () => start(async () => {
    const f = new FormData();
    f.set("status", value);
    f.set("sub", subValue ?? "");
    f.set("fixedInVersion", value === "fixed" ? ver : "");
    f.set("notify", mail ? "1" : "0");
    f.set("note", note);
    await setStatus(slug, itemId, f);
    toast.success(t("statusToast", { s: target }), value !== status && mail ? { description: kind === "bug" ? t("notifyBug") : t("notifyIdea") } : undefined);
    setNote("");
    setMail(true);
  });

  const row = "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] font-medium transition-colors hover:bg-muted";
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={t("status")} className="grid gap-0.5">
        {statuses.map((s) => {
          const own = subs.filter((x) => x.stage === s);
          const picked = value === s && !subValue;
          return (
            <div key={s} className="grid gap-0.5">
              <button type="button" role="radio" aria-checked={picked} onClick={() => { setValue(s); setSub(null); }}
                className={cn(row,
                  picked && "bg-brand-soft text-foreground ring-1 ring-brand-line",
                  value === s && subValue && "text-foreground",
                  s === status && value !== s && "text-foreground",
                  s !== status && value !== s && "text-muted-foreground",
                )}>
                <StatusMark kind={kind} status={s} />
                <span className="flex-1">{label(s)}</span>
                {s === status && !sub && <span className="text-[11.5px] font-medium text-muted-foreground">{t("now")}</span>}
              </button>
              {own.map((x) => {
                const on = value === s && subValue === x.id;
                return (
                  <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => { setValue(s); setSub(x.id); }}
                    className={cn(row, "h-8 pl-[34px] text-[13.5px]",
                      on ? "bg-brand-soft text-foreground ring-1 ring-brand-line" : x.id === sub ? "text-foreground" : "text-muted-foreground")}>
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", on || x.id === sub ? "bg-foreground" : "bg-line-strong")} />
                    <span className="min-w-0 flex-1 truncate">{x.label}</span>
                    {x.id === sub && <span className="text-[11.5px] font-medium text-muted-foreground">{t("now")}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {kind === "bug" && value === "fixed" && (
        <div className="grid gap-1.5">
          <Label htmlFor="fixed-version">{t("fixedIn")}</Label>
          <Input id="fixed-version" value={ver} onChange={(e) => setVer(e.target.value)} placeholder={t("versionPh")} maxLength={40} autoComplete="off" data-1p-ignore />
        </div>
      )}
      {value !== status && (
        // Who hears about the move, said before it happens; the team can add its own words or move quietly.
        <div className="grid gap-2 rounded-md border bg-wash/60 p-2.5 animate-in fade-in-0">
          <label className="flex items-start gap-2 text-[13.5px] font-medium">
            <Checkbox checked={mail} onCheckedChange={(v) => setMail(v === true)} className="mt-0.5" />
            <span className="grid gap-0.5">{t("sendMail")}<span className="text-[12.5px] font-normal text-muted-foreground">{kind === "bug" ? t("mailBug") : t("mailIdea")}</span></span>
          </label>
          <div className="grid gap-1">
            <Label htmlFor="status-note" className="text-[13px]">{t("note")}</Label>
            <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={5000} className="min-h-14 text-[13.5px]" />
            <p className="text-[12px] text-muted-foreground">{mail ? t("noteHint") : t("noteNoMail")}</p>
          </div>
        </div>
      )}
      {dirty && (
        <Button onClick={save} disabled={pending} aria-busy={pending || undefined} className="h-auto min-h-9 py-2 whitespace-normal animate-in fade-in-0 slide-in-from-top-1">
          {pending ? tf("saving") : t("moveTo", { s: target })}
        </Button>
      )}
    </div>
  );
}

const NOBODY = "none";

/** Who handles the item: a team member, or nobody. "Assign to me" in one click for the common case. */
export function AssigneeControl({ slug, itemId, assignee, me, team }: {
  slug: string; itemId: string; assignee: string | null; me: string; team: { id: string; label: string; former?: boolean }[];
}) {
  const t = useTranslations("board.item");
  const [value, setValue] = useState(assignee ?? NOBODY);
  const [pending, start] = useTransition();
  const save = (next: string) => {
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setAssignee(slug, itemId, next === NOBODY ? "" : next);
      if (r.error) { setValue(prev); toast.error(r.error); return; }
      if (r.unchanged) return;
      const who = team.find((x) => x.id === next)?.label;
      toast.success(who ? t("assigned", { who }) : t("unassigned"));
    });
  };
  return (
    <div className="grid gap-2">
      <Select value={value} onValueChange={save} disabled={pending}>
        <SelectTrigger aria-label={t("assignee")} className="h-9 w-full bg-surface"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NOBODY}>{t("nobody")}</SelectItem>
          {/* Former team members only while this item is theirs: it shows who has it, and it can be handed on. */}
          {team.filter((x) => !x.former || x.id === assignee).map((x) => <SelectItem key={x.id} value={x.id}>{x.former ? t("former", { who: x.label }) : x.id === me ? t("you", { who: x.label }) : x.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {value !== me && (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start px-2" disabled={pending} onClick={() => save(me)}>{t("takeIt")}</Button>
      )}
    </div>
  );
}

export function GithubBox({ slug, itemId, links, enabled }: {
  slug: string; itemId: string; enabled: boolean;
  links: { id: string; ref: string; url: string; title: string | null; state: string }[];
}) {
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => githubLink(slug, itemId, p, f), {});
  const [unlinking, start] = useTransition();
  const t = useTranslations("forms.team");
  return (
    <div className="grid gap-3">
      {links.length > 0 && (
        <ul className="grid gap-1.5">
          {links.map((l) => (
            <li key={l.id} className="flex min-w-0 items-center gap-2 text-[13.5px]">
              <span className={cn("size-2 shrink-0 rounded-full", l.state === "closed" ? "bg-st-done" : "bg-st-work")} aria-hidden />
              <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 max-w-[65%] truncate font-semibold hover:underline" title={l.ref}>{l.ref}</a>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.title}</span>
              <Button variant="ghost" size="icon-xs" aria-label={t("unlink", { ref: l.ref })} disabled={unlinking}
                onClick={() => start(async () => { await githubUnlink(slug, l.id); toast(t("unlinked", { ref: l.ref })); })}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {enabled && (
        <form action={action} className="grid gap-2">
          <Input name="issue" aria-label={t("issueLabel")} placeholder={t("issuePlaceholder")} autoComplete="off" data-1p-ignore />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" name="create" value="0" disabled={pending} className="flex-1">{t("link")}</Button>
            <Button variant="outline" size="sm" name="create" value="1" disabled={pending} formNoValidate className="flex-1">{t("createIssue")}</Button>
          </div>
          {state.error && <p className="text-[13px] font-medium text-destructive" role="alert">{state.error}</p>}
          {state.ok && <p className="text-[13px] font-medium text-success" role="status">{state.ok}</p>}
        </form>
      )}
    </div>
  );
}

export function MergeBox({ slug, itemId, number, suggestion, kind, candidates = [] }: {
  slug: string; itemId: string; number: number; suggestion?: number; kind: Kind;
  /**
   * Similar items, each with the merge that makes sense: `into` = this one is the duplicate ("Merge into #n"),
   * otherwise the other one is ("Merge #n here"). The original is the one with more votes, then the older one
   * (the review found suggestions offering to merge a planned idea with votes into a new one).
   */
  candidates?: { id: string; number: number; title: string; meta: string; into: boolean }[];
}) {
  const [state, action, pending] = useActionState((p: { error?: string }, f: FormData) => mergeInto(slug, itemId, p, f), {});
  const [hereState, hereAction, herePending] = useActionState((p: { error?: string }, f: FormData) => mergeInto(slug, String(f.get("source")), p, f), {});
  const [target, setTarget] = useState("");
  const [open, setOpen] = useState(false);
  const [here, setHere] = useState<{ id: string; number: number } | null>(null);
  const n = target.replace(/^#/, "");
  const tf = useTranslations("forms");
  const t = useTranslations("forms.team");
  const error = state.error ?? hereState.error;
  return (
    <div className="grid gap-2">
      {candidates.length > 0 && (
        <ul className="grid gap-1.5">
          {candidates.map((c) => (
            <li key={c.number} className="flex items-start justify-between gap-2 text-[13.5px]">
              <span className="min-w-0">
                <a href={`/${slug}/i/${c.number}`} className="font-medium hover:underline">#{c.number} {c.title}</a>
                <span className="text-muted-foreground"> · {c.meta}</span>
              </span>
              {c.into
                ? <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[12.5px]"
                    onClick={() => { setTarget(`#${c.number}`); setOpen(true); }}>{t("mergeInto", { n: String(c.number) })}</Button>
                : <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[12.5px]"
                    onClick={() => setHere({ id: c.id, number: c.number })}>{t("mergeHere", { n: String(c.number) })}</Button>}
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (/^\d+$/.test(n)) setOpen(true); }}>
        <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={suggestion ? `#${suggestion}` : "#12"}
          aria-label={t("mergeLabel")} inputMode="numeric" autoComplete="off" data-1p-ignore data-lpignore="true" className="w-24" />
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!/^#?\d+$/.test(target)}>{t("merge")}</Button>
      </form>
      {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mergeTitle", { n })}</DialogTitle>
            <DialogDescription>
              {kind === "idea" ? t("mergeIdea", { n }) : t("mergeBug", { n })}
            </DialogDescription>
          </DialogHeader>
          <form action={action}>
            <input type="hidden" name="target" value={n} />
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">{tf("keep")}</Button></DialogClose>
              <Button type="submit" variant="destructive" disabled={pending}>{pending ? t("merging") : t("mergeInto", { n })}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!here} onOpenChange={(o) => { if (!o) setHere(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mergeHereTitle", { n: String(here?.number ?? "") })}</DialogTitle>
            <DialogDescription>
              {kind === "idea" ? t("mergeHereIdea", { n: String(here?.number ?? "") }) : t("mergeHereBug", { n: String(here?.number ?? "") })}
            </DialogDescription>
          </DialogHeader>
          <form action={hereAction}>
            <input type="hidden" name="source" value={here?.id ?? ""} />
            <input type="hidden" name="target" value={String(number)} />
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">{tf("keep")}</Button></DialogClose>
              <Button type="submit" variant="destructive" disabled={herePending}>{herePending ? t("merging") : t("mergeHere", { n: String(here?.number ?? "") })}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Team, on a merged item: undo the merge ("Oddeliť"); the confirm names both items and says the votes stay. */
export function UnmergeBox({ slug, itemId, number, into, kind }: { slug: string; itemId: string; number: number; into: number; kind: Kind }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tf = useTranslations("forms");
  const t = useTranslations("forms.team");
  const n = String(number), i = String(into);
  return (
    <div className="grid gap-1.5">
      <p className="text-[13px] text-muted-foreground">{t("unmergeHint", { into: i })}</p>
      <div><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>{t("unmerge")}</Button></div>
      {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("unmergeTitle", { n, into: i })}</DialogTitle>
            <DialogDescription>{kind === "idea" ? t("unmergeIdea", { n, into: i }) : t("unmergeBug", { n, into: i })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{tf("keep")}</Button></DialogClose>
            <Button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => start(async () => {
              setError(null);
              const r = await unmergeItem(slug, itemId);
              if (r?.error) { setError(r.error); setOpen(false); }
            })}>{pending ? t("unmerging") : t("unmergeConfirm", { n })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Team-only, on demand: a short AI summary of a long thread. Not stored; shown as plain text. */
export function AiSummaryBox({ slug, itemId }: { slug: string; itemId: string }) {
  const [text, setText] = useState<string | null>(null);
  const t = useTranslations("forms.team");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      {text ? <>
          <p className="text-[13.5px] whitespace-pre-wrap" data-ai-generated="true">{text}</p>
          {/* EU AI Act art. 50: machine-written, not yet checked by anybody. */}
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Sparkles aria-hidden className="size-3.5 shrink-0" />{t("aiSummaryLabel")}</p>
        </>
        : <p className="text-[13px] text-muted-foreground">{t("aiHint")}</p>}
      <Button variant="outline" size="sm" disabled={pending} aria-busy={pending || undefined}
        onClick={() => start(async () => {
          const r = await aiSummarizeItem(slug, itemId);
          if (r.error) toast.error(r.error);
          if (r.text) setText(r.text);
        })}>
        <Sparkles />{pending ? t("summarizing") : text ? t("summarizeAgain") : t("summarize")}
      </Button>
    </div>
  );
}
