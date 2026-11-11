"use client";

import { ArrowLeft, ChevronUp, Lock, MessageSquare, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { StatusMark } from "@/components/ozvi/route";
import { cn } from "@/lib/utils";

/**
 * The landing's sample board (local state: votes, new ideas, comments) in whatever theme its
 * parent scopes around it. ProductTour drives its tabs and re-themes it with toCss().
 */

export const ACCENTS = ["#5A3FE6", "#1D4ED8", "#0E7C66", "#C2410C", "#BE185D", "#0F172A"];
export const BASES = {
  neutral: { ink: "#111827", surface: "#FFFFFF", canvas: "#F4F5F7", border: "#E3E5EA" },
  warm: { ink: "#2B2118", surface: "#FFFDF9", canvas: "#F5EFE6", border: "#E7DCCD" },
  cool: { ink: "#0F1B2D", surface: "#FFFFFF", canvas: "#EDF2F8", border: "#D8E1EC" },
  dark: { ink: "#ECEDF2", surface: "#17181D", canvas: "#0F1013", border: "#2B2D35" },
} as const;
export type Base = keyof typeof BASES;

type IdeaStatus = "open" | "planned" | "in_progress" | "shipped";
type Idea = { id: number; title: string; text: string; author: string; votes: number; voted: boolean; status: IdeaStatus; comments: [string, string][]; mine?: boolean };
export type View = "ideas" | "roadmap" | "news" | "bugs";
const VIEWS: View[] = ["ideas", "roadmap", "news", "bugs"];

/** Sample content: texts live in messages (playground.board.ideas / bugs, same order), the rest here. */
type IdeaText = { title: string; text: string; author: string; comments: [string, string][] };
type News = { v: string; date: string; title: string; text: string };
const IDEAS: { votes: number; status: IdeaStatus }[] = [{ votes: 41, status: "planned" }, { votes: 17, status: "in_progress" }, { votes: 9, status: "open" }];
const BUGS: { n: number; status: "new" | "fixed"; v: string | null }[] = [{ n: 128, status: "fixed", v: "2.15" }, { n: 131, status: "new", v: null }];

/** The sample board. `view`/`onView` let a parent (the landing's product tour) drive the tabs. */
export function MiniBoard({ name, compact, view: shown, onView, fit = false }: {
  name: string; compact: boolean; view?: View; onView?: (v: View) => void;
  /** As tall as its content (a still picture) instead of the fixed frame the interactive tour needs. */
  fit?: boolean;
}) {
  const t = useTranslations("playground.board");
  const locale = useLocale();
  const sample = (): Idea[] => (t.raw("ideas") as IdeaText[]).map((i, id) => ({ ...i, ...IDEAS[id]!, id, voted: false, comments: [...i.comments] }));
  const news = t.raw("news") as News[];
  const bugs = (t.raw("bugs") as { title: string }[]).map((b, k) => ({ ...b, ...BUGS[k]! }));
  const [own, setOwn] = useState<View>("ideas");
  const view = shown ?? own;
  const setView = (v: View) => (onView ? onView(v) : setOwn(v));
  const [ideas, setIdeas] = useState<Idea[]>(sample);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [comment, setComment] = useState("");

  // Language switched: reset the sample content.
  useEffect(() => { setIdeas(sample()); setOpen(null); }, [locale]);

  const vote = (id: number) => setIdeas((xs) => xs.map((i) => (i.id === id ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) } : i)));
  const sorted = [...ideas].sort((a, b) => b.votes - a.votes);
  const current = ideas.find((i) => i.id === open);
  const row = compact ? "py-2.5" : "py-3.5";
  const r = { borderRadius: "var(--oz-radius)" };
  const btn = "inline-flex h-8 items-center gap-1.5 bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:opacity-90";

  const Vote = ({ i }: { i: Idea }) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); vote(i.id); }} aria-pressed={i.voted} aria-label={`${i.votes} ${t("votes")}`} style={r}
      className={cn("grid h-11 w-10 shrink-0 place-items-center content-center border text-[13px] leading-none font-bold tabular-nums transition-colors",
        i.voted ? "border-primary bg-primary text-primary-foreground" : "border-line-strong hover:border-primary")}>
      <ChevronUp className="size-3.5" strokeWidth={2.5} />{i.votes}
    </button>
  );

  return (
    <div className={cn("flex flex-col", !fit && "h-[520px]")}>
      <div className="flex h-12 shrink-0 items-center gap-5 border-b bg-surface px-4">
        <span className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="grid size-6 place-items-center bg-primary text-[11px] font-bold text-primary-foreground" style={{ borderRadius: "calc(var(--oz-radius) * 0.6)" }}>{name.charAt(0).toUpperCase()}</span>
          <b className="max-w-[12ch] truncate font-heading text-[14.5px] font-semibold">{name}</b>
        </span>
        <nav className="flex min-w-0 gap-4 overflow-x-auto text-[13px] font-medium whitespace-nowrap text-muted-foreground [scrollbar-width:none]">
          {VIEWS.map((v) => (
            <button key={v} type="button" aria-current={view === v ? "page" : undefined} onClick={() => { setView(v); setOpen(null); }}
              className={cn("relative h-12 hover:text-foreground", view === v && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary")}>
              {t(`tabs.${v}`)}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {view === "ideas" && !current && (
          <div className="grid gap-3">
            {adding ? (
              <form className="grid gap-2 border bg-surface p-3" style={r}
                onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return; setIdeas((xs) => [...xs, { id: Date.now(), title: draft.trim(), text: "", author: t("you"), votes: 1, voted: true, status: "open", comments: [], mine: true }]); setDraft(""); setAdding(false); }}>
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 80))} placeholder={t("titlePh")} aria-label={t("titlePh")} style={r}
                  className="h-9 border bg-background px-2.5 text-[14px] focus-visible:border-primary" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAdding(false)} className="h-8 px-3 text-[13px] text-muted-foreground hover:text-foreground">{t("cancel")}</button>
                  <button type="submit" className={btn} style={r}>{t("add")}</button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className={cn(btn, "justify-self-end")} style={r}><Plus className="size-3.5" />{t("suggest")}</button>
            )}
            <ul className="divide-y overflow-hidden border bg-surface" style={r}>
              {sorted.map((i) => (
                <li key={i.id} className={cn("grid cursor-pointer grid-cols-[auto_1fr] items-center gap-3 px-3.5 hover:bg-wash sm:grid-cols-[auto_1fr_auto]", row)} onClick={() => setOpen(i.id)}>
                  <Vote i={i} />
                  <span className="min-w-0">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(i.id); }} className="block max-w-full truncate text-left text-[14px] font-semibold hover:underline">{i.title}</button>
                    <small className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      {i.mine ? t("now") : i.author}
                      {i.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{i.comments.length}</span>}
                    </small>
                  </span>
                  <span className="hidden items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap sm:inline-flex"><StatusMark kind="idea" status={i.status} />{t(`status.${i.status}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === "ideas" && current && (
          <article className="grid gap-4">
            <button type="button" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 justify-self-start text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />{t("back")}</button>
            <div className="flex items-start gap-3">
              <Vote i={current} />
              <div className="min-w-0">
                <h4 className="font-heading text-[18px] leading-tight font-semibold">{current.title}</h4>
                <p className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"><StatusMark kind="idea" status={current.status} />{t(`status.${current.status}`)}</p>
              </div>
            </div>
            {current.text && <p className="text-[14px] leading-relaxed">{current.text}</p>}
            <div className="grid gap-2 border-t pt-4">
              <p className="text-[12.5px] font-medium text-muted-foreground">{t("comments", { n: current.comments.length })}</p>
              {current.comments.length === 0 && <p className="text-[13px] text-muted-foreground">{t("empty")}</p>}
              {current.comments.map(([who, text], k) => (
                <div key={k} className="border bg-surface p-3 text-[13.5px]" style={r}><b className="mr-1.5 font-semibold">{who}</b>{text}</div>
              ))}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; setIdeas((xs) => xs.map((i) => (i.id === current.id ? { ...i, comments: [...i.comments, [t("you"), comment.trim()]] } : i))); setComment(""); }}>
                <input value={comment} onChange={(e) => setComment(e.target.value.slice(0, 200))} placeholder={t("comment")} aria-label={t("comment")} style={r}
                  className="h-9 min-w-0 flex-1 border bg-surface px-2.5 text-[13.5px] focus-visible:border-primary" />
                <button type="submit" className={btn} style={r}>{t("send")}</button>
              </form>
            </div>
          </article>
        )}

        {view === "roadmap" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(["planned", "in_progress", "shipped"] as const).map((col) => (
              <div key={col} className="grid content-start gap-2">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><StatusMark kind="idea" status={col} />{t(`columns.${col}`)}</p>
                {(col === "shipped" ? news.map((n) => ({ id: -Number(n.v.replace(".", "")), title: n.title, votes: 0 })) : sorted.filter((i) => i.status === col)).map((i) => (
                  <button key={i.id} type="button" disabled={col === "shipped"} onClick={() => { setView("ideas"); setOpen(i.id); }}
                    className={cn("border bg-surface p-3 text-left text-[13px] font-medium enabled:hover:border-line-strong", row)} style={r}>
                    {i.title}{col !== "shipped" && <span className="mt-1 block text-[11.5px] font-normal text-muted-foreground">{i.votes} {t("votes")}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {view === "news" && (
          <ol className="grid gap-3">
            {news.map((n) => (
              <li key={n.v} className="border bg-surface p-4" style={r}>
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground"><span className="bg-primary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground" style={{ borderRadius: "calc(var(--oz-radius) * 0.5)" }}>{n.v}</span>{n.date}</p>
                <h4 className="mt-2 font-heading text-[15px] font-semibold">{n.title}</h4>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{n.text}</p>
              </li>
            ))}
          </ol>
        )}

        {view === "bugs" && (
          <div className="grid gap-3">
            <p className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Lock className="size-3.5" />{t("private")}</p>
            <ul className="divide-y overflow-hidden border bg-surface" style={r}>
              {bugs.map((b) => (
                <li key={b.n} className={cn("grid grid-cols-[auto_1fr] items-center gap-3 px-3.5 sm:grid-cols-[auto_1fr_auto]", row)}>
                  <span className="w-10 text-right font-mono text-[13px] font-semibold text-muted-foreground">#{b.n}</span>
                  <b className="min-w-0 truncate text-[14px] font-semibold">{b.title}</b>
                  <span className="hidden items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap sm:inline-flex">
                    <StatusMark kind="bug" status={b.status} />{t(`status.${b.status}`)}{b.v && <span className="font-normal text-muted-foreground">{b.v}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
