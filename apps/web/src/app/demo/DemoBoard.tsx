"use client";

import { ArrowLeft, Bug, Check, ChevronUp, Lock, Mail, MessageSquare, Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Journey, type JourneyEvent } from "@/components/ozvi/Journey";
import { RouteRail, StatusMark } from "@/components/ozvi/route";
import type { Locale } from "@/i18n/locales";
import { routeText } from "@/lib/route";
import { cn } from "@/lib/utils";

/**
 * The demo's board: a working replica of an Ozvi board (ideas with search, detail, votes, comments
 * and a new-idea form; roadmap; changelog with entries; private bug reports as the team and as the
 * author see them) on sample data and on what the visitor sent with the widget in this tab. Votes
 * are shared with the widget through the mock's data (window.__ozviDemoData). Nothing is stored.
 */

export interface SentReport {
  kind: string; number: number; title: string; body: string;
  context: {
    url?: string; browser?: string; viewport?: string; appVersion?: string;
    errors?: { text: string }[]; network?: { method: string; url: string; status: number; failed: boolean }[];
    actions?: { kind: string; label: string }[];
  };
  files: { name: string; url: string }[];
}
export interface BoardSample {
  ideas: { id: string; number: number; title: string; text: string; author: string; votes: number; status: string; comments: [string, string][] }[];
  news: { v: string; date: string; title: string; text: string; related: number[] }[];
}
type Tab = "ideas" | "roadmap" | "news" | "bugs";
type Status = "new" | "confirmed" | "in_progress" | "fixed" | "verified";
const BUG_STOPS: Status[] = ["new", "confirmed", "in_progress", "fixed", "verified"];
const IDEA_STOPS = ["open", "planned", "in_progress", "shipped"];
type Idea = BoardSample["ideas"][number] & { voted: boolean; mine?: boolean; at: number; comments: [string, string][] };
type Page = { tab: Tab; idea?: number; entry?: string; bug?: number; adding?: boolean };
type MockData = { ideas: { id: string; votes: number; weight: number }[] };
const mock = () => (window as unknown as { __ozviDemoData?: MockData }).__ozviDemoData;
const DAY = 86_400_000;

/** "/ukazka/roadmap", "/ukazka/i/132", "/ukazka/bugs" → the page to show. */
export function pageFor(path: string, reports: SentReport[], ideas: number[]): Page {
  const n = Number(/\/i\/(\d+)/.exec(path)?.[1] ?? NaN);
  if (Number.isFinite(n)) {
    if (reports.some((r) => r.number === n && r.kind !== "idea")) return { tab: "bugs", bug: n };
    if (ideas.includes(n) || reports.some((r) => r.number === n)) return { tab: "ideas", idea: n };
  }
  if (path.includes("/roadmap")) return { tab: "roadmap" };
  if (path.includes("/changelog")) return { tab: "news" };
  if (path.includes("/ideas")) return { tab: "ideas" };
  return { tab: "bugs" };
}

