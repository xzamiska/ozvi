"use client";

import { Camera, Check, GitMerge, GitPullRequestArrow, Lock, Mail, MonitorSmartphone, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { StatusMark } from "@/components/ozvi/route";
import { routeText } from "@/lib/route";
import { cn } from "@/lib/utils";

/**
 * The team's side of a board, for the landing: the bug queue and one report open, working on local
 * state. Pick a report, filter the queue, merge the similar report, add a team note, move it along
 * the route and tell the author. Every block mirrors a real screen: capture (BugCapture), similar
 * items (MergeBox), team note, GitHub links (GithubBox) and the route control (RouteControl).
 * The hero shows it as a still (wrapped in `inert`).
 */
type Status = "new" | "confirmed" | "in_progress" | "fixed" | "verified";
const STOPS: Status[] = ["new", "confirmed", "in_progress", "fixed", "verified"];
type Report = { n: number; status: Status; answered: boolean; browser: string; path: string; error: "export" | "calendar" | null; similar?: boolean; pr?: boolean };
const START: Report[] = [
  { n: 131, status: "new", answered: false, browser: "Firefox 133 · Windows", path: "/export", error: "export" },
  { n: 128, status: "in_progress", answered: false, browser: "Chrome 141 · macOS", path: "/kalendar/2026-11-14", error: "calendar", similar: true, pr: true },
  { n: 127, status: "confirmed", answered: true, browser: "Safari 19 · iOS", path: "/prihlasenie", error: null },
];
const OTHERS = 38; // the rest of "All" in the sample, not listed
type Filter = "new" | "unanswered" | "all";
const FILTERS: Filter[] = ["new", "unanswered", "all"];

export function TeamDesk() {
  const t = useTranslations("landing");
  const tr = useTranslations("route");
  const titles = t.raw("product.team.queue") as string[];
  const reporters = t.raw("product.team.reporters") as string[];
  const labels = t.raw("product.team.filters") as [string, string][];
  const [items, setItems] = useState<Report[]>(START);
  const [open, setOpen] = useState(128);
  const [filter, setFilter] = useState<Filter>("all");
  const [merged, setMerged] = useState(false);
  const [notes, setNotes] = useState<Record<number, string[]>>({});
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  // The sample note is the 128's first one; language switched: start over.
  useEffect(() => { setNotes({ 128: [t("product.team.note")] }); setSent(null); }, [t]);

  const r = { borderRadius: "var(--oz-radius)" };
  const chip = "inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5 text-[11.5px] text-muted-foreground";
  const idx = (n: number) => START.findIndex((x) => x.n === n);
  const matches = (x: Report, f: Filter) => f === "all" || (f === "new" ? x.status === "new" : !x.answered);
  const shown = items.filter((x) => matches(x, filter));
  const cur = items.find((x) => x.n === open) ?? items[0]!;
  const update = (patch: Partial<Report>) => setItems((xs) => xs.map((x) => (x.n === cur.n ? { ...x, ...patch } : x)));
  const label = (s: Status) => routeText(tr, "label", s);

  return (
    <div className="flex h-[520px] flex-col max-md:h-auto">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-surface px-4">
        <b className="font-heading text-[14.5px] font-semibold">{t("product.team.title")}</b>
        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Lock className="size-3" />{t("product.team.private")}</span>
        <span role="group" aria-label={t("product.team.filterLabel")} className="ml-auto hidden gap-1 sm:flex">
          {FILTERS.map((f, i) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} style={r}
              className={cn("inline-flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium", filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {labels[i]![0]}<span data-num className="tabular-nums opacity-70">{items.filter((x) => matches(x, f)).length + (f === "all" ? OTHERS : 0)}</span>
            </button>
          ))}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[200px_minmax(0,1fr)]">
        {/* queue */}
        <ul className="hidden divide-y overflow-y-auto border-r bg-surface md:block">
          {shown.map((b) => (
            <li key={b.n}>
              <button type="button" onClick={() => { setOpen(b.n); setSent(null); setDraft(""); }} aria-current={b.n === cur.n ? "true" : undefined}
                className={cn("grid w-full gap-1 px-3.5 py-3 text-left hover:bg-wash", b.n === cur.n && "bg-wash shadow-[inset_2px_0_0_var(--oz-accent)]")}>
                <span className="flex items-center justify-between gap-2">
                  <span data-num className="text-[13px] font-extrabold tabular-nums">#{b.n}</span>
                  <StatusMark kind="bug" status={b.status} className="size-3.5" />
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-snug font-medium">{titles[idx(b.n)]}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3.5 py-6 text-[12.5px] leading-snug text-muted-foreground">{t("product.team.emptyFilter")}</li>}
        </ul>

        {/* the report, open */}
        <div className="min-w-0 overflow-y-auto p-4">
          <p className="flex items-baseline gap-2">
            <span data-num className="text-[18px] leading-none font-extrabold tracking-tight">#{cur.n}</span>
            <span className="truncate text-[14.5px] font-semibold">{titles[idx(cur.n)]}</span>
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">{reporters[idx(cur.n)]}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={chip}><Camera className="size-3" />{t("product.team.shot")}</span>
            <span className={cn(chip, "font-mono")}>v2.14.0</span>
            <span className={chip}><MonitorSmartphone className="size-3" />{cur.browser}</span>
            <span className={cn(chip, "font-mono")}>{cur.path}</span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 rounded-md border bg-surface px-2.5 py-2 text-[11.5px] leading-snug" style={r}>
            {cur.error
              ? <><TriangleAlert className="mt-px size-3.5 shrink-0 text-destructive" /><span className="min-w-0 font-mono break-words">{cur.error === "calendar" ? t("product.team.console") : "Error: request timed out after 30000 ms · export.ts:41"}</span></>
              : <><Check className="mt-px size-3.5 shrink-0 text-success" /><span className="min-w-0 text-muted-foreground">{t("product.team.noErrors")}</span></>}
          </p>

          {cur.similar && (
            <div className="mt-3 flex items-center gap-2.5 border bg-surface px-3 py-2 text-[12.5px]" style={r}>
              <GitMerge className={cn("size-3.5 shrink-0", merged ? "text-success" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1 truncate">{merged ? t("product.team.merged") : t("product.team.similar")}</span>
              {!merged && <button type="button" onClick={() => setMerged(true)} className="shrink-0 font-semibold text-brand-text hover:underline">{t("product.team.merge")}</button>}
            </div>
          )}

          {/* team notes */}
          <div className="mt-3 grid gap-2 border border-dashed bg-st-ack/8 px-3 py-2.5" style={r}>
            <p className="text-[11.5px] font-semibold text-muted-foreground">{t("product.team.noteLabel")}</p>
            {(notes[cur.n] ?? []).map((n, i) => <p key={i} className="text-[12.5px] leading-snug">{n}</p>)}
            <form className="flex gap-1.5" onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              setNotes((x) => ({ ...x, [cur.n]: [...(x[cur.n] ?? []), text] }));
              setDraft("");
            }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 140))} placeholder={t("product.team.notePh")} aria-label={t("product.team.notePh")} style={r}
                className="h-8 min-w-0 flex-1 border border-input bg-surface px-2 text-[12.5px] focus-visible:border-primary" />
              <button type="submit" style={r} className="h-8 shrink-0 border border-line-strong bg-surface px-2.5 text-[12px] font-semibold hover:bg-wash">{t("product.team.addNote")}</button>
            </form>
          </div>

          {cur.pr && (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5"><GitPullRequestArrow className="size-3.5 text-muted-foreground" />acme/app#482</span>
              <span className="text-muted-foreground">{t("product.team.pr")}</span>
            </p>
          )}

          {/* route control */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <label className="inline-flex h-8 items-center gap-1.5 border border-input bg-surface pr-2 pl-2.5 text-[12.5px] font-semibold" style={r}>
              <StatusMark kind="bug" status={cur.status} />
              <span className="sr-only">{t("product.team.statusLabel")}</span>
              <select value={cur.status} onChange={(e) => { update({ status: e.target.value as Status }); setSent(null); }} className="cursor-pointer appearance-none bg-transparent pr-1 outline-none">
                {STOPS.map((s) => <option key={s} value={s}>{label(s)}{s === "fixed" ? " · 2.15" : ""}</option>)}
              </select>
            </label>
            <button type="button" style={r}
              onClick={() => { update({ answered: true }); setSent(cur.status === "fixed" ? t("product.team.sentFixed") : t("product.team.sentStatus", { status: label(cur.status) })); }}
              className="inline-flex h-8 items-center bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90">{t("product.team.save")}</button>
          </div>
          {sent && <p role="status" className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-success"><Mail className="mt-0.5 size-3.5 shrink-0" />{sent}</p>}
        </div>
      </div>
    </div>
  );
}