export function DemoBoard({ reports, sample, path, onClose }: { reports: SentReport[]; sample: BoardSample; path: string; onClose: () => void }) {
  const t = useTranslations("demo");
  const tb = useTranslations("playground.board");
  const tl = useTranslations("landing");
  const tt = (k: string, v?: Record<string, string>) => tl(`product.team.${k}` as never, v as never);
  const tr = useTranslations("route");
  const locale = useLocale() as Locale;
  const box = useRef<HTMLDivElement>(null);

  // Ideas: the sample (votes as the widget left them) plus ideas sent with the widget in this tab.
  const [ideas, setIdeas] = useState<Idea[]>(() => {
    const m = mock();
    const now = Date.now();
    const sent = reports.filter((r) => r.kind === "idea").map((r): Idea => ({ id: `s-${r.number}`, number: r.number, title: r.title, text: r.body, author: tb("you"), votes: 1, voted: true, status: "open", comments: [], mine: true, at: now }));
    return [...sent, ...sample.ideas.map((i, k): Idea => {
      const w = m?.ideas.find((x) => x.id === i.id);
      return { ...i, votes: w?.votes ?? i.votes, voted: !!w?.weight, at: now - (k + 2) * 9 * DAY };
    })];
  });
  const [page, setPage] = useState<Page>(() => pageFor(path, reports, ideas.map((i) => i.number)));
  const [view, setView] = useState<"team" | "author">("team");
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [told, setTold] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"top" | "new">("top");
  const [draft, setDraft] = useState({ title: "", text: "" });
  const [comment, setComment] = useState("");
  const next = useRef(Math.max(140, ...reports.map((r) => r.number)) + 1);

  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);
  // Scroll to the top of the board on every page change.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, [page]);

  const label = (_kind: "idea" | "bug", s: string) => routeText(tr, "label", s);
  const dt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", year: "numeric" });
  const r = { borderRadius: "var(--oz-radius)" };

  const vote = (n: number) => setIdeas((xs) => xs.map((i) => {
    if (i.number !== n) return i;
    const voted = !i.voted;
    const m = mock()?.ideas.find((x) => x.id === i.id);
    if (m) { m.weight = voted ? 1 : 0; m.votes = i.votes + (voted ? 1 : -1); }
    return { ...i, voted, votes: i.votes + (voted ? 1 : -1) };
  }));
  const ideaEvents = (i: Idea): JourneyEvent[] => {
    const at = IDEA_STOPS.indexOf(i.status);
    const ev: JourneyEvent[] = IDEA_STOPS.slice(0, Math.max(1, at + 1)).map((s, k) => ({ type: "status", at: new Date(i.at + k * 6 * DAY), status: s, who: k === 0 ? i.author : t("board.teamBadge") }));
    i.comments.forEach(([who], k) => { if (who === t("board.teamBadge")) ev.push({ type: "reply", at: new Date(i.at + (k + 1) * 3 * DAY), who, commentId: `${i.number}-${k}` }); });
    if (i.status === "shipped") ev.push({ type: "release", at: new Date(i.at + 20 * DAY), title: sample.news[0]?.title ?? "", href: "#" });
    return ev;
  };

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    const list = ideas.filter((i) => !words || i.title.toLowerCase().includes(words) || i.text.toLowerCase().includes(words));
    return [...list].sort((a, b) => (sort === "top" ? b.votes - a.votes : b.at - a.at));
  }, [ideas, q, sort]);
  const similar = draft.title.trim().length >= 3 ? ideas.filter((i) => draft.title.toLowerCase().split(/\s+/).some((w) => w.length >= 4 && i.title.toLowerCase().includes(w))).slice(0, 3) : [];

  const bugs = reports.filter((x) => x.kind !== "idea");
  const cur = bugs.find((x) => x.number === page.bug) ?? bugs[0];
  const st = (cur && status[cur.number]) || "new";
  const failed = cur?.context.network?.filter((x) => x.failed) ?? [];
  const chip = "inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5 text-[11.5px] text-muted-foreground";

  const VoteBtn = ({ i, big }: { i: Idea; big?: boolean }) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); vote(i.number); }} aria-pressed={i.voted} aria-label={`${i.votes} ${tb("votes")}`} style={r}
      className={cn("grid shrink-0 place-items-center content-center border font-bold tabular-nums transition-colors", big ? "h-16 w-14 text-[17px]" : "h-12 w-11 text-[13px]",
        i.voted ? "border-brand-line bg-brand-soft text-brand-text" : "border-line-strong bg-surface hover:border-primary")}>
      <ChevronUp className={big ? "size-4" : "size-3.5"} strokeWidth={2.5} />{i.votes}
    </button>
  );
  const Back = ({ to, text }: { to: Page; text: string }) => (
    <button type="button" onClick={() => setPage(to)} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{text}</button>
  );

  const ideaPage = page.idea !== undefined ? ideas.find((i) => i.number === page.idea) : undefined;
  const entry = page.entry ? sample.news.find((n) => n.v === page.entry) : undefined;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="demo-board-h" className="fixed inset-0 z-[2147483000] grid bg-ink/40 p-2 backdrop-blur-sm sm:p-6">
      <div ref={box} tabIndex={-1} className="mx-auto flex h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border bg-surface shadow-2xl outline-none">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <h2 id="demo-board-h" className="text-[14.5px] font-semibold">{t("board.title")}</h2>
          <span className="text-[13px] text-muted-foreground">{t("board.note")}</span>
          <button type="button" onClick={onClose} aria-label={t("board.close")} className="ml-auto grid size-8 place-items-center rounded-md hover:bg-wash"><X className="size-4" /></button>
        </div>

        {/* the board, in the host app's brand */}
        <div className="look-host oz-scope flex min-h-0 flex-1 flex-col bg-background font-sans text-foreground">
          <div className="flex h-14 shrink-0 items-center gap-6 overflow-x-auto border-b bg-surface px-5 [scrollbar-width:none]">
            <span className="flex shrink-0 items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">R</span><b className="text-[16px] font-bold tracking-tight">{t("app.brand")}</b></span>
            <nav className="flex gap-5 text-[14px] font-medium whitespace-nowrap">
              {(["ideas", "roadmap", "news", "bugs"] as const).map((k) => (
                <button key={k} type="button" aria-current={page.tab === k ? "page" : undefined} onClick={() => setPage({ tab: k })}
                  className={cn("relative h-14 text-muted-foreground hover:text-foreground", page.tab === k && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary")}>{tb(`tabs.${k}`)}</button>
              ))}
            </nav>
          </div>

          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1000px] px-5 py-7">
              {/* ---------- ideas ---------- */}
              {page.tab === "ideas" && page.adding && (
                <form className="grid max-w-[640px] gap-4" onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.title.trim().length < 3) return;
                  const n = next.current++;
                  setIdeas((xs) => [{ id: `s-${n}`, number: n, title: draft.title.trim(), text: draft.text.trim(), author: tb("you"), votes: 1, voted: true, status: "open", comments: [], mine: true, at: Date.now() }, ...xs]);
                  setDraft({ title: "", text: "" });
                  setPage({ tab: "ideas", idea: n });
                }}>
                  <Back to={{ tab: "ideas" }} text={tb("back")} />
                  <h3 className="text-[26px] font-bold tracking-tight">{tb("suggest")}</h3>
                  <label className="grid gap-1.5 text-[14px] font-semibold">{tb("titlePh")}
                    <input autoFocus required minLength={3} maxLength={120} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} style={r} className="h-10 border border-input bg-surface px-3 text-[15px] font-normal focus-visible:border-primary" />
                  </label>
                  {similar.length > 0 && (
                    <div className="grid gap-1.5 rounded-lg border bg-surface p-3 text-[13.5px]">
                      <p className="font-semibold text-muted-foreground">{t("board.similar")}</p>
                      {similar.map((i) => <button key={i.number} type="button" onClick={() => setPage({ tab: "ideas", idea: i.number })} className="flex items-center gap-2 text-left hover:underline"><StatusMark kind="idea" status={i.status} />{i.title}<span className="text-muted-foreground">· {i.votes} {tb("votes")}</span></button>)}
                    </div>
                  )}
                  <label className="grid gap-1.5 text-[14px] font-semibold">{t("board.why")}
                    <textarea rows={4} value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} style={r} className="border border-input bg-surface px-3 py-2 text-[15px] font-normal focus-visible:border-primary" />
                  </label>
                  <div className="flex gap-2"><button type="submit" style={r} className="inline-flex h-10 items-center bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:opacity-90">{tb("suggest")}</button>
                    <button type="button" onClick={() => setPage({ tab: "ideas" })} className="h-10 px-3 text-[14px] text-muted-foreground hover:text-foreground">{tb("cancel")}</button></div>
                </form>
              )}

              {page.tab === "ideas" && !page.adding && !ideaPage && (
                <div className="grid gap-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <h3 className="text-[28px] font-bold tracking-tight">{tb("tabs.ideas")} <span className="text-[18px] font-semibold text-muted-foreground tabular-nums">{ideas.length}</span></h3>
                    <button type="button" onClick={() => setPage({ tab: "ideas", adding: true })} style={r} className="inline-flex h-10 items-center gap-1.5 bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-4" />{tb("suggest")}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="relative min-w-[220px] flex-1"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("board.search")} aria-label={t("board.search")} style={r} className="h-10 w-full border border-input bg-surface pr-3 pl-9 text-[14px] focus-visible:border-primary" /></label>
                    <span className="flex rounded-lg border bg-surface p-0.5 text-[13px] font-medium">
                      {(["top", "new"] as const).map((s) => <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)} className={cn("h-8 rounded-md px-3", sort === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t(`board.sort.${s}`)}</button>)}
                    </span>
                  </div>
                  {shown.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-[14px] text-muted-foreground">{t("board.noMatch")}</p> : (
                    <ul className="divide-y overflow-hidden rounded-xl border bg-surface">
                      {shown.map((i) => (
                        <li key={i.number} className="grid cursor-pointer grid-cols-[auto_1fr] items-center gap-4 px-4 py-4 hover:bg-wash sm:grid-cols-[auto_1fr_auto]" onClick={() => setPage({ tab: "ideas", idea: i.number })}>
                          <VoteBtn i={i} />
                          <span className="min-w-0">
                            <button type="button" className="block max-w-full truncate text-left text-[16px] font-semibold hover:underline">{i.title}</button>
                            {i.text && <span className="mt-0.5 block truncate text-[13.5px] text-muted-foreground">{i.text}</span>}
                            <span className="mt-1 flex items-center gap-2 text-[12.5px] text-muted-foreground">#{i.number} · {i.mine ? tb("now") : i.author}{i.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{i.comments.length}</span>}</span>
                          </span>
                          <span className="hidden min-w-[150px] justify-items-end gap-1.5 sm:grid">
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"><StatusMark kind="idea" status={i.status} />{label("idea", i.status)}</span>
                            <RouteRail kind="idea" status={i.status} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {page.tab === "ideas" && ideaPage && (
                <article className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0">
                    <Back to={{ tab: "ideas" }} text={tb("back")} />
                    <div className="mt-5 flex items-start gap-4">
                      <VoteBtn i={ideaPage} big />
                      <div className="min-w-0">
                        <h3 className="text-[28px] leading-tight font-bold tracking-tight">{ideaPage.title}</h3>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><StatusMark kind="idea" status={ideaPage.status} />{label("idea", ideaPage.status)}</span>
                          · #{ideaPage.number} · {ideaPage.mine ? tb("you") : ideaPage.author} · {dt.format(ideaPage.at)}
                        </p>
                      </div>
                    </div>
                    {ideaPage.text && <p className="mt-6 max-w-[68ch] text-[16px] leading-relaxed">{ideaPage.text}</p>}
                    <section className="mt-8 grid gap-3 border-t pt-6">
                      <h4 className="text-[15px] font-semibold">{tb("comments", { n: ideaPage.comments.length })}</h4>
                      {ideaPage.comments.length === 0 && <p className="text-[14px] text-muted-foreground">{tb("empty")}</p>}
                      {ideaPage.comments.map(([who, text], k) => {
                        const team = who === t("board.teamBadge");
                        return (
                          <div key={k} id={`c-${ideaPage.number}-${k}`} style={r} className={cn("border bg-surface p-4 text-[14.5px]", team && "border-brand-line")}>
                            <p className={cn("mb-1 text-[13px] font-semibold", team && "text-brand-text")}>{who}</p>{text}
                          </div>
                        );
                      })}
                      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; setIdeas((xs) => xs.map((i) => (i.number === ideaPage.number ? { ...i, comments: [...i.comments, [tb("you"), comment.trim()]] } : i))); setComment(""); }}>
                        <input value={comment} onChange={(e) => setComment(e.target.value.slice(0, 300))} placeholder={tb("comment")} aria-label={tb("comment")} style={r} className="h-10 min-w-0 flex-1 border border-input bg-surface px-3 text-[14px] focus-visible:border-primary" />
                        <button type="submit" style={r} className="h-10 bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:opacity-90">{tb("send")}</button>
                      </form>
                    </section>
                  </div>
                  <aside className="grid content-start gap-3 lg:pt-12">
                    <h4 className="text-[13px] font-semibold text-muted-foreground">{t("board.trail")}</h4>
                    <div className="rounded-xl border bg-surface p-4"><Journey kind="idea" status={ideaPage.status} events={ideaEvents(ideaPage)} locale={locale} /></div>
                  </aside>
                </article>
              )}

              {/* ---------- roadmap ---------- */}
              {page.tab === "roadmap" && (
                <div className="grid gap-5">
                  <h3 className="text-[28px] font-bold tracking-tight">{tb("tabs.roadmap")}</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {(["planned", "in_progress", "shipped"] as const).map((s) => (
                      <section key={s} className="grid content-start gap-2.5">
                        <h4 className="flex items-center gap-1.5 text-[14px] font-semibold"><StatusMark kind="idea" status={s} />{label("idea", s)}<span className="text-muted-foreground tabular-nums">{ideas.filter((i) => i.status === s).length}</span></h4>
                        {ideas.filter((i) => i.status === s).sort((a, b) => b.votes - a.votes).map((i) => (
                          <button key={i.number} type="button" onClick={() => setPage({ tab: "ideas", idea: i.number })} style={r} className="grid gap-1 border bg-surface p-3.5 text-left hover:border-line-strong">
                            <span className="text-[14.5px] font-semibold">{i.title}</span>
                            <span className="flex items-center gap-1 text-[12.5px] text-muted-foreground">#{i.number} · <ChevronUp className="size-3" strokeWidth={2.5} />{i.votes}</span>
                          </button>
                        ))}
                      </section>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------- changelog ---------- */}
              {page.tab === "news" && !entry && (
                <div className="grid max-w-[760px] gap-5">
                  <h3 className="text-[28px] font-bold tracking-tight">{tb("tabs.news")}</h3>
                  {sample.news.map((n) => (
                    <button key={n.v} type="button" onClick={() => setPage({ tab: "news", entry: n.v })} style={r} className="grid gap-2 border bg-surface p-5 text-left hover:border-line-strong">
                      <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground">{n.v}</span>{n.date}</span>
                      <span className="text-[18px] font-semibold">{n.title}</span>
                      <span className="text-[14.5px] leading-relaxed text-muted-foreground">{n.text}</span>
                    </button>
                  ))}
                </div>
              )}
              {page.tab === "news" && entry && (
                <article className="grid max-w-[720px] gap-4">
                  <Back to={{ tab: "news" }} text={t("board.backNews")} />
                  <span className="flex items-center gap-2 text-[13px] text-muted-foreground"><span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground">{entry.v}</span>{entry.date}</span>
                  <h3 className="text-[30px] leading-tight font-bold tracking-tight">{entry.title}</h3>
                  <p className="text-[16px] leading-relaxed">{entry.text}</p>
                  {entry.related.length > 0 && (
                    <section className="mt-2 grid gap-2 border-t pt-5">
                      <h4 className="text-[14px] font-semibold">{t("board.related")}</h4>
                      {entry.related.map((n) => ideas.find((i) => i.number === n)).filter(Boolean).map((i) => (
                        <button key={i!.number} type="button" onClick={() => setPage({ tab: "ideas", idea: i!.number })} className="flex items-center gap-2 text-left text-[14.5px] hover:underline"><StatusMark kind="idea" status={i!.status} />{i!.title}<span className="text-muted-foreground">· {i!.votes} {tb("votes")}</span></button>
                      ))}
                    </section>
                  )}
                </article>
              )}

              {/* ---------- bugs ---------- */}
              {page.tab === "bugs" && !cur && (
                <p className="mx-auto max-w-[46ch] py-16 text-center text-[14.5px] leading-relaxed text-muted-foreground">{t("board.noBugs")}</p>
              )}
              {page.tab === "bugs" && cur && (
                <div className="grid gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-3 text-[28px] font-bold tracking-tight">{tb("tabs.bugs")}<span className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground"><Lock className="size-3.5" />{tt("private")}</span></h3>
                    <span role="group" aria-label={t("board.title")} className="flex rounded-lg border bg-surface p-0.5 text-[13px] font-medium">
                      {(["team", "author"] as const).map((v) => (
                        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                          className={cn("h-8 rounded-md px-3", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t(`board.${v}`)}</button>
                      ))}
                    </span>
                  </div>
                  <div className="grid overflow-hidden rounded-xl border bg-surface md:grid-cols-[230px_minmax(0,1fr)]">
                    <ul className="divide-y border-b md:border-r md:border-b-0">
                      {bugs.map((x) => (
                        <li key={x.number}>
                          <button type="button" onClick={() => setPage({ tab: "bugs", bug: x.number })} aria-current={x.number === cur.number ? "true" : undefined}
                            className={cn("grid w-full gap-1 px-3.5 py-3 text-left hover:bg-wash", x.number === cur.number && "bg-wash shadow-[inset_2px_0_0_var(--oz-accent)]")}>
                            <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[13px] font-extrabold tabular-nums"><Bug className="size-3.5" />#{x.number}</span><StatusMark kind="bug" status={status[x.number] ?? "new"} className="size-3.5" /></span>
                            <span className="line-clamp-2 text-[12.5px] leading-snug font-medium">{x.title || t("inspector.untitled")}</span>
                          </button>
                        </li>
                      ))}
                    </ul>

                    {view === "team" ? (
                      <div className="min-w-0 p-5">
                        <p className="flex items-baseline gap-2"><span data-num className="text-[22px] leading-none font-extrabold tracking-tight">#{cur.number}</span><span className="text-[17px] font-semibold">{cur.title || t("inspector.untitled")}</span></p>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">{t("board.you")}</p>
                        {cur.body && <p className="mt-3 max-w-[70ch] text-[14.5px] leading-relaxed whitespace-pre-wrap">{cur.body}</p>}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className={cn(chip, "font-mono")}>v{cur.context.appVersion || "?"}</span>
                          <span className={chip}>{cur.context.viewport}</span>
                          <span className={cn(chip, "max-w-full truncate")}>{cur.context.browser}</span>
                        </div>
                        {cur.files.map((f) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={f.url} src={f.url} alt={t("inspector.shot")} className="mt-4 w-full max-w-[720px] rounded-lg border" />
                        ))}
                        <div className="mt-5 grid max-w-[720px] gap-3">
                          <Block title={t("inspector.errors")}>{cur.context.errors?.length ? cur.context.errors.map((e, i) => <p key={i} className="font-mono text-[12px] text-destructive">{e.text}</p>) : <p className="text-[13px] text-muted-foreground">–</p>}</Block>
                          <Block title={t("inspector.network")}>{failed.length ? failed.map((x, i) => <p key={i} className="truncate font-mono text-[12px]"><b className="text-destructive">{x.status || "—"}</b> {x.method} {x.url}</p>) : <p className="text-[13px] text-muted-foreground">{t("inspector.noFailed")}</p>}</Block>
                          <Block title={t("inspector.actions")}>{cur.context.actions?.length ? <ol className="grid gap-1 text-[13px]">{cur.context.actions.map((a, i) => <li key={i}><span className="text-muted-foreground">{i + 1}.</span> {a.label}</li>)}</ol> : <p className="text-[13px] text-muted-foreground">–</p>}</Block>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
                          <label className="inline-flex h-9 items-center gap-1.5 border border-input bg-surface pr-2 pl-2.5 text-[13px] font-semibold" style={r}>
                            <StatusMark kind="bug" status={st} />
                            <span className="sr-only">{tt("statusLabel")}</span>
                            <select value={st} onChange={(e) => setStatus((x) => ({ ...x, [cur.number]: e.target.value as Status }))} className="cursor-pointer appearance-none bg-transparent pr-1 outline-none">
                              {BUG_STOPS.map((s) => <option key={s} value={s}>{label("bug", s)}{s === "fixed" ? " · 2.15" : ""}</option>)}
                            </select>
                          </label>
                          <button type="button" style={r} onClick={() => setTold((x) => ({ ...x, [cur.number]: st === "fixed" ? tt("sentFixed") : tt("sentStatus", { status: label("bug", st) }) }))}
                            className="inline-flex h-9 items-center bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90">{tt("save")}</button>
                        </div>
                        {told[cur.number] && <p role="status" className="mt-2.5 flex flex-wrap items-start gap-1.5 text-[13px] text-success"><Mail className="mt-0.5 size-3.5 shrink-0" />{told[cur.number]} <button type="button" onClick={() => setView("author")} className="font-semibold underline">{t("board.seeAuthor")}</button></p>}
                      </div>
                    ) : (
                      <div className="min-w-0 p-5">
                        <p className="text-[13px] text-muted-foreground">{t("board.authorNote")}</p>
                        <p className="mt-4 flex items-baseline gap-2"><span data-num className="text-[22px] font-extrabold">#{cur.number}</span><span className="text-[17px] font-semibold">{cur.title || t("inspector.untitled")}</span></p>
                        <div className="mt-5 max-w-[520px] rounded-xl border bg-background p-4">
                          <Journey kind="bug" status={st} locale={locale}
                            events={BUG_STOPS.slice(0, BUG_STOPS.indexOf(st) + 1).map((s, k) => ({ type: "status" as const, at: new Date(Date.now() - (BUG_STOPS.indexOf(st) - k) * 60_000), status: s, version: s === "fixed" || s === "verified" ? "2.15" : null }))} />
                        </div>
                        {told[cur.number]
                          ? <p className="mt-4 flex max-w-[520px] items-start gap-2 rounded-lg border bg-wash p-3 text-[13.5px]"><Check className="mt-0.5 size-4 shrink-0 text-success" />{told[cur.number]}</p>
                          : <p className="mt-4 text-[13px] text-muted-foreground">{t("board.noReply")}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5 rounded-lg border bg-background p-3">
      <h3 className="text-[12px] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
